import { z } from 'zod';
import { commandSchema } from '@maos-em-oracao/backend-core/command-schema';
import { DomainError } from '@maos-em-oracao/backend-core/shared';
import { defineTool } from './tool';

const resources = [
  'orders',
  'subscriptions',
  'customers',
  'products',
  'production',
  'shipping',
  'finance',
  'expenses',
  'support',
  'prayers',
  'campaigns',
  'team',
  'editions',
  'coupons',
  'inventory',
  'audit',
] as const;

const schemaOptions = { io: 'input', unrepresentable: 'any' } as const;

/** Each admin command type with the JSON Schema of its payload, built once from the real schema. */
const commandCatalog = commandSchema.options.flatMap((option) => {
  const discriminator = z.toJSONSchema(option.shape.type, schemaOptions) as {
    const?: string;
    enum?: string[];
  };
  const types = discriminator.const ? [discriminator.const] : (discriminator.enum ?? []);
  return types.map((type) => ({ type, option }));
});
const commandTypes = commandCatalog.map((c) => c.type);

export const adminTools = [
  defineTool({
    name: 'whoami',
    title: 'Quem sou eu',
    description:
      'Mostra em nome de quem a chave atua, as permissões dela e a loja conectada. Use primeiro para saber o que é permitido.',
    readOnly: true,
    input: z.object({}),
    run: async (_args, env) => {
      const store = await env.ctx.db.appSetting.findUnique({ where: { key: 'store' } });
      return {
        actingAs: { name: env.actor.name, email: env.actor.email, role: env.actor.role },
        owner: env.actor.owner,
        permissions: env.actor.permissions,
        store: (store?.data as { storeName?: string } | null)?.storeName ?? null,
        storefront: env.ctx.config.PUBLIC_WEB_URL,
      };
    },
  }),
  defineTool({
    name: 'store_overview',
    title: 'Resumo da loja',
    description:
      'Indicadores do período (vendas, pedidos em aberto, assinaturas, produção, atendimento, financeiro). Sem datas, usa o mês atual.',
    readOnly: true,
    input: z.object({
      from: z.string().optional().describe('Início, ISO 8601 (ex.: 2026-11-01).'),
      to: z.string().optional().describe('Fim, ISO 8601.'),
      origin: z.enum(['Loja', 'Clube']).optional(),
    }),
    run: (args, env) => env.reports.overview(env.actor, args),
  }),
  defineTool({
    name: 'list_records',
    title: 'Consultar registros',
    description:
      'Lista paginada de qualquer área da gestão: pedidos, assinaturas, clientes, produtos, produção, expedição, financeiro, despesas, atendimento, orações, campanhas, equipe, edições do clube, cupons, estoque e auditoria. Use nextCursor para a próxima página.',
    readOnly: true,
    input: z.object({
      resource: z.enum(resources),
      search: z.string().max(120).optional(),
      status: z.string().max(50).optional().describe('Situação exata, ex.: "Em produção".'),
      from: z.string().optional().describe('Data inicial ISO 8601.'),
      to: z.string().optional().describe('Data final ISO 8601.'),
      limit: z.number().int().min(1).max(200).default(25),
      cursor: z.string().max(100).optional(),
    }),
    run: (args, env) =>
      env.reports.page(env.actor, args.resource, {
        q: args.search,
        status: args.status,
        from: args.from,
        to: args.to,
        limit: args.limit,
        cursor: args.cursor,
      }),
  }),
  defineTool({
    name: 'get_admin_snapshot',
    title: 'Painel completo',
    description:
      'O mesmo conjunto de dados que o painel admin carrega (pedidos, clientes, cobranças, produção, impressoras, campanhas, cupons, configurações…). Sem sections, devolve só os nomes das seções e quantos itens cada uma tem; depois peça as seções que precisar.',
    readOnly: true,
    input: z.object({
      sections: z.array(z.string().max(60)).max(40).optional(),
    }),
    run: async (args, env) => {
      const snapshot = (await env.admin.operations(env.actor)) as unknown as Record<
        string,
        unknown
      >;
      if (!args.sections?.length)
        return Object.fromEntries(
          Object.entries(snapshot).map(([key, value]) => [
            key,
            Array.isArray(value) ? `${value.length} itens` : typeof value,
          ]),
        );
      const unknown = args.sections.filter((s) => !(s in snapshot));
      if (unknown.length)
        throw new DomainError(
          'UNKNOWN_SECTION',
          'Seções inexistentes: ' +
            unknown.join(', ') +
            '. Disponíveis: ' +
            Object.keys(snapshot).join(', '),
        );
      return Object.fromEntries(args.sections.map((s) => [s, snapshot[s]]));
    },
  }),
  defineTool({
    name: 'describe_admin_commands',
    title: 'Comandos da gestão',
    description:
      'Sem type: lista todos os comandos que run_admin_command aceita. Com type: devolve o JSON Schema exato daquele comando. Consulte antes de executar um comando que ainda não usou.',
    readOnly: true,
    input: z.object({ type: z.string().max(60).optional() }),
    run: async (args) => {
      if (!args.type) return { commands: commandTypes };
      const entry = commandCatalog.find((c) => c.type === args.type);
      if (!entry)
        throw new DomainError(
          'UNKNOWN_COMMAND',
          'Comando inexistente. Use: ' + commandTypes.join(', '),
        );
      const schema = z.toJSONSchema(entry.option, schemaOptions) as Record<string, unknown>;
      Reflect.deleteProperty(schema, '$schema');
      return { type: args.type, schema };
    },
  }),
  defineTool({
    name: 'run_admin_command',
    title: 'Executar comando da gestão',
    description:
      'Executa qualquer operação do painel admin: pedidos (order.create, order.update, orders.batch), clientes, produção, impressoras, expedição e etiquetas, cobranças e estornos, despesas, assinaturas e edições do clube, cupons, atendimento, orações e avaliações, compras coletivas, stories, CRM e campanhas de e-mail e configurações. Equipe e convites (team.*, invite.*) ficam só no painel. Confira o formato com describe_admin_commands antes. Operações financeiras e exclusões são definitivas: confirme com a pessoa antes.',
    destructive: true,
    input: z.object({
      command: z
        .looseObject({ type: z.enum(commandTypes as [string, ...string[]]) })
        .describe('Objeto do comando, com "type" e os campos do schema dele.'),
    }),
    run: async (args, env) => {
      // Team access stays with people in the panel: a leaked key (or an assistant misled by
      // customer-written text) must not be able to invite someone and keep access after revocation.
      if (/^(team|invite)\./.test(args.command.type))
        throw new DomainError(
          'FORBIDDEN',
          'Equipe e convites só podem ser alterados no painel, não por chave MCP.',
          403,
        );
      const result = await env.admin.execute(env.actor, args.command);
      return { ok: true, type: args.command.type, result: result ?? null };
    },
  }),
];
