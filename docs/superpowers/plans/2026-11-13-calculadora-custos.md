# Calculadora de custos e preço por tamanho — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma calculadora de custo de impressão (filamento e resina) configurável no admin, que gera custo por peça, preço sugerido e projeção de ganho, e grava preço e custo **por tamanho** no produto.

**Architecture:** O cálculo é uma função pura em `packages/contracts` (usada pelo admin agora e pelo backend nos módulos de kits/compra coletiva). A configuração da calculadora mora dentro das configurações `workspace` (mesmo fluxo `workspace.save`, só o dono salva). Preço e custo por tamanho entram em `Product.data` como `sizePrices` e `costBySize`, lidos por helpers compartilhados que caem no comportamento antigo (`priceCents + tamanho × R$ 20`) quando o produto ainda não tem preços por tamanho; por isso não há migração de banco.

**Tech Stack:** TypeScript, zod 4, Next.js 16 (admin e loja), NestJS + Prisma (api), Vitest + Testing Library, `scripts/backend-test.mjs` (fluxos de integração).

**Spec:** `docs/superpowers/specs/2026-11-13-crescimento-loja-design.md`, seção "1. Calculadora de custos".

## Global Constraints

- Todo texto de interface em pt-BR, no tom das telas atuais do admin.
- Dinheiro sempre em centavos inteiros (`*Cents`); percentuais guardados como número (ex.: `4.98` = 4,98 %).
- Campos de custo (`costCents`, `costBreakdown`, `costBySize`) nunca saem na API pública (`projections.ts`).
- Só o dono (`ownerOnly`) salva a configuração da calculadora, como as demais configurações.
- Nenhuma dependência nova.
- Produto sem `sizePrices` mantém exatamente o preço de hoje: `priceCents + sizeIndex × 2000`.
- Partes do custo seguem as 5 já existentes: `materialCents`, `packagingCents`, `energyCents` (energia **e desgaste/manutenção da impressora**, como o rótulo atual "Energia e máquina"), `laborCents`, `otherCents` (falha, insumos de resina, extras).

## Review Focus

- Tamanhos editados depois dos preços (quantidade de tamanhos ≠ `sizePrices.length`): o editor realinha a tabela e a API recusa o desalinhamento com 422 `INVALID_PRICES`.
- Margem-alvo + taxas ≥ 100 %: a calculadora mostra erro e nunca exibe preço infinito ou negativo.
- Configuração da calculadora ausente (workspace salvo antes desta entrega): usa `defaultCalculatorSettings`.
- Percentual digitado com vírgula ("0,99"): aceito como 0.99.
- Carrinho guardado no navegador com preço antigo: o servidor sempre recalcula o preço da linha pelo helper.

---

### Task 1: Preço e custo por tamanho nos contratos

**Files:**
- Modify: `packages/contracts/src/schemas.ts` (`productSchema`, `inventoryProductSchema`)
- Create: `packages/contracts/src/size-pricing.ts`
- Test: `packages/contracts/src/size-pricing.test.ts`

**Interfaces:**
- Produces:
  - `productSchema.sizePrices: z.array(z.number().int().positive()).max(11).optional()`
  - `inventoryProductSchema.costBySize: z.array(costBreakdownSchema).max(11).optional()`
  - `unitPriceCents(p: { priceCents: number; sizePrices?: number[] }, sizeIndex: number): number`
  - `unitCostBreakdown(p: { costCents: number; costBreakdown?: CostBreakdown; costBySize?: CostBreakdown[] }, sizeIndex: number): CostBreakdown` — usa `costBySize[i]`, senão `costBreakdown`, senão `{ otherCents: costCents, demais 0 }`
  - `unitCostCents(p, sizeIndex): number` = `costBreakdownTotal(unitCostBreakdown(p, sizeIndex))`
  - `SIZE_STEP_CENTS = 2000` (fallback legado)
  - Exportados pelo índice do pacote como os demais módulos.

- [ ] **Step 1: Write the failing tests**

```ts
it('falls back to the legacy +R$ 20 per size', () => {
  expect(unitPriceCents({ priceCents: 8990 }, 2)).toBe(12990);
});
it('uses the configured price of each size', () => {
  expect(unitPriceCents({ priceCents: 9990, sizePrices: [9990, 12990, 15990] }, 2)).toBe(15990);
});
it('picks the cost of the size, then the product breakdown, then the plain total', () => {
  const b = (n: number) => ({ materialCents: n, packagingCents: 0, energyCents: 0, laborCents: 0, otherCents: 0 });
  expect(unitCostCents({ costCents: 900, costBySize: [b(1000), b(2500)] }, 1)).toBe(2500);
  expect(unitCostCents({ costCents: 900, costBreakdown: b(1200) }, 1)).toBe(1200);
  expect(unitCostBreakdown({ costCents: 900 }, 0)).toEqual({ ...b(0), otherCents: 900 });
});
```

- [ ] **Step 2: Run** `npx vitest run packages/contracts/src/size-pricing.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `size-pricing.ts` and the two schema fields.
- [ ] **Step 4: Run** the same command — Expected: PASS; `npx tsc --noEmit` sem erros.
- [ ] **Step 5: Commit** `feat(contracts): preço e custo por tamanho`

### Task 2: Backend usa preço e custo por tamanho

**Files:**
- Modify: `packages/backend-core/src/orders.ts:71` (linhas do carrinho), `:157` (estimativa de frete/subtotal), `productCosts()` em `:31-41` e o `costCents` da linha em `:395`
- Modify: `packages/backend-core/src/catalog.ts` (salvar produto: validação e coluna `costCents`; linha `:97`)
- Modify: `packages/backend-core/src/projections.ts:39-40` (remover `costBySize` do público)
- Test: `scripts/backend-test.mjs` (novo `check`)

**Interfaces:**
- Consumes: `unitPriceCents`, `unitCostCents` (Task 1).
- Produces: `productCosts(tx, items: { productId: string; sizeIndex: number }[]): Promise<Map<string, number>>` com chave `productId + '/' + sizeIndex` (custo unitário daquele tamanho). Ao salvar produto: se `sizePrices` existe e `sizePrices.length !== sizes.length` (ou `costBySize` idem) → `DomainError('INVALID_PRICES', 'Informe preço e custo para cada tamanho.', 422)`; `priceCents` gravado = `sizePrices[0]`; coluna `costCents` = `unitCostCents(produto, 0)`.

- [ ] **Step 1: Write the failing integration check** em `scripts/backend-test.mjs`, junto ao check de custo existente (`'custo congelado no item…'`):

```js
await check('preço e custo por tamanho no pedido', async () => {
  // owner salva uma cópia do produto de teste com 3 tamanhos:
  //   sizePrices [9990, 12990, 15990]; costBySize com materialCents 1000 / 1800 / 2600 (demais 0)
  // comprador cota e compra 2 unidades do tamanho índice 2
  assert.equal(estimate.subtotalCents, 15990 * 2);
  assert.equal(line.unitCents, 15990);
  assert.equal(line.costCents, 2600 * 2);
  // salvar com sizePrices de 2 itens para 3 tamanhos → 422 INVALID_PRICES
  // catálogo público do produto não contém costBySize nem costBreakdown
});
```

- [ ] **Step 2: Run** `npm run backend:test` (mesmo comando usado nas entregas anteriores; sobe API/worker locais) — Expected: o novo check FAIL.
- [ ] **Step 3: Implement** as mudanças listadas em Files usando os helpers; `productCosts` passa a ler `data` + `costCents` do produto.
- [ ] **Step 4: Run** `npm run backend:test` — Expected: todos os checks PASS (os 42 anteriores + o novo).
- [ ] **Step 5: Commit** `feat(api): pedidos usam preço e custo do tamanho escolhido`

### Task 3: Loja mostra o preço de cada tamanho

**Files:**
- Modify: `src/features/catalog/product-detail.tsx:39` e `:93`
- Modify: `src/lib/domain/commerce.ts:39`
- Test: `src/lib/domain/commerce.test.ts` (criar se não existir)

**Interfaces:**
- Consumes: `unitPriceCents` (Task 1).

- [ ] **Step 1: Write the failing test**

```ts
it('cart line uses the configured size price', () => {
  const line = cartLine({ ...product, priceCents: 9990, sizePrices: [9990, 12990, 15990] }, 1, product.colors[0], 2, '');
  expect(line.unitCents).toBe(15990);
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/domain/commerce.test.ts` — Expected: FAIL (12990 ≠ 15990).
- [ ] **Step 3: Implement**: `cartLine` e o preço da página usam `unitPriceCents`; o seletor de tamanho mostra o preço de cada opção (`"20 cm · R$ 129,90"`) em vez de `"(+ R$ 20,00)"`.
- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): preço por tamanho na página do produto`

### Task 4: Motor da calculadora

**Files:**
- Create: `packages/contracts/src/print-cost.ts`
- Test: `packages/contracts/src/print-cost.test.ts`

**Interfaces:**
- Produces:
  - `calculatorSettingsSchema` (zod) e tipo `CalculatorSettings`:
    `materials: { id, name, technology: 'fdm' | 'resin', priceCents /* por kg (fdm) ou litro (resina) */ }[]`,
    `printers: { id, name, technology, powerWatts, purchaseCents, lifetimeHours (min 1), maintenancePerHourCents }[]`,
    `packagingItems: { id, name, unitCents }[]`, `packagingKits: { id, name, items: { itemId, quantity }[] }[]`,
    `energyKwhCents`, `laborHourCents`, `failureRatePct`, `resinConsumablesPerPrintCents`,
    `pixFeePct`, `cardFeePct`, `cardSharePct`, `taxPct`, `fixedPerOrderCents`, `fixedMonthlyCents`, `targetMarginPct`.
  - `defaultCalculatorSettings: CalculatorSettings` (os valores do teste abaixo, com 1 filamento "PLA" e 1 resina "Resina padrão" R$ 180/l, 1 impressora FDM e 1 de resina, kit "Padrão").
  - `printJobSchema` / `PrintJob`: `{ technology, materialId, amount /* g ou ml */, printHours, printerId, piecesPerPlate (min 1), laborMinutes, packagingKitId?, extraCents }`.
  - `calculatePrintCost(s: CalculatorSettings, job: PrintJob): PrintCostResult` →
    `{ breakdown: CostBreakdown; totalCents; feeRatePct; suggestedPriceCents: number | null; prices: { marginPct: 20|30|40|50; priceCents: number | null }[]; error?: 'MARGIN_TOO_HIGH' }`
  - `projectProfit(r: PrintCostResult, s: CalculatorSettings, priceCents: number, unitsPerMonth: number)` →
    `{ unitFeesCents, unitProfitCents, marginPct, revenueCents, monthlyProfitCents, breakEvenUnits: number | null }`

Fórmulas (por peça; arredondar cada parte com `Math.round`, total = soma das partes):
- material = `amount / 1000 × priceCents ÷ piecesPerPlate`
- energia+máquina = `(powerWatts/1000 × printHours × energyKwhCents + (purchaseCents/lifetimeHours + maintenancePerHourCents) × printHours) ÷ piecesPerPlate`
- mão de obra = `laborMinutes / 60 × laborHourCents`
- embalagem = soma do kit (0 sem kit)
- outros = `(material + energia) × falha/(1 − falha)` (valores não arredondados) `+ resinConsumablesPerPrintCents ÷ piecesPerPlate` (só resina) `+ extraCents`
- `feeRatePct = pixFeePct × (1 − cardSharePct/100) + cardFeePct × cardSharePct/100 + taxPct`
- preço para margem m = `ceil((total + fixedPerOrderCents) / (1 − feeRate − m))`; se denominador ≤ 0 → `null` e `error: 'MARGIN_TOO_HIGH'`
- projeção: `unitFees = round(price × feeRate)`, `unitProfit = price − total − fixedPerOrder − unitFees`, `monthlyProfit = unitProfit × units − fixedMonthlyCents`, `breakEven = ceil(fixedMonthlyCents / unitProfit)` (null se unitProfit ≤ 0)

- [ ] **Step 1: Write the failing tests** (configuração de teste: PLA 12000/kg; impressora 150 W, compra 600000, vida 5000 h, manutenção 50/h; kWh 95; mão de obra 3000/h; falha 10 %; kit Padrão = caixa 250 + bolha 50 + cartão 100; Pix 0.99 %, cartão 4.98 %, 40 % no cartão, imposto 6 %; fixo/pedido 0; fixo/mês 50000; margem 30 %)

```ts
it('FDM: 120 g, 6 h, 1 peça, 20 min, kit Padrão', () => {
  const r = calculatePrintCost(settings, fdmJob);
  expect(r.breakdown).toEqual({ materialCents: 1440, energyCents: 1106, laborCents: 1000, packagingCents: 400, otherCents: 283 });
  expect(r.totalCents).toBe(4229);
  expect(r.feeRatePct).toBeCloseTo(8.586, 3);
  expect(r.suggestedPriceCents).toBe(6887);
  expect(r.prices.map((p) => p.priceCents)).toEqual([5922, 6887, 8226, 10212]);
});
it('resina: 50 ml a R$ 180/l, 3 h, impressora 60 W / 250000 / 3000 h / 30 por h, falha 15 %, insumos 150, 30 min', () => {
  expect(calculatePrintCost(resinSettings, resinJob).breakdown).toEqual({
    materialCents: 900, energyCents: 357, laborCents: 1500, packagingCents: 400, otherCents: 372,
  });
});
it('refuses margin + fees ≥ 100%', () => {
  const r = calculatePrintCost({ ...settings, targetMarginPct: 95 }, fdmJob);
  expect(r.suggestedPriceCents).toBeNull();
  expect(r.error).toBe('MARGIN_TOO_HIGH');
});
it('projects 50 sales a month at R$ 69,90', () => {
  expect(projectProfit(calculatePrintCost(settings, fdmJob), settings, 6990, 50)).toMatchObject({
    unitFeesCents: 600, unitProfitCents: 2161, revenueCents: 349500, monthlyProfitCents: 58050, breakEvenUnits: 24,
  });
});
```

- [ ] **Step 2: Run** `npx vitest run packages/contracts/src/print-cost.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `print-cost.ts` com as fórmulas acima.
- [ ] **Step 4: Run** the tests — Expected: PASS.
- [ ] **Step 5: Commit** `feat(contracts): motor da calculadora de custo de impressão`

### Task 5: Configuração da calculadora salva no workspace

**Files:**
- Modify: `packages/contracts/src/admin-schemas.ts` (`workspaceSchema.costCalculator: calculatorSettingsSchema.optional()`)
- Modify: `packages/contracts/src/admin-types.ts` (`WorkspaceSettings.costCalculator?`)
- Create: `src/features/admin/cost-calculator-settings.tsx`
- Test: `src/features/admin/cost-calculator.test.tsx`

**Interfaces:**
- Consumes: `calculatorSettingsSchema`, `defaultCalculatorSettings` (Task 4); `useAdminData().workspace`, `useAdminAction().run` (padrão de `workspace-settings.tsx:122`).
- Produces: `CalculatorSettingsEditor({ value, onSaved }: { value: CalculatorSettings; onSaved?: () => void })` — listas editáveis (adicionar/remover) de materiais, impressoras, itens e kits de embalagem; campos de energia, mão de obra, falha, insumos de resina, taxas (Pix, cartão, % no cartão, imposto), fixo por pedido, fixo mensal, margem-alvo. Salva com `run({ type: 'workspace.save', settings: { ...workspace, costCalculator } })`.
- Produces: `parsePercent(value: string): number` (aceita vírgula) em `src/lib/domain/format.ts`.

- [ ] **Step 1: Write the failing test**: renderiza o editor com `defaultCalculatorSettings`, troca "Preço por kg" do PLA para `130,00`, digita `0,99` em "Taxa Pix (%)", clica "Salvar configuração" e espera `run` chamado com `type: 'workspace.save'` e `settings.costCalculator.materials[0].priceCents === 13000` e `pixFeePct === 0.99`.
- [ ] **Step 2: Run** `npx vitest run src/features/admin/cost-calculator.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** schema, tipo, `parsePercent` e o editor.
- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Commit** `feat(admin): configuração da calculadora de custos`

### Task 6: Página "Calculadora de custos"

**Files:**
- Create: `src/app/admin/calculadora/page.tsx`, `src/features/admin/cost-calculator.tsx`
- Modify: `src/features/admin/admin-frame.tsx` (`adminNavigation`: `['calculadora', 'Calculadora de custos', <ícone existente>, 'catalog']`, logo após "Produtos e estoque")
- Modify: `src/styles/admin-operation.css` (estilos da página)
- Test: `src/features/admin/cost-calculator.test.tsx`

**Interfaces:**
- Consumes: `calculatePrintCost`, `projectProfit` (Task 4); `CalculatorSettingsEditor` (Task 5).
- Produces: `PrintCostForm({ settings, initial?, onApply? }: { settings: CalculatorSettings; initial?: Partial<PrintJob>; onApply?: (r: PrintCostResult) => void })` — formulário de peça (tecnologia filtra materiais e impressoras; gramas ↔ ml conforme tecnologia), resultado ao vivo: 5 partes, custo total, preço sugerido, tabela 20/30/40/50 %, e projeção (preço praticado e vendas/mês editáveis → faturamento, lucro mensal, ponto de equilíbrio). Com `onApply`, mostra botão "Usar este custo".
- `AdminCostCalculator()`: abas "Calcular" (PrintCostForm) e "Configuração" (editor da Task 5); usa `workspace.costCalculator ?? defaultCalculatorSettings`.

- [ ] **Step 1: Write the failing test**: renderiza `PrintCostForm` com as configurações do teste da Task 4, preenche 120 g, 6 h, 1 peça, 20 min, kit Padrão; espera ver "R$ 42,29" (custo) e "R$ 68,87" (preço sugerido); digita preço `69,90` e vendas `50` e espera "R$ 580,50" (lucro mensal) e "24 vendas" (equilíbrio); com margem 95 % espera o alerta "Margem e taxas somam 100% ou mais". Segundo teste: `AdminCostCalculator` com `workspace` sem `costCalculator` mostra o material "PLA" de `defaultCalculatorSettings`.
- [ ] **Step 2: Run** `npx vitest run src/features/admin/cost-calculator.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** a página, o formulário e o item de menu.
- [ ] **Step 4: Run** the test — Expected: PASS.
- [ ] **Step 5: Commit** `feat(admin): página da calculadora de custos`

### Task 7: Preço e custo por tamanho no editor de produto

**Files:**
- Create: `src/features/admin/product-size-pricing.tsx` (substitui `ProductCostFields` no editor; `product-cost.tsx` fica só com `costFields`)
- Modify: `src/features/admin/product-editor.tsx:118-139` (montagem do produto) e `:174` / `:417` (campo de preço e aba de custo)
- Test: `src/features/admin/product-editor.test.tsx`

**Interfaces:**
- Consumes: `PrintCostForm` (Task 6), `unitCostBreakdown` (Task 1), `costFields`.
- Produces: `readSizePricing(d: FormData, sizes: number): { priceCents; sizePrices; costBySize; costBreakdown; costCents }` (`priceCents`/`costBreakdown`/`costCents` = tamanho 0). `ProductSizePricing({ product })`: tabela com uma linha por tamanho (segue o campo "Tamanhos" ao vivo, como `product-packaging.tsx`): preço (R$), as 5 partes do custo, custo total, lucro e margem (taxas pela configuração da calculadora); botão "Calcular" por linha abre `PrintCostForm` em diálogo e "Usar este custo" preenche as 5 partes daquela linha; alerta quando o lucro de algum tamanho é negativo. Produtos sem `sizePrices` abrem com `unitPriceCents(p, i)` em cada linha.

- [ ] **Step 1: Write the failing test** em `product-editor.test.tsx`: abre o editor do primeiro produto do seed, na aba de preço e custo digita preço `159,90` e matéria-prima `26,00` na linha do 3º tamanho, salva e espera `run` com `product` contendo `sizePrices[2] === 15990`, `costBySize[2].materialCents === 2600` e `priceCents === sizePrices[0]`. Segundo teste: trocar "Tamanhos" para `15 cm, 20 cm` deixa a tabela com 2 linhas e o produto salvo com `sizePrices.length === 2` e `costBySize.length === 2`.
- [ ] **Step 2: Run** `npx vitest run src/features/admin/product-editor.test.tsx` — Expected: o novo teste FAIL; os existentes PASS.
- [ ] **Step 3: Implement** o componente e a integração no editor.
- [ ] **Step 4: Run** the test file — Expected: PASS.
- [ ] **Step 5: Commit** `feat(admin): preço e custo por tamanho no editor de produto`

### Task 8: Verificação completa e publicação

- [ ] **Step 1: Run** `npx tsc --noEmit && npx vitest run && npx prettier --check .` — Expected: 0 erros, todos os testes PASS.
- [ ] **Step 2: Run** `npm run backend:test` — Expected: todos os checks PASS.
- [ ] **Step 3: Verificar no navegador local** (`NEXT_DIST_DIR=.next-http`, porta 3010): `/admin/calculadora` calcula e salva configuração; editor de produto grava preço por tamanho; página do produto mostra o preço de cada tamanho e o carrinho usa esse preço.
- [ ] **Step 4: Commit e push** (`git push`); aguardar deploy do Railway (web, api, worker em SUCCESS).
- [ ] **Step 5: Smoke em produção**: `GET https://maosemoracao.com.br/api/v1/catalog/products` não contém `costBySize`/`costBreakdown`; página de um produto existente mostra os mesmos preços de antes.
