# Avaliações de produto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Só quem recebeu o pedido avalia cada peça comprada (1–5 estrelas, título, texto, até 3 fotos). A loja pede a avaliação por e-mail de serviço X dias após a entrega. O admin modera e responde. A vitrine mostra a nota, as fotos e a resposta, com JSON-LD `AggregateRating`.

**Architecture:**
- **Dados:** uma tabela `Review` (1 por `OrderItem`) e colunas novas em `Order` (`deliveredAt`, `reviewRequestedAt`) e `Customer` (`reviewRequestsOptOut`).
- **Moderação:** segue o padrão do Mural de orações (status `Publicado | Em análise | Oculto`, comando admin, snapshot de operações).
- **Fotos de cliente:** reaproveitam o fluxo de upload do `MediaService` em 3 passos, com um caminho autorizado para clientes.
- **Pedido de avaliação:** é agendado no `tick()` do worker, no mesmo padrão da oração diária (lock por pedido e marcação `reviewRequestedAt`). Não depende de atraso no outbox, então desligar a opção ou descadastrar vale até o momento do envio.

**Tech Stack:** Prisma 7 (migração SQL escrita à mão), NestJS, BullMQ worker, Next.js 16, zod 4, Vitest + Testing Library, `scripts/backend-test.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-13-crescimento-loja-design.md`, seção "2. Avaliações".

## Global Constraints

- **Texto e tom:** todo texto de interface em pt-BR, no tom das telas atuais.
- **Quem avalia:** só quem tem acesso ao pedido (`owned(actor, orderId)`), com `order.status === 'Entregue'`. No máximo 1 avaliação por `OrderItem`, garantido por unique no banco.
- **Campos da avaliação:**
  - `rating`: inteiro 1–5.
  - `title`: 0–80 caracteres.
  - `text`: 10–2000 caracteres.
  - `photos`: 0–3 imagens já enviadas pelo **mesmo** cliente (`MediaAsset.uploaderId === 'customer/' + customerId`, `state === 'ready'`, `kind === 'image'`).
- **Status:** `Publicado | Em análise | Oculto`.
- **Publicação automática:**
  - Regra: `rating >= autoPublishMinRating` **e** sem fotos.
  - Avaliação com fotos sempre fica `Em análise`.
  - `autoPublishMinRating: null` faz tudo passar por aprovação (padrão).
- **Configuração no workspace** (opcional, ausente = padrões): `reviews?: { requestEnabled: boolean (padrão true); requestDelayDays: int 1–60 (padrão 7); autoPublishMinRating: 1–5 | null (padrão null) }`.
- **E-mail "Como ficou sua peça?":**
  - É de serviço (categoria `transactional`), com link de descadastro.
  - Vai 1 vez por pedido, só para pedidos com `deliveredAt` dentro dos últimos 60 dias.
  - Não vai se `reviewRequestsOptOut` for true, se `requestEnabled` for false, ou se todos os itens já foram avaliados.
- **Público:**
  - Só avaliações `Publicado`.
  - Nome do autor = primeiro nome + inicial do sobrenome ("Maria S."), sem e-mail.
  - Média com 1 casa decimal.
- **Moderação:** permissão `community` (mesma do Mural de orações).
- **Restrições técnicas:**
  - Nenhuma dependência nova.
  - Dinheiro não entra aqui.
  - Toda rota nova entra no regex do BFF (`src/app/api/v1/[...path]/route.ts`).
  - Todo método novo do gateway entra em `contracts.ts`, `http.ts`, `demo/gateway.ts` e `lazy-demo.ts`.
  - Todo campo novo de resposta entra nos schemas de `src/lib/api/response-schemas.ts`.

## Review Focus

- **Pedido entregue antes desta entrega** (sem `deliveredAt`): o cliente consegue avaliar (status `Entregue` basta), mas nenhum e-mail retroativo é enviado.
- **Cliente tenta avaliar item de outro cliente, item de pedido não entregue, o mesmo item duas vezes, ou usar foto de outro cliente:** 404, 409 `NOT_DELIVERED`, 409 `ALREADY_REVIEWED` e 422 `INVALID_PHOTO`, respectivamente.
- **Admin desliga o pedido de avaliação ou o cliente se descadastra depois da entrega:** o tick não envia.
- **Produto sem avaliações publicadas:** o card e a página não mostram estrelas e nenhum JSON-LD de nota é emitido. O Google rejeita `AggregateRating` com `ratingCount` 0.
- **Avaliação ocultada depois de publicada:** sai da média e da lista pública imediatamente. A vitrine em cache de 60 s é aceita.

---

### Task 1: Contratos das avaliações

**Files:**
- Create: `packages/contracts/src/reviews.ts`, `packages/contracts/src/reviews.test.ts`
- Modify:
  - `packages/contracts/src/index.ts` (export)
  - `packages/contracts/src/admin-types.ts` (`WorkspaceSettings.reviews?`, `Operations.reviews`)
  - `packages/contracts/src/admin-schemas.ts` (`workspaceSchema.reviews`)
  - `packages/contracts/src/types.ts`:
    - `Product.rating?`
    - `CartItem.itemId?`
    - `AdminCommand` `review.moderate`
    - conta: `reviews`
  - `packages/contracts/src/schemas.ts` (`productSchema.rating`)

**Interfaces — Produces:**
- `reviewStatusSchema = z.enum(['Publicado', 'Em análise', 'Oculto'])`.
- `reviewSettingsSchema = z.object({ requestEnabled: z.boolean(), requestDelayDays: z.number().int().min(1).max(60), autoPublishMinRating: z.number().int().min(1).max(5).nullable() })`.
- `defaultReviewSettings = { requestEnabled: true, requestDelayDays: 7, autoPublishMinRating: null }`.
- `reviewInputSchema = z.object({ orderItemId: z.uuid(), rating: z.number().int().min(1).max(5), title: z.string().trim().max(80).default(''), text: z.string().trim().min(10).max(2000), photoIds: z.array(z.uuid()).max(3).default([]) })`.
- `PublicReview`: `{ id, rating, title, text, author, createdAt, variant: string /* "20 cm · Marfim" */, photos: { url: string }[], reply: string | null, repliedAt: string | null }`.
- `AdminReview = PublicReview & { status, productId, productName, orderId, orderNumber, customerName, customerEmail }`.
- `MyReview = { orderItemId, rating, status }`.
- `RatingSummary = { average: number /* 1 casa */, count: number, histogram: [n1, n2, n3, n4, n5] }`.
- `ProductReviews = { summary: RatingSummary, reviews: PublicReview[] }`.
- `summarizeRatings(ratings: number[]): RatingSummary`.
- `initialReviewStatus(s: ReviewSettings, rating: number, photoCount: number): 'Publicado' | 'Em análise'`.
- `reviewAuthorName(fullName: string): string`.
- `Product.rating?: { average: number; count: number }` (ausente quando count 0).
- `CartItem.itemId?: string` (id do `OrderItem`, só em pedidos).
- `AdminCommand` `{ type: 'review.moderate'; id: string; status: ReviewStatus; reply: string }` (reply 0–1000; vazio remove a resposta).

- [ ] **Step 1: Write the failing tests** (`reviews.test.ts`):

```ts
it('summarizes ratings with one decimal and a 5-bucket histogram', () => {
  expect(summarizeRatings([5, 4, 4, 1])).toEqual({ average: 3.5, count: 4, histogram: [1, 0, 0, 2, 1] });
  expect(summarizeRatings([])).toEqual({ average: 0, count: 0, histogram: [0, 0, 0, 0, 0] });
});
it('auto-publishes only at or above the threshold and never with photos', () => {
  const s = { ...defaultReviewSettings, autoPublishMinRating: 4 };
  expect(initialReviewStatus(s, 4, 0)).toBe('Publicado');
  expect(initialReviewStatus(s, 3, 0)).toBe('Em análise');
  expect(initialReviewStatus(s, 5, 1)).toBe('Em análise');
  expect(initialReviewStatus(defaultReviewSettings, 5, 0)).toBe('Em análise');
});
it('shows first name and last initial only', () => {
  expect(reviewAuthorName('Maria Aparecida Souza')).toBe('Maria S.');
  expect(reviewAuthorName('  joão ')).toBe('João');
  expect(reviewAuthorName('')).toBe('Cliente');
});
it('validates review input bounds', () => {
  const ok = { orderItemId: crypto.randomUUID(), rating: 5, text: 'Ficou linda na sala.' };
  expect(reviewInputSchema.parse(ok)).toMatchObject({ title: '', photoIds: [] });
  expect(() => reviewInputSchema.parse({ ...ok, rating: 6 })).toThrow();
  expect(() => reviewInputSchema.parse({ ...ok, text: 'curto' })).toThrow();
  expect(() => reviewInputSchema.parse({ ...ok, photoIds: [1, 2, 3, 4].map(() => crypto.randomUUID()) })).toThrow();
});
```

- [ ] **Step 2: Run** `npx vitest run packages/contracts/src/reviews.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `reviews.ts` and the type/schema fields above. Every new field must be optional where existing data lacks it: `Product.rating`, `CartItem.itemId`, `WorkspaceSettings.reviews`.
- [ ] **Step 4: Run** the test, `npx tsc --noEmit` and `npm run backend:typecheck`. Expected: PASS and clean. (`Operations.reviews` will force compile fixes in the demo seed/gateway; add `reviews: []` there.)
- [ ] **Step 5: Commit** `feat(contracts): avaliações de produto`

### Task 2: Banco — tabela de avaliações e data de entrega

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: `packages/database/prisma/migrations/202611140001_reviews/migration.sql`
- Modify:
  - `packages/backend-core/src/shipping.ts` (`reconcile`, ~:513-556)
  - `packages/backend-core/src/admin.ts` (`shipping.deliver`, ~:522-529)
- Test: `scripts/backend-test.mjs`

**Interfaces — Produces:**
- Prisma `Review`:
  - Campos: `id uuid`, `orderItemId String @unique`, `orderId`, `productId`, `customerId`, `rating Int`, `title String @default("")`, `text String`, `photos Json` (array `{ assetId, url }`), `author String`, `variant String @default("")`, `status String @default("Em análise")`, `reply String @default("")`, `repliedAt DateTime?`, `createdAt`, `updatedAt @updatedAt`.
  - Relações para OrderItem, Order, Product e Customer.
  - `@@index([productId, status, createdAt])`.
- `Order.deliveredAt DateTime?`, `Order.reviewRequestedAt DateTime?`, `@@index([status, deliveredAt])`.
- `Customer.reviewRequestsOptOut Boolean @default(false)`.
- Toda transição para `Entregue` grava `deliveredAt: now`, tanto em `reconcile` quanto no `shipping.deliver` em modo mock.

- [ ] **Step 1: Write the failing check** in `backend-test.mjs`, right after the existing `shipping.deliver` assertion (~:666-667): `assert.ok((await ctx.db.order.findUnique({ where: { id: orderId } })).deliveredAt instanceof Date)`.
- [ ] **Step 2: Run** `npm run backend:build && npm run backend:test` (with `set -a; . ./.env.backend.local; set +a`; Docker postgres/redis up). Expected: FAIL (`deliveredAt` undefined).
- [ ] **Step 3: Implement** the schema, the hand-written SQL migration (CREATE TABLE + FKs + indexes; ALTER TABLE for the 3 columns; follow the style of `202611130001_order_item_cost`), `npm run backend:generate`, and set `deliveredAt` in both delivery paths. Existing delivered orders keep `deliveredAt` NULL; there is no backfill.
- [ ] **Step 4: Run** the backend suite. Expected: all checks PASS.
- [ ] **Step 5: Commit** `feat(db): avaliações e data de entrega do pedido`

### Task 3: API das avaliações (criar, listar, moderar, nota no catálogo)

**Files:**
- Create: `packages/backend-core/src/reviews.ts` (`ReviewsService`)
- Modify:
  - `packages/backend-core/src/projections.ts`: `reviewDto(r, private?)`; `orderDto` items get `itemId`; `productDto` accepts optional `rating`.
  - `packages/backend-core/src/catalog.ts`: `list`/`product` attach `rating` via one `groupBy` on `Publicado`.
  - `packages/backend-core/src/orders.ts`: `account` returns `reviews: MyReview[]`.
  - `packages/backend-core/src/admin.ts`:
    - `permissionMap.review = 'community'`
    - `case 'review.moderate'`
    - snapshot `reviews` (`can('community')`, take 1000, newest first)
  - `packages/backend-core/src/command-schema.ts`
  - `apps/api/src/commerce.module.ts` (new `ReviewsController`, registered in `main.ts`)
  - `src/app/api/v1/[...path]/route.ts`: BFF regex gets `reviews` and `catalog/products/[id]/reviews`.
  - `src/lib/api/response-schemas.ts` (account, operations, product rating)
  - `src/app/api/v1/proxy.test.ts`
- Test: `scripts/backend-test.mjs`

**Interfaces:**
- Consumes: Task 1 contracts; Task 2 tables.
- Produces (routes under `/api/v1`):
  - `GET catalog/products/:id/reviews?rating=1..5` returns `ProductReviews`:
    - `summary` covers all published reviews, regardless of filter.
    - `reviews` are filtered, newest first, take 50.
  - `POST reviews` (body `reviewInputSchema`) returns `MyReview` with 201.
    - Customer only, or a guest session limited to its order.
    - Rate limit `'review/' + actor.id`, 10 per hour.
    - Errors: 404 if the item is not the actor's, 409 `NOT_DELIVERED`, 409 `ALREADY_REVIEWED`, 422 `INVALID_PHOTO` (Task 4 fills photo validation; here it rejects any non-empty `photoIds`).
    - Stores `author = reviewAuthorName(customer.name)`, `variant = size + ' · ' + color` from item data, and `status = initialReviewStatus(...)`.
    - Audit entry.
  - `review.moderate` sets `status`. It sets `reply`/`repliedAt`: `repliedAt` = now when the reply changes and is non-empty, null when emptied. Audit `'Avaliação: ' + status`.

- [ ] **Step 1: Write the failing integration check** `'avaliação só de quem recebeu, moderada e na nota do catálogo'`, using the order delivered in the existing flow (customer `customer`, ~:666):
  1. `other` posting a review for that item gets 404.
  2. A review for an item of a not-delivered order gets 409 `NOT_DELIVERED`.
  3. `customer` posts rating 4. Expect 201, status `Em análise`, `account.reviews` contains it, and `account.orders[].items[].itemId` exists.
  4. Posting again gets 409 `ALREADY_REVIEWED`.
  5. The public list has 0 reviews and the product has no `rating`.
  6. `owner.command({ type: 'review.moderate', id, status: 'Publicado', reply: 'Obrigado!' })`.
  7. The public list has 1 review with author "<first name> <initial>.", reply "Obrigado!", no email anywhere in the JSON. `catalog/products/:id` has `rating { average: 4, count: 1 }`.
  8. `?rating=5` gives 0 reviews and the same `summary.count` 1.
  9. Moderate to `Oculto`: the product rating disappears.
  10. `operationsSchema.parse` and `accountSchema.parse` pass.
  11. With workspace `reviews.autoPublishMinRating: 4`, a new review rated 5 on another delivered item is published immediately.
- [ ] **Step 2: Run** backend build + test. Expected: FAIL (404 route).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the backend suite, `npx vitest run src/app/api` and `npx tsc --noEmit`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(api): avaliações de produto com moderação`

### Task 4: Fotos enviadas pelo cliente

**Files:**
- Modify:
  - `packages/backend-core/src/media.ts`: extract the 3 steps so they take an `uploader: { id: string; kinds: ('image'|'model'|'video')[]; maxBytes?: number }`.
    - Admin keeps `permit(actor,'catalog')` and today's uploaderId.
    - New `customerCreate/customerContent/customerComplete` require a customer actor with `customerId` and use `uploaderId = 'customer/' + customerId`, kinds `['image']`, `maxBytes` 8 MB.
    - Rate limit `'review-upload/' + customerId`, 12 per hour.
    - A customer only touches its own reserved assets (404 otherwise).
  - `packages/backend-core/src/reviews.ts`: validate `photoIds`:
    - Each must be the actor's (`uploaderId`), `state 'ready'`, `kind 'image'`, and not used by another review. Otherwise 422 `INVALID_PHOTO`.
    - Store `{ assetId, url }`.
  - `apps/api/src/main.ts`: raw-body middleware also for `PUT /api/v1/reviews/uploads/:id/content`, after checking a customer actor.
  - `apps/api/src/commerce.module.ts`: routes `POST reviews/uploads`, `PUT reviews/uploads/:id/content`, `POST reviews/uploads/:id/complete`.
  - `src/app/api/v1/[...path]/route.ts`: regex plus the PUT allowance for that exact path, with the same length checks as admin media and a cap of 8 MB.
  - `src/lib/media/upload.ts`: `uploadMedia(file, kind, onProgress, base = 'admin/media')`. Reviews pass `'reviews'`.
- Test: `scripts/backend-test.mjs`, `src/app/api/v1/proxy.test.ts`

- [ ] **Step 1: Write the failing check** `'fotos da avaliação: só imagem do próprio cliente'`:
  1. `customer` uploads a small PNG (reuse the PNG bytes the existing media check uses) through the 3 steps and gets status `ready` and an https/`/api/media/public/` url.
  2. `other` trying to complete it gets 404.
  3. A text file declared as image is rejected.
  4. `other` using `customer`'s photo id in its own review gets 422 `INVALID_PHOTO`.
  5. `customer` reviewing another delivered item with that photo gets 201 and `Em análise` even with autoPublish 4.
  6. After the owner publishes it, the public review has `photos[0].url`.
  7. Proxy test: PUT to `reviews/uploads/<uuid>/content` passes the allow-list; PUT to other paths is still refused.
- [ ] **Step 2: Run** backend build + test and `npx vitest run src/app/api`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the suites. Expected: PASS. Admin media checks unchanged.
- [ ] **Step 5: Commit** `feat(api): fotos de cliente nas avaliações`

### Task 5: E-mail "Como ficou sua peça?" e descadastro

**Files:**
- Modify:
  - `packages/emails/src/index.ts`: kind `'review-request'` with:
    - `{ customerName, orderNumber, items: { name, variant, image }[], reviewUrl, optOutUrl }`;
    - label "Como ficou sua peça?";
    - `content()` case: CTA "Avaliar minhas peças" → `reviewUrl`;
    - footer line "Não quer mais receber pedidos de avaliação? Descadastre-se" → `optOutUrl`.
    - Bump `EMAIL_TEMPLATE_VERSION`.
  - `packages/emails/src/samples.ts`: sample.
  - `packages/backend-core/src/worker.ts`: `scheduleReviewRequests(now)` called from `tick()`.
  - `packages/backend-core/src/security.ts`: signed token purpose `'review-optout'` (or reuse `signedToken` with that purpose).
  - `packages/backend-core/src/reviews.ts`: `optOut(token)` sets `Customer.reviewRequestsOptOut = true`.
  - API route `POST reviews/opt-out`, plus BFF regex.
  - Page `src/app/(auth)/avaliacoes/descadastro/page.tsx`, reusing `TokenAction` (copy "Pronto: você não receberá mais pedidos de avaliação.").

**Interfaces — Produces:** `scheduleReviewRequests(now: Date): Promise<number>` (orders e-mailed).
- Reads `settings.workspace.reviews ?? defaultReviewSettings`; stops if `requestEnabled === false`.
- Selects orders with `status 'Entregue'`, `deliveredAt <= now − delay days` and `>= now − 60 days`, `reviewRequestedAt null`, customer not opted out. Take 50.
- Per order, in a transaction:
  - `updateMany` sets `reviewRequestedAt` where it is still null (skip if count 0).
  - Skip the e-mail if every item already has a review.
  - Enqueue `mail.email(tx, 'review-request/' + orderId, orderId, customer.email, message)`, with `reviewUrl = orderUrl(tx, orderId)`.

- [ ] **Step 1: Write the failing tests:**
  - `packages/emails/src/emails.test.ts` keeps passing with the new sample (it asserts every label has a sample) and asserts the review-request HTML contains the opt-out link.
  - Backend check `'pedido de avaliação após a entrega, uma vez e com descadastro'`:
    1. Backdate a delivered order's `deliveredAt` 8 days, then `engine.tick()`.
    2. `mail(orderId, 'review-request')` exists, and its envelope contains `/avaliacoes/descadastro?token=`.
    3. A second `tick()` gives exactly 1 outbox row for that key.
    4. A second customer opts out via `POST reviews/opt-out` with the token from its e-mail; the next eligible order of that customer gets no e-mail.
    5. With `reviews.requestEnabled false`, an eligible order gets no e-mail and stays with `reviewRequestedAt` null.
    6. An order with `deliveredAt` 3 days ago gets no e-mail.
- [ ] **Step 2: Run** `npx vitest run packages/emails` and the backend suite. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both. Expected: PASS. Then `npm run emails:preview` renders the new template.
- [ ] **Step 5: Commit** `feat: e-mail "Como ficou sua peça?" com descadastro`

### Task 6: Gateway web (http e demo)

**Files:**
- Modify:
  - `src/lib/api/contracts.ts`: `CommerceGateway` gets the methods below.
  - `src/lib/api/http.ts`
  - `src/lib/demo/gateway.ts`: in-memory reviews in the demo state; same rules, demo owner moderates via `admin-commands.ts`.
  - `src/lib/api/lazy-demo.ts`
  - `src/lib/demo/admin-commands.ts`: `review.moderate`
  - `src/lib/demo/seed.ts`: 3 published reviews on the first product (ratings 5, 5, 4 → average 4,7), one with a store reply, so the storefront has something to show in demo.
  - `src/lib/api/query.tsx`: `useProductReviews(productId, rating?)`.
- Test: `src/lib/demo/gateway.test.ts`, `src/lib/api/http.test.ts`

**Interfaces — Produces:**
- `productReviews(productId: string, rating?: number): Promise<ProductReviews>`
- `createReview(input: ReviewInput, idempotencyKey: string): Promise<MyReview>`
- `optOutReviewRequests(token: string): Promise<void>`
- `useProductReviews` query key `['reviews', productId, rating ?? 'all']`. It is invalidated by `useCommand`, which already invalidates all.
- Photo upload goes through `uploadMedia(file, 'image', onProgress, 'reviews')` (Task 4), not the gateway. Demo mode stores the file as today's demo assets do.

- [ ] **Step 1: Write the failing tests:**
  - Demo gateway: the customer's delivered seed order can be reviewed once; a second time throws `ALREADY_REVIEWED`; `productReviews` returns only `Publicado`; the `rating` filter keeps the full summary.
  - HttpGateway: `productReviews('x', 5)` calls `GET /api/v1/catalog/products/x/reviews?rating=5` and validates the schema.
- [ ] **Step 2: Run** `npx vitest run src/lib`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/lib` and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): gateway das avaliações`

### Task 7: "Avaliar peça" na conta do cliente

**Files:**
- Create: `src/features/account/review-form.tsx`
- Modify: `src/features/account/account-view.tsx` (order detail, items loop ~:128-140)
- Test: `src/features/account/review-form.test.tsx`

**Interfaces — Produces:** `ReviewForm({ item, onDone })`, used in a `Modal`.
- Stars: a radio group "Nota" with 5 options, each with `aria-label` "1 estrela" … "5 estrelas".
- Fields "Título (opcional)" and "Conte como ficou a peça" (10–2000; counter).
- Up to 3 photos with progress and remove; "Adicionar foto" is disabled at 3.
- "Enviar avaliação" calls `createReview`.
- Errors from the API are shown in `role="alert"` in pt-BR (`ALREADY_REVIEWED` → "Esta peça já foi avaliada.").
- Success: toast "Obrigado! Sua avaliação foi enviada." and the item shows the status.

In the order detail, each item of an `Entregue` order shows one of:
- "Avaliar peça", when there is no review;
- "Avaliação publicada";
- "Avaliação em análise".

Hidden reviews show "Avaliação em análise", so we do not tell the customer it was hidden.

- [ ] **Step 1: Write the failing tests:**
  1. Render `ReviewForm` with a mocked gateway. Picking 5 stars, typing a 10+ char text and submitting calls `createReview` with `{ orderItemId, rating: 5, text, title: '', photoIds: [] }`.
  2. Text shorter than 10 blocks submit with an alert.
  3. `AccountView` for a delivered order shows "Avaliar peça". For a reviewed item it shows "Avaliação em análise". For a non-delivered order it shows no button.
- [ ] **Step 2: Run** `npx vitest run src/features/account`. Expected: FAIL.
- [ ] **Step 3: Implement**, with styles in the existing account stylesheet.
- [ ] **Step 4: Run** the tests and `npx tsc --noEmit`. Expected: PASS, no act() warnings.
- [ ] **Step 5: Commit** `feat(web): cliente avalia peças entregues`

### Task 8: Avaliações na vitrine e JSON-LD

**Files:**
- Create:
  - `src/features/catalog/rating-stars.tsx`: `RatingStars({ value, count?, size? })`, `role="img"`, `aria-label` "Nota 4,5 de 5 (12 avaliações)".
  - `src/features/catalog/product-reviews.tsx`
- Modify:
  - `src/features/catalog/product-card.tsx`: stars + count when `rating` exists.
  - `src/features/catalog/product-detail.tsx`:
    - stars beside the price, linking to `#avaliacoes`;
    - `<ProductReviews>` section before the related products.
  - `src/app/(store)/produto/[id]/page.tsx`: JSON-LD.
  - `src/lib/api/server.ts`: server fetch of reviews, if needed for JSON-LD; tag 'catalog', revalidate 60.
- Test: `src/features/catalog/product-reviews.test.tsx`

**Interfaces — Produces:**
- `ProductReviews({ productId })` with `id="avaliacoes"`:
  - heading "Avaliações";
  - average + "N avaliações" + histogram bars (5→1), each bar a button that filters ("Só 5 estrelas" …, "Todas");
  - list: stars, title, text, author · date (pt-BR) · variant, photo thumbnails that open the full image in a `Modal`, and "Resposta da loja" when a reply exists;
  - empty state "Ainda não há avaliações desta peça.".
- JSON-LD `<script type="application/ld+json">`:
  - `Product` with name, image, sku, `offers` (price in BRL from `priceCents`, availability), and `aggregateRating` `{ ratingValue, reviewCount }` only when `rating.count > 0`;
  - up to 5 `review` entries (author, reviewRating, reviewBody, datePublished).
  - Escape `<` as `<` in the serialized JSON.

- [ ] **Step 1: Write the failing tests:**
  1. `ProductReviews` with a mocked hook returning the demo seed reviews shows "4,7", "3 avaliações" and "Resposta da loja".
  2. Clicking the 5-star bar requests `rating 5`.
  3. Empty data shows the empty state.
  4. `ProductCard` without `rating` renders no "Nota".
  5. A page JSON-LD helper `productJsonLd(product, reviews)` (export it from the page module or `src/lib/seo/product-json-ld.ts`) omits `aggregateRating` when count 0 and escapes `</script>`.
- [ ] **Step 2: Run** `npx vitest run src/features/catalog src/lib/seo`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): avaliações na vitrine com JSON-LD`

### Task 9: Moderação e configuração no admin

**Files:**
- Create:
  - `src/features/admin/review-manager.tsx`
  - `src/app/admin/avaliacoes/page.tsx` (thin, like `src/app/admin/comunidade/page.tsx`)
- Modify:
  - `src/features/admin/admin-frame.tsx`: nav `['avaliacoes', 'Avaliações', <existing icon, e.g. 'heart' or 'spark'>, 'community']` right after "Mural de orações".
  - `src/features/admin/workspace-settings.tsx`: in the tab "Comunidade e oração diária", or a new tab "Avaliações", add:
    - checkbox "Pedir avaliação por e-mail após a entrega" (`reviews.requestEnabled`);
    - number "Dias após a entrega" (1–60);
    - select "Publicar automaticamente" (Nunca — tudo passa por aprovação | Notas 5 | Notas 4 ou mais | Notas 3 ou mais).
    - It saves `reviews` inside the workspace and keeps the other fields.
- Test: `src/features/admin/review-manager.test.tsx`, `src/features/admin/workspace-settings` test if one exists (else add the case to review-manager tests by rendering `WorkspaceSettings`).

**Interfaces — Produces:** `AdminReviews()`, following `prayer-manager.tsx`:
- `useAdminFilter` with statuses Todos / Em análise / Publicado / Oculto;
- metrics: Em análise, Publicadas, Nota média publicada, Com fotos;
- each row: product, stars, title/text excerpt, customer name, order number, status badge, photos;
- a Modal with "Status" select, "Resposta pública da loja" textarea (≤1000) and "Salvar moderação", which runs `{ type: 'review.moderate', id, status, reply }`.

- [ ] **Step 1: Write the failing tests:**
  1. `AdminReviews` with mocked `useAdminData` of 2 reviews filters by "Em análise".
  2. Opening one, choosing "Publicado", typing a reply and saving calls `run` with the exact command.
  3. Workspace settings: unchecking "Pedir avaliação…", setting 10 days and "Notas 4 ou mais" saves `reviews: { requestEnabled: false, requestDelayDays: 10, autoPublishMinRating: 4 }`.
- [ ] **Step 2: Run** `npx vitest run src/features/admin`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the tests and `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(admin): moderação e configuração das avaliações`

### Task 10: Verificação completa e publicação

- [ ] **Step 1: Run** `npx tsc --noEmit && npx vitest run`, plus prettier check on the committed content of every changed file (`git show HEAD:<f> | npx prettier --stdin-filepath <f> --check`). Expected: all clean.
- [ ] **Step 2: Run** `npm run backend:build && npm run backend:typecheck && npm run backend:test`. Expected: all flows PASS.
- [ ] **Step 3: Check in the local browser** (demo mode, port 3010):
  - customer reviews a delivered demo order item with a photo;
  - admin publishes it with a reply;
  - the product page shows stars, filter, photo and reply;
  - the card shows stars;
  - page source has valid JSON-LD;
  - mobile width has no horizontal scroll.
- [ ] **Step 4: Merge to main and push**, then wait for Railway web, api and worker SUCCESS. The api `preDeploy` runs `prisma migrate deploy`; confirm the migration applied in the deploy logs.
- [ ] **Step 5: Smoke in production:**
  - `GET https://maosemoracao.com.br/api/v1/catalog/products/<id>/reviews` returns `{ summary: { count: 0 } }`;
  - product pages are unchanged (no stars, no `aggregateRating`);
  - `/admin/avaliacoes` loads;
  - no errors in api/worker logs after one worker tick.
