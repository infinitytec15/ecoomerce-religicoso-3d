import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { Prisma } from '@maos-em-oracao/database';
import { ProviderError } from '@maos-em-oracao/integrations';
import { DomainError } from '@maos-em-oracao/backend-core/shared';
import type { Context } from '@maos-em-oracao/backend-core/context';
import type { Actor } from '@maos-em-oracao/backend-core/shared';
import { adminTools } from './admin-tools';
import { productTools } from './product-tools';
import { toolEnv, type McpTool } from './tool';

/** Long answers are cut so a single tool result never floods the assistant's context. */
const MAX_RESULT_CHARS = 120_000;

export const mcpTools: McpTool[] = [...adminTools, ...productTools];
const byName = new Map(mcpTools.map((t) => [t.name, t]));

const INSTRUCTIONS = `Gestão da loja Mãos em Oração (artigos religiosos impressos em 3D).
- Comece com whoami para ver as permissões da chave.
- Valores em dinheiro são sempre em centavos (R$ 89,90 = 8990).
- Para cadastrar peças use create_product (imageUrls envia as fotos sozinho); para editar, get_product e depois update_product só com o que muda.
- Para consultar qualquer área use list_records ou get_admin_snapshot; para alterar o que não tem ferramenta própria, use describe_admin_commands e run_admin_command.
- Estornos, cancelamentos, exclusões e envios de e-mail são definitivos: confirme com a pessoa antes.`;

function inputSchema(tool: McpTool) {
  const schema = z.toJSONSchema(tool.input, { io: 'input', unrepresentable: 'any' }) as Record<
    string,
    unknown
  >;
  Reflect.deleteProperty(schema, '$schema');
  return { ...schema, type: 'object' as const };
}

function text(value: unknown) {
  const raw = JSON.stringify(value ?? null, null, 2);
  return raw.length > MAX_RESULT_CHARS
    ? raw.slice(0, MAX_RESULT_CHARS) +
        '\n… resultado cortado. Refine o filtro, use limit/cursor ou peça menos seções.'
    : raw;
}

/** Turns any failure into a message the assistant can act on, without leaking internals. */
export function toolError(error: unknown): CallToolResult {
  let message = 'Não foi possível concluir a operação.';
  if (error instanceof DomainError || error instanceof ProviderError)
    message = `${error.message} (${error.code})`;
  else if (error instanceof z.ZodError)
    message =
      'Dados inválidos: ' +
      error.issues
        .slice(0, 8)
        .map((i) => (i.path.length ? i.path.join('.') + ': ' : '') + i.message)
        .join('; ');
  else if (error instanceof Prisma.PrismaClientKnownRequestError)
    message =
      error.code === 'P2002'
        ? 'Este registro já existe (CONFLICT).'
        : error.code === 'P2025'
          ? 'Registro não encontrado (NOT_FOUND).'
          : message;
  return { isError: true, content: [{ type: 'text', text: message }] };
}

export function visibleTools(actor: Actor): McpTool[] {
  return mcpTools.filter(
    (t) => !t.permission || actor.owner || actor.permissions.includes(t.permission),
  );
}

/** One stateless MCP server per HTTP request, bound to the actor of the request's API key. */
export function createMcpServer(ctx: Context, actor: Actor): Server {
  const server = new Server(
    { name: 'maos-em-oracao', title: 'Mãos em Oração · Gestão', version: '1.0.0' },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
  );
  const env = toolEnv(ctx, actor);
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: visibleTools(actor).map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: inputSchema(t),
      annotations: {
        title: t.title,
        readOnlyHint: !!t.readOnly,
        destructiveHint: !t.readOnly && !!t.destructive,
        openWorldHint: t.name === 'upload_image_from_url' || t.name === 'create_product',
      },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request): Promise<CallToolResult> => {
    const tool = byName.get(request.params.name);
    if (!tool)
      return {
        isError: true,
        content: [{ type: 'text', text: 'Ferramenta inexistente: ' + request.params.name }],
      };
    try {
      const args = tool.input.parse(request.params.arguments ?? {});
      return { content: [{ type: 'text', text: text(await tool.run(args, env)) }] };
    } catch (error) {
      return toolError(error);
    }
  });
  return server;
}
