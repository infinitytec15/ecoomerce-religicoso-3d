# Essência nos e-mails — registro de preservação

Registro extraído do renderer e das capturas locais finais em 09/11/2026. Este trabalho estende a identidade aprovada de Mãos em Oração para e-mail; não redefine o sistema visual da aplicação. `DESIGN.md` continua sendo a referência normativa geral e `.impeccable/design.json` continua sendo seu complemento. Ambos foram preservados integralmente.

## Evidência e alcance

Foram lidos `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `.impeccable/emails.md`, `packages/emails/src/index.ts` e `docs/EMAILS.md`. O contrato específico descreve transacionais em modo Operate e oração em modo Read: reconhecer a marca, compreender a mensagem e encontrar a próxima ação, sem ofertas acrescentadas aos avisos operacionais.

As seis imagens abaixo foram abertas e examinadas. Os pares móveis têm sobreposição e mostram o começo e o rodapé da mesma mensagem.

| Evidência local                                            | O que se observa                                                                                                                    |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `.impeccable/review/emails/order-desktop-final.png`        | Cabeçalho oliva, título serifado, explicação do recebimento, CTA antes dos valores, resumo com total em destaque e rodapé de ajuda. |
| `.impeccable/review/emails/prayer-desktop-final.png`       | Oração em painel oliva claro, reflexão antes do CTA e descadastro visível no rodapé.                                                |
| `.impeccable/review/emails/order-mobile-top-final.png`     | Nome da marca, título refluído, texto de estado e CTA antes do resumo no celular.                                                   |
| `.impeccable/review/emails/order-mobile-footer-final.png`  | Valores alinhados, total, distinção entre recebimento e pagamento e link de ajuda.                                                  |
| `.impeccable/review/emails/prayer-mobile-top-final.png`    | Título, saudação e oração refluem dentro da coluna estreita.                                                                        |
| `.impeccable/review/emails/prayer-mobile-footer-final.png` | Fim da oração, reflexão, CTA, autoria, ajuda, motivo do recebimento e descadastro.                                                  |

As capturas são evidência de prévia HTML local. Não são testes de Gmail, Outlook, Apple Mail, modo escuro, entrega ou funcionamento de links em produção. O renderer cobre 16 tipos, mas esta inspeção visual cobre as duas amostras indicadas. A preparação e as dependências de envio real permanecem descritas em `docs/EMAILS.md`.

## Cores preservadas

Os valores abaixo já existem no frontmatter de `DESIGN.md`. As funções indicadas são aplicações locais observadas no renderer, não novos tokens globais.

| Token existente   | Valor usado no e-mail | Aplicação observada                                                                                 |
| ----------------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| `olive`           | `#3e4934`             | Faixa da marca e ação principal.                                                                    |
| `olive-light`     | `#e9eddf`             | Painel da oração e de respostas em formato de carta.                                                |
| `paper`           | `#faf9f5`             | Fundo externo.                                                                                      |
| `admin-surface`   | `#fffef8`             | Corpo creme da mensagem; reutilização do valor existente, sem importar a composição administrativa. |
| `ink`             | `#282c25`             | Leitura e identificação da marca no rodapé.                                                         |
| `muted`           | `#65695f`             | Notas e informações auxiliares.                                                                     |
| `line`            | `#dedfd6`             | Separadores do resumo.                                                                              |
| `summary`         | `#eeeee6`             | Fundo do rodapé.                                                                                    |
| `badge-terra-ink` | `#89422e`             | Links sublinhados de ajuda, descadastro e rastreio.                                                 |
| `white`           | `#ffffff`             | Texto sobre oliva; equivalente à escrita `#fff` do sistema.                                         |
| `terra`           | `#aa5438`             | Contorno de foco declarado para links quando o cliente suporta `:focus-visible`.                    |

O terracota mais escuro dos links é um valor já presente na família Essência. A escolha para texto pequeno no rodapé é específica deste meio e não altera o token `terra` da aplicação.

## Adaptações específicas do meio

| Aspecto             | Implementação observada                                                                                                                                          | Relação com Essência                                                                                                                             |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tipografia          | Georgia com Times New Roman/serif para marca e títulos; Arial com Helvetica/sans-serif para corpo e ações. Sem fonte baixada.                                    | Mantém a relação entre expressão serifada e leitura sans, substituindo as fontes web por stacks de e-mail previstas no brief.                    |
| Escala              | Marca 27 px; título 38 px, 32 px abaixo de 620 px; corpo 16 px; notas 14 px; rodapé 13 px. Título com peso 400 e entrelinha 1,14; parágrafos com entrelinha 1,7. | Hierarquia local para leitura de mensagem, sem substituir a escala da interface web.                                                             |
| Estrutura           | Tabelas de apresentação, largura de 100% com máximo de 600 px; wrapper condicional MSO de 600 px. Estilos essenciais inline.                                     | Uma coluna de carta útil, sem reproduzir grids de loja ou painéis administrativos. A presença de fallback MSO não comprova compatibilidade real. |
| Respiro             | Externo 40 px/16 px e corpo 40 px no desktop; abaixo de 620 px, externo 16 px/10 px e corpo 30 px/24 px.                                                         | Mantém espaço generoso e adapta a leitura ao celular.                                                                                            |
| Botão               | Oliva com texto branco em negrito, padding de 16 px/24 px e raio de 8 px.                                                                                        | Ajuste local do controle para e-mail; o raio geral de controle de 7 px permanece intacto.                                                        |
| Carta               | Painel oliva claro, padding de 26 px/24 px e raio de 12 px.                                                                                                      | Reutiliza a suavidade de painel existente. O texto permanece HTML selecionável.                                                                  |
| Profundidade        | Superfícies planas, separadores finos e contraste tonal; sem sombra.                                                                                             | Preserva a contenção dos componentes de tarefa e leitura.                                                                                        |
| Imagens e movimento | Nenhum raster, ícone ou animação é necessário; nome da marca em texto real.                                                                                      | Adaptação simplificada da assinatura para e-mail, sem substituir os lockups e o emblema oficiais da aplicação. Não há raster novo a registrar.   |

O foco é um aprimoramento declarado no bloco de CSS; as capturas fornecidas não mostram sua execução. As regras móveis também são aprimoramentos de CSS cuja aceitação depende do cliente. A base inline, o texto real e a versão de texto simples são escolhas observáveis na fonte, não uma certificação de suporte.

## Composição e conteúdo observados

No pedido, marca, título, saudação e explicação precedem o CTA; o resumo vem em seguida. A versão de texto simples coloca a URL da ação antes dos detalhes. Recebimento do pedido não é apresentado como aprovação de pagamento. Na oração, o texto autoral e a reflexão vêm antes da ação para o Cantinho da Fé; o rodapé explica o recebimento e oferece descadastro explícito. Os demais transacionais compartilham a estrutura do renderer e suas mensagens próprias.

O texto simples é produzido pelo mesmo renderer. A assinatura da marca, os estados, os valores, a oração e os controles não dependem de imagem para serem compreendidos. A amostra usa conteúdo fictício; domínio verificado, API/worker, consentimento e descadastro reais continuam fora desta entrega visual local.

## Revisão registrada e preservação

`docs/DESIGN-VALIDATION-EMAILS.md` registra `disposition: ship` para as duas correções avaliadas: CTA antes do resumo em HTML/texto simples e links do rodapé em `#89422e`. A revisão registra contraste de 6,2475:1 sobre `#eeeee6` e nenhuma regressão observada nas seis capturas finais. Esse veredito tem o alcance local expresso no próprio relatório; este registro não o amplia para clientes reais ou produção.

Hashes SHA-256 dos arquivos de sistema, conferidos antes e depois deste registro:

| Arquivo preservado        | SHA-256                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| `DESIGN.md`               | `0A52C4BA0D381967CAED79D508F79E0597DDEE84DB632319DD1469FE08626942` |
| `.impeccable/design.json` | `6E8030AED80B7667430E7FB27C8C68F4DEBF7BC158CBF5FA807535303ADCC394` |

Nenhuma deriva geral foi identificada no recorte examinado. Georgia/Arial, largura de 600 px, botão de 8 px e simplificação da assinatura são adaptações locais documentadas, não regras globais novas. Nenhum defeito foi canonizado e nenhum arquivo de implementação foi alterado por este registro.
