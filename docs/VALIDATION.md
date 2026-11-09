# Validação da operação administrativa

Verificado em 9 de novembro de 2026. Esta entrega amplia o frontend Next.js e planeja o backend; não implementa serviços comerciais reais.

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
