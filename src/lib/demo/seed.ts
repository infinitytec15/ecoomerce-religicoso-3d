import { productSchema } from '@/lib/domain/schemas';
import source from '@/data/legacy-seed.json';
import { defaultWorkspaceSettings } from '@/lib/domain/admin-types';
import type {
  Charge,
  Collection,
  Customer,
  Operations,
  Order,
  InventoryProduct,
  Session,
  Subscription,
  Ticket,
} from '@/lib/domain/types';
export const STAFF_PERMISSIONS: Session['permissions'] = [
  'orders',
  'subscriptions',
  'production',
  'shipping',
  'catalog',
  'customers',
  'finance',
  'support',
  'community',
  'marketing',
  'reports',
  'team',
  'settings',
];
export const DEMO_EMAIL = 'gestao@maosemoracao.demo';
export const DEMO_PASSWORD = 'Essencia3D!';
const cents = (v: number) => Math.round(v * 100);
export { normalizeAddress } from '@/lib/domain/address';
import { normalizeAddress } from '@/lib/domain/address';
export function createSeed(legacy = source.operations): Operations {
  const overrides = legacy.productOverrides as Record<
    string,
    Partial<(typeof source.products)[number]>
  >;
  const rawProducts = [...source.products, ...(legacy.extraProducts as typeof source.products)];
  const products: InventoryProduct[] = rawProducts.map((original) => {
    const p = { ...original, ...overrides[original.id] },
      inventory = legacy.inventory[p.id as keyof typeof legacy.inventory] || {
        stock: 10,
        cost: 25,
        sku: 'MEO-NOVO',
      };
    return {
      id: p.id,
      name: p.name,
      description: p.desc,
      category: p.category as Collection,
      tags: p.tags as Collection[],
      priceCents: cents(p.price),
      imageIndex: p.img,
      image: `/assets/products/${source.products.find((x) => x.img === p.img)?.id || source.products[0].id}.webp`,
      badge: p.tag,
      sizes: p.sizes,
      colors: p.colors,
      active: !('active' in p) || p.active !== false,
      sku: inventory.sku,
      stock: inventory.stock,
      costCents: cents(inventory.cost),
    };
  });
  const clients: Customer[] = legacy.clients.map((c) => ({
    ...normalizeAddress(c),
    id: c.id,
    status: c.status as Customer['status'],
    created: c.created,
    notes: c.notes || '',
  }));
  const orders: Order[] = legacy.orders.map((o) => ({
    id: o.id,
    number: o.id,
    customerId: o.customerId,
    subscriptionId: o.subscriptionId || undefined,
    type: o.type as Order['type'],
    edition: o.edition || undefined,
    items: o.items.map((x) => {
      const p = products.find((p) => p.id === x.id) || products[0];
      return {
        key: x.id + '|' + x.color + '|' + x.size,
        productId: x.id,
        name: x.name,
        image: p.image,
        imageIndex: x.img,
        color: x.color,
        size: x.size,
        sizeIndex: Math.max(0, p.sizes.indexOf(x.size)),
        unitCents: cents(x.price),
        quantity: x.qty,
        dedication: '',
      };
    }),
    totalCents: cents(o.total),
    subtotalCents: cents(o.total - o.shipping),
    discountCents: 0,
    shippingCents: cents(o.shipping),
    status: o.status as Order['status'],
    created: o.created,
    due: o.due,
    address: normalizeAddress(o.address),
    chargeId: o.chargeId,
    tracking: o.tracking || '',
    carrier: o.carrier,
    priority: o.priority as Order['priority'],
    notes: o.notes || '',
  }));
  const subscriptions: Subscription[] = legacy.subscriptions.map((s) => ({
    ...s,
    profile: s.profile as Subscription['profile'],
    status: s.status as Subscription['status'],
    payment: s.payment as Subscription['payment'],
    priceCents: cents(s.price),
    address: normalizeAddress(s.address),
  }));
  const charges: Charge[] = legacy.charges.map((c) => ({
    ...c,
    subscriptionId: c.subscriptionId || undefined,
    status: c.status as Charge['status'],
    method: c.method as Charge['method'],
    amountCents: cents(c.amount),
    paidAt: c.paidAt || undefined,
    pixCents: c.method === 'pix' ? cents(c.amount) : 0,
    cardCents: c.method === 'card' ? cents(c.amount) : 0,
    installments: 1,
  }));
  return {
    version: 2,
    workspace: { ...defaultWorkspaceSettings },
    invitations: [],
    editions: [
      {
        id: 'edition-current',
        name: legacy.settings.edition,
        month: legacy.settings.editionMonth,
        dispatchDay: legacy.settings.dispatchDay,
        status: 'Programada',
        profiles: legacy.settings.profiles,
        message: 'Que a esperança encontre espaço em seu lar.',
        notes: '',
      },
    ],
    coupons: [],
    stockMovements: [],
    reviews: [],
    products,
    clients,
    orders,
    subscriptions,
    charges,
    jobs: legacy.jobs.map((j) => ({
      ...j,
      stage: j.stage as Operations['jobs'][number]['stage'],
      priority: j.priority as 'Normal' | 'Alta',
    })),
    printers: legacy.printers.map((p) => ({
      ...p,
      status: p.status as Operations['printers'][number]['status'],
    })),
    expenses: legacy.expenses.map((e) => ({
      ...e,
      amountCents: cents(e.amount),
      status: e.status as 'Pago' | 'Previsto',
    })),
    tickets: legacy.tickets.map((t) => ({
      ...t,
      status: t.status as Ticket['status'],
      priority: t.priority as Ticket['priority'],
      messages: t.messages.map((m) => ({ ...m, by: m.by as 'cliente' | 'equipe' })),
    })),
    team: legacy.team.map((t) => ({ ...t, status: t.status as 'Ativo' | 'Inativo' })),
    settings: {
      ...legacy.settings,
      storeName: 'Mãos em Oração',
      priceCents: cents(legacy.settings.price),
    },
    campaigns: [],
    audit: legacy.audit,
    prayers: [
      {
        id: 'example-family',
        name: 'Exemplo de família',
        title: 'Pela paz em nosso lar',
        message:
          'Peço oração para que haja mais diálogo, paciência e união em nossa família. Que o amor de Deus guie nossos passos.',
        category: 'Família',
        anonymous: false,
        example: true,
        hidden: false,
        created: '2026-11-08',
        reactions: 0,
        owned: false,
        prayed: false,
      },
      {
        id: 'example-gratitude',
        name: 'Exemplo de gratidão',
        title: 'Gratidão pelos pequenos recomeços',
        message:
          'Hoje minha oração é de agradecimento. Pela vida, pelas pessoas que caminham comigo e pela esperança de recomeçar.',
        category: 'Gratidão',
        anonymous: false,
        example: true,
        hidden: false,
        created: '2026-11-08',
        reactions: 0,
        owned: false,
        prayed: false,
      },
      {
        id: 'example-direction',
        name: 'Exemplo de pedido',
        title: 'Sabedoria para uma nova etapa',
        message:
          'Peço oração por clareza e serenidade nas decisões desta fase. Que eu saiba ouvir, ter coragem e seguir com fé.',
        category: 'Direção',
        anonymous: false,
        example: true,
        hidden: false,
        created: '2026-11-08',
        reactions: 0,
        owned: false,
        prayed: false,
      },
    ],
    newsletter: null,
    processed: {},
  };
}
export const seedCatalog = createSeed().products.map((product) => productSchema.parse(product));
export const seedSettings = createSeed().settings;
