# Validação da migração

Verificado localmente em 9 de novembro de 2026:

- Next.js: build de produção concluído, 44 páginas do App Router.
- TypeScript estrito e ESLint sem erros ou avisos.
- Vitest: 45 testes em 7 arquivos, todos passando.
- Storybook: build concluído, 55 histórias e 7 páginas de documentação.
- Prettier e `git diff --check` aprovados.
- `npm audit --omit=dev`: zero vulnerabilidades nas dependências de produção. A instalação apontou 12 avisos moderados na cadeia das ferramentas de desenvolvimento; acompanhe as atualizações compatíveis, sem aplicar `audit fix --force` indiscriminadamente.
- Revisão visual independente Impeccable: **ship**, sem correções materiais. O sistema visual existente foi preservado. O detector de código teve zero achados primários; os avisos consultivos de escala/cor/raio refletem principalmente os valores legados e não equivalem a falhas funcionais.

## Conferência no navegador

Desktop 1280 × 900, celular 390 × 844 e janela de 853 px: loja, login e administrador. Catálogo de componentes também conferido no Storybook. Capturas locais e pacote de revisão ficam em `.impeccable/review-next/` (não versionados).

Fluxos percorridos: produto e seleção de tamanho, adição ao carrinho, controles de rotação/cor/zoom em 3D, checkout com Pix + cartão em duas parcelas, confirmação fictícia e pedido na conta, adesão ao clube com perfil evangélico, assinatura/itens/cobrança/produção refletidos na gestão, login da equipe e abertura do pedido manual. A migração preservou o carrinho antigo com três itens e os registros operacionais existentes na mesma origem local.

A revisão também conferiu feedback compacto após login, restauração de foco dos diálogos e leitura do e-mail lembrado em formato antigo. Os testes cobrem idempotência, valores em centavos, limites do pagamento combinado, ciclos mensais, permissão/propriedade demonstrativas, migração, isolamento de custos internos, contratos HTTP e proxy de mesma origem.

## Limites do resultado

Esta validação cobre o frontend e a operação demonstrativa, não serviços comerciais. Não representa certificação de segurança, acessibilidade integral, desempenho em dispositivos reais ou transações reais. A API deve implementar identidade/autorização, banco, cálculo comercial, gateway/webhooks, recorrência agendada, frete e e-mail segundo `BACKEND.md`.

O build do Storybook informa chunks grandes das ferramentas de documentação/acessibilidade e diretivas React de cliente removidas pelo empacotador de preview. O catálogo é uma aplicação cliente separada. O Three.js da loja é importado sob demanda; as ferramentas de documentação não entram no build publicado do Next.js.
