# Mãos em Oração — loja, clube mensal e administração

## Logo da empresa

Nome confirmado: **Mãos em Oração**. A logo reúne mãos unidas em oração e um arco de acolhimento, com assinatura em Cormorant Garamond, nas cores do Essência. Veja `dist/brand-preview.html`. Arquivos: `dist/assets/maos-em-oracao-logo.svg` (oliva), `maos-em-oracao-logo-clara.svg` (creme) e `maos-em-oracao-mark.png` (símbolo com transparência). Os SVGs incorporam o símbolo PNG e letras convertidas em contornos. Origem da arte e licença da fonte acompanham os arquivos. Os dados salvos anteriormente continuam disponíveis; os identificadores internos de armazenamento foram preservados.

Protótipo visual navegável de uma loja de impressões 3D para o público católico, evangélico e cristão. Marca conceitual, creme, oliva e terracota, títulos Cormorant Garamond e fotografia gerada de devoção no lar. HTML, CSS e JavaScript estáticos; fontes, imagens e Three.js incluídos localmente.

## Rodar localmente

Na raiz deste repositório:

```sh
python -m http.server 8766 --bind 127.0.0.1 --directory dist
```

Abra http://127.0.0.1:8766/. Não há dependências de instalação nem etapa de build. O visualizador 3D requer HTTP e WebGL.

No ZIP de apresentação, `index.html` fica na raiz: execute `python -m http.server 8766 --bind 127.0.0.1` na pasta extraída, sem `--directory dist`. As instruções de Vercel abaixo se referem ao repositório GitHub.

## Acessos

- Loja: `/#/`
- Catálogo: `/#/produtos`
- Clube Cesta com Jesus: `/#/clube`
- Adesão em três etapas: `/#/clube/assinar`
- Minha assinatura: `/#/conta/assinatura`
- Histórico de envios: `/#/conta/envios`
- Cobranças: `/#/conta/cobrancas`
- Atendimento do cliente: `/#/conta/atendimentos`
- Login da equipe: `/#/admin/login`. Use “Preencher acesso de demonstração” e depois “Entrar na gestão”.
- Painel administrador: `/#/admin` — sessão visual demonstrativa nesta aba.
- Login do cliente e criação de conta: `/#/login`.
- Cantinho da Fé: `/#/cantinho-da-fe`

## Clube mensal

Plano único ilustrativo de **R$129,90/mês**, com frete incluído. Escolha de curadoria católica, evangélica ou cristã e preferência de acabamento. Checkout com dados fictícios, cartão de teste ou Pix mensal; Pix exige confirmação de cada ciclo. Área do cliente com pausa, retomada, pular edição, cancelamento, preferências, endereço, cobranças, comprovantes ilustrativos e rastreio. O preço para novas adesões, as peças por perfil e o dia de expedição podem ser editados no administrador. Contratos existentes preservam o preço de adesão.

## Operação administrativa

Visão geral derivada dos registros, busca geral, filtros e CSV. Clientes com histórico de compras e assinaturas; pedidos da loja e do clube e criação manual; contratos e renovação mensal simulada; ordens de produção em fila, impressão, acabamento e conferência; situação das máquinas; expedição, rastreio e entrega; recebimentos, pendências, estornos e despesas; produtos, preço, visibilidade e estoque; curadoria mensal; conversas de suporte; moderação do mural; oração diária com envio apenas simulado; relatórios, equipe com perfis ilustrativos, configurações e atividade da operação.

Os registros são compartilhados no mesmo navegador: assinar cria contrato, cobrança e pedido; pagamento confirmado libera a produção; despacho aparece nos envios do cliente; respostas do suporte aparecem na conta. Há dados sintéticos para explorar todos os estados.

## Loja e experiências de fé

Catálogo com busca, coleções, ocasiões, filtros e ordenação; produto com cor, tamanho, dedicatória e frete por CEP; favoritos e carrinho; checkout Pix, cartão de teste e pagamento combinado Pix + cartão; conta e pedidos. Use “Preencher com dados fictícios” e o cupom `PRIMEIRAFE`.

Toast de versículos com referência, próximo e fechar; breve animação da Bíblia respeitando movimento reduzido; visualizador 3D com órbita por arraste, zoom, teclado, cor e rotação automática opcional. Modelos procedurais ilustrativos, sem correspondência com arquivos de fabricação. Popup de oração diária gratuita e mural com anonimato, filtros e reação de oração. Nada é enviado por e-mail nem publicado entre visitantes.

O usuário escolheu **Essência** como tema definitivo. O seletor de versões e seus atalhos foram removidos. O login acompanha a identidade com fotografia de devoção, formulário em creme/oliva e entrada breve de 240–280 ms, respeitando movimento reduzido e navegação por teclado. Cliente e equipe têm acesso, mostrar/ocultar senha, recuperação simulada, validação e estados de erro. A sessão da equipe dura nesta aba, usa somente credenciais públicas de teste e nunca armazena senhas. Não é autenticação real.

## Publicar na Vercel

Importe o repositório `infinitytec15/ecoomerce-religicoso-3d` na Vercel. Use a raiz do repositório, framework **Other**, sem comando de build e diretório de saída **dist**. O arquivo `vercel.json` já define a saída. Rotas usam hash e não precisam de rewrite de servidor. Nenhuma variável de ambiente é necessária para esta demonstração.

## Limites do protótipo

Nenhuma venda, recorrência, transferência Pix, cartão, postagem, e-mail ou mensagem externa é executada. Não há servidor, banco de dados, autenticação, controle real de permissões, integração fiscal, gateway ou transportadora. Use somente dados fictícios. Cada navegador mantém sua própria demonstração em localStorage; administração e mural não sincronizam entre pessoas. A central de ajuda pode apagar os dados locais, restaurando os exemplos administrativos.

Preços, fretes, datas, composições e políticas são ilustrativos. Imagens geradas por IA têm proveniência nos arquivos `dist/assets/*.png.json` e metadados. Fontes e Three.js incluem licenças. Os versículos NVI são ligados à fonte BibleGateway na interface.

## Verificação

JavaScript verificado com `node --check`. Execute `node --test tests/*.test.cjs` no repositório para os oito testes isolados de sincronização do Pix, rastreio, renovação sem duplicidade, preservação de preço e histórico, suporte e arquivos de entrada. Fluxos exercitados no navegador em desktop 1280px e celular 390px: adesão com cartão e Pix; pausa, retomada, pulo e cancelamento; renovação do administrador; produção em quatro etapas e rastreio refletido no cliente; suporte cliente/equipe; cadastro, edição, busca e estoque; navegação nas 15 áreas do administrador. Nenhum transbordamento horizontal no documento nessas áreas; tabelas e quadro de produção têm rolagem própria. Sem erros ou avisos de console nos fluxos conferidos. Detector da extensão: zero achados primários; avisos de escala e tons do sistema documentados na revisão. A checagem automatizada não substitui a revisão visual.
