# Backend implementado · Mãos em Oração

Implementação de 10/11/2026. A API NestJS, o worker BullMQ, o banco Prisma/PostgreSQL e os adaptadores de provedores existem neste repositório. Testes usam banco e filas reais, com provedores simulados. Credenciais e homologação externa continuam necessárias para operar vendas reais.

## Monorepo

| Caminho                  | Responsabilidade                                               |
| ------------------------ | -------------------------------------------------------------- |
| `src/`                   | Next.js, loja, cliente, admin e BFF de mesma origem            |
| `apps/api/`              | API NestJS e OpenAPI em desenvolvimento                        |
| `apps/worker/`           | Filas, scheduler, conversão isolada de STL/3MF                 |
| `packages/backend-core/` | Regras transacionais de comércio, acesso, conteúdo e operação  |
| `packages/database/`     | Prisma, migrations SQL, constraints e transações serializáveis |
| `packages/integrations/` | Mercado Pago, Melhor Envio, Bunny Storage e Stream             |
| `packages/contracts/`    | DTOs e validações compartilhadas                               |
| `packages/emails/`       | 17 templates HTML/texto Essência e Resend                      |

O web permanece na raiz para preservar o projeto Vercel. API e worker são executáveis distintos e compartilham o mesmo banco, Redis, secrets e prefixo de filas. O código de domínio não depende do NestJS. O banco é a fonte de verdade; Redis transporta trabalhos recuperáveis.

## Rodar localmente com backend

Use Node 24 e Docker Desktop com engine Linux ativo. Os comandos não substituem um arquivo de ambiente existente.

```powershell
npm ci
npm run backend:local -- setup
docker compose --env-file .env.backend.local -f compose.backend.yml up -d
npm run backend:local -- generate
npm run backend:local -- migrate
npm run backend:local -- seed
npm run backend:local -- build
```

Em três terminais separados:

```powershell
npm run backend:local -- api
npm run backend:local -- worker
npm run backend:local -- web
```

- Web e admin: `http://127.0.0.1:8888` e `/admin`.
- API: `http://127.0.0.1:4000/api/v1`; documentação local `/docs`.
- Worker: `http://127.0.0.1:4001/health/ready`.
- PostgreSQL/Redis locais: portas 5545/6385, vinculadas apenas ao loopback.
- Login: `BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_PASSWORD` do arquivo privado `.env.backend.local`. A senha é aleatória, sem credencial pública fixa.
- O setup local usa `mock`: não cobra, não compra frete e não envia e-mail externo. Prévia dos e-mails em `var/backend/emails/`, arquivos privados fora de `public/`.

`npm run dev` continua oferecendo o protótipo independente quando `NEXT_PUBLIC_DATA_MODE=demo`. Os modos nunca se substituem silenciosamente.

## Acesso e privacidade

Senhas Argon2id, sessões opacas com hash, cookies HttpOnly/SameSite, TTL de 8 horas para equipe, 7 dias para clientes e 1 dia para o acesso de visitante. Recuperação de senha, confirmação e troca de e-mail e convites usam tokens com hash, expiração e uso único. Alterar a senha revoga as sessões.

O BFF precisa do mesmo `BFF_SHARED_SECRET` da API. Mutações exigem a origem pública configurada. Permissões são verificadas no servidor, inclusive para administradores que não são o responsável. Contas só leem seus próprios registros; um visitante só acessa seu pedido. E-mails de visitante possuem link seguro de uso único. Após confirmar o e-mail, a conta pode reunir pedidos anteriores desse endereço. Notas internas não entram na conta nem no e-mail do cliente.

Tokens OAuth, envelopes de e-mail e webhooks são cifrados com AES-256-GCM. Guarde `TOKEN_ENCRYPTION_KEY` no cofre e no backup: perdê-lo impede recuperar esses dados. Trocar `SESSION_SECRET` encerra os acessos existentes. A chave de supressão de e-mail usa a chave de criptografia e não muda ao rotacionar sessões.

## Comércio e recorrência

Preço, variação, frete, desconto e estoque são calculados pelo servidor. Cotação guarda fingerprint da cesta e validade. Chaves idempotentes impedem duplicar checkout, adesão, ajustes e comandos administrativos. Estoque e reservas têm constraints e locks transacionais; produção exige pagamento integral.

Pix e cartão usam Checkout Transparente. O navegador envia somente token do SDK Mercado Pago. Cartão combinado é processado antes do Pix; as duas partes precisam ser aprovadas. Expiração cancela a parte pendente e agenda compensação da parte capturada. Um Pix simples vencido pode ser renovado no mesmo pedido, com nova referência e nova verificação de estoque. Cartão recusado exige nova tokenização/compra; tentativas de resultado desconhecido precisam de conciliação antes de outra cobrança.

No clube, cartão usa preapproval nativo do Mercado Pago; autorização não significa mensalidade paga. Faturas são verificadas pela cadeia assinatura → fatura → pagamento. Há unicidade por contrato/competência e referência de pagamento. Cobrança duplicada, ciclo suspenso/cancelado ou falta de curadoria/estoque geram exceção financeira e estorno durável. Replay de uma mensalidade antiga não cria outra cesta nem a estorna após cancelamento. Pix mensal é cobrança a confirmar pelo cliente, sem débito automático. O scheduler cria ciclos e acompanha vencimentos. Prepare e ative a curadoria de cada competência antes da renovação.

O ledger registra recebimentos, taxas, despesas, frete, estornos e chargebacks com referências únicas. Gráficos e totais consultam o servidor por período; a visão mensal usa Brasília. Estorno é confirmado pelo provedor. Pedidos já entregues preservam o histórico de entrega.

## Frete e expedição

Melhor Envio oferece OAuth com estado de uso único, refresh cifrado, cotação, carrinho, compra, geração, impressão e rastreamento. Preparar envio atualiza o preço e os volumes; a operação deve conferir o custo e salvar NF-e ou a declaração aplicável antes de comprar a etiqueta. A cotação precisa estar válida. Remetente real e documento do destinatário são obrigatórios na operação live.

Peso é convertido de gramas para quilogramas; dimensões usam centímetros. Os volumes vêm do empacotamento retornado pelo provedor. Opções que exigem múltiplas etiquetas em transportadoras sem suporte ao mesmo envio e Azul com XML específico não são oferecidas por este adaptador inicial. Compra de etiqueta e postagem são etapas distintas. Resultado desconhecido de criação/compra bloqueia repetição automática: confira a conta Melhor Envio antes de reconciliar a remessa. Cancelamento e reembolso do frete seguem a confirmação do provedor; não há crédito fictício de saldo.

## Mídia e 3D

Imagens passam por validação de formato/pixels, correção de orientação e conversão WebP sem metadados, até 2000 px. Arquivos originais STL/3MF ficam na zona privada. A conversão roda em processo separado, com timeout, limite de memória, de ZIP/XML, de triângulos e de recursão. O GLB preserva geometria real e usa quantização; nenhum modelo substituto é fabricado quando falta arquivo ou a conversão falha. Preview público e original de fabricação têm acessos separados. Download original exige catálogo ou produção e deixa auditoria.

Bunny Stream usa TUS e autorização temporária renovável, sem expor a chave da biblioteca. Webhook assinado e polling atualizam o processamento. YouTube utiliza URL validada. A zona pública/CDN deve permitir CORS para GLB; a zona privada não deve ter pull zone pública. As fotos do seed local são demonstrativas e não substituem produtos comerciais aprovados.

## E-mail, comunidade, relatórios e operação

Resend recebe HTML/texto congelados na outbox, chave idempotente estável e links do domínio da loja. Aceite e entrega são estados diferentes. Webhook usa corpo bruto e assinatura SDK; callbacks recebidos antes da resposta de envio são reconciliados. Bounce/complaint alimentam supressão. Retentativa ambígua após a janela de idempotência fica em revisão, sem reenvio cego.

Oração diária exige consentimento e confirmação de inscrição, controla versão/revogação e oferece descadastro one-click. O scheduler processa campanhas no horário de Brasília; a versão da inscrição é revalidada imediatamente antes de enviar. Mural possui moderação, reações e denúncias; suporte separa mensagens públicas e notas internas. Alertas de novo pedido, atendimento e estoque baixo respeitam as preferências e os acessos da equipe. Estoque baixo gera no máximo um alerta por produto/dia.

`GET /admin/resources/:resource` e `/admin/reports/:resource` são paginados. Listas de trabalho do snapshot administrativo são limitadas a 1000 registros recentes; os totais e os relatórios consultam todo o período no servidor. CSV é produzido no worker, privado por 24 horas e neutraliza fórmulas. Limites atuais: 10 mil registros e 8 MiB por exportação; reduza o período para volumes maiores. `/admin/jobs` e `/admin/webhooks` mostram estados e erros sem payloads ou credenciais. Auditoria registra mudanças e downloads privados.

## Verificar

```powershell
npm run typecheck
npm run lint
npm test
npm run format:check
npm run backend:build
node --env-file=.env.backend.local --import tsx scripts/backend-test.mjs
npm run build
npm run build-storybook
npm run emails:preview
docker build -f Dockerfile.backend -t meo-backend:local .
```

O teste de integração cria um banco `meo_test_<aleatório>` e prefixo BullMQ próprio, aplica migrations, inicia API/worker e limpa somente esses recursos. Nunca usa FLUSHDB ou limpa tabelas da loja. O usuário PostgreSQL de testes precisa criar bancos. A CI executa a suíte com PostgreSQL e Redis novos, além dos checks do frontend.

## Publicar no Railway

Crie serviços `web`, `api`, `worker`, PostgreSQL e Redis no mesmo projeto. Mantenha a raiz do repositório como contexto de build. Configure o arquivo de cada serviço:

| Serviço | Config as Code                | Imagem/início                                       |
| ------- | ----------------------------- | --------------------------------------------------- |
| Web     | `/deploy/railway.web.json`    | `Dockerfile`, Next standalone                       |
| API     | `/deploy/railway.api.json`    | `Dockerfile.backend`, `node apps/api/dist/main.mjs` |
| Worker  | `/deploy/railway.worker.json` | mesma imagem, `node apps/worker/dist/main.mjs`      |

Somente API executa migrations no pre-deploy. Ambos os serviços backend usam os mesmos `DATABASE_URL`, `REDIS_URL`, `TOKEN_ENCRYPTION_KEY`, `SESSION_SECRET`, `BFF_SHARED_SECRET`, `QUEUE_PREFIX`, URLs públicas e credenciais. Railway injeta `PORT`; não fixe `WORKER_PORT` nesse serviço. Saúde: API `/api/v1/health/ready`, worker `/health/ready`, web `/api/health`.

Use `config/backend.env.example` como inventário, configure secrets nas variáveis privadas e referências entre serviços. Redis deve manter política `noeviction` e persistência apropriada para BullMQ; PostgreSQL precisa de backups e teste de restauração. O backend usa Bunny para persistência live, não disco efêmero, salvo arquivos temporários do conversor.

Execute uma vez, na imagem da API, `node apps/api/dist/seed.mjs`, com `BOOTSTRAP_ADMIN_EMAIL` e uma senha aleatória de pelo menos 16 caracteres. O bootstrap não troca senhas existentes, não cria catálogo fictício em produção e recusa um segundo responsável. Remova as variáveis de bootstrap depois. Cadastre remetente, produtos reais, fotos, documentos e curadorias pelo painel.

No web: build com `NEXT_PUBLIC_DATA_MODE=http`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY` e `IMAGE_HOSTS` do CDN. Runtime com `API_BASE_URL=https://dominio-api/api/v1` e o mesmo `BFF_SHARED_SECRET`. `NEXT_PUBLIC_*` é público; nunca inclua access tokens ou senhas. Vercel pode continuar hospedando o web, usando essas mesmas variáveis e rebuild.

Configure callbacks públicos `/api/v1/webhooks/mercado-pago`, `/resend`, `/bunny-stream` e `/melhor-envio` nos provedores. Resend exige domínio verificado, SPF/DKIM e secret do webhook; Bunny exige zonas e biblioteca; Melhor Envio exige aplicação/OAuth. Habilite `PAYMENTS_ENABLED`, `EMAIL_ENABLED` e, após homologar compensação, `SPLIT_PAYMENT_ENABLED`.

Código e testes locais não equivalem a homologação comercial. Antes de abrir vendas, execute os cenários sandbox dos provedores com as credenciais da loja e confirme entrega de e-mail, cartão/Pix, uma recorrência, cancelamento/estorno, cotação/etiqueta e CORS do preview. Não foram usadas credenciais reais nem realizadas cobranças, postagens ou disparos externos durante QA.

Fontes: [Railway monorepo](https://docs.railway.com/deployments/monorepo), [Config as Code](https://docs.railway.com/config-as-code), [Mercado Pago](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/overview), [Melhor Envio](https://docs.melhorenvio.com.br/docs/compra-de-fretes), [Bunny TUS](https://bunny.net/docs/stream/tus-resumable-uploads), [Resend](https://resend.com/docs).
