import { z } from 'zod';

/** Group-buy (compra coletiva) contracts. Kept free of other contract imports so schemas.ts can use them. */
export const GROUP_BUY_MODES = ['difference', 'hold'] as const;
export type GroupBuyMode = (typeof GROUP_BUY_MODES)[number];
export const groupBuyModeLabels: Record<GroupBuyMode, string> = {
  difference: 'Devolve a diferença',
  hold: 'Estorno se não fechar',
};
export type GroupBuyStatus = 'Aberta' | 'Meta atingida' | 'Concluída' | 'Não fechou';

const groupBuyStatusSchema = z.enum(['Aberta', 'Meta atingida', 'Concluída', 'Não fechou']);
const orderStatusSchema = z.enum([
  'Aguardando pagamento',
  'Aguardando grupo',
  'Confirmado',
  'Em produção',
  'Em acabamento',
  'Pronto para envio',
  'Enviado',
  'Entregue',
  'Cancelado',
]);
const groupBuyId = z.string().min(1).max(64);

export const groupBuyInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(3).max(80),
    description: z.string().trim().max(600).default(''),
    productId: z.string().min(1),
    sizeIndex: z.number().int().min(0).max(10),
    groupPriceCents: z.number().int().min(1).max(100_000_000),
    goal: z.number().int().min(2).max(1000),
    maxParticipants: z.number().int().min(2).max(5000).nullable(),
    perPersonLimit: z.number().int().min(1).max(10),
    mode: z.enum(GROUP_BUY_MODES),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime(),
    active: z.boolean(),
  })
  .refine((v) => v.maxParticipants === null || v.maxParticipants >= v.goal, {
    message: 'O limite de participantes não pode ser menor que a meta.',
    path: ['maxParticipants'],
  });
export type GroupBuyInput = z.infer<typeof groupBuyInputSchema>;

export const groupBuySummarySchema = z.object({
  id: groupBuyId,
  title: z.string(),
  mode: z.enum(GROUP_BUY_MODES),
  sizeIndex: z.number().int().min(0).max(10),
  size: z.string(),
  groupPriceCents: z.number().int().nonnegative(),
  normalPriceCents: z.number().int().nonnegative(),
  goal: z.number().int().positive(),
  participants: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(),
  maxParticipants: z.number().int().positive().nullable(),
  perPersonLimit: z.number().int().positive(),
  endsAt: z.string(),
  goalReached: z.boolean(),
  status: groupBuyStatusSchema,
  initials: z.array(z.string()),
});
export type GroupBuySummary = z.infer<typeof groupBuySummarySchema>;

export const groupBuyPublicSchema = groupBuySummarySchema.extend({
  description: z.string(),
  productId: z.string().min(1),
  productName: z.string(),
  productImage: z.string(),
  colors: z.array(z.string()),
});
export type GroupBuyPublic = z.infer<typeof groupBuyPublicSchema>;

export const adminGroupBuySchema = groupBuyPublicSchema.extend({
  active: z.boolean(),
  startsAt: z.string(),
  createdAt: z.string(),
  costCents: z.number().int().nonnegative(),
  /** True when the campaign already has at least one order. */
  locked: z.boolean(),
  refundedCents: z.number().int().nonnegative(),
  orders: z.array(
    z.object({
      orderId: z.string(),
      number: z.string(),
      customerName: z.string(),
      email: z.string(),
      quantity: z.number().int().positive(),
      paidUnitCents: z.number().int().nonnegative(),
      status: orderStatusSchema,
      paymentStatus: z.string(),
      refund: z
        .object({ amountCents: z.number().int().nonnegative(), status: z.string() })
        .nullable(),
      createdAt: z.string(),
    }),
  ),
});
export type AdminGroupBuy = z.infer<typeof adminGroupBuySchema>;

/** Stored in Order.data.groupBuy. */
export interface GroupBuyOrderSnapshot {
  id: string;
  title: string;
  mode: GroupBuyMode;
  normalUnitCents: number;
  groupUnitCents: number;
  paidUnitCents: number;
  quantity: number;
}

const time = (value: Date | string) => new Date(value).getTime();

export function groupBuyJoinable(
  gb: {
    active: boolean;
    status: GroupBuyStatus | string;
    startsAt: Date | string;
    endsAt: Date | string;
  },
  now: Date,
): boolean {
  return (
    gb.active &&
    (gb.status === 'Aberta' || gb.status === 'Meta atingida') &&
    time(gb.startsAt) <= now.getTime() &&
    now.getTime() < time(gb.endsAt)
  );
}

/** Unit price charged for a group order: hold always pays the group price, difference only after the goal. */
export function groupUnitCents(
  mode: GroupBuyMode,
  goalReached: boolean,
  normalUnitCents: number,
  groupPriceCents: number,
): number {
  return mode === 'hold' || goalReached ? groupPriceCents : normalUnitCents;
}

export function groupDifferenceCents(
  s: Pick<GroupBuyOrderSnapshot, 'paidUnitCents' | 'groupUnitCents' | 'quantity'>,
): number {
  return Math.max(0, (s.paidUnitCents - s.groupUnitCents) * s.quantity);
}

export function remainingParticipants(goal: number, participants: number): number {
  return Math.max(0, goal - participants);
}

/** First letter of the first and last names, uppercase; '?' when empty. */
export function participantInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0]!;
  const last = parts.length > 1 ? parts[parts.length - 1]! : '';
  return (first.charAt(0) + last.charAt(0)).toLocaleUpperCase('pt-BR');
}

export function endsInLabel(endsAt: Date | string, now: Date): string {
  const ms = time(endsAt) - now.getTime();
  if (ms <= 0) return 'encerrada';
  const hours = ms / 3_600_000;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `termina em ${days} ${days === 1 ? 'dia' : 'dias'}`;
  }
  if (hours >= 1) {
    const whole = Math.floor(hours);
    return `termina em ${whole} ${whole === 1 ? 'hora' : 'horas'}`;
  }
  return 'termina em minutos';
}
