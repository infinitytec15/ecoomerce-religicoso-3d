# Validação da extensão administrativa Essência

Data: 09/11/2026. Extensão funcional do sistema existente de Mãos em Oração, sem substituição de identidade. Este relatório registra evidências; não redefine tokens nem aprova indiscriminadamente todas as superfícies.

## Continuidade do sistema

- **Paleta:** estrutura oliva (`#2f402b`), papel de trabalho (`#f3f4ed`), superfícies claras (`#fffef8`) e terracota funcional preservam a família Essência. Estados continuam escritos, acompanhados das cores semânticas existentes.
- **Tipografia:** DM Sans organiza a operação; os tamanhos observados de títulos são 28/17/14px, com leitura de 13–14px e metadados de 11–12px. A marca mantém o emblema original e o wordmark Cormorant, sem importar a composição narrativa da loja para o painel.
- **Estrutura:** navegação oliva, registros compartilhados, tabelas com rolagem própria, filtros e painéis de tarefa mantêm a linguagem administrativa incumbente. Mobile reorganiza os blocos e conserva navegação horizontal.
- **Formas e profundidade:** controles com cantos de 7px, painéis tonais e bordas discretas continuam a família existente. O drawer tem elevação transitória e ocupa a altura da viewport; particularidades locais de sombra e raio não viram novos tokens globais.
- **Regras preservadas:** Olive Structure, Operational Status, Story and Task e Quiet Operations. Entradas e saídas do drawer usam 220/160ms, com supressão por teclado e movimento reduzido, conforme o contrato desta extensão.

## Evidências consultadas

Leitura de `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `.impeccable/admin-operation.md`, `src/styles/admin-operation.css` e dos componentes `admin-frame.tsx`, `analytics.tsx`, `product-editor.tsx`, `record-drawer.tsx`; amostra adicional da hierarquia de assunto/metadados em `service.tsx`.

Inspeção das 13 capturas em `.impeccable/review/`: `desktop.png`, `mobile.png`, `user-853.png`, `drawer-mobile.png`, `product-mobile.png`, `model-desktop.png`, `finance-desktop.png`, `settings-desktop.png`, `prayers-desktop.png`, `editions-desktop.png`, `support-desktop.png`, `reports-desktop.png` e `invite-desktop.png`. Viewports informadas: desktop 1280×900, mobile 390×844 e intermediária 853×844; overlays capturados na viewport e demais páginas em comprimento completo.

O código e as imagens sustentam gráficos derivados de registros, abertura de detalhes contextual, editor com mídia e estoque, edições, atendimento, moderação, relatórios, convites e configurações. O editor valida e interpreta STL/3MF antes de habilitar a prévia; ausência de arquivo mantém 3D desativado. O modelo mostrado é o arquivo enviado, sem substituto procedural. Bunny Storage, Bunny Stream/YouTube, Melhor Envio e Mercado Pago são os provedores confirmados. `docs/BACKEND-PLAN.md` é um plano: API NestJS e worker permanecem por implementar e implantar.

## Verificação e alcance do resultado

O detector manual foi executado **uma única vez**: 44 achados consultivos (25 de tipografia, 13 de paleta e 6 de raio), nenhum material. O relatório bruto e a nota de resolução estão em `../../work/admin-detector.json` e `../../work/admin-detector-resolution.md`. A correção mecânica alinhou os valores sinalizados à escala existente, incluindo metadados de 10 para 11px. Não houve segunda execução.

O reviewer independente reconheceu a continuidade com Essência e solicitou três correções materiais. As recapturas e o código mostram: legenda financeira persistente com unidade R$ e linhas contínua/tracejada; identificador/categoria do atendimento em linha separada do assunto; saída mobile visível com altura mínima de 44px. O resultado informado foi **pass / ship**, com os três itens resolvidos e sem regressões materiais observadas nas recapturas fornecidas. Esse parecer final cobre os três ajustes pontuados, não uma aprovação integral de todas as superfícies.

A verificação do agente principal registrou logout por ponteiro e Enter até `/admin/login`, upload/remoção de modelo, persistência de fotografias e comportamento de foco do drawer. Foram informados 65 testes em 12 arquivos e builds aprovados; esta passagem documental não repetiu testes, contexto ou detector.

## Defasagens documentais preservadas

O `DESIGN.md` recebido ainda cita o protótipo estático em `dist/` como evidência e descreve a antiga prévia procedural. Essas referências não representam a aplicação Next atual nem a exigência posterior de arquivo STL/3MF validado. O documento e o sidecar também registram medidas da operação anterior (por exemplo, controles de 38px e drawer de 240ms), enquanto esta extensão possui ajustes locais. Permanecem registros históricos, sem converter diferenças pontuais, sombras quase imperceptíveis, literais próximos ou metadados compactos em novas regras universais. Nenhuma defasagem foi reparada sem autorização para atualizar o sistema.

**Preservação:** `DESIGN.md` e `.impeccable/design.json` permaneceram intactos nesta passagem. O único arquivo escrito foi `docs/DESIGN-VALIDATION-ADMIN.md`.
