# Validação do monorepo

## Backend e integração · 10/11/2026

- TypeScript estrito em todos os workspaces e ESLint sem erros ou avisos.
- Vitest: 104 testes aprovados; segurança, adaptadores e geometria GLB real incluídos.
- 33 cenários integrados passaram com PostgreSQL, Redis, API e worker reais; provedores em mock, sem transações externas.
- A suíte integrada e o build Docker foram aprovados em serviços isolados na [execução da CI](https://github.com/infinitytec15/ecoomerce-religicoso-3d/actions/runs/42864944180). A suíte também valida os DTOs reais pelos schemas usados no frontend.
- Next e Storybook tiveram builds aprovados; prévias dos 17 templates HTML/texto geradas localmente.
- `npm audit`: zero vulnerabilidades após corrigir as dependências transitivas de glob/minimatch e validar Storybook.
- O Docker Desktop local apresentou indisponibilidade de engine/WSL durante a rodada final. A CI possui PostgreSQL e Redis próprios e valida também a imagem de API/worker.
- As credenciais comerciais não foram fornecidas. Não foram feitos pagamentos, compras de etiqueta nem disparos externos. [Operação e limites do backend](BACKEND-RUNBOOK.md).

## Histórico da validação visual · 09/11/2026

Verificado em 9 de novembro de 2026. A entrega daquele dia ampliou o frontend e documentou o planejamento, antes da implementação do backend.

## Checks executados

- TypeScript estrito e ESLint aprovados.
- Vitest: 65 testes em 12 arquivos, todos passando.
- Next.js: build de produção aprovado; 45 páginas de aplicação no fonte (47 entradas incluindo páginas internas do framework no manifesto).
- Storybook: build aprovado, 60 histórias e 8 páginas de documentação; histórias adicionais para cadastro, condição de arquivo 3D e drawers.
- Docker Linux: imagem standalone construída com Node 24.14.1 fixado por digest; execução como usuário node; /api/health, /admin e produto responderam 200.
- Docker em modo HTTP: build aprovado sem acesso à futura API durante o build; leituras públicas são resolvidas em runtime.
- BFF sem API configurada: respondeu 503, sem recorrer a pagamentos ou fretes fictícios no modo HTTP.
- npm audit --omit=dev: zero vulnerabilidades de produção. Permanecem 12 avisos moderados na cadeia de ferramentas de desenvolvimento, sem atualização forçada incompatível.
- Prettier e git diff --check compõem os checks finais e o CI.

## Navegador e dados

Conferidos desktop 1280×900, celular 390×844 e largura intermediária 853×844. Capturas completas e overlays ficam em .impeccable/review/ (não versionados). O build Linux foi servido em http://127.0.0.1:8767/admin; o ambiente anterior em 8766 foi preservado.

Fluxos conferidos: login da equipe, gráficos e filtros, drawers de pedido e produção, Escape e retorno ao acionador; cadastro de produto oculto com foto e STL, persistência após recarregar, rejeição de STL inválido, leitura de STL e 3MF válidos, geometria real com rotação/zoom, remoção do modelo desativando 3D; convite demonstrativo criado, link copiado e aceito no mesmo navegador. O fixture geométrico é um tetraedro de teste, não um produto comercial. Arquivos ficam no IndexedDB e dados comerciais continuam separados no armazenamento local. Não houve limpeza dos dados existentes da origem anterior.

A saída móvel foi conferida por ativação por ponteiro e pela tecla Enter: ambas exibiram /admin/login com o botão Entrar na gestão; em seguida o acesso de equipe foi restaurado. O botão mede 44px de altura e permanece dentro do viewport de 390px.

Os testes cobrem migração, idempotência e regras comerciais anteriores, estoque negativo e ajuste com motivo, SKU duplicado, arquivamento sem apagar pedidos, convites expirados/revogados/aceitos uma vez, permissões demonstrativas, notas internas ausentes da conta do cliente, edição mensal sem reescrever pedidos, preparação de etiqueta, privacidade da moderação, biblioteca de bytes, arquivos/modelos inválidos e limite de descompactação, remoção da capa, condição de publicação, links de vídeo, contratos HTTP e streaming limitado do BFF.

## Revisão visual

Skills Emil Kowalski e Impeccable aplicadas. O detector manual rodou uma vez: 44 achados consultivos de escala/cor/raio e nenhum achado material. Houve alinhamento mecânico com a paleta e escala existentes; não houve segunda execução. A revisão independente preservou a direção Essência e pediu três correções: legenda financeira persistente e unidade BRL; assunto e metadados separados no atendimento; saída da gestão acessível no celular. O reviewer avaliou as três correções como resolvidas, com disposition ship no escopo desses três itens e sem regressões materiais observadas nas recapturas. Isso não constitui auditoria integral de toda a plataforma.

O relatório de preservação do sistema está em DESIGN-VALIDATION-ADMIN.md. DESIGN.md e .impeccable/design.json são a referência existente e permanecem preservados.

## Limites e próxima etapa

Pagamentos, assinatura, etiquetas, envio de e-mail, autenticação e permissões continuam demonstrativos. O frontend contém os DTOs compartilhados, adaptador HTTP, tokenização por Card Payment Brick, sessão de upload e transporte TUS/streaming preparados; nenhum teste foi executado contra contas comerciais de Mercado Pago, Melhor Envio ou Bunny. O plano completo para implementar e homologar NestJS/Prisma/PostgreSQL/Redis no Railway está em BACKEND-PLAN.md, com módulos, entidades, rotas, filas, webhooks, conciliação, deploy e critérios de aceite.

Docker e railway.toml descrevem o serviço web; não foi feito provisionamento nem deploy no Railway. A entrega não representa certificação de segurança, acessibilidade integral, desempenho em aparelhos físicos ou transações reais. Os avisos de empacotamento do Storybook sobre diretivas de cliente e tamanho de chunks das ferramentas não impedem seu build e não entram como ferramentas de documentação na loja publicada.

# Resend e templates — 09/11/2026

Incluído workspace de e-mails com 16 modelos HTML/texto, renderer validado e adaptador Resend 6.37.0. Suíte ampliada para 83 testes em 13 arquivos, incluindo 18 testes de e-mail: escaping, domínio de ações, totais em centavos, links de descadastro obrigatórios na oração, rejeição de nota interna, payload/chave estável em mock do SDK, classificação de falhas e verificação real local de assinatura pelo SDK. Nenhum envio real foi feito.

Typecheck do web e do workspace, lint, formatação, Next e Storybook passaram. O primeiro build Next teve EPERM ao criar um diretório no sandbox Windows; a repetição com permissão apropriada passou sem alteração no código do web. Auditoria das dependências de produção: zero vulnerabilidades na consulta. A CI também gera o catálogo fictício e publica o artefato email-previews.

Navegador: 16 modelos em viewport 390×844 sem overflow horizontal; pedido e oração diária capturados em desktop 1280 e celular 390. Botão principal medido com aproximadamente 56 px de altura. Revisão independente: duas correções solicitadas e avaliadas como resolvidas, disposition ship no escopo desses itens (ação antes do resumo e contraste do rodapé 6,2475:1). Relatórios em DESIGN-VALIDATION-EMAILS.md e EMAIL-DESIGN-SYSTEM.md; sistema visual existente preservado. O detector rodou uma vez e os avisos de fontes/rampa/raios foram avaliados como adaptações locais de compatibilidade de e-mail, não como mudança na identidade.

Esta validação não comprova entrega em clientes de e-mail, rotas Nest, persistência, consentimento/descadastro end-to-end ou envio real. Esses itens, configuração do domínio e worker estão no plano aprovado e em EMAILS.md.
