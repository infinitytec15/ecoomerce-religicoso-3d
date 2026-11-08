# Âmago 3D — protótipo navegável

Abra `dist/index.html` em um navegador. A pasta `dist` contém o site completo e funciona sem instalação de dependências.

## Comparar apresentações

Use o seletor na parte inferior: Essência (editorial), Ateliê (galeria com fundo oliva) e Coleção (catálogo direto). Atalhos: 1, 2, 3 ou setas; R redesenha a tela. A variante fica no parâmetro `?v=1`, `?v=2` ou `?v=3`.

## Explorar

- Catálogo: busca, coleção, cor, preço e ordenação.
- Produto: tamanho, cor, quantidade, dedicatória nas peças personalizáveis e frete demonstrativo por CEP.
- Favoritos e carrinho persistem neste navegador.
- Checkout: dados fictícios, entrega padrão/expressa, Pix, cartão de teste e Pix + cartão com saldo e parcelamento.
- Use “Preencher com dados fictícios”. Cupom de teste: `PRIMEIRAFE`.
- Minha conta: entrar/criar perfil fictício, endereços, dados, pedidos e detalhe de pedido.
- Suporte: perguntas frequentes e envio simulado com protocolo local.

## Limites

Não há venda real, cobrança, QR Pix real, gateway, cotação de transportadora, autenticação de servidor ou envio de mensagem. Não informe dados pessoais ou de cartão reais. Os produtos, preços, prazos e políticas são conceituais. O usuário confirmou a marca Âmago 3D e sua direção de cores. Imagens produzidas com a ferramenta Imagegen integrada; prompt e origem em `dist/assets/products.png.json`.

Os dados fictícios ficam no armazenamento local do navegador. É possível apagá-los pela central de ajuda. O site hospedado inicia privado na conta do proprietário.

## Verificação

Validado no navegador em desktop 1280px e mobile 390px: três variantes, categoria evangélica, produto personalizado, tamanho e cor, CEP, carrinho, dados fictícios, entrega, pagamento combinado e confirmação Pix, pedido, cupom e cartão. JavaScript passou por `node --check`; detector Impeccable retornou `[]`.

