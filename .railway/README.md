# Infraestrutura Mãos em Oração

Workspace autorizado: **Intra Pay**. Projeto `01c60d12-7298-4a87-b958-4ca4aedb0bc3`.

`railway.ts` declara web, API, worker, PostgreSQL, Redis e preserva seus volumes. Não inclui secrets. `preserve()` mantém os valores privados cadastrados no Railway.

```sh
npm ci
npm run infra:typecheck
railway link --project 01c60d12-7298-4a87-b958-4ca4aedb0bc3
railway config plan
railway config apply
```

Revise o plano antes de aplicar. Push em main publica o código dos três serviços; alterações nesta infraestrutura exigem plan/apply. Configuração dos provedores: [runbook](../docs/BACKEND-RUNBOOK.md).
