import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Module,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Context } from '@maos-em-oracao/backend-core/context';
import { rateLimit } from '@maos-em-oracao/backend-core/context';
import { ApiKeysService } from '@maos-em-oracao/backend-core/api-keys';
import { DomainError } from '@maos-em-oracao/backend-core/shared';
import { CONTEXT } from './context.module';
import { createMcpServer } from './mcp/server';
import type { ApiRequest } from './request';

/** Calls one key may make per minute; a busy assistant session stays well below it. */
const MCP_CALLS_PER_MINUTE = 240;

@ApiTags('Chaves MCP')
@Controller('admin/api-keys')
class ApiKeysController {
  private keys: ApiKeysService;
  constructor(@Inject(CONTEXT) ctx: Context) {
    this.keys = new ApiKeysService(ctx);
  }
  @Get() async list(@Req() req: ApiRequest) {
    return { data: await this.keys.list(req.actor) };
  }
  @Post() @HttpCode(200) async create(@Req() req: ApiRequest, @Body() body: unknown) {
    return { data: await this.keys.create(req.actor, body) };
  }
  @Post(':id/revoke') @HttpCode(204) async revoke(@Req() req: ApiRequest, @Param('id') id: string) {
    await this.keys.revoke(req.actor, id);
  }
}

function bearer(header: string | undefined) {
  const match = /^Bearer\s+(\S+)$/i.exec(header || '');
  return match?.[1];
}

/**
 * Model Context Protocol endpoint (Streamable HTTP, stateless, JSON responses) for Claude,
 * ChatGPT and any other MCP client. Authenticated only by an API key from the admin panel.
 */
@ApiTags('MCP')
@Controller('mcp')
class McpController {
  private keys: ApiKeysService;
  constructor(@Inject(CONTEXT) private ctx: Context) {
    this.keys = new ApiKeysService(ctx);
  }
  @Post() async handle(@Req() req: ApiRequest, @Res() res: Response) {
    const actor = await this.keys.actor(bearer(req.get('authorization')));
    if (!actor) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="mcp"');
      throw new DomainError(
        'UNAUTHORIZED',
        'Chave MCP inválida, expirada ou revogada. Gere outra em Configurações › Integrações com IA.',
        401,
      );
    }
    await rateLimit(this.ctx, 'mcp/' + actor.apiKeyId, MCP_CALLS_PER_MINUTE, 60000);
    const server = createMcpServer(this.ctx, actor),
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }
  /** Stateless server: no server-initiated stream and no session to end. */
  @Get() notStreaming(@Res() res: Response) {
    res.setHeader('Allow', 'POST');
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Use POST neste endpoint MCP.' },
      id: null,
    });
  }
  @Delete() noSession(@Res() res: Response) {
    this.notStreaming(res);
  }
}

@Module({ controllers: [ApiKeysController, McpController] })
export class McpModule {}
