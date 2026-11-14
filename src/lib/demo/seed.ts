import { productSchema } from '@/lib/domain/schemas';
import { withKitSummary } from '@/lib/domain/kits';
import { KIT_COLOR, KIT_SIZE, kitCostCents } from '@maos-em-oracao/contracts';
import source from '@/data/legacy-seed.json';
import { defaultWorkspaceSettings } from '@/lib/domain/admin-types';
import type { AdminReview } from '@maos-em-oracao/contracts';
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
/** "Kit Oração em Família": one piece each of three catalog items, sold below their sum. */
function demoKit(products: InventoryProduct[]): InventoryProduct {
  const cross = products.find((p) => p.id === 'cruz-essencial') ?? products[0],
    kit = {
      components: [
        { productId: cross.id, sizeIndex: 1, color: 'Marfim', quantity: 1 },
        { productId: 'palavra-fe', sizeIndex: 0, color: 'Terracota', quantity: 1 },
        { productId: 'biblia-viva', sizeIndex: 0, color: null, quantity: 1 },
      ],
    };
  return {
    id: 'kit-oracao-familia',
    name: 'Kit Oração em Família',
    description:
      'Três peças para o altar de casa: a cruz, a Palavra e a Bíblia reunidas em um presente só.',
    category: 'Presentes',
    tags: ['Presentes', 'Cristãos', 'Evangélicos'],
    priceCents: cents(169.9),
    imageIndex: cross.imageIndex,
    image: cross.image,
    badge: 'Kit',
    sizes: [KIT_SIZE],
    colors: [KIT_COLOR],
    active: true,
    sku: 'MEO-KIT-FAMILIA',
    stock: 0,
    costCents: kitCostCents(kit, new Map(products.map((p) => [p.id, p])), 0),
    kit,
  };
}
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
  products.push(demoKit(products));
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
  // Demo customer ("Explorar com uma conta de teste") with a delivered order, so reviews can be tried.
  const demoClient: Customer = {
    ...clients[0],
    id: 'CLI-DEMO',
    name: 'Ana Ferreira',
    email: 'ana@exemplo.com',
    notes: '',
  };
  const demoProduct = products[0],
    demoSize = demoProduct.sizes[Math.min(1, demoProduct.sizes.length - 1)],
    demoColor = demoProduct.colors[0],
    deliveredTemplate = orders.find((o) => o.status === 'Entregue') || orders[0],
    chargeTemplate = charges.find((c) => c.id === deliveredTemplate.chargeId) || charges[0];
  const demoUnit = demoProduct.priceCents;
  clients.push(demoClient);
  orders.push({
    ...deliveredTemplate,
    id: 'PED-4100',
    number: 'PED-4100',
    customerId: demoClient.id,
    subscriptionId: undefined,
    type: 'Loja',
    edition: undefined,
    items: [
      {
        key: [demoProduct.id, demoColor, demoSize].join('|'),
        productId: demoProduct.id,
        name: demoProduct.name,
        image: demoProduct.image,
        imageIndex: demoProduct.imageIndex,
        color: demoColor,
        size: demoSize,
        sizeIndex: Math.max(0, demoProduct.sizes.indexOf(demoSize)),
        unitCents: demoUnit,
        quantity: 1,
        dedication: '',
      },
    ],
    subtotalCents: demoUnit,
    discountCents: 0,
    totalCents: demoUnit + deliveredTemplate.shippingCents,
    status: 'Entregue',
    created: '2026-10-20',
    due: '2026-10-22',
    address: { ...demoClient },
    chargeId: 'COB-4100',
    tracking: deliveredTemplate.tracking,
  });
  charges.push({
    ...chargeTemplate,
    id: 'COB-4100',
    customerId: demoClient.id,
    orderId: 'PED-4100',
    subscriptionId: undefined,
    amountCents: demoUnit + deliveredTemplate.shippingCents,
    status: 'Pago',
    paidAt: '2026-10-20',
  });
  const variant = (size: string) => `${size} · ${demoColor}`;
  const seedReview = (
    n: number,
    r: Pick<AdminReview, 'rating' | 'title' | 'text' | 'author' | 'createdAt' | 'variant'> &
      Partial<Pick<AdminReview, 'reply' | 'repliedAt'>>,
  ): AdminReview => ({
    photos: [],
    reply: null,
    repliedAt: null,
    ...r,
    id: `AV-DEMO-${n}`,
    status: 'Publicado',
    productId: demoProduct.id,
    productName: demoProduct.name,
    orderId: `PED-39${n}0`,
    orderNumber: `PED-39${n}0`,
    customerName: r.author,
    customerEmail: `cliente${n}@exemplo.com`,
  });
  const reviews: AdminReview[] = [
    seedReview(1, {
      rating: 5,
      title: 'Perfeita para o altar da sala',
      text: 'Chegou muito bem embalada e o acabamento é lindo. Combinou com o cantinho de oração da nossa casa.',
      author: 'Ana P.',
      createdAt: '2026-11-02T14:20:00.000Z',
      variant: variant(demoProduct.sizes[1] || demoSize),
      reply: 'Que alegria saber que ela encontrou o lugar certo na sua casa. Obrigada, Ana!',
      repliedAt: '2026-11-03T10:05:00.000Z',
    }),
    seedReview(2, {
      rating: 5,
      title: 'Presente que emocionou',
      text: 'Dei de presente para minha mãe e ela ficou emocionada. Peça delicada e muito bem feita.',
      author: 'Marcos T.',
      createdAt: '2026-10-27T18:40:00.000Z',
      variant: variant(demoProduct.sizes[0]),
    }),
    seedReview(3, {
      rating: 4,
      title: '',
      text: 'Muito bonita e firme. A cor é um pouco mais clara do que nas fotos, mas gostamos do resultado.',
      author: 'Lúcia R.',
      createdAt: '2026-10-19T09:15:00.000Z',
      variant: variant(demoProduct.sizes[0]),
    }),
  ];
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
    reviews,
    groupBuys: [],
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
const seedProducts = createSeed().products;
export const seedCatalog = seedProducts.flatMap((product) => {
  const visible = withKitSummary(seedProducts, product);
  return visible ? [productSchema.parse(visible)] : [];
});
export const seedSettings = createSeed().settings;
