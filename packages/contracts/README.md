# Contratos compartilhados

Workspace real, independente de React e Next.js. Exporta entidades, DTOs e validações Zod usados pelo frontend. A API NestJS e o worker deverão importar este pacote e mapear o domínio persistido para esses DTOs.

`types` e `admin-types`: modelos de leitura e comandos; `schemas` e `admin-schemas`: validação de dados. Os caminhos antigos em `src/lib/domain` são reexports para preservar as importações existentes. Arquivos originais de produção e tokens de cartão não podem ser publicados em respostas públicas nem persistidos em snapshots.

O pacote exporta TypeScript para ser compilado por cada aplicação. Next usa `transpilePackages`; o build Nest deverá incluir o pacote em seu bundler ou gerar uma distribuição ESM antes de iniciar. Não apontar Node diretamente para estes fontes no deploy da API.
