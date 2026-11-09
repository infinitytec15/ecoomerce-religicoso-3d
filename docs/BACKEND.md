# Contrato de integração

O frontend é uma aplicação Next.js real. O backend comercial não acompanha esta entrega. No modo `demo`, a operação é simulada no navegador; no modo `http`, as mesmas telas usam a API e não recorrem aos dados fictícios quando uma chamada falha.

## Configurar

```dotenv
NEXT_PUBLIC_DATA_MODE=http
NEXT_PUBLIC_API_BASE_URL=/api/v1
API_BASE_URL=https://api.sua-empresa.com/api/v1
NEXT_PUBLIC_SITE_URL=https://sua-loja.com.br
IMAGE_HOSTS=cdn.sua-empresa.com
```

`API_BASE_URL` é exclusivo do servidor. A URL inclui a versão. `IMAGE_HOSTS` permite somente os hosts HTTPS indicados ao otimizador de imagens. Variáveis `NEXT_PUBLIC_*` entram no build: faça um novo build após alterá-las. Disponibilize o catálogo e as configurações públicas durante o build.

O BFF em `src/app/api/v1/[...path]/route.ts` encaminha caminhos permitidos para a API. Mantém cookies, `Idempotency-Key` e `X-CSRF-Token`; repassa `Set-Cookie`; não armazena respostas privadas em cache; limita mutações a 256 KiB e valida a origem. Não é um banco, provedor de autenticação ou implementação de pagamentos. `/api/health` verifica a aplicação, sem testar o provedor comercial.

## Formato e fontes de verdade

Sucesso: `{ "data": ... }`. Falha: `{ "error": { "code": "OUT_OF_STOCK", "message": "Revise a quantidade.", "details": { "quantity": "Estoque insuficiente." } } }`. Mutações sem retorno podem responder `204`.

- `src/lib/domain/types.ts`: entidades e união completa dos comandos administrativos.
- `src/lib/domain/schemas.ts`: validação dos formulários e produtos.
- `src/lib/api/response-schemas.ts`: validação completa das respostas recebidas.
- `src/lib/api/contracts.ts`: interface `CommerceGateway` usada pelas telas.
- `src/lib/api/http.ts`: métodos HTTP, URLs e DTOs enviados.
- `src/lib/demo/gateway.ts`: implementação funcional de referência, exclusivamente demonstrativa.

`Product` é público; custos internos ficam somente em `InventoryProduct` no snapshot administrativo. Não exponha notas internas, custos ou dados de outros clientes nos endpoints públicos e da conta.

Todos os valores monetários são **inteiros em centavos de BRL**, com nomes terminados em `Cents`. Datas civis usam `YYYY-MM-DD`, meses `YYYY-MM` e eventos com horário usam ISO 8601. IDs aceitos pelo proxy contêm letras, números, hífen e sublinhado. Os estados de operação são os rótulos tipados em português em `types.ts`.

## Endpoints

Todos os caminhos abaixo são relativos a `/api/v1`. As entidades indicadas correspondem aos tipos e validadores acima.

| Método | Caminho                           | Entrada / retorno                                                                 |
| ------ | --------------------------------- | --------------------------------------------------------------------------------- |
| GET    | `/catalog/products`               | Filtros `search,category,color,maxCents,sort,occasion` → `Product[]`              |
| GET    | `/catalog/products/:id`           | `Product` ou `null`                                                               |
| GET    | `/store/settings`                 | `StoreSettings` público                                                           |
| GET    | `/auth/session`                   | `Session` ou `null`; 401 também representa desconectado                           |
| POST   | `/auth/login`                     | `LoginInput` → `Session`; em cadastro `register:true,name`                        |
| POST   | `/auth/logout`                    | Invalida e remove cookie; 204                                                     |
| POST   | `/auth/recover`                   | `{email,kind}` → `{message}` com resposta neutra                                  |
| GET    | `/account`                        | `AccountSnapshot` da sessão: cliente, pedidos, assinaturas, cobranças e conversas |
| PATCH  | `/account/profile`                | `{name,email,address?}`; 204                                                      |
| POST   | `/orders`                         | `CheckoutInput` + `Idempotency-Key` → `CheckoutResult`                            |
| GET    | `/orders/:id/payment`             | `CheckoutResult` com a próxima ação de pagamento                                  |
| POST   | `/subscriptions`                  | `SubscribeInput` + `Idempotency-Key` → `CheckoutResult`                           |
| PATCH  | `/subscriptions/:id`              | `SubscriptionChange`: pause/resume/skip/cancel/preferences; 204                   |
| GET    | `/shipping/quotes?cep=...`        | `ShippingQuote[]`: IDs `standard`/`express`, preço e prazo                        |
| POST   | `/support/tickets`                | `{subject,category,message,name?,email?}`; visitante informa nome/e-mail; 204     |
| POST   | `/support/tickets/:id/messages`   | `{message}`; 204                                                                  |
| GET    | `/community/prayers`              | `Prayer[]`, já filtrados pela moderação; `owned`/`prayed` relativos ao visitante  |
| POST   | `/community/prayers`              | `PrayerInput` com consentimento; 204                                              |
| POST   | `/community/prayers/:id/reaction` | Alterna a reação; 204                                                             |
| DELETE | `/community/prayers/:id`          | Remove pedido do autor; 204                                                       |
| POST   | `/newsletter`                     | `NewsletterInput` com consentimento → `{message,token?}`                          |
| POST   | `/newsletter/unsubscribe`         | `{token}`; 204                                                                    |
| GET    | `/admin/operations`               | `Operations`: snapshot autorizado do painel                                       |
| POST   | `/admin/commands`                 | `AdminCommand`, discriminado por `type`; 204                                      |

`Operations` é um contrato inicial único que mantém todos os módulos consistentes. Em operações grandes, introduza paginação e endpoints de listagem por domínio no adaptador e nos hooks, preservando os componentes de apresentação. Não use o snapshot integral para cargas grandes.

## Checkout e pagamentos

O cliente envia somente IDs/opções/quantidades, endereço, frete selecionado, cupom, forma de pagamento, parcelas e consentimento. **Recalcule no servidor** preços, adicionais, descontos, estoque e frete. Os totais mostrados antes da confirmação são estimativas; o pedido e a cobrança retornados são a autoridade.

`CheckoutResult` contém `orderId`, `subscriptionId?` e `paymentAction`:

```json
{
  "orderId": "PED-123",
  "paymentAction": { "type": "redirect", "url": "https://checkout.provedor.com/sessao" }
}
```

As outras ações são `{type:"none"}` e `{type:"pix",qrCode,copyPaste,expiresAt}`. A tela oferece redirecionamento HTTPS, Pix copia e cola e atualização da situação. Dados de cartão nunca passam pelo frontend da loja; use a página hospedada do provedor. Confirmação financeira deve vir de webhook validado no backend. O método `confirmDemoPayment` é bloqueado no adaptador HTTP.

Em Pix + cartão, `pixCents` deve ser positivo e menor que o total. O backend orquestra as duas partes, trata recusa/expiração/estorno e só libera o pedido quando ambas estiverem liquidadas. Repetições com a mesma chave de idempotência devem devolver o mesmo pedido. Nenhuma chave secreta ou endpoint de confirmação financeira pertence ao browser.

## Sessão, permissões e recorrência

Use cookies de sessão `HttpOnly`, `Secure`, `SameSite` apropriado e `Path=/`. Ao passar pelo BFF, o cookie precisa ser válido para o domínio da loja; não envie um `Domain` do host interno da API. A recuperação de senha deve concluir no serviço de autenticação escolhido. Verificação de identidade e propriedade de cada registro, autorização por comando, limites de requisição e proteção CSRF adicional pertencem ao backend. A visibilidade dos menus não é controle de segurança.

O checkout de visitante deve criar uma sessão segura ou devolver um caminho seguro para acessar o pedido. Nunca autentique uma pessoa apenas por conhecer o e-mail usado na compra — esse comportamento só existe no adaptador demonstrativo. O login de demonstração e os cadastros locais não são migrados para usuários reais automaticamente.

O scheduler de recorrência deve gerar no máximo um ciclo por contrato/mês, preservar o preço contratado, aplicar a curadoria atual somente em novos pedidos, respeitar pausas/pulos/cancelamento e criar produção somente após pagamento confirmado. Endereços e preferências novos afetam envios não despachados. A confirmação manual administrativa precisa de permissão e auditoria no servidor. Pix mensal depende de novo pagamento; não significa débito automático.

## Integrações restantes

Implemente persistência transacional, identidade real, gateway e webhooks, cálculo/etiquetas/rastreio de frete, jobs de recorrência, serviço de oração por e-mail com consentimento e cancelamento, armazenamento de imagens e moderação pública. Substitua produtos, preços, políticas e imagens conceituais pelos dados comerciais aprovados. Os modelos 3D atuais são procedurais ilustrativos; não são STL/GLB de fabricação.
