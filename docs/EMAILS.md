# E-mails Mãos em Oração

Resend aprovado em 09/11/2026. O workspace `@maos-em-oracao/emails` contém 16 templates no visual Essência, renderer tipado com validação Zod, versões HTML/texto simples e adaptador do SDK oficial Resend 6.37.0. Sem leitura automática de secrets, chamadas ao importar ou disparo durante build/testes.

**Implementado:** templates, prévia local, adaptador de envio, chave determinística, classificação de falhas e verificação de assinatura pelo SDK. **Planejado:** módulos Nest, worker BullMQ, tabelas Prisma, rotas de confirmação/descadastro, domínio verificado e configuração de produção. O formulário demo de oração diária e os comandos administrativos ainda não enviam e-mails reais.

## Prévia e testes

```powershell
npm run emails:preview
python -m http.server 8772 --bind 127.0.0.1 --directory packages/emails/.preview
```

Abra `http://127.0.0.1:8772`. Catálogo e amostras são gerados localmente e ignorados pelo Git/Docker. Os dados são fictícios e os botões apontam para domínios `.example`. O catálogo oferece HTML e texto simples de cada modelo. Não publicar tokens reais nesse diretório.

`npm test` inclui os testes de e-mail. `npm run typecheck` também verifica o workspace de e-mails. O renderer usa centavos inteiros; confere a soma das linhas, frete e desconto no resumo de pedido. URLs de ação devem ser HTTPS e do mesmo domínio público da loja; rastreio aceita HTTPS da transportadora. Todo conteúdo dinâmico é escapado; nenhuma nota interna é aceita pelo DTO de resposta pública de suporte.

## Catálogo e gatilhos do domínio

| Modelo               | Evento confirmado que permite criar o e-mail                                           |
| -------------------- | -------------------------------------------------------------------------------------- |
| `verify-email`       | Cadastro criou token de verificação com hash/expiração                                 |
| `password-reset`     | Solicitação de recuperação válida; resposta HTTP genérica impede enumeração            |
| `team-invite`        | Convite criado ou renovado; token anterior revogado                                    |
| `order-received`     | Pedido e linhas imutáveis persistidos; não afirma pagamento                            |
| `pix-pending`        | Pix emitido, link seguro e vencimento disponíveis                                      |
| `payment-approved`   | Soma das partes aprovadas atingiu o total; nunca no callback do navegador              |
| `production-started` | Job de produção iniciou de fato, pedido elegível                                       |
| `shipment-posted`    | Postagem confirmada; não ao gerar ou comprar etiqueta                                  |
| `club-welcome`       | Preapproval autorizado; deixa explícito que primeira mensalidade pode estar pendente   |
| `club-renewed`       | Pagamento da competência conciliado; unique por assinatura/competência                 |
| `payment-failed`     | Recusa confirmada da tentativa; não inferir recusa em timeout                          |
| `club-status`        | Provedor confirmou pausa, retomada, cancelamento ou pulo suportado pela regra do clube |
| `devotional-opt-in`  | Pessoa solicitou inscrição; confirmação pendente                                       |
| `daily-prayer`       | Campanha aprovada chegou ao horário, consentimento confirmado e não revogado           |
| `support-reply`      | Resposta pública persistida; mensagens internas nunca geram este evento                |
| `refund-confirmed`   | Provedor confirmou valor efetivamente estornado, parcial ou integral                   |

Os textos e valores finais vêm dos snapshots do domínio. O remetente de produção, domínio, regras comerciais e datas não são definidos pelas amostras. Datas de validade são produzidas pelo backend em `America/Sao_Paulo`, com fuso explícito; não prometer entrega ou aprovação sem evento real. O texto da oração demonstrativa é autoral, sem atribuição de versículo bíblico.

## Integração Nest / worker

API: módulo `Notifications` recebe eventos de domínio e grava `EmailOutbox` na mesma transação da alteração. Worker: injeta o provider na fila `email-transactional`; `devotional-delivery` resolve destinatários e reutiliza o provider após verificar consentimento e supressão. Templates não devem ser importados por componentes client nem expor chaves ao Next público.

```ts
import { createResendProvider } from '@maos-em-oracao/emails/resend';

// ConfigService valida os valores no boot do worker; este exemplo não executa envio.
const provider = createResendProvider(config.resendApiKey, {
  fromEmail: config.emailFrom,
  replyToEmail: config.emailReplyTo,
  webhookSecret: config.resendWebhookSecret,
});
// O processor chama provider.send({ eventId, to, message, context })
// apenas para um job persistido, autorizado e não suprimido.
```

Secrets exclusivos do servidor:

```dotenv
RESEND_API_KEY=re_substituir_no_ambiente
RESEND_WEBHOOK_SECRET=whsec_substituir_no_ambiente
EMAIL_FROM=pedidos@seu-dominio.example
EMAIL_REPLY_TO=atendimento@seu-dominio.example
PUBLIC_WEB_URL=https://seu-dominio.example
```

Usar `config/email.env.example` como referência; nenhuma chave real é incluída. Limitar a chave de envio ao domínio/ambiente necessário. API recebe o segredo de webhook; worker recebe a chave de envio. A fábrica atual exige configuração completa; passar via configuração de Notifications sem exportar o objeto completo para controllers/logs. Antes de ativar, verificar domínio e registros SPF/DKIM; configurar DMARC conforme a política do domínio e confirmar a caixa de reply-to. O adaptador utiliza a API HTTPS do Resend, não SMTP.

### Entrega e retentativa

`send()` retorna `accepted`, um ID de provedor e a chave de idempotência. Isso não confirma chegada à caixa postal. A chave é hash de evento, destinatário normalizado, tipo e versão do template; não contém e-mail ou token em claro. Persistir destinatário/payload/versionamento congelados na outbox; retries precisam usar o mesmo corpo, remetente e configuração. Não re-renderizar um job antigo com uma nova versão de código: guardar o HTML/texto e permitir ao processor enviar o snapshot por um port de outbox, ou manter o renderer histórico até a fila antiga drenar. O método atual recebe o DTO e é apropriado à primeira versão; o consumidor durável ainda será implementado.

Resend conserva chaves por **24 horas**, enquanto a aplicação precisa de unicidade durável no PostgreSQL: `unique(eventId, recipientHash, templateKind, templateVersion)`. Não regenerar a chave ao repetir job. 429/5xx e falha de rede são elegíveis a retry com backoff/jitter, limite e rate limit da conta; 401/422/409 entram em diagnóstico. Respeitar `Retry-After` no processor conforme os headers do provedor. Após timeout, o resultado é desconhecido: conservar a mesma chave e tentar/reconciliar dentro da janela. Fora de 24 horas, parar para conciliação, sem reenviar cegamente. [Idempotência Resend](https://resend.com/docs/dashboard/emails/idempotency-keys).

`POST /api/v1/webhooks/resend`: corpo bruto limitado a 256 KiB, headers `svix-id`, `svix-timestamp`, `svix-signature`, assinatura validada pelo SDK antes de persistir inbox. Não confiar no JSON do cliente nem reserializar o corpo. Dedupe `unique(provider, svixId)`, responder rápido depois de persistir e processar assincronamente. Eventos podem repetir ou chegar fora de ordem. Conservar cada evento com timestamp do provedor; um `sent` atrasado não regride `delivered`, e reclamação/bounce prevalecem para supressão. Correlacionar por providerId conhecido e jamais alterar destinatário a partir de webhook não correlacionado. [Verificação oficial](https://resend.com/docs/webhooks/verify-webhooks-requests).

Estados: queued → accepted → sent → delivered, com delayed, failed, bounced, complained e suppressed registrados separadamente. `delivered` indica aceite pelo servidor de destino, sem garantir leitura/inbox. Atraso não é recusa; abertura/clique não são critérios de entrega nem de consentimento. Bounce permanente, reclamação e supressão bloqueiam novos envios ao endereço até resolução apropriada. Logs guardam IDs, tipo, código e contagem, sem conteúdo de oração, recipient em claro, link de acesso ou token. [Eventos Resend](https://resend.com/docs/webhooks/event-types).

### Oração diária e consentimento

Double opt-in com token aleatório, hash, validade e uso único; registrar finalidade e data de confirmação. A compra não inscreve o cliente automaticamente. Revalidar consentimento e supressão imediatamente antes de cada envio. Revogar inscrição remove jobs pendentes elegíveis, sem cancelar avisos essenciais de pedidos. Campanhas canceladas não criam novos envios.

O template exige link visível de descadastro e headers `List-Unsubscribe` / `List-Unsubscribe-Post`. Implementar uma rota pública dedicada `POST /api/email/unsubscribe` com token assinado restrito a revogação, sem sessão, sem redirect externo e resposta idempotente, aceitando `List-Unsubscribe=One-Click`. Essa rota ainda não existe e **não** deve ser encaminhada ao BFF genérico, que exige Origin do navegador. Validar assinatura, limites e propósito do token; essa exceção não abre outras mutações sem proteção. O GET humano de descadastro apresenta uma página com ação explícita; scanners que seguem links não devem inscrever ou descadastrar alguém por GET. [Cabeçalhos Resend](https://resend.com/docs/dashboard/emails/custom-headers).

O PostgreSQL é a fonte de consentimento; se Contacts/Topics/Broadcasts do Resend forem adotados depois, sincronizar descadastros em ambos os sentidos sem substituir o registro de consentimento. A implementação atual usa envio individual pela API de e-mail; não cadastra contatos nem cria Broadcasts automaticamente.

## Aceite antes de produção

Testes locais verificam renderização de todos os modelos, centavos, soma de recibo, escaping, URLs, dados privados, unsubscribe, payload/chave em SDK mock, falhas e assinatura real local via SDK. A revisão de navegador valida HTML desktop/mobile, sem disparos reais.

Homologação ainda necessária: API/worker/banco/fila reais, domínio verificado, credenciais no Railway, SPF/DKIM/DMARC, limites da conta, consentimento/descadastro end-to-end e entrega controlada para endereços de teste autorizados. Validar Gmail, Outlook desktop/web e Apple Mail, incluindo imagens bloqueadas, CSS parcial e alterações de cor em modo escuro; o screenshot no Chromium não comprova compatibilidade nesses clientes. Confirmar bounce/reclamação, webhook inválido/duplicado/fora de ordem e retry sem duplicação. Não habilitar a campanha de oração diária antes desse aceite.
