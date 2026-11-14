# Compra coletiva — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O admin cria campanhas de compra coletiva ligadas a um produto (ou kit) e tamanho.
- O cliente entra no grupo por um checkout próprio: um único item, sem cupom e sem misturar com o carrinho.
- A loja mostra o progresso ("7 de 10 · faltam 3 · termina em 2 dias").
- O sistema fecha a campanha no prazo e, conforme o modo, devolve a diferença ou estorna tudo.

**Architecture:**
- **Campanha e vínculo:** a campanha é uma tabela nova, `GroupBuy`. Cada pedido de grupo aponta para ela por `Order.groupBuyId` e guarda um snapshot de preços em `Order.data.groupBuy`.
- **Participantes:** contam os clientes distintos com pedido pago e não cancelado. A contagem é refeita sob lock no momento do pagamento (`PaymentsService.apply`). É ali que se decide segurar o pedido ("Aguardando grupo") e marcar a meta batida.
- **Worker:** o efeito da meta (liberar pedidos ou devolver a diferença), o fechamento no prazo e o estorno de quem não fechou rodam no worker, por eventos do outbox com chaves idempotentes.
- **Estorno parcial:** é um método novo em `PaymentsService`, sobre o `payments.refund(id, amount, key)` que já existe na integração.

**Tech Stack:** zod 4, NestJS + Prisma 7, Next.js 16, Vitest + Testing Library, `scripts/backend-test.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-13-crescimento-loja-design.md`, seção "4. Compra coletiva".

**Recon:** os números de linha citados ("~:NNN") vêm de uma leitura em b61e1d5. Confira antes de editar.

## Global Constraints

- Todo texto de interface em pt-BR, no tom das telas atuais.
- Dinheiro sempre em centavos inteiros.
- Nenhuma dependência nova.
- Uma única migração: `202611150001_group_buys`.
- **Modos:**
  - `mode` é `'difference'` (rótulo "Devolve a diferença") ou `'hold'` (rótulo "Estorno se não fechar").
- **Status da campanha:** `'Aberta' | 'Meta atingida' | 'Concluída' | 'Não fechou'`.
  - "Concluída" = prazo acabou com a meta batida.
  - "Não fechou" = prazo acabou (ou o admin encerrou) sem a meta.
- **Novo status de pedido:** `'Aguardando grupo'`, com tom "warning" no badge.
  - É receita paga: não entra em `unpaidStatuses` dos relatórios.
- **Participante:**
  - Conta cada pessoa distinta (e-mail do cliente, sem diferenciar maiúsculas) entre os pedidos com `groupBuyId = campanha`, `payment.status = 'Pago'` e `status ≠ 'Cancelado'`. (Revisão final: antes era por `customerId`, mas o checkout de visitante cria um cliente por pedido.)
  - O mesmo cliente com dois pedidos conta uma vez.
- **Preço por unidade no pedido de grupo** (`normal = unitPriceCents(produto, sizeIndex)`):
  - `hold`: sempre `groupPriceCents`.
  - `difference`: `normal` enquanto `goalReachedAt` é null no momento do checkout; `groupPriceCents` depois.
- **Diferença a devolver:** `(paidUnitCents − groupUnitCents) × quantity`, só quando for > 0.
- **Quem pode entrar** (`groupBuyJoinable`): campanha `active` e status `'Aberta'` ou `'Meta atingida'`, com `startsAt ≤ agora < endsAt`.
  - Fora disso: 409 `GROUP_BUY_CLOSED`.
  - Com `maxParticipants` atingido e o cliente ainda não participante: 409 `GROUP_BUY_FULL`.
- **Checkout de grupo:** exatamente 1 linha, com o `productId` e o `sizeIndex` da campanha; a cor é livre entre as cores do produto.
  - Violação de linha: 422 `GROUP_BUY_SINGLE_ITEM` (mais de uma linha) ou 422 `GROUP_BUY_ITEM` (produto ou tamanho diferente).
  - `coupon` precisa ser `''`; senão, 422 `COUPON_NOT_ALLOWED`.
  - Soma das quantidades do cliente (por e-mail, sem diferenciar maiúsculas) nos pedidos não cancelados da campanha + a nova ≤ `perPersonLimit`; senão, 422 `GROUP_BUY_LIMIT`.
- **Uma campanha aberta por produto:** status `'Aberta'`/`'Meta atingida'`; uma segunda dá 409 `GROUP_BUY_EXISTS`.
- **Preço de grupo:** precisa ser menor que o preço normal do tamanho; senão, 422 `GROUP_PRICE_NOT_LOWER`.
- **Pedido "Aguardando grupo":** nunca vai para a produção.
  - `payments.production()` recusa com 409 `GROUP_PENDING`, inclusive pelos atalhos do admin.
- **Chaves idempotentes do outbox:**
  - `group-reached/<groupBuyId>` (kind `group-buy-reached`), e `group-close-release/<groupBuyId>` (mesmo kind) quando uma campanha `hold` fecha como "Concluída", para liberar pedidos que ficaram retidos;
  - `group-diff/<orderId>` (kind `group-buy-refund`);
  - `group-fail/<orderId>` (kind `group-buy-fail-order`);
  - `refund-order` com chave `group-fail-refund/<orderId>`.
- **Chaves de e-mail:** `group-joined/<orderId>`, `group-confirmed/<orderId>`, `group-difference/<orderId>`, `group-failed/<orderId>`.
- **Permissão:** comandos `groupbuy.*` e a lista no admin exigem a permissão `marketing`.
- **Aviso de margem no admin:** reutiliza `kitMargin({ priceCents: groupPriceCents, costCents: unitCostCents(produto, sizeIndex) }, settings)`.
  - `loss` → "Preço de grupo abaixo do custo (R$ X)."
  - `belowMinimum` → "Margem abaixo da mínima de N%."

## Review Focus

- **Pedido criado antes da meta e pago depois dela, no modo `difference`:** pagou o preço normal e também recebe a diferença (Task 4 enfileira; Task 5 testa).
- **Pagamento aprovado quando a campanha já está "Não fechou", no modo `hold`:** o pedido é cancelado e estornado, nunca fica preso em "Aguardando grupo" (Task 4 e Task 5).
- **Admin tenta mandar um pedido "Aguardando grupo" para a produção** por `order.update` ou `orders.batch`: recebe 409 `GROUP_PENDING` (Task 4).
- **Pagamento dividido (Pix + cartão) com diferença a devolver:** o estorno se distribui entre as partes sem passar do capturado de cada uma. Um retry não estorna duas vezes (Task 5).
- **Worker rodando `tick()`/`dispatch()` repetidamente:** um único estorno e um único e-mail por pedido (Task 5).

---

### Task 1: Contratos da compra coletiva e o status "Aguardando grupo"

**Files:**
- Create: `packages/contracts/src/group-buys.ts`, `packages/contracts/src/group-buys.test.ts`
- Modify:
  - `packages/contracts/src/index.ts` (export).
  - `packages/contracts/src/types.ts`:
    - `OrderStatus` (~:44) ganha `'Aguardando grupo'`;
    - `Product.groupBuy?: GroupBuySummary`;
    - `Operations.groupBuys: AdminGroupBuy[]`;
    - `AdminCommand` ganha os 3 comandos.
  - `packages/contracts/src/schemas.ts`:
    - `checkoutSchema` (~:41) ganha `groupBuyId: z.string().uuid().optional()`;
    - o schema usado por `estimate` também;
    - `productSchema.groupBuy` optional.
  - `packages/backend-core/src/command-schema.ts`: `status` enum (~:16).
  - `src/lib/api/response-schemas.ts`: `orderSchema.status` (~:97); `operationsSchema.groupBuys` `.default([])`.
  - Status em telas:
    - `src/components/ui/status-badge.tsx` (warning);
    - `src/features/admin/orders.tsx:21` (`orderStatuses`);
    - `src/features/admin/analytics.tsx:311` (funil: conta como pago);
    - `src/stories/foundations.stories.tsx:89`.

**Interfaces — Produces:**
- `GROUP_BUY_MODES = ['difference', 'hold'] as const`; `GroupBuyMode`; `groupBuyModeLabels: Record<GroupBuyMode, string>`.
- `GroupBuyStatus = 'Aberta' | 'Meta atingida' | 'Concluída' | 'Não fechou'`.
- `groupBuyInputSchema`:

  ```ts
  z.object({
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
  ```

  Tem um `.refine`: `maxParticipants === null || maxParticipants >= goal`.
- `groupBuySummarySchema`: `{ id, title, mode, sizeIndex, size, groupPriceCents, normalPriceCents, goal, participants, remaining, maxParticipants: number | null, perPersonLimit, endsAt, goalReached: boolean, status, initials: string[] }`. Também vale como item público de `GET group-buys`.
- `groupBuyPublicSchema = groupBuySummarySchema.extend({ description, productId, productName, productImage, colors: string[] })`.
- `adminGroupBuySchema = groupBuyPublicSchema.extend({ active, startsAt, createdAt, costCents, locked: boolean, refundedCents, orders: { orderId, number, customerName, email, quantity, paidUnitCents, status: OrderStatus, paymentStatus, refund: { amountCents, status } | null, createdAt }[] })`.
  - `locked` = existe ao menos um pedido da campanha.
- `GroupBuyOrderSnapshot = { id, title, mode, normalUnitCents, groupUnitCents, paidUnitCents, quantity }`. É gravado em `Order.data.groupBuy`.
- `groupBuyJoinable(gb: { active, status, startsAt: Date|string, endsAt: Date|string }, now: Date): boolean`.
- `groupUnitCents(mode, goalReached: boolean, normalUnitCents, groupPriceCents): number`.
- `groupDifferenceCents(s: Pick<GroupBuyOrderSnapshot, 'paidUnitCents'|'groupUnitCents'|'quantity'>): number`.
- `remainingParticipants(goal, participants): number` (nunca negativo).
- `participantInitials(name: string): string`.
- `endsInLabel(endsAt: Date|string, now: Date): string`.
- `AdminCommand` ganha:
  - `{ type: 'groupbuy.save' } & GroupBuyInput`;
  - `{ type: 'groupbuy.close'; id }`;
  - `{ type: 'groupbuy.extend'; id; endsAt }`.

- [ ] **Step 1: Write the failing tests** (`group-buys.test.ts`):

```ts
const now = new Date('2026-11-14T12:00:00Z');
const h = (n: number) => new Date(now.getTime() + n * 3600_000);
it('prices by mode and goal', () => {
  expect(groupUnitCents('hold', false, 8990, 6990)).toBe(6990);
  expect(groupUnitCents('difference', false, 8990, 6990)).toBe(8990);
  expect(groupUnitCents('difference', true, 8990, 6990)).toBe(6990);
});
it('difference is per unit times quantity, never negative', () => {
  expect(groupDifferenceCents({ paidUnitCents: 8990, groupUnitCents: 6990, quantity: 2 })).toBe(4000);
  expect(groupDifferenceCents({ paidUnitCents: 6990, groupUnitCents: 6990, quantity: 3 })).toBe(0);
});
it('joinable only when active, open and inside the window', () => {
  const base = { active: true, status: 'Aberta', startsAt: h(-1), endsAt: h(5) } as const;
  expect(groupBuyJoinable(base, now)).toBe(true);
  expect(groupBuyJoinable({ ...base, status: 'Meta atingida' }, now)).toBe(true);
  expect(groupBuyJoinable({ ...base, active: false }, now)).toBe(false);
  expect(groupBuyJoinable({ ...base, status: 'Não fechou' }, now)).toBe(false);
  expect(groupBuyJoinable({ ...base, endsAt: h(-0.1) }, now)).toBe(false);
  expect(groupBuyJoinable({ ...base, startsAt: h(1) }, now)).toBe(false);
});
it('labels the deadline', () => {
  expect(endsInLabel(h(49), now)).toBe('termina em 2 dias');
  expect(endsInLabel(h(24), now)).toBe('termina em 1 dia');
  expect(endsInLabel(h(5), now)).toBe('termina em 5 horas');
  expect(endsInLabel(h(1), now)).toBe('termina em 1 hora');
  expect(endsInLabel(h(0.3), now)).toBe('termina em minutos');
  expect(endsInLabel(h(-1), now)).toBe('encerrada');
});
it('initials and remaining', () => {
  expect(participantInitials('Maria das Graças Souza')).toBe('MS');
  expect(participantInitials('joão')).toBe('J');
  expect(participantInitials('  ')).toBe('?');
  expect(remainingParticipants(10, 7)).toBe(3);
  expect(remainingParticipants(10, 12)).toBe(0);
});
it('rejects a cap below the goal', () => {
  const ok = { title: 'Natal', productId: 'p', sizeIndex: 0, groupPriceCents: 5000, goal: 5,
    maxParticipants: null, perPersonLimit: 2, mode: 'hold', endsAt: h(48).toISOString(), active: true };
  expect(groupBuyInputSchema.parse(ok).description).toBe('');
  expect(() => groupBuyInputSchema.parse({ ...ok, maxParticipants: 4 })).toThrow();
});
```

- [ ] **Step 2: Run** `npx vitest run packages/contracts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the module and add the status in every listed place.
- [ ] **Step 4: Run** `npx vitest run packages/contracts src/components src/features/admin` and `npx tsc --noEmit`. Expected: PASS.
  - Fix any exhaustive `Record<OrderStatus, …>` that TS flags, with "Aguardando grupo" next to "Confirmado".
- [ ] **Step 5: Commit** `feat(contracts): compra coletiva e status "Aguardando grupo"`

### Task 2: E-mails da compra coletiva

**Files:**
- Modify: `packages/emails/src/index.ts`, `packages/emails/src/samples.ts`, `packages/emails/src/emails.test.ts`

**Interfaces — Produces** (variantes de `emailMessageSchema`; `order` = `{ name, actionUrl, orderNumber, totalCents }`):
- **`'group-joined'`:** `{ ...order, groupTitle: line, participants: int ≥ 0, goal: int ≥ 2, endsAtLabel: line }`.
  - Rótulo: "Você entrou no grupo".
  - Título: "Você entrou no grupo!".
  - Intro: "Seu pagamento foi aprovado. Quando o grupo chegar a {goal} pessoas, seu pedido vai para a produção. Se não fechar até {endsAtLabel}, devolvemos todo o valor."
  - Detalhes: "Compra coletiva" = groupTitle; "Participantes" = "{participants} de {goal}".
  - CTA: "Acompanhar pedido".
- **`'group-confirmed'`:** `{ ...order, groupTitle }`.
  - Rótulo: "O grupo fechou".
  - Intro: "A compra coletiva {groupTitle} bateu a meta. Seu pedido já foi para a produção."
  - CTA: "Acompanhar pedido".
- **`'group-difference'`:** `{ ...order, groupTitle, refundedCents: cents }`.
  - Rótulo: "Devolvemos a diferença".
  - Intro: "A compra coletiva {groupTitle} bateu a meta e o preço caiu. Devolvemos {money(refundedCents)} no mesmo meio de pagamento."
  - O renderer lança erro se `refundedCents > totalCents`, como em `refund-confirmed`.
  - CTA: "Ver pedido".
- **`'group-failed'`:** `{ ...order, groupTitle }`.
  - Rótulo: "O grupo não fechou".
  - Intro: "A compra coletiva {groupTitle} não chegou à meta no prazo. Cancelamos o pedido e vamos estornar {money(totalCents)} no mesmo meio de pagamento."
  - CTA: "Ver pedido".
- Suba `EMAIL_TEMPLATE_VERSION`.

- [ ] **Step 1: Write the failing tests** in `emails.test.ts`:
  - the existing "every label has a sample" assertion covers the 4 new kinds;
  - `group-difference` HTML contains "R$ 40,00" for `refundedCents: 4000`;
  - rendering it with `refundedCents > totalCents` throws;
  - `group-joined` HTML contains "3 de 10".
- [ ] **Step 2: Run** `npx vitest run packages/emails`. Expected: FAIL.
- [ ] **Step 3: Implement** the 4 variants, labels, `content()` cases and samples.
- [ ] **Step 4: Run** `npx vitest run packages/emails`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(emails): e-mails da compra coletiva`

### Task 3: Banco, admin e leitura pública das campanhas

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create:
  - `packages/database/prisma/migrations/202611150001_group_buys/migration.sql` (same style as `202611140001_reviews`).
  - `packages/backend-core/src/group-buys.ts` (`GroupBuysService`).
- Modify:
  - `packages/backend-core/src/projections.ts`: `groupBuySummaryDto`, `groupBuyPublicDto`, `groupBuyAdminDto`.
  - `packages/backend-core/src/admin.ts`:
    - `permissionMap.groupbuy = 'marketing'`;
    - cases `groupbuy.save|close|extend`;
    - snapshot `groupBuys` gated by `can('marketing')`, newest first, take 200.
  - `packages/backend-core/src/command-schema.ts`: the 3 commands. `groupbuy.save` wraps `groupBuyInputSchema`; `extend` takes `{ id: uuid, endsAt: datetime }`.
  - `packages/backend-core/src/catalog.ts`: `list` and `product` attach `groupBuy` (one `findMany` of joinable campaigns for the listed product ids, plus one participants query).
  - `apps/api/src/commerce.module.ts`: new `GroupBuysController` + `GroupBuysModule`, registered in `apps/api/src/main.ts`.
  - `src/app/api/v1/[...path]/route.ts`: regex gets `group-buys(?:\/[a-zA-Z0-9_-]+)?`.
  - `src/app/api/v1/proxy.test.ts`.
- Test: `scripts/backend-test.mjs`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - Prisma `GroupBuy`:
    - Campos: `id uuid`, `title`, `description @default("")`, `productId`, `sizeIndex Int`, `groupPriceCents Int`, `goal Int`, `maxParticipants Int?`, `perPersonLimit Int @default(1)`, `mode String`, `status String @default("Aberta")`, `active Boolean @default(true)`, `startsAt DateTime @default(now())`, `endsAt DateTime`, `goalReachedAt DateTime?`, `closedAt DateTime?`, `createdAt`, `updatedAt @updatedAt`.
    - Relação `product` com `onDelete: Restrict`; `orders Order[]`.
    - `@@index([status, endsAt])`, `@@index([productId, status])`.
  - `Order.groupBuyId String?`, com relação `onDelete: Restrict` e `@@index([groupBuyId])`.
  - `GroupBuysService(ctx)`:
    - `participants(db, groupBuyId): Promise<number>`: regra do Global Constraints, via `distinct: ['customerId']`.
    - `save(actor, value)`:
      - Só `marketing`.
      - Valida: produto existe, ativo, não arquivado; `sizeIndex` válido; preço de grupo < `unitPriceCents(produto, sizeIndex)`; `endsAt > now` (422 `INVALID_END`); uma aberta por produto.
      - Quando `locked`, só `title`, `description`, `active`, `perPersonLimit` e `maxParticipants` (≥ participantes atuais) mudam. Mudar outro campo dá 409 `GROUP_BUY_LOCKED`.
      - Audit "Compra coletiva salva".
    - `extend(actor, id, endsAt)`:
      - Só com status aberto e `endsAt` novo > atual; senão, 422 `INVALID_END`.
      - Audit.
    - `close(actor, id)`: só `marketing`; faz `endsAt = now` e chama `closeCampaign(id, now)`.
      - Nesta task, `closeCampaign` faz só o passo 1 da definição da Task 5 (o claim do status).
      - A Task 5 acrescenta os eventos de fracasso.
    - `forProduct(db, productIds): Promise<Map<string, GroupBuySummary>>`: só campanhas joinable.
    - `publicList()`, `publicOne(id)`: 404 `NOT_FOUND` se não for joinable.
  - Rotas públicas: `GET group-buys` → `GroupBuyPublic[]` (prazo mais próximo primeiro); `GET group-buys/:id` → `GroupBuyPublic`.
  - `initials`: dos primeiros 8 participantes, por ordem de pagamento, via `participantInitials(customer.name)`. Nenhum nome ou e-mail completo sai nas rotas públicas.

- [ ] **Step 1: Write the failing integration check** `'compra coletiva: admin cria, loja mostra e só marketing mexe'`:
  1. `groupbuy.save` com `groupPriceCents` ≥ preço normal do tamanho → 422 `GROUP_PRICE_NOT_LOWER`.
  2. Save válido (`mode 'hold'`, goal 2, `perPersonLimit` 2, `endsAt` +3 dias) → `ops.groupBuys[0]` com `participants 0`, `status 'Aberta'`, `locked false`, `orders []`.
  3. Segunda campanha para o mesmo produto → 409 `GROUP_BUY_EXISTS`.
  4. `GET group-buys` lista a campanha. `GET catalog/products/:id` tem `groupBuy { goal: 2, participants: 0, remaining: 2 }`.
  5. `groupbuy.extend` com `endsAt` anterior ao atual → 422 `INVALID_END`.
  6. `customer.command({ type: 'groupbuy.close', id })` → 403.
  7. Save com `active false` → o produto não tem `groupBuy` e `GET group-buys/:id` → 404. Reative no fim, porque a Task 4 continua desta campanha.
  8. `operationsSchema.parse(ops)` passa.
  9. Proxy test: `group-buys` e `group-buys/<uuid>` passam pela allow-list.
- [ ] **Step 2: Run** `set -a; . ./.env.backend.local; set +a; npm run backend:build && npm run backend:test` (Docker postgres/redis up) and `npx vitest run src/app/api`. Expected: FAIL.
- [ ] **Step 3: Implement.** Order: schema + migration, `npm run backend:generate`, then the service, admin, catalog and the API.
- [ ] **Step 4: Run** the backend suite, `npx vitest run src/app/api` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): campanhas de compra coletiva`

### Task 4: Checkout do grupo e pagamento que segura o pedido

**Files:**
- Modify:
  - `packages/backend-core/src/orders.ts`: `checkout` (~:404) and `estimate` (~:365).
  - `packages/backend-core/src/payments.ts`: `apply` paid branch (~:351-420) and `production` (~:451).
  - `packages/backend-core/src/group-buys.ts`: `context`, `onPaid`.
- Test: `scripts/backend-test.mjs`. Extend the `checkout(...)` helper (~:184) with an optional `{ groupBuyId, coupon, items }`.

**Interfaces:**
- Consumes: Task 1 helpers, Task 2 `'group-joined'`, Task 3 tables/service.
- Produces:
  - `GroupBuysService.context(tx, input: { groupBuyId, items: OrderItemInput[], coupon: string }, email: string, now): Promise<{ groupBuy: GroupBuy; unitCents: number; snapshot: GroupBuyOrderSnapshot }>`.
    - Faz `lock(tx, 'group-buy/' + id)` e aplica todas as regras de checkout do Global Constraints.
    - Erros na ordem: `GROUP_BUY_CLOSED`, `GROUP_BUY_SINGLE_ITEM`, `GROUP_BUY_ITEM`, `COUPON_NOT_ALLOWED`, `GROUP_BUY_LIMIT`, `GROUP_BUY_FULL`.
    - `estimate` usa o mesmo cálculo sem e-mail (pula `LIMIT` e `FULL`).
  - `checkout` com `groupBuyId`:
    - Depois de `this.cart(...)`, troca o preço unitário da única linha (o campo que `cart()` preenche via `unitPriceCents`, ~:175) por `unitCents`.
    - Grava `groupBuyId` e `data.groupBuy = snapshot` no pedido. Subtotal, total e parcelas saem do preço trocado.
    - O frete continua vindo da cotação normal (`fingerprint` não muda).
  - `GroupBuysService.onPaid(tx, orderId, now): Promise<'hold' | 'release' | 'fail'>`. É chamado em `apply` depois de o intent virar `'Pago'`, só quando `stockReady`:
    1. Faz `lock(tx, 'group-buy/' + id)`.
    2. Status `'Não fechou'` → event `group-fail/<orderId>` (`group-buy-fail-order`, payload `{ orderId }`), retorna `'fail'`.
    3. Se `goalReachedAt` é null e `participants ≥ goal`: grava `goalReachedAt = now` e `status 'Meta atingida'`, mais o event `group-reached/<id>` (`group-buy-reached`, payload `{ groupBuyId }`).
    4. `hold` e `goalReachedAt` ainda null → `'hold'`.
    5. `difference` com meta batida e `groupDifferenceCents(snapshot) > 0` → event `group-diff/<orderId>` (`group-buy-refund`, payload `{ orderId }`).
    6. Retorna `'release'`.
  - `apply`:
    - `'hold'` / `'fail'` → `order.status 'Aguardando grupo'`, sem `production()`.
    - `'hold'` também envia `'group-joined'` (chave `group-joined/<orderId>`, `endsAtLabel` em `dd/mm/aaaa`, America/Sao_Paulo) no lugar de `'payment-approved'`. `'fail'` não envia e-mail.
    - `'release'` e pedidos sem grupo: comportamento atual.
  - `production(tx, orderId)`: com `order.status === 'Aguardando grupo'` lança `DomainError('GROUP_PENDING', …, 409)`.
  - `order.update`: sair de `'Aguardando grupo'` só é permitido para `'Cancelado'`. Qualquer outro destino dá 409 `GROUP_PENDING`.

- [ ] **Step 1: Write the failing integration check** `'compra coletiva segura o pedido até o grupo fechar'`. Continua a campanha `hold` da Task 3 (goal 2, limite 2):
  1. **Recusas:**
     - Duas linhas → 422 `GROUP_BUY_SINGLE_ITEM`.
     - Coupon `'X'` → 422 `COUPON_NOT_ALLOWED`.
     - Outro `sizeIndex` → 422 `GROUP_BUY_ITEM`.
     - Quantidade 3 → 422 `GROUP_BUY_LIMIT`.
  2. **Primeira compra de A:** A compra 1 unidade com cartão `mock-approved`.
     - O item do pedido custa o preço de grupo; o pedido tem `groupBuyId`.
     - Depois do pagamento: status `'Aguardando grupo'`, 0 `productionJob`.
     - `mail(orderId, 'group-joined')` existe e não há `'payment-approved'` para esse pedido.
  3. **Atalhos do admin:**
     - `owner.command` `order.update` para `'Em produção'` → 409 `GROUP_PENDING`.
     - `orders.batch` com a ação `production` → 409 `GROUP_PENDING`.
  4. **A compra de novo:**
     - A compra mais 1 unidade e paga; `ops.groupBuys[0].participants` continua 1.
     - Uma terceira compra de 1 unidade de A → 422 `GROUP_BUY_LIMIT`.
  5. **B bate a meta:** B compra e paga.
     - A campanha fica `'Meta atingida'` com `goalReachedAt`.
     - O pedido de B vai direto para `'Confirmado'` com `productionJob`.
     - Existe 1 outbox `group-reached/<id>`.
  6. **Estimate:** `checkout/estimate` com `groupBuyId` devolve `subtotalCents` = preço de grupo × quantidade.
- [ ] **Step 2: Run** the backend suite. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Adicione em `worker.ts` `process()` (~:204) os cases `group-buy-reached`, `group-buy-refund` e `group-buy-fail-order`. Cada um chama o método do `GroupBuysService` (`reached`, `refundDifference`, `failOrder`).
  - Nesta task esses métodos são stubs que só retornam, para que um `dispatch()` de outros fluxos não marque os eventos como `UNKNOWN_JOB`. A Task 5 os implementa.
- [ ] **Step 4: Run** the backend suite and `npx tsc --noEmit`. Expected: PASS; os fluxos de checkout/pagamento existentes não mudam.
- [ ] **Step 5: Commit** `feat(api): checkout da compra coletiva e pedido aguardando grupo`

### Task 5: Meta batida, diferença devolvida, prazo e estorno

**Files:**
- Modify:
  - `packages/backend-core/src/payments.ts`: `refundPartial`.
  - `packages/backend-core/src/group-buys.ts`: `reached`, `refundDifference`, `closeCampaign`, `failOrder`, `close`.
  - `packages/backend-core/src/worker.ts`: `closeGroupBuys(now)` chamado em `tick()` logo após `scheduleReviewRequests` (~:756) com `.catch(() => 0)`. Os cases de `process()` já existem desde a Task 4.
- Test: `scripts/backend-test.mjs`

**Interfaces:**
- Consumes: Tasks 2-4.
- Produces:
  - `PaymentsService.refundPartial(orderId: string, amountCents: number, reason: string, key: string): Promise<void>`:
    - Percorre as partes `approved`, Pix antes de cartão. Em cada uma estorna `min(restante, part.amountCents − part.refundedCents)`, com `Refund.key = key + '/' + part.id`.
    - Um `Refund` já `approved` é pulado. Provedor não aprovado → `REFUND_PENDING` (o outbox tenta de novo). Disponível < valor → `DomainError('REFUND_EXCEEDS')`.
    - Atualiza a parte por `apply(...)`. No mock, use `refundedCents: part.refundedCents + valor`; no live, `ctx.payments.get`.
    - Não envia `refund-confirmed`. Um estorno parcial deixa o pedido vivo, porque `apply` só cancela no total.
  - `GroupBuysService.reached(groupBuyId)`:
    - `hold`: para cada pedido `'Aguardando grupo'` com `payment 'Pago'`, numa transação própria: `lock(tx, 'order/' + id)`, rechecagem, status `'Confirmado'`, `payments.production(tx, id)` e e-mail `'group-confirmed'`.
    - `difference`: para cada pedido pago, não cancelado, com diferença > 0, faz o event `group-diff/<orderId>`.
  - `GroupBuysService.refundDifference(orderId)`:
    - Pula pedido cancelado ou diferença 0.
    - Chama `refundPartial(orderId, diff, 'Compra coletiva: diferença devolvida', 'group-diff/' + orderId)`.
    - Depois, numa transação, envia o e-mail `'group-difference'` com `refundedCents = diff`.
  - `GroupBuysService.closeCampaign(id, now): Promise<boolean>`:
    1. Faz um claim com `updateMany({ where: { id, status: { in: ['Aberta', 'Meta atingida'] } } })`. O novo status é `'Concluída'` se `goalReachedAt` existe, senão `'Não fechou'`, com `closedAt = now`. `count 0` retorna `false`.
    2. Na mesma transação, para `hold` e `'Não fechou'`: event `group-fail/<orderId>` para cada pedido da campanha não cancelado (pago ou pendente).
  - `GroupBuysService.close(actor, id)` (já existe desde a Task 3): passa a usar o `closeCampaign` completo. Audit "Compra coletiva encerrada".
  - `WorkerEngine.closeGroupBuys(now = new Date()): Promise<number>`: campanhas abertas com `endsAt ≤ now`, take 20, `closeCampaign` em cada uma.
  - `GroupBuysService.failOrder(orderId)`, numa transação com `lock(tx, 'order/' + id)`:
    1. Já cancelado → retorna.
    2. Status `'Cancelado'` e `payments.release(tx, id)`.
    3. Reservas `consumed` devolvem `Product.stock` com `StockMovement` motivo `'Compra coletiva não fechou <orderId>'` e passam a `released`.
    4. Intent `'Pendente'` → event `payment-cancel` chave `cancel-pending/<intentId>`, igual ao admin.
    5. Parte `approved` → event `refund-order` chave `group-fail-refund/<orderId>`, payload `{ orderId, reason: 'Compra coletiva não fechou' }`.
    6. Se estava pago, envia o e-mail `'group-failed'`.
    7. Audit "Pedido cancelado: compra coletiva não fechou".
  - `adminGroupBuyDto.orders[].refund`: soma dos `Refund` com chave começando por `group-diff/<orderId>/`, ou o estorno total quando o pedido foi cancelado pela campanha. `refundedCents` é a soma da campanha.

- [ ] **Step 1: Write the failing integration check** `'compra coletiva libera, devolve a diferença e estorna se não fechar'`:
  1. **Liberação (`hold`, continuando a Task 4):** `engine.dispatch()` → os dois pedidos de A ficam `'Confirmado'` com `productionJob`, e `mail(<cada um>, 'group-confirmed')` existe.
  2. **Diferença (campanha `difference` em outro produto, goal 2, limite 2):**
     - C paga 2 unidades com cartão, a preço normal: `'Confirmado'` com job.
     - D faz checkout com `'split'` antes da meta e paga: a meta é batida.
     - `engine.dispatch()` (repetir até a fila esvaziar) gera:
       - estorno aprovado de `(normal − grupo) × 2` para C e de `(normal − grupo) × 1` para D;
       - os `Refund` de D distribuídos entre as partes Pix e cartão, cada um ≤ ao capturado da parte;
       - e-mails `'group-difference'` para os dois;
       - pedidos e intents de C e D continuam `'Confirmado'`/`'Pago'`.
     - `engine.tick()` + `engine.dispatch()` de novo → as contagens de `Refund` e de e-mails não mudam.
  3. **Depois da meta:** E faz checkout depois da meta → o item custa o preço de grupo e nenhum `Refund` é criado para E.
  4. **Admin vê os estornos:** `ops.groupBuys` da campanha de diferença mostra `orders[].refund.amountCents` para C e D e `refundedCents` = soma.
  5. **Prazo sem meta (`hold`, terceiro produto, goal 3, workspace `inventoryPolicy 'stock'`, estoque 5):**
     - F paga 1 → `'Aguardando grupo'` e estoque 4.
     - G fica com Pix pendente.
     - Atrasar `endsAt` no banco, `engine.tick()` → campanha `'Não fechou'`.
     - `engine.dispatch()` até esvaziar:
       - F fica `'Cancelado'`, intent `'Estornado'`, estoque 5, `mail(F, 'group-failed')`;
       - G fica `'Cancelado'`, sem `'group-failed'`.
     - Restaurar a política do workspace no fim.
  6. **Pagamento depois do fracasso:** campanha `hold` com H pendente. Mudar o status para `'Não fechou'` direto no banco e fazer `charge.pay` de H. `engine.dispatch()` → H `'Cancelado'` e estornado.
  7. **Encerrar antes:** `groupbuy.close` numa campanha `difference` aberta sem meta → `'Não fechou'` e nenhum `Refund` novo.
- [ ] **Step 2: Run** the backend suite. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the backend suite and `npx tsc --noEmit`. Expected: PASS, inclusive os fluxos de estorno existentes (~:1363).
- [ ] **Step 5: Commit** `feat(worker): fechamento, diferença devolvida e estorno da compra coletiva`

### Task 6: Gateway web (http e demo)

**Files:**
- Modify:
  - `src/lib/api/contracts.ts`, `src/lib/api/http.ts`, `src/lib/api/lazy-demo.ts`, `src/lib/api/server.ts` (`getServerGroupBuys`, `getServerGroupBuy`).
  - `src/lib/demo/gateway.ts`, `src/lib/demo/admin-commands.ts`, demo seed/storage.
  - `src/lib/api/response-schemas.ts` (`productSchema.groupBuy` on the web side, if the web keeps its own).
- Test: `src/lib/demo/*.test.ts` (next to the existing demo gateway tests), `src/lib/api/http.test.ts` if present.

**Interfaces — Produces:**
- `CommerceGateway.groupBuys(): Promise<GroupBuyPublic[]>` e `CommerceGateway.groupBuy(id: string): Promise<GroupBuyPublic>`. Ambos estão nos 4 lugares.
- `CheckoutInput.groupBuyId?` e `groupBuyId?` na entrada de `estimate`, passados adiante pelo http.
- **Seed do demo:** campanha `id 'grupo-demo'`, título "Compra coletiva de Natal".
  - Produto: o primeiro componente do kit `kit-oracao-familia`, `sizeIndex` 0.
  - `groupPriceCents` = preço normal − 2000, goal 10, `mode 'difference'`, `perPersonLimit` 2.
  - `endsAt` = criação do seed + 2 dias.
  - 7 participantes com `initials ['MS','JP','AC','LR','FB','TC','RM']`. A loja mostra "7 de 10 · faltam 3 · termina em 2 dias".
- **Checkout no demo com `groupBuyId`:** aplica as mesmas regras de preço e linha única. No modo `hold`, o pedido pago fica `'Aguardando grupo'`; o pagamento soma 1 participante. Não há simulação de estornos.
- **Comandos `groupbuy.*` no demo:** editam o storage com as validações de preço menor e de uma campanha por produto.

- [ ] **Step 1: Write the failing tests:**
  - O demo `groupBuys()` devolve `grupo-demo` com `participants 7`, `remaining 3`.
  - `product(<id>)` tem `groupBuy`.
  - O checkout demo com `groupBuyId` e cupom → `ApiError` `COUPON_NOT_ALLOWED`.
  - `adminCommand({ type: 'groupbuy.close', id: 'grupo-demo' })` tira a campanha de `groupBuys()`.
- [ ] **Step 2: Run** `npx vitest run src/lib`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/lib` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): gateway da compra coletiva`

### Task 7: Loja — bloco no produto, selo, página e checkout do grupo

**Files:**
- Create:
  - `src/features/group-buys/group-buy-block.tsx` (`GroupBuyBlock`);
  - `src/features/group-buys/share-buttons.tsx` (`ShareButtons`);
  - `src/features/group-buys/group-buy-list.tsx`;
  - `src/app/(store)/compra-coletiva/page.tsx`;
  - `src/app/(store)/compra-coletiva/[id]/page.tsx`;
  - `src/app/(store)/compra-coletiva/[id]/checkout/page.tsx`;
  - tests next to the components.
- Modify:
  - `src/features/catalog/product-detail.tsx`: bloco abaixo do preço quando `p.groupBuy`.
  - `src/features/catalog/product-card.tsx`: selo.
  - `src/features/checkout/checkout-view.tsx`: prop `groupBuy`.
  - `src/features/checkout/success-view.tsx` e `src/features/account/shipment-card.tsx`: textos de "Aguardando grupo".
  - Rodapé da loja (link "Compra coletiva").
  - `src/app/sitemap.ts`, se existir: `/compra-coletiva` + campanhas abertas.

**Interfaces:**
- Consumes: Task 6 gateway, Task 1 helpers.
- Produces:
  - `GroupBuyBlock({ groupBuy: GroupBuySummary, href: string, shareUrl: string, now?: Date })`:
    - Título "Compra coletiva".
    - Linha `"{participants} de {goal} · faltam {remaining} · {endsInLabel}"`; com a meta batida: `"{participants} de {goal} · meta batida! · {endsInLabel}"`.
    - Barra `role="progressbar"` com `aria-valuenow={participants}` e `aria-valuemax={goal}`.
    - Até 8 iniciais em círculos.
    - Preço "R$ {grupo} no grupo" e o normal riscado.
    - Texto do modo:
      - `difference`, sem meta: "Pague {normal} agora e receba de volta {normal − grupo} por peça quando o grupo fechar.";
      - `difference`, com meta: "Meta batida: o preço de grupo já vale para você.";
      - `hold`: "Pague {grupo}. Se o grupo não fechar até {dd/mm}, devolvemos tudo.".
    - Botão-link "Entrar no grupo" → `href`, mais `ShareButtons`.
  - `ShareButtons({ url, text })`:
    - Link "Compartilhar no WhatsApp" → `https://wa.me/?text=` + `encodeURIComponent(text + ' ' + url)`, `target="_blank" rel="noopener noreferrer"`.
    - Botão "Copiar link" → `navigator.clipboard.writeText(url)`; o rótulo vira "Link copiado" por 2 s. Falha silenciosa se o clipboard não existir.
  - **Selo no card:** "Compra coletiva · {money(groupPriceCents)}".
  - **`/compra-coletiva`:** título "Compra coletiva", lista de cards com o bloco. Vazio: "Nenhuma compra coletiva aberta agora."
  - **`/compra-coletiva/[id]`:**
    - Bloco + nome, foto e descrição.
    - Tamanho fixo exibido, seletor de cor e quantidade de 1 a `perPersonLimit`.
    - "Entrar no grupo" → `/compra-coletiva/[id]/checkout?cor=<cor>&qtd=<n>`.
    - Campanha inexistente ou encerrada: `notFound()`.
  - **`CheckoutView({ groupBuy?: { id: string; line: CartItem } })`:**
    - Com `groupBuy`: usa só essa linha (ignora `useCartStore`), envia `groupBuyId` no estimate e no checkout e esconde o formulário de cupom.
    - Não altera nem esvazia o carrinho no sucesso.
    - Sem `groupBuy`, nada muda.
  - **Status "Aguardando grupo":**
    - `success-view`: "Pagamento aprovado. Seu pedido entra na produção assim que o grupo fechar."
    - `shipment-card`: etapa "Aguardando o grupo fechar".

- [ ] **Step 1: Write the failing tests:**
  - **`GroupBuyBlock`:**
    - Com `{ participants: 7, goal: 10, remaining: 3, endsAt: now+49h }` mostra "7 de 10 · faltam 3 · termina em 2 dias".
    - Mostra o progressbar com `aria-valuenow` 7.
    - Mostra o texto de `difference` com "R$ 20,00" quando normal − grupo = 2000.
    - Com a meta batida, mostra "meta batida!".
  - **`ShareButtons`:** o href começa com `https://wa.me/?text=` e contém a URL codificada; o clique em "Copiar link" chama `clipboard.writeText` com a URL e mostra "Link copiado".
  - **`CheckoutView` com `groupBuy`:** não renderiza o campo de cupom; envia `groupBuyId` (gateway mock); não chama `clear` do carrinho.
  - **`product-card`:** mostra o selo quando `groupBuy` existe.
- [ ] **Step 2: Run** `npx vitest run src/features`. Expected: FAIL.
- [ ] **Step 3: Implement.** Mobile primeiro; reutilize as classes de botão e cartão existentes.
- [ ] **Step 4: Run** `npx vitest run src/features src/app`, `npx tsc --noEmit` and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): compra coletiva na vitrine`

### Task 8: Admin — campanhas, participantes e estornos

**Files:**
- Create:
  - `src/features/admin/group-buy-manager.tsx` (+ `.test.tsx`);
  - `src/app/admin/compra-coletiva/page.tsx`.
- Modify:
  - `src/features/admin/admin-frame.tsx`: entrada `['compra-coletiva', 'Compra coletiva', <ícone existente>, 'marketing']`.
  - `src/features/admin/service.tsx`: `AdminGroupBuys`, se as outras páginas seguem esse padrão.

**Interfaces:**
- Consumes: `useAdminData().groupBuys`, `useAdminAction()`, `kitMargin`, `unitCostCents`, `unitPriceCents`, `groupBuyModeLabels`, the calculator settings already available to the kit editor.
- Produces `GroupBuyManager`:
  - **Métricas:** "Abertas", "Meta atingida", "Participantes" (soma das abertas), "Devolvido" (soma de `refundedCents`).
  - **Tabela:** Campanha, Produto · tamanho, Modo, Progresso `"{participants}/{goal}"`, Prazo (`dd/mm/aaaa hh:mm`), Status.
  - **Botão "Nova campanha".**
  - **Editor (Modal + Form):**
    - Campos: Título, Descrição, Produto (select dos produtos não arquivados), Tamanho (select dos tamanhos do produto), Preço de grupo (R$, via `centsFromInput`), Meta de participantes, Limite de participantes (vazio = sem limite), Limite por pessoa, Modo (2 opções com rótulos), Início, Prazo, Ativa.
    - Mostra o preço normal do tamanho e o aviso de margem do Global Constraints.
    - Com `locked`, os campos travados ficam desabilitados com a nota "Já há pedidos nesta campanha: produto, tamanho, preço, meta, modo e datas não mudam mais."
    - Salva com `groupbuy.save`.
  - **Ações por linha (campanha aberta):**
    - "Prorrogar": diálogo com data, envia `groupbuy.extend`.
    - "Encerrar agora": confirmação "Encerrar agora? Sem a meta, os pedidos do modo 'Estorno se não fechar' serão cancelados e estornados.", envia `groupbuy.close`.
  - **"Participantes":** diálogo com tabela Pedido (`MEO-000123`), Cliente, Qtd, Pago por unidade, Status, Estorno ("R$ X · aprovado" / "—").

- [ ] **Step 1: Write the failing tests** (`group-buy-manager.test.tsx`, fixture with 1 campaign `locked: true`, 1 order with a refund):
  - A tabela mostra "7/10" e "Devolve a diferença".
  - O editor de uma campanha locked tem "Preço de grupo" desabilitado e a nota.
  - Com preço de grupo abaixo do custo, mostra "Preço de grupo abaixo do custo".
  - "Encerrar agora" → confirmar despacha `{ type: 'groupbuy.close', id }`.
  - O diálogo de participantes mostra "R$ 40,00 · aprovado".
- [ ] **Step 2: Run** `npx vitest run src/features/admin`. Expected: FAIL.
- [ ] **Step 3: Implement**, following `review-manager.tsx` and the kit editor.
- [ ] **Step 4: Run** `npx vitest run src/features/admin`, `npx tsc --noEmit` and `npm run lint`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(admin): campanhas de compra coletiva`

### Task 9: Verificação completa e publicação

- [ ] **Step 1: Run** the full gates:
  - `npm test`;
  - `npx tsc --noEmit`;
  - `npm run lint`;
  - backend build + suite;
  - `npm run build`;
  - prettier check on the committed blobs: `git show HEAD:<f> | npx prettier --stdin-filepath <f> --check` for each changed file.

  Expected: all PASS.
- [ ] **Step 2: Local smoke (demo, `NEXT_DIST_DIR=.next-http`, port 3010):**
  - O produto da campanha mostra "7 de 10 · faltam 3".
  - `/compra-coletiva` lista a campanha.
  - O checkout do grupo não tem cupom e não mexe no carrinho.
  - O admin `/admin/compra-coletiva` abre o editor com o aviso de margem.
- [ ] **Step 3: Final whole-branch review**, then merge to `main` and push.
- [ ] **Step 4: Watch Railway** (`railway deployment list --service <web|api|worker>`) until SUCCESS. The migration runs in the api preDeploy.
- [ ] **Step 5: Production smoke:**
  - `GET https://api.maosemoracao.com.br/api/v1/group-buys` → 200 `{ data: [] }`.
  - O catálogo continua sem campos de custo e com os mesmos preços.
  - `/admin/compra-coletiva` → 200.
  - Logs da api e do worker sem erros.
