import type { CommerceGateway } from '@/lib/api/contracts';
import { ApiError, requireValue } from '@/lib/api/contracts';
import type {
  Address,
  AdminCommand,
  CheckoutInput,
  CheckoutResult,
  Operations,
  Session,
  SubscribeInput,
  SubscriptionChange,
} from '@/lib/domain/types';
import {
  checkoutSchema,
  loginSchema,
  newsletterSchema,
  prayerSchema,
  productSchema,
  inventoryProductSchema,
  publicSettingsSchema,
  subscriptionSchema,
  type LoginInput,
  type NewsletterInput,
  type PrayerInput,
} from '@/lib/domain/schemas';
import {
  audit,
  cartLine,
  clubItems,
  createShopOrder,
  enqueueProduction,
  ensureCustomer,
  generateCycle,
  payCharge,
  setOrderStatus,
} from '@/lib/domain/commerce';
import { addMonth, monthLabel, today, uid } from '@/lib/domain/format';
import { filterProducts } from '@/lib/domain/catalog';
import { DEMO_EMAIL, DEMO_PASSWORD, normalizeAddress, STAFF_PERMISSIONS } from './seed';
import { MemoryDemoStorage, type DemoStorage } from './storage';
import { applyAdminExtension } from './admin-commands';
export class DemoGateway implements CommerceGateway {
  readonly mode = 'demo' as const;
  constructor(private storage: DemoStorage = new MemoryDemoStorage()) {}
  private read() {
    return this.storage.load();
  }
  private mutate<T>(operation: (state: Operations) => T): T {
    const next = this.read();
    const result = operation(next);
    this.storage.save(next);
    return result;
  }
  private customerSession() {
    const s = requireValue(this.storage.session(), 'Entre na sua conta para continuar.');
    if (s.role !== 'customer')
      throw new ApiError('CUSTOMER_SESSION_REQUIRED', 'Entre com uma conta de cliente.', 403);
    return s;
  }
  private staffSession() {
    const s = requireValue(this.storage.session(), 'Entre na gestão para continuar.');
    if (s.role === 'customer')
      throw new ApiError('FORBIDDEN', 'Seu acesso não permite esta operação.', 403);
    return s;
  }
  async catalog(query = {}) {
    return filterProducts(this.read().products, query).map((p) => productSchema.parse(p));
  }
  async product(id: string) {
    const product = this.read().products.find((p) => p.id === id && p.active);
    return product ? productSchema.parse(product) : null;
  }
  async settings() {
    return this.read().settings;
  }
  async session() {
    return this.storage.session();
  }
  async login(input: LoginInput) {
    const data = loginSchema.parse(input);
    let session: Session;
    if (data.kind === 'staff') {
      if (data.email.toLowerCase() !== DEMO_EMAIL || data.password !== DEMO_PASSWORD)
        throw new ApiError(
          'INVALID_CREDENTIALS',
          'Use o acesso de demonstração para explorar a gestão.',
          401,
        );
      session = {
        id: 'staff-demo',
        name: 'Equipe Mãos em Oração',
        email: DEMO_EMAIL,
        role: 'admin',
        permissions: STAFF_PERMISSIONS,
        demo: true,
      };
    } else {
      const customer = this.mutate((s) =>
        ensureCustomer(
          s,
          normalizeAddress({
            ...s.clients.find((c) => c.email.toLowerCase() === data.email.toLowerCase()),
            email: data.email,
            ...(data.name ? { name: data.name } : {}),
          }),
        ),
      );
      session = {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        role: 'customer',
        permissions: [],
        demo: true,
      };
    }
    this.storage.saveSession(session);
    return session;
  }
  async logout() {
    this.storage.saveSession(null);
  }
  async recover() {
    return {
      message:
        'Simulação concluída. Nenhum e-mail foi enviado. Volte ao login e use o acesso de demonstração.',
    };
  }
  async account() {
    const session = this.customerSession(),
      state = this.read();
    return {
      customer: { ...requireValue(state.clients.find((c) => c.id === session.id)), notes: '' },
      orders: state.orders.filter((o) => o.customerId === session.id),
      subscriptions: state.subscriptions.filter((s) => s.customerId === session.id),
      charges: state.charges.filter((c) => c.customerId === session.id),
      tickets: state.tickets
        .filter((t) => t.customerId === session.id)
        .map((t) => ({ ...t, messages: t.messages.filter((m) => !m.internal) })),
    };
  }
  async updateProfile(input: { name: string; email: string; address?: Address }) {
    const session = this.customerSession();
    this.mutate((state) => {
      const customer = requireValue(state.clients.find((c) => c.id === session.id));
      if (
        state.clients.some(
          (c) => c.id !== session.id && c.email.toLowerCase() === input.email.toLowerCase(),
        )
      )
        throw new ApiError('EMAIL_IN_USE', 'Este e-mail já tem uma conta.');
      Object.assign(customer, input.address || {}, { name: input.name, email: input.email });
      audit(state, 'Perfil atualizado', customer.id, customer.name);
    });
    this.storage.saveSession({ ...session, name: input.name, email: input.email });
  }
  async estimate(input: Parameters<CommerceGateway['estimate']>[0]) {
    const { cartLine, calculateTotals } = await import('@/lib/domain/commerce');
    const items = input.items.map((i) =>
      cartLine(
        requireValue(this.read().products.find((p) => p.id === i.productId)),
        i.quantity,
        i.color,
        i.sizeIndex,
        i.dedication,
      ),
    );
    return {
      items,
      ...calculateTotals(
        items,
        input.shippingQuoteId === 'express' ? 2890 : input.shippingQuoteId ? 1890 : 0,
        input.coupon,
      ),
    };
  }
  async checkout(input: CheckoutInput): Promise<CheckoutResult> {
    checkoutSchema.parse(input);
    const result = this.mutate((state) => createShopOrder(state, input, this.storage.session()));
    const state = this.read(),
      order = requireValue(state.orders.find((o) => o.id === result.orderId)),
      client = requireValue(state.clients.find((c) => c.id === order.customerId));
    this.storage.saveSession({
      id: client.id,
      name: client.name,
      email: client.email,
      role: 'customer',
      permissions: [],
      demo: true,
    });
    return { ...result, paymentAction: { type: 'none' } };
  }
  async subscribe(input: SubscribeInput): Promise<CheckoutResult> {
    subscriptionSchema.parse(input);
    const result = this.mutate((state) => {
      if (state.processed[input.idempotencyKey]) return state.processed[input.idempotencyKey];
      const customer = ensureCustomer(state, input.address);
      if (state.subscriptions.some((s) => s.customerId === customer.id && s.status !== 'Cancelada'))
        throw new ApiError(
          'ALREADY_SUBSCRIBED',
          'Você já tem uma assinatura. Acesse Minha assinatura.',
        );
      const id = uid('ASS'),
        oid = uid('PED'),
        cid = uid('COB'),
        paid = input.payment === 'card',
        price = state.settings.priceCents;
      const sub = {
        id,
        customerId: customer.id,
        profile: input.profile,
        finish: input.finish,
        priceCents: price,
        status: paid ? ('Ativa' as const) : ('Pagamento pendente' as const),
        payment: input.payment,
        created: today(),
        nextRenewal: addMonth(today()),
        nextShipment: today().slice(0, 8) + String(state.settings.dispatchDay).padStart(2, '0'),
        address: { ...input.address },
        history: [{ date: today(), label: 'Assinatura de demonstração criada.' }],
      };
      state.subscriptions.unshift(sub);
      state.orders.unshift({
        id: oid,
        number: oid,
        customerId: customer.id,
        subscriptionId: id,
        type: 'Clube',
        edition: monthLabel(today()) + ' · ' + state.settings.edition,
        items: clubItems(state, input.profile, input.finish),
        totalCents: price,
        subtotalCents: price,
        discountCents: 0,
        shippingCents: 0,
        status: paid ? 'Confirmado' : 'Aguardando pagamento',
        created: today(),
        due: sub.nextShipment,
        address: { ...input.address },
        chargeId: cid,
        tracking: '',
        carrier: 'A definir',
        priority: 'Normal',
        notes: 'Primeira edição da assinatura.',
      });
      state.charges.unshift({
        id: cid,
        customerId: customer.id,
        subscriptionId: id,
        orderId: oid,
        amountCents: price,
        method: input.payment,
        status: paid ? 'Pago' : 'Pendente',
        due: today(),
        paidAt: paid ? today() : undefined,
        description: 'Primeira edição do clube',
        cycle: today().slice(0, 7),
        pixCents: input.payment === 'pix' ? price : 0,
        cardCents: input.payment === 'card' ? price : 0,
        installments: 1,
      });
      if (paid) enqueueProduction(state, oid);
      audit(state, 'Assinatura criada', id, customer.name);
      return (state.processed[input.idempotencyKey] = { orderId: oid, subscriptionId: id });
    });
    const order = requireValue(this.read().orders.find((o) => o.id === result.orderId)),
      customer = requireValue(this.read().clients.find((c) => c.id === order.customerId));
    this.storage.saveSession({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      role: 'customer',
      permissions: [],
      demo: true,
    });
    return { ...result, paymentAction: { type: 'none' } };
  }
  async confirmDemoPayment(id: string) {
    const session = this.customerSession();
    this.mutate((state) => {
      const charge = requireValue(
        state.charges.find((c) => c.id === id && c.customerId === session.id),
      );
      payCharge(state, charge.id);
    });
  }
  async payment(id: string): Promise<CheckoutResult> {
    const session = this.customerSession();
    requireValue(this.read().orders.find((o) => o.id === id && o.customerId === session.id));
    return { orderId: id, paymentAction: { type: 'none' } };
  }
  async shipping(cep: string) {
    if (!/^\d{5}-?\d{3}$/.test(cep)) throw new ApiError('INVALID_CEP', 'Informe um CEP válido.');
    return [
      {
        id: 'standard' as const,
        label: 'Entrega padrão',
        cents: 1890,
        estimate: '8 a 12 dias úteis · inclui produção',
      },
      {
        id: 'express' as const,
        label: 'Entrega expressa',
        cents: 2990,
        estimate: '5 a 7 dias úteis · inclui produção',
      },
    ];
  }
  async changeSubscription(change: SubscriptionChange) {
    const session = this.storage.session();
    if (!session) throw new ApiError('UNAUTHENTICATED', 'Entre para continuar.', 401);
    this.mutate((state) => {
      const sub = requireValue(
        state.subscriptions.find(
          (s) => s.id === change.id && (session.role !== 'customer' || s.customerId === session.id),
        ),
      );
      if (change.action === 'pause' && sub.status === 'Ativa') sub.status = 'Pausada';
      else if (change.action === 'resume' && sub.status === 'Pausada') sub.status = 'Ativa';
      else if (change.action === 'skip' && sub.status === 'Ativa') {
        sub.nextRenewal = addMonth(sub.nextRenewal);
        sub.nextShipment = addMonth(sub.nextShipment);
      } else if (change.action === 'cancel') sub.status = 'Cancelada';
      else if (change.action === 'preferences') {
        if (change.profile) sub.profile = change.profile;
        if (change.finish) sub.finish = change.finish;
        if (change.payment) sub.payment = change.payment;
        if (change.address) {
          sub.address = change.address;
          for (const o of state.orders.filter(
            (o) =>
              o.subscriptionId === sub.id &&
              !['Enviado', 'Entregue', 'Cancelado'].includes(o.status),
          ))
            o.address = { ...change.address };
        }
      } else
        throw new ApiError('INVALID_STATE', 'Esta alteração não está disponível no estado atual.');
      sub.history.unshift({
        date: today(),
        label: {
          pause: 'Próximos ciclos pausados.',
          resume: 'Assinatura retomada.',
          skip: 'Próxima edição pulada.',
          cancel: 'Renovações canceladas. ' + (change.reason || ''),
          preferences: 'Preferências atualizadas.',
        }[change.action],
      });
      audit(state, 'Assinatura atualizada', sub.id, session.name);
    });
  }
  async createTicket(input: {
    subject: string;
    category: string;
    message: string;
    name?: string;
    email?: string;
  }) {
    if (input.subject.trim().length < 5 || input.message.trim().length < 10)
      throw new ApiError(
        'INVALID_TICKET',
        'Complete o assunto e uma mensagem com pelo menos 10 caracteres.',
      );
    const session = this.storage.session();
    this.mutate((state) => {
      const customer =
        session?.role === 'customer'
          ? requireValue(state.clients.find((c) => c.id === session.id))
          : ensureCustomer(state, normalizeAddress({ name: input.name, email: input.email }));
      const id = uid('AT');
      state.tickets.unshift({
        id,
        customerId: customer.id,
        subject: input.subject,
        category: input.category,
        status: 'Aberto',
        priority: 'Normal',
        assignee: 'Camila',
        created: today(),
        messages: [{ by: 'cliente', text: input.message, date: today() }],
      });
      audit(state, 'Atendimento aberto', id, customer.name);
    });
  }
  async replyTicket(id: string, message: string) {
    const session = this.customerSession();
    if (message.trim().length < 3)
      throw new ApiError('INVALID_MESSAGE', 'Escreva uma mensagem com pelo menos 3 caracteres.');
    this.mutate((s) => {
      const ticket = requireValue(
        s.tickets.find((t) => t.id === id && t.customerId === session.id),
      );
      ticket.messages.push({ by: 'cliente', text: message, date: today() });
      ticket.status = 'Aberto';
    });
  }
  async community() {
    return this.read()
      .prayers.filter((p) => !p.hidden || (p.owned && p.moderation === 'Em análise'))
      .map((p) => ({ ...p, reports: undefined, moderationNote: undefined }));
  }
  async postPrayer(input: PrayerInput) {
    const data = prayerSchema.parse(input);
    this.mutate((s) =>
      s.prayers.unshift({
        id: uid('OR'),
        ...data,
        name: data.anonymous ? 'Anônimo' : data.name || 'Uma pessoa de fé',
        created: today(),
        example: false,
        hidden: s.workspace.reviewPrayers,
        moderation: s.workspace.reviewPrayers ? 'Em análise' : 'Publicado',
        reactions: 0,
        owned: true,
        prayed: false,
      }),
    );
  }
  async reactPrayer(id: string) {
    this.mutate((s) => {
      const prayer = requireValue(s.prayers.find((p) => p.id === id && !p.hidden));
      prayer.prayed = !prayer.prayed;
      prayer.reactions = Math.max(0, prayer.reactions + (prayer.prayed ? 1 : -1));
    });
  }
  async reportPrayer(id: string, reason: string) {
    if (reason.trim().length < 5)
      throw new ApiError('INVALID_REASON', 'Conte o que precisa ser revisado.');
    this.mutate((s) => {
      const p = requireValue(s.prayers.find((p) => p.id === id && !p.hidden));
      p.reports = [...(p.reports || []), { reason: reason.slice(0, 500), date: today() }];
    });
  }
  async deletePrayer(id: string) {
    this.mutate((s) => {
      const prayer = requireValue(s.prayers.find((p) => p.id === id));
      if (!prayer.owned)
        throw new ApiError('FORBIDDEN', 'Somente quem publicou pode remover este pedido.', 403);
      s.prayers = s.prayers.filter((p) => p.id !== id);
    });
  }
  async newsletter(input: NewsletterInput) {
    const data = newsletterSchema.parse(input);
    this.mutate((s) => {
      s.newsletter = { name: data.name, email: data.email, subscribed: true };
    });
    return {
      message: 'Inscrição de demonstração salva. Nenhum e-mail será enviado.',
      token: 'demo-local',
    };
  }
  async unsubscribeNewsletter() {
    this.mutate((s) => {
      s.newsletter = null;
    });
  }
  async admin() {
    this.staffSession();
    return this.read();
  }
  async invitation(token: string) {
    const invite = requireValue(
      this.read().invitations.find(
        (i) =>
          i.token === token && i.status === 'Pendente' && i.expiresAt > new Date().toISOString(),
      ),
      'Este convite não está mais disponível.',
    );
    return invite;
  }
  async acceptInvitation(input: { token: string; name: string }) {
    const invitation = await this.invitation(input.token);
    if (input.name.trim().length < 3) throw new ApiError('INVALID_NAME', 'Informe seu nome.');
    const id = uid('U');
    this.mutate((s) => {
      const current = requireValue(
        s.invitations.find((i) => i.id === invitation.id && i.status === 'Pendente'),
      );
      current.status = 'Aceito';
      s.team.push({
        id,
        name: input.name,
        email: invitation.email,
        role: invitation.role,
        status: 'Ativo',
        permissions: invitation.permissions,
      });
      audit(s, 'Convite aceito', id, input.name);
    });
    this.storage.saveSession({
      id,
      name: input.name,
      email: invitation.email,
      role: invitation.role,
      permissions: invitation.permissions,
      demo: true,
    });
  }
  async adminCommand(command: AdminCommand) {
    const session = this.staffSession();
    const prefix = command.type.split('.')[0],
      permission = (
        {
          customer: 'customers',
          product: 'catalog',
          stock: 'catalog',
          orders: 'orders',
          order: 'orders',
          production: 'production',
          printer: 'production',
          shipping: 'shipping',
          charge: 'finance',
          expense: 'finance',
          subscription: 'subscriptions',
          edition: 'subscriptions',
          coupon: 'catalog',
          ticket: 'support',
          prayer: 'community',
          campaign: 'marketing',
          team: 'team',
          invite: 'team',
          workspace: 'settings',
          settings: 'settings',
        } as Record<string, string>
      )[prefix];
    if (session.role !== 'admin' && !session.permissions.some((p) => p === permission))
      throw new ApiError('FORBIDDEN', 'Seu perfil não permite esta alteração.', 403);
    this.mutate((s) => {
      if (applyAdminExtension(s, command, session)) {
        audit(s, command.type, 'id' in command ? command.id : 'Operação', session.name);
        return;
      }
      switch (command.type) {
        case 'customer.save': {
          const c = command.customer;
          if (!c.name.trim() || !c.email.includes('@'))
            throw new ApiError('INVALID_CUSTOMER', 'Informe nome e e-mail.');
          const existing = s.clients.find((x) => x.id === c.id);
          if (
            s.clients.some((x) => x.email.toLowerCase() === c.email.toLowerCase() && x.id !== c.id)
          )
            throw new ApiError('EMAIL_IN_USE', 'Este e-mail já está cadastrado.');
          if (existing) Object.assign(existing, c);
          else
            s.clients.unshift({
              ...normalizeAddress(c),
              id: uid('CLI'),
              status: 'Ativo',
              created: today(),
              notes: c.notes || '',
            });
          break;
        }
        case 'customer.archive': {
          const c = requireValue(s.clients.find((c) => c.id === command.id));
          c.status = c.status === 'Ativo' ? 'Inativo' : 'Ativo';
          break;
        }
        case 'product.save': {
          const product = inventoryProductSchema.parse(command.product),
            existing = s.products.find((p) => p.id === product.id);
          if (
            s.products.some(
              (p) => p.id !== product.id && p.sku.toLowerCase() === product.sku.toLowerCase(),
            )
          )
            throw new ApiError('DUPLICATE_SKU', 'Este SKU já pertence a outro produto.');
          if (existing) Object.assign(existing, product);
          else s.products.push(product);
          break;
        }
        case 'order.update': {
          const order = requireValue(s.orders.find((o) => o.id === command.id));
          Object.assign(order, {
            status: command.status,
            priority: command.priority,
            due: command.due,
            notes: command.notes,
          });
          break;
        }
        case 'order.create': {
          const customer = requireValue(s.clients.find((c) => c.id === command.customerId)),
            product = requireValue(s.products.find((p) => p.id === command.productId)),
            item = cartLine(product, command.quantity),
            id = uid('PED'),
            cid = uid('COB'),
            totals = {
              subtotalCents: item.unitCents * item.quantity,
              discountCents: 0,
              shippingCents: command.shippingCents,
              totalCents: item.unitCents * item.quantity + command.shippingCents,
            };
          s.orders.unshift({
            id,
            number: id,
            customerId: customer.id,
            type: 'Loja',
            items: [item],
            ...totals,
            status: command.paid ? 'Confirmado' : 'Aguardando pagamento',
            created: today(),
            due: command.due,
            address: normalizeAddress(customer),
            chargeId: cid,
            tracking: '',
            carrier: 'A definir',
            priority: 'Normal',
            notes: 'Pedido manual de demonstração.',
          });
          s.charges.unshift({
            id: cid,
            customerId: customer.id,
            orderId: id,
            amountCents: totals.totalCents,
            method: command.paid ? 'card' : 'pix',
            status: command.paid ? 'Pago' : 'Pendente',
            due: today(),
            paidAt: command.paid ? today() : undefined,
            description: 'Pedido manual',
            cycle: today().slice(0, 7),
            pixCents: command.paid ? 0 : totals.totalCents,
            cardCents: command.paid ? totals.totalCents : 0,
            installments: 1,
          });
          break;
        }
        case 'production.create':
          enqueueProduction(s, command.orderId, command);
          break;
        case 'production.advance': {
          const job = requireValue(s.jobs.find((j) => j.id === command.id)),
            stages = ['Fila', 'Impressão', 'Acabamento', 'Conferência', 'Pronto'] as const,
            index = stages.indexOf(job.stage);
          if (index < 4) {
            job.stage = stages[index + 1];
            setOrderStatus(
              s,
              job.orderId,
              job.stage === 'Pronto'
                ? 'Pronto para envio'
                : job.stage === 'Impressão'
                  ? 'Em produção'
                  : 'Em acabamento',
            );
          }
          break;
        }
        case 'printer.update':
          requireValue(s.printers.find((p) => p.id === command.id)).status = command.status;
          break;
        case 'shipping.dispatch': {
          const o = requireValue(s.orders.find((o) => o.id === command.id));
          if (o.status !== 'Pronto para envio')
            throw new ApiError('NOT_READY', 'Libere o pedido na produção antes de despachar.');
          if (command.tracking.length < 5)
            throw new ApiError('INVALID_TRACKING', 'Informe um rastreio fictício válido.');
          o.tracking = command.tracking;
          o.carrier = command.carrier;
          o.status = 'Enviado';
          break;
        }
        case 'shipping.deliver': {
          const o = requireValue(s.orders.find((o) => o.id === command.id));
          if (o.status !== 'Enviado')
            throw new ApiError('NOT_DISPATCHED', 'Despache antes de registrar a entrega.');
          o.status = 'Entregue';
          break;
        }
        case 'charge.pay':
          payCharge(s, command.id);
          break;
        case 'charge.refund': {
          const c = requireValue(s.charges.find((c) => c.id === command.id));
          if (c.status !== 'Pago')
            throw new ApiError('NOT_PAID', 'Somente pagamentos confirmados podem ser estornados.');
          c.status = 'Estornado';
          c.refundReason = command.reason;
          const o = s.orders.find((o) => o.id === c.orderId);
          if (o && !['Enviado', 'Entregue'].includes(o.status)) {
            o.status = 'Cancelado';
            s.jobs = s.jobs.filter((j) => j.orderId !== o.id);
          }
          break;
        }
        case 'expense.create':
          if (command.expense.amountCents <= 0)
            throw new ApiError('INVALID_AMOUNT', 'Informe um valor positivo.');
          s.expenses.unshift({ ...command.expense, id: uid('DES') });
          break;
        case 'expense.pay':
          requireValue(s.expenses.find((e) => e.id === command.id)).status = 'Pago';
          break;
        case 'subscription.renew':
          generateCycle(
            s,
            requireValue(s.subscriptions.find((x) => x.id === command.id)),
            command.result,
          );
          break;
        case 'subscription.state': {
          const sub = requireValue(s.subscriptions.find((x) => x.id === command.id));
          sub.status = command.status;
          sub.history.unshift({
            date: today(),
            label: 'Situação alterada pela equipe: ' + command.status,
          });
          break;
        }
        case 'ticket.reply': {
          const ticket = requireValue(s.tickets.find((t) => t.id === command.id));
          if (command.message.trim())
            ticket.messages.push({
              by: 'equipe',
              text: command.message,
              date: today(),
              internal: command.internal || false,
            });
          if (command.priority) ticket.priority = command.priority;
          ticket.status = command.status;
          ticket.assignee = command.assignee;
          break;
        }
        case 'prayer.moderate': {
          const p = requireValue(s.prayers.find((p) => p.id === command.id));
          p.hidden = !p.hidden;
          p.moderation = p.hidden ? 'Oculto' : 'Publicado';
          break;
        }
        case 'campaign.create':
          s.campaigns.unshift({
            id: uid('ORA'),
            ...command.campaign,
            recipients: s.newsletter?.subscribed ? 1 : 0,
            status: 'Simulado',
          });
          break;
        case 'team.save': {
          const member = command.member,
            existing = s.team.find((m) => m.id === member.id);
          if (existing) Object.assign(existing, member);
          else s.team.push(member);
          break;
        }
        case 'settings.save':
          s.settings = publicSettingsSchema.parse(command.settings);
          break;
      }
      audit(s, command.type, 'id' in command ? command.id : 'Operação', session.name);
    });
  }
}
