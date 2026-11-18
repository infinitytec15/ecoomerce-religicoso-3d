# Servidor MCP (Claude e ChatGPT)

A loja expõe um servidor [Model Context Protocol](https://modelcontextprotocol.io) para que
assistentes de IA operem a gestão: cadastrar e editar produtos, enviar fotos, ajustar estoque,
consultar pedidos, clientes e relatórios e executar qualquer comando do painel admin.

## Endereço e autenticação

| Uso                                                | Endereço                                                   |
| -------------------------------------------------- | ---------------------------------------------------------- |
| Conectores que só aceitam URL (ChatGPT, Claude.ai) | `https://<loja>/api/mcp/<chave>`                           |
| Clientes que enviam cabeçalho (Claude Code etc.)   | `https://<loja>/api/mcp` + `Authorization: Bearer <chave>` |

- Transporte **Streamable HTTP**, sem sessão (stateless), respostas em JSON. `GET`/`DELETE`
  respondem 405.
- A chave é gerada em **Configurações › Integrações com IA** (só o responsável pela loja). Ela
  aparece uma única vez; o banco guarda apenas o HMAC (`SESSION_SECRET`), por isso trocar o
  `SESSION_SECRET` invalida todas as chaves.
- **Acesso total** age com todas as permissões do responsável. **Acesso por área** limita a chave
  às permissões escolhidas (as ferramentas fora delas nem aparecem para a IA).
- Uma chave nunca tem mais acesso do que quem a criou tem no momento; se a conta for desativada,
  a chave para de funcionar. Revogar no painel corta o acesso na hora.
- Limite de 240 chamadas por minuto por chave e 20 chaves ativas. O painel sugere validade de
  90 dias.
- **Equipe e convites (`team.*`, `invite.*`) nunca são alterados por chave**, nem com acesso
  total: assim uma chave vazada (ou uma IA enganada por texto de cliente) não consegue convidar
  alguém e manter acesso depois da revogação. Chaves também não criam outras chaves.

### Fluxo da requisição

`cliente MCP → Next /api/mcp (troca a chave da URL por Bearer, soma o x-bff-secret) → API Nest
/api/v1/mcp (valida a chave, monta o ator) → serviços de backend-core`. Toda ação passa pelas
mesmas regras de permissão, validação e auditoria do painel. Chamadas de ferramenta renovam o
cache da vitrine.

## Como conectar

**ChatGPT** — Configurações › Aplicativos e conectores › Avançado › ative o **Modo
desenvolvedor** › Criar conector. Cole `https://<loja>/api/mcp/<chave>` e escolha "Sem
autenticação" (a chave já está na URL).

**Claude.ai / Claude Desktop** — Configurações › Conectores › Adicionar conector personalizado e
cole a mesma URL.

**Claude Code**

```bash
claude mcp add --transport http maos-em-oracao https://<loja>/api/mcp --header "Authorization: Bearer <chave>"
```

> A URL com a chave é um segredo: quem a tiver opera a loja. Se vazar, revogue a chave.

## Ferramentas

| Ferramenta                | O que faz                                                                   |
| ------------------------- | --------------------------------------------------------------------------- |
| `whoami`                  | Em nome de quem a chave age e quais permissões tem.                         |
| `list_products`           | Produtos com preço, estoque, reservas e situação; busca por nome/SKU.       |
| `get_product`             | Cadastro completo de um produto (id ou SKU).                                |
| `create_product`          | Cria peça; `imageUrls` baixa e publica as fotos; `active` publica na loja.  |
| `update_product`          | Altera só os campos enviados em `changes`; `addImageUrls` inclui fotos.     |
| `archive_product`         | Tira da loja e arquiva.                                                     |
| `adjust_stock`            | Entrada/saída de estoque com motivo.                                        |
| `upload_image_from_url`   | Envia uma imagem por link HTTPS e devolve o `assetId`.                      |
| `store_overview`          | Indicadores do período.                                                     |
| `list_records`            | Qualquer área: pedidos, assinaturas, clientes, produção, financeiro…        |
| `get_admin_snapshot`      | Os mesmos dados que o painel admin carrega, por seção.                      |
| `describe_admin_commands` | Lista os comandos do painel e o JSON Schema de cada um.                     |
| `run_admin_command`       | Executa comandos do painel (pedidos, cupons, CRM, stories…), exceto equipe. |

Valores em dinheiro são sempre em centavos (R$ 89,90 = `8990`).

`upload_image_from_url` só aceita HTTPS público: endereços de rede interna, loopback e
link-local são recusados em cada redirecionamento.
