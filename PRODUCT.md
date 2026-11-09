# Mãos em Oração
<!-- impeccable:product-schema 1 -->

## Confirmed business identity
The user supplied the actual business name “Mãos em Oração”, replacing the earlier concept name. Use the generated prayer-hands emblem with its open arch and the Cormorant Garamond wordmark. Keep the selected Essência palette and composition. Public titles, store settings, footer, staff labels, demonstration email and downloads use the new name. Legacy browser-storage namespaces are intentionally retained to preserve carts, orders, clients and subscriptions. The public staff demo email is now gestao@maosemoracao.demo; the existing demo password remains unchanged. Portable olive and cream SVG lockups contain the original raster emblem and outlined vector lettering, not an entirely vector emblem.

## Platform
web

## Stack
Next.js 16 App Router, React 19, TypeScript estrito e Storybook 10, por solicitação explícita do usuário. O protótipo estático anterior permanece em dist/ como referência histórica; a aplicação ativa usa src/app/. O visual Essência aprovado é preservado.

## Users
Brazilian Portuguese shoppers looking for Catholic, Evangelical and broadly Christian 3D-printed decor and gifts.

## Product Purpose
Explore religious 3D prints, personalize products, estimate shipping and experience a complete purchase flow.

## Capabilities and Constraints
Requested: products, product detail, client account, cart, checkout with Pix, card and combined payments, shipping, orders, support. All checkout and account activity is a browser-local simulation. No real charge, authentication, address lookup or carrier quote. Never request real payment credentials. Demonstration products, prices and delivery estimates are explicitly labeled.

## Brand Commitments
Modern interface; apply Prototype, Emil Kowalski and Impeccable. User confirmed the name Mãos em Oração and the cream, olive and terracotta visual direction.
The user subsequently requested a livelier design that speaks directly to Christian audiences. Use welcoming faith-centered language and daily devotion, home and giving contexts; preserve distinct Catholic and Evangelical pathways. Continue this iteration on the local server as requested.
Additional requested features: dismissible Bible-verse toasts, a brief Bible-opening page arrival animation, interactive 3D product rotation/zoom, a free daily-prayer email signup popup, and Cantinho da Fé prayer-wall UI. The 3D objects are procedural illustrative meshes, not manufacturing files. Prayer-wall posts/reactions and signup are browser-local demonstrations; no real email delivery or internet publication. Samples must remain labeled. Preserve existing commerce data.

## Evidence on Hand
No real product catalog, photography, testimonials or commercial policies provided. Product imagery is generated concept artwork. No invented ratings or customer testimonials.

## Product Principles
Respect denominational differences through clear product categories. Make price composition transparent. Keep the end-to-end visual experience functional. Support mobile and keyboard navigation.


## Monthly club and operation extension
Requested: one fixed-price monthly Christian basket plan, complete subscription journey and self-service, linked shipment history and a comprehensive visual administrator. Assumed illustrative plan: R$129.90/month including shipping; configurable for new contracts in administration. Catholic, Evangelical and Christian curation profiles share the same plan. Card renewal and monthly Pix confirmation remain simulated. Pause, resume, skip, cancel, future preferences, billing and support are local. Operations include searchable clients/orders/contracts, manual orders, product prices/visibility/stock, monthly editions, production stages/machines, shipping/tracking, receivables/refunds/expenses, support conversations, prayer moderation, prayer-email campaign simulations, CSV reports, illustrative team roles, settings and audit history. Shared records let storefront actions become operational records and shipment/support updates appear in the customer area. No real authentication or permissions are implemented. The user explicitly authorized pushing the completed prototype to infinitytec15/ecoomerce-religicoso-3d for Vercel; no deployment to Vercel has yet been performed.

## Chosen theme and sign-in
The user selected Essência as the final theme and requested a modern animated login after viewing administration. Promote Essência, remove variant picker/shortcuts, and extend its cream/olive/terracotta identity to customer sign-in/register/recovery and staff sign-in/recovery. Staff demo credentials are public test fixtures; a sessionStorage record gates the visual admin journey in this tab. It is not authentication or a security boundary. Passwords are not stored; optional remembered email is local. Eight tests cover existing operation and demo session/return-route behavior. User explicitly requested commit and push after this update.


## Migração Next.js solicitada

O usuário solicitou converter o frontend completo para Next.js com Storybook, otimização e preparação para backend. As jornadas foram reimplementadas em componentes React reutilizáveis e 44 páginas do App Router. React Query, Zustand, validação Zod, adaptadores DemoGateway/HttpGateway e BFF de mesma origem separam apresentação, dados e serviços. Imagens WebP e fontes WOFF2 locais usam otimização do Next; Three.js e overlays são carregados sob demanda. Storybook documenta componentes reais, estados e jornadas com dados isolados. TypeScript, ESLint, Vitest e os dois builds compõem a verificação automatizada. O modo demonstrativo continua local e explicitamente sintético. Autenticação, pagamento, recorrência agendada, frete e e-mail reais dependem de uma API implementada segundo docs/BACKEND.md. Não houve substituição da identidade, dos tokens ou da direção visual Essência.
