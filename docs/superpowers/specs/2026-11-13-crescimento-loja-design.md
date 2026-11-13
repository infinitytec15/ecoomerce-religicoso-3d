# Crescimento da loja: calculadora, avaliações, kits, compra coletiva, stories e CRM

Data: 2026-11-13 · Status: rascunho para aprovação

## Intenção

A loja Mãos em Oração vende peças cristãs impressas em 3D (filamento e resina). O dono quer seis
recursos novos para vender mais e precificar melhor, todos **configuráveis pelo painel admin**
(pedido explícito: "deixar configurável tudo pelo admin"):

1. **Calculadora de custos de impressão** (filamento e resina) para chegar ao custo real, ao preço
   sugerido de venda e à projeção de ganho.
2. **Avaliações de produto.**
3. **Kits** (ex.: 3 peças por um preço fechado).
4. **Compra coletiva** bem visível no produto ("faltam 3 pessoas para o preço cair").
5. **Video commerce em stories**: bolinhas estilo destaques do Instagram, vídeos enviados pelo
   painel para o Bunny.
6. **CRM de e-mail**: campanhas disparadas pelo painel para clientes e grupos.

Sucesso = o dono consegue operar tudo sozinho no admin, sem mexer em código, e cada recurso aparece
para o cliente na loja (mobile primeiro).

## Não-objetivos (por agora)

- WhatsApp/SMS, automações por gatilho (carrinho abandonado, aniversário), A/B test de e-mail.
- Avaliações importadas de marketplaces; stories com enquetes/perguntas; lives.
- Compra coletiva iniciada pelo cliente (só o admin cria campanhas).

## Anti-objetivos (falharia mesmo "funcionando")

- Mandar e-mail de marketing para quem não pode receber (LGPD) ou sem descadastro.
- Compra coletiva ou kit com preço abaixo do custo sem o admin ser avisado.
- Stories deixando a home lenta (vídeo só carrega ao abrir; capa é imagem).
- Avaliação falsa: só quem comprou e recebeu avalia.

## Restrições e o que já existe

- Monorepo atual: Next.js 16 (web + admin), NestJS (api), worker BullMQ com outbox, Prisma/Postgres,
  contratos zod em `packages/contracts`. Tudo é construído aqui, sem SaaS novo.
- `Product.data` (JSON) guarda tamanhos, cores, embalagem por tamanho (`shipping.bySize`) e
  `costBreakdown` (material, embalagem, energia, mão de obra, outros). `OrderItem.costCents`
  congela o custo na venda e alimenta os relatórios de lucro.
- **Preço por tamanho hoje é fixo no código**: `base + sizeIndex × R$ 20`
  (`packages/backend-core/src/orders.ts`). Isso contraria "tudo configurável" e precisa mudar.
- Bunny Stream já integrado (upload TUS, URLs de reprodução, webhook). Upload de mídia aceita
  `video` até 150 MB.
- Mercado Pago com estorno **parcial** já suportado pela integração (`payments.refund(id, amount, key)`);
  o serviço de pedidos hoje só faz estorno total.
- Campanhas existem (`Campaign`) mas só com públicos "Inscritos em oração" e "Assinantes do clube";
  envio pelo worker via Resend, com webhook de eventos já gravando entregas.
- `Customer` não tem campo de consentimento de marketing.
- Configurações gerais ficam em `AppSetting` (chave + JSON versionado).

## Abordagem

**Escolhida: construir os seis módulos dentro do sistema atual**, um por vez, cada um publicado
antes do próximo. Ordem: calculadora → avaliações → kits → compra coletiva → stories → CRM.
A calculadora vem primeiro porque kits e compra coletiva usam o custo dela para avisar margem
negativa.

Descartadas:
- **Apps de terceiros** (Judge.me/Yotpo para avaliações, Tolstoy/Videowise para stories,
  Brevo/Mailchimp para CRM): mensalidade em dólar, dados fora do painel, e o dono pediu tudo no
  próprio admin; Bunny e Resend já estão pagos e integrados.
- **Tudo de uma vez num grande lançamento**: risco alto em produção e nada chega ao cliente até o fim.

## Design por módulo

### 1. Calculadora de custos (admin › "Calculadora de custos")

**Configuração prévia** (salva em `AppSetting` `cost-calculator`, editável na própria página):
- Materiais: lista de filamentos (nome, preço por kg) e resinas (nome, preço por litro ou kg).
- Impressoras: nome, tecnologia (FDM/resina), potência (W), preço de compra, vida útil (h),
  manutenção por hora. Gera depreciação por hora.
- Energia: preço do kWh.
- Mão de obra: valor/hora; tempos padrão de preparo, pós-processo (lixa, pintura), e para resina
  lavagem/cura.
- Insumos de resina por impressão (álcool isopropílico, luvas, FEP) como custo por impressão.
- Taxa de falha (%), embalagens (itens com custo unitário: caixa, plástico bolha, cartão,
  adesivo; montados em "kits de embalagem").
- Taxas de venda: % do Mercado Pago **separadas para Pix e cartão** (com mix configurável, ex.:
  60 % Pix / 40 % cartão, que gera a taxa média usada no preço sugerido), % de imposto (Simples),
  custo fixo por pedido; margem-alvo.

**Cálculo** (inputs por peça/tamanho): tecnologia, material, gramas (ou ml), horas de impressão,
impressora, peças por mesa, minutos de mão de obra, kit de embalagem, extras.
**Saída**: custo por peça quebrado nas 5 partes já existentes (depreciação e manutenção da impressora entram em
"Energia e máquina", como o rótulo atual; falha, insumos de resina e extras em "outros"), preço sugerido = custo ÷ (1 − taxas − imposto − margem), tabela de preços em margens
20/30/40/50 %, lucro por unidade e **projeção** (unidades/mês informadas → faturamento, lucro,
ponto de equilíbrio).

**Ligação com produto**: no editor de produto, botão "Calcular custo" abre a calculadora por
tamanho e grava `costBreakdown` **por tamanho**. Junto, o preço por tamanho passa a ser
configurável (cada tamanho tem preço próprio), substituindo o "+R$ 20 por tamanho" do código;
produtos existentes migram mantendo o preço atual de cada tamanho.

### 2. Avaliações

- Só cliente com pedido **entregue** daquele produto avalia (1 avaliação por item de pedido):
  1–5 estrelas, título opcional, texto, até 3 fotos (upload de imagem existente).
- E-mail "Como ficou sua peça?" X dias após a entrega (X configurável; desligável). É tratado como
  e-mail de serviço do pedido (não marketing), com opção de não receber mais pedidos de avaliação.
- Moderação no admin: aprovar, ocultar, responder publicamente. Configurável: publicar
  automaticamente notas ≥ N ou tudo passa por aprovação.
- Loja: média e quantidade no card e na página do produto, filtro por nota, fotos de clientes,
  resposta da loja; JSON-LD `AggregateRating` para o Google.

### 3. Kits

- Kit é um produto do tipo "kit" com componentes (produto + tamanho + cor opcional + quantidade),
  preço próprio, fotos próprias e embalagem própria (para o frete).
- Loja mostra "Kit com 3 peças · economize R$ X" contra a soma avulsa.
- Estoque é por produto (não por tamanho/cor), como hoje; tamanho e cor do componente servem à
  produção. Estoque disponível do kit = mínimo derivado dos componentes; a compra reserva e baixa cada
  componente. Custo do kit = soma dos custos dos componentes + embalagem do kit; congelado na venda.
- Produção recebe os componentes separados no job do pedido.
- Admin avisa se o preço do kit dá margem abaixo da mínima configurada.

### 4. Compra coletiva

Campanha criada pelo admin, ligada a um produto (ou kit) e tamanho:
meta de participantes, preço de grupo, prazo, limite máximo opcional, texto, ativa/inativa, e
**modo de pagamento escolhido por campanha** (pedido do dono: configurável):

- **Modo "devolve a diferença"**: paga o preço normal; pedido segue para produção na hora. Ao bater
  a meta, o sistema estorna automaticamente a diferença de cada participante (estorno parcial MP)
  e envia e-mail. Quem entra depois da meta paga o preço de grupo direto.
- **Modo "estorno se não fechar"**: paga o preço de grupo; pedido fica "Aguardando grupo" e não
  entra na produção. Meta batida → pedidos liberados para produção + e-mail. Prazo vencido sem
  meta → estorno total, pedido cancelado, estoque liberado, e-mail.

Participante = cliente distinto com pedido pago vinculado à campanha (conta pessoas, não peças;
o mesmo cliente com dois pedidos conta uma vez).

**Checkout próprio**: "Entrar no grupo" leva a um checkout só com aquele item (quantidade até o
limite por pessoa definido na campanha), sem misturar com o carrinho e sem cupom. Assim, segurar o
pedido ou estornar nunca afeta outros produtos, e a diferença a devolver é
`(preço normal − preço de grupo) × quantidade`.
Loja: bloco de destaque na página do produto (barra "7 de 10 · faltam 3 · termina em 2 dias",
avatares/iniciais, botão compartilhar no WhatsApp e copiar link), selo nos cards e página
`/compra-coletiva` com campanhas ativas. Admin: criar/editar, encerrar antes, prorrogar, ver
participantes e estornos. Worker fecha campanhas no prazo (mesmo padrão do agendador da oração
diária). Aviso se preço de grupo < custo.

### 5. Stories (video commerce)

- **Destaques** (bolinhas): título, capa (imagem), ordem, ativo, onde aparece (home, página de
  produto, categoria).
- Cada destaque tem vídeos verticais enviados pelo admin direto para o Bunny Stream (upload já
  existente), com ordem, legenda opcional e produtos vinculados (botão "Comprar" / "Ver peça").
- Loja: fileira de bolinhas no topo da home; viewer em tela cheia com barras de progresso, toque
  para avançar/voltar, arrastar para fechar, som desligado por padrão, próximo destaque ao terminar.
  Na página do produto aparecem os destaques com vídeos daquele produto.
- Métricas simples no admin: visualizações por vídeo e cliques em produto.
- Desempenho: capas pequenas; vídeo (HLS do Bunny) só carrega ao abrir.

### 6. CRM de e-mail

- **Consentimento**: `Customer` ganha aceite de marketing (data + versão do texto) e base legal;
  checkbox no cadastro, no checkout e na conta; descadastro em um clique em todo e-mail (já existe para a
  oração diária). Inscritos da oração diária continuam como público próprio.
- **Quem pode receber** (configurável no admin, padrão mais restrito): por padrão só quem aceitou.
  Chave "Incluir clientes que já compraram (legítimo interesse)" amplia para compradores sem aceite,
  sempre com descadastro. Contatos importados exigem que o admin marque "Tenho o consentimento
  dessas pessoas" na importação; isso fica registrado como base legal do contato.
- **Grupos**: etiquetas manuais em clientes (ex.: "Paróquia São José") e importação CSV de
  e-mails para um grupo (contatos sem conta viram contatos de marketing, não clientes).
- **Segmentos por regra** (combináveis): todos com consentimento, comprou produto/categoria X,
  gastou acima de R$ Y, última compra há mais/menos de N dias, assinantes do clube, inscritos na
  oração, participantes de compra coletiva, etiqueta. Mostra a contagem antes de enviar.
- **Campanhas**: editor em blocos (texto, imagem, cartões de produto puxados do catálogo, botão,
  cupom) no layout de e-mail da marca, envio de teste, agendamento, envio em lotes pelo worker
  (respeitando limite do Resend), métricas por campanha (entregues, aberturas, cliques,
  descadastros, bounces) via webhook do Resend.
- Configurável: remetente, assunto de rodapé, limite de envios por hora.

## Decisões que ficam com quem constrói

Modelagem exata das tabelas, nomes de rotas, componentes e testes; reaproveitar padrões
existentes (comandos admin, outbox, `AppSetting`, `DataTable`, `report-viewer`).

## Chamadas minhas (para o dono conferir)

- Ordem dos módulos e entrega um a um.
- Preço por tamanho passa a ser configurável (remove o "+R$ 20" fixo).
- Compra coletiva conta pessoas (pedidos), não peças; só o admin cria campanhas.
- Avaliação só de quem recebeu o pedido; fotos limitadas a 3.
- CRM: por padrão só envia a quem deu consentimento; ampliar para compradores é uma chave sua.
- Compra coletiva tem checkout próprio, sem cupom e sem misturar com o carrinho.
- Taxa do Mercado Pago separada por Pix e cartão na calculadora.
- Pedido de avaliação é e-mail de serviço, não marketing.
