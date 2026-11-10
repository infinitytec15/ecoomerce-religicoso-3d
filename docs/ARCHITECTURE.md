# Arquitetura do frontend

> Atualização de 10/11/2026: API, worker, banco e integrações foram implementados. O estado atual, os comandos, os limites e o deploy estão no [runbook do backend](BACKEND-RUNBOOK.md). As seções de planejamento abaixo preservam a especificação anterior; não são um registro de implantação em provedores.

```text
src/app/                   App Router, metadados, layouts e BFF
src/components/ui/         Botões, formulários, diálogo, tabela e estados
src/components/layout/     Marca, cabeçalho, rodapé e providers
src/components/faith/      Versículos, chegada da Bíblia e oração diária
src/features/              Catálogo, carrinho, checkout, clube, conta e gestão
src/lib/domain/            Entidades, validação, cálculos e regras puras
src/lib/api/               Contrato, adaptador HTTP, consultas e servidor
src/lib/demo/              Operação demonstrativa e migração local
src/lib/store/             Zustand para carrinho e preferências visuais
src/stories/               Componentes, estados, jornadas e documentação
public/assets/             WebP, fontes WOFF2 locais e marca
packages/emails/            Templates HTML/texto e adaptador servidor Resend
dist/                      Protótipo estático anterior, somente referência
```

Páginas e layouts do Next.js são componentes de servidor. A home, o catálogo e o produto recebem catálogo/configuração pelo servidor; cache público de 60 segundos no adaptador HTTP. Interações, consultas privadas e formulários são componentes cliente. O rodapé é composto pelo servidor e entregue como slot ao frame cliente.

React Query mantém cache de sessão e dados da operação. Chaves de conta/admin incluem o usuário da sessão; logout remove consultas privadas. Mutações invalidam as consultas relacionadas para que compra, cobrança, produção, envio e suporte se reflitam entre os painéis. O adaptador demonstrativo é importado dinamicamente no primeiro uso. Nesse modo, catálogo e mensalidade são atualizados imediatamente a partir da operação persistida, inclusive após recarregar a página; o modo HTTP mantém a política de cache dos dados públicos do servidor.

Zustand persiste apenas carrinho e favoritos. A migração lê os namespaces `amago-*`, grava `meo-commerce-v2`/`meo-cart-v2` e preserva os originais. Sessões de demonstração são restritas à aba. Senhas e dados de cartão não são armazenados. A compatibilidade de links antigos `/#/...` redireciona para as rotas nativas após a hidratação. Dados locais pertencem à origem: conserve o mesmo host/porta ao verificar a migração.

## Otimizações

- Rotas separadas e renderização pública no servidor; estado interativo limitado a componentes cliente.
- Imagens de produto individuais em WebP, `next/image`, tamanhos responsivos e prioridade na imagem principal.
- Fontes WOFF2 locais com caracteres do português, sem chamadas ao Google Fonts.
- Three.js e loaders STL/3MF/GLB só são importados ao enviar um modelo ou abrir o 3D. A visualização é condicionada a arquivo válido; não há modelos procedurais substitutos. Geometria, materiais, eventos e renderer são liberados ao fechar.
- Cart drawer e recursos devocionais usam importação dinâmica.
- Páginas de erro, carregamento, 404, dados vazios, submissão e falhas de API têm estados próprios.
- `robots.txt`, sitemap e metadados por produto; conta, login, checkout e gestão não indexáveis.

O CSS mantém o Essência aprovado, extraído do protótipo original, com uma camada de adaptação para React. `DESIGN.md` e `.impeccable/design.json` continuam sendo a autoridade visual existente; referências antigas a `dist/` descrevem a origem do sistema, agora portado para `src/styles/`. Não houve troca de identidade.

## Testes e manutenção

`npm run check` executa TypeScript, ESLint, Vitest e builds de Next.js/Storybook. `npm run format:check` verifica a formatação. Os testes novos em `src/` cobrem as regras comerciais, migração, limites HTTP e os componentes acessíveis. `tests/*.cjs` são testes históricos do protótipo, não entram no Vitest.

Storybook usa `@storybook/nextjs-vite`, os componentes reais, dados em memória isolados por história, Autodocs, controles e inspeção de acessibilidade. As histórias não dependem de API externa. A interação do diálogo tem um teste `play` de abertura/fechamento.

## Implantação

Vercel: framework Next.js, comando `npm run build`, diretório de saída padrão; não configure `dist`. O `vercel.json` já aponta para Next.js. Use as variáveis do ambiente e configure o domínio em `NEXT_PUBLIC_SITE_URL` antes do build. Storybook é um build separado: `npm run build-storybook`, saída `storybook-static/`.

Servidor Node: `npm ci && npm run build && npm start -- --port 8766`. Para gerar standalone em Linux/contêiner, use `NEXT_STANDALONE=true npm run build`; copie também `public` e `.next/static` para a distribuição standalone. O build padrão funciona em Windows sem exigir privilégios de criação de links.

## Operação e monorepo

O frontend na raiz agora consome o workspace npm packages/contracts. Os arquivos antigos src/lib/domain/types, schemas, admin-types e admin-schemas são reexports. Tipos e validações não dependem de React/Next; serão usados pela API NestJS. O plano detalhado está em BACKEND-PLAN.md.

Biblioteca de mídia demonstrativa no IndexedDB (meo-media-v1), operação JSON separada. Fotos resolvem URLs temporárias com cleanup; STL/3MF são validados e têm geometria real carregada sob demanda. Modelos remotos usam preview GLB preparado pelo worker. O adaptador HTTP de mídia negocia sessão e finalização validada; Storage passa por streaming do BFF, vídeo vai a Bunny Stream por TUS com assinatura curta. O Card Payment Brick só é carregado em HTTP e recebe chave pública; tokens transitórios nunca entram na operação local. Cotação HTTP aceita itens e devolve serviço, orçamento e validade para Melhor Envio.

Drawers Radix preservam foco e contexto da lista, incluindo entrada/saída reduzida e teclado sem animação. Gráficos Recharts usam cobranças/despesas reais do estado demonstrativo e oferecem tabela alternativa. Convites, edições, movimentos, moderação, campanhas e preferências têm comandos próprios; a API deverá autorizar cada comando e filtrar respostas por perfil. O modo local é uma simulação, não autenticação nem proteção de dados.
