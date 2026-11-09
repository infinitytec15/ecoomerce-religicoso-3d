# Mãos em Oração · Next.js + Storybook

Loja de peças cristãs em impressão 3D, com clube mensal, área do cliente e administrador. Aplicação **Next.js 16 / React 19 / TypeScript**, mantendo o visual Essência aprovado.

## Rodar

Requer Node.js 22.12+ (Node 24 recomendado) e npm.

```sh
npm ci
npm run dev
```

Abra [a loja](http://127.0.0.1:3000), [o administrador](http://127.0.0.1:3000/admin) ou [o login](http://127.0.0.1:3000/login).

```sh
npm run storybook
```

Abra [o Storybook](http://127.0.0.1:6006). Há componentes, estados, controles, acessibilidade, jornadas e documentação de integração.

Para rodar o build de produção local:

```sh
npm run build
npm start -- --port 8766
```

## Fluxos incluídos

- Home, catálogo com filtros/busca/ocasiões, favoritos, produto com cor/tamanho/dedicatória e visualização 3D com rotação, zoom e cor.
- Carrinho e checkout com frete, cupom, Pix, cartão e Pix + cartão, confirmação e pedidos.
- Clube Cesta com Jesus: adesão, perfis de fé, plano mensal, preferências, pausa, retomada, pulo, cancelamento, cobranças e histórico de envios.
- Conta, cadastro/login/recuperação, endereços e conversas de suporte.
- Cantinho da Fé, mural com pedidos/reação/moderação, versículos e convite gratuito de oração diária.
- Gestão de clientes, pedidos, assinaturas, produção/máquinas, expedição, produtos/estoque, edições, financeiro, suporte, comunidade, mensagens, relatórios CSV, equipe, configurações e auditoria.

## Demonstração e backend

O padrão é `NEXT_PUBLIC_DATA_MODE=demo`. Registros ficam neste navegador, pagamentos e envios são simulados e nenhum e-mail é enviado. Use apenas dados fictícios. Não há autenticação real nesse modo.

Acesso de teste da equipe: **gestao@maosemoracao.demo** / **Essencia3D!**. O login também oferece preenchimento do acesso de demonstração. Senhas e dados de cartão não são armazenados.

Para conectar uma API, copie `.env.example` para `.env.local`, configure o modo `http` e a URL exclusiva do servidor, e faça um novo build. Veja o **[contrato completo do backend](docs/BACKEND.md)** e a **[arquitetura](docs/ARCHITECTURE.md)**. A camada HTTP valida respostas e não usa gravações fictícias como fallback.

A API real, banco, autenticação, gateway/webhooks, scheduler de recorrência, transportadora e disparos reais de e-mail **não estão implementados nesta entrega do frontend**. O workspace `packages/emails` já contém 16 templates Essência e adaptador Resend testado sem envios. Consulte [docs/EMAILS.md](docs/EMAILS.md) e rode `npm run emails:preview` para gerar o catálogo local.

## Qualidade

```sh
npm run typecheck
npm run lint
npm test
npm run format:check
npm run build
npm run build-storybook
# ou todos os checks de código/build:
npm run check
```

A integração contínua executa os checks e publica o build do Storybook e as prévias fictícias de e-mail como artefatos. `npm run format` formata o novo código. Os testes novos ficam em `src/**/*.test.*` e `packages/*/src/**/*.test.ts`; `tests/*.cjs` são a suíte histórica do protótipo estático.

## Vercel

Importe o repositório com o framework **Next.js**, build `npm run build` e saída padrão. O `vercel.json` já está configurado. Remova qualquer override antigo de Output Directory `dist` no painel da Vercel. Configure `NEXT_PUBLIC_SITE_URL` com o domínio publicado. O Storybook pode ser hospedado separadamente com `npm run build-storybook`, saída `storybook-static`.

## Identidade, dados anteriores e assets

Marca: **Mãos em Oração**, creme, oliva e terracota; Cormorant Garamond, DM Sans e Manrope locais. A logo tem símbolo de mãos em oração e assinatura tipográfica. SVGs portáteis em `public/assets/maos-em-oracao-logo.svg` e `maos-em-oracao-logo-clara.svg` incorporam o símbolo PNG e letras em contorno; o símbolo não é integralmente vetorial. Licenças e proveniência acompanham os assets.

As fotos são cenas conceituais geradas por IA e os modelos 3D são procedurais ilustrativos, sem correspondência com arquivos de fabricação. Produtos, valores e políticas precisam de aprovação comercial antes de vendas reais.

Links antigos `/#/...` redirecionam para rotas nativas. A migração lê os dados `amago-*`, grava o novo formato e preserva os originais. Armazenamento pertence ao mesmo host/porta. `dist/` conserva o protótipo estático anterior para referência; não é a aplicação publicada nem a saída do Next.js.

## Administração ampliada e monorepo

Visão geral e financeiro com gráficos derivados dos registros; drawers de pedidos, contratos, clientes, produção, expedição e cobranças; cadastro com fotos/vídeos e STL/3MF, estoque e embalagem; várias edições do clube; convites com aceitação local; notas internas de suporte; revisão do mural; oração diária; relatórios CSV por módulo. A visualização 3D só existe quando um arquivo válido foi enviado.

Os arquivos da demonstração ficam no IndexedDB deste navegador; metadados e operação permanecem separados. Limites: imagem 12 MB, vídeo 150 MB, modelo 30 MB e 1 milhão de triângulos. Não usar o protótipo para guardar arquivos únicos sem cópia: limpar dados do navegador remove a biblioteca. Remover uma referência não apaga imediatamente os bytes que ainda podem ser usados em histórico.

O workspace `packages/contracts` fornece DTOs e validações ao web e à futura API. [Plano completo do backend](docs/BACKEND-PLAN.md) para NestJS/Prisma/Postgres/Redis e Railway. Bunny Storage/Stream, Melhor Envio e Mercado Pago estão definidos nos contratos; serviços reais aguardam implementação, credenciais e homologação. Dockerfile e railway.toml descrevem somente o web. O frontend permanece na raiz para manter o deploy Vercel existente.
