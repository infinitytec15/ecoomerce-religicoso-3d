import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Param,
  Body,
  Req,
  Res,
  Query,
  Inject,
  Module,
  HttpCode,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import type { Context } from '@maos-em-oracao/backend-core/context';
import { AdminService } from '@maos-em-oracao/backend-core/admin';
import { ReportsService } from '@maos-em-oracao/backend-core/reports';
import { MediaService } from '@maos-em-oracao/backend-core/media';
import { TeamService } from '@maos-em-oracao/backend-core/team';
import { ShippingCredentials } from '@maos-em-oracao/backend-core/credentials';
import { ownerOnly, permit, requireValue, DomainError } from '@maos-em-oracao/backend-core/shared';
import { CONTEXT } from './context.module';
import type { ApiRequest } from './request';
@ApiTags('Gestão')
@Controller('admin')
class OperationsController {
  private service: AdminService;
  constructor(@Inject(CONTEXT) private ctx: Context) {
    this.service = new AdminService(ctx);
  }
  @Get('operations') async operations(@Req() req: ApiRequest) {
    return { data: await this.service.operations(req.actor) };
  }
  @Post('commands') @HttpCode(204) async command(@Req() req: ApiRequest, @Body() body: unknown) {
    await this.service.executeIdempotent(req.actor, body, req.get('idempotency-key'));
  }
  @Get('overview') async overview(@Req() req: ApiRequest, @Query() query: Record<string, string>) {
    return { data: await new ReportsService(this.ctx).overview(req.actor, query) };
  }
  @Get('resources/:resource') async page(
    @Req() req: ApiRequest,
    @Param('resource') resource: string,
    @Query() query: Record<string, string>,
  ) {
    return { data: await new ReportsService(this.ctx).page(req.actor, resource, query) };
  }
  @Get('reports/:resource') async report(
    @Req() req: ApiRequest,
    @Param('resource') resource: string,
    @Query() query: Record<string, string>,
  ) {
    permit(req.actor, 'reports');
    return { data: await new ReportsService(this.ctx).page(req.actor, resource, query) };
  }
  @Post('exports') @HttpCode(200) async export(@Req() req: ApiRequest, @Body() body: unknown) {
    const input = z
      .object({ kind: z.string().max(40), filters: z.record(z.string(), z.unknown()).optional() })
      .parse(body);
    return {
      data: await new ReportsService(this.ctx).export(req.actor, input.kind, input.filters || {}),
    };
  }
  @Get('exports/:id') async exportStatus(@Req() req: ApiRequest, @Param('id') id: string) {
    return { data: await new ReportsService(this.ctx).status(req.actor, id) };
  }
  @Get('exports/:id/download') async download(
    @Req() req: ApiRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const file = await new ReportsService(this.ctx).download(req.actor, id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.bytes);
  }
  @Get('orders/:id/shipment') async shipment(@Req() req: ApiRequest, @Param('id') id: string) {
    return { data: await this.service.shipping.details(req.actor, id) };
  }
  @Patch('orders/:id/fiscal') @HttpCode(204) async fiscal(
    @Req() req: ApiRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.service.shipping.fiscal(req.actor, id, body);
  }
  @Get('integrations') async integrations(@Req() req: ApiRequest) {
    ownerOnly(req.actor);
    const c = this.ctx.config;
    return {
      data: [
        {
          provider: 'mercado-pago',
          configured: !!c.MP_ACCESS_TOKEN,
          enabled: c.PAYMENTS_ENABLED === 'true',
        },
        {
          provider: 'melhor-envio',
          configured:
            !!c.ME_ACCESS_TOKEN ||
            !!(await this.ctx.db.integrationCredential.findUnique({
              where: { provider: 'melhor-envio' },
            })),
          sandbox: c.ME_SANDBOX === 'true',
        },
        {
          provider: 'bunny-storage',
          configured: !!c.BUNNY_STORAGE_ZONE && !!c.BUNNY_STORAGE_PASSWORD,
        },
        {
          provider: 'bunny-stream',
          configured: !!c.BUNNY_STREAM_LIBRARY_ID && !!c.BUNNY_STREAM_API_KEY,
        },
        {
          provider: 'resend',
          configured: !!c.RESEND_API_KEY && !!c.RESEND_WEBHOOK_SECRET,
          enabled: c.EMAIL_ENABLED === 'true',
        },
      ],
      mode: c.INTEGRATIONS_MODE,
    };
  }
  @Get('jobs') async jobs(@Req() req: ApiRequest) {
    ownerOnly(req.actor);
    return {
      data: await this.ctx.db.outboxEvent.findMany({
        select: {
          id: true,
          kind: true,
          aggregateId: true,
          state: true,
          attempts: true,
          errorCode: true,
          providerId: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      }),
    };
  }
  @Get('webhooks') async webhooks(@Req() req: ApiRequest) {
    ownerOnly(req.actor);
    return {
      data: await this.ctx.db.webhookInbox.findMany({
        select: {
          id: true,
          provider: true,
          type: true,
          state: true,
          errorCode: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    };
  }
}
@ApiTags('Mídia')
@Controller()
class MediaController {
  private service: MediaService;
  constructor(@Inject(CONTEXT) private ctx: Context) {
    this.service = new MediaService(ctx);
  }
  @Post('admin/media/uploads') @HttpCode(200) async create(
    @Req() req: ApiRequest,
    @Body() body: unknown,
  ) {
    return { data: await this.service.create(req.actor, body) };
  }
  @Put('admin/media/uploads/:id/content') @HttpCode(204) async content(
    @Req() req: ApiRequest,
    @Param('id') id: string,
    @Body() body: Buffer,
  ) {
    if (!Buffer.isBuffer(body))
      throw new DomainError('INVALID_UPLOAD', 'Envie o conteúdo binário do arquivo.');
    await this.service.content(req.actor, id, body);
  }
  @Post('admin/media/uploads/:id/renew') @HttpCode(200) async renew(
    @Req() req: ApiRequest,
    @Param('id') id: string,
  ) {
    return { data: await this.service.renew(req.actor, id) };
  }
  @Post('admin/media/uploads/:id/complete') @HttpCode(200) async complete(
    @Req() req: ApiRequest,
    @Param('id') id: string,
  ) {
    return { data: await this.service.complete(req.actor, id) };
  }
  @Get('admin/media/:id/original') async original(
    @Req() req: ApiRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const f = await this.service.original(req.actor, id);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${f.filename}"`);
    res.setHeader('Cache-Control', 'private,no-store');
    res.send(f.bytes);
  }
  @Get('admin/media/:id/status') async status(@Req() req: ApiRequest, @Param('id') id: string) {
    permit(req.actor, 'catalog');
    return {
      data: this.service.dto(
        requireValue(await this.ctx.db.mediaAsset.findUnique({ where: { id } })),
      ),
    };
  }
  @Get('media/public/:id/:name') async publicFile(
    @Param('id') id: string,
    @Param('name') name: string,
    @Res() res: Response,
  ) {
    const f = await this.service.publicFile(id, name);
    res.setHeader('Access-Control-Allow-Origin', new URL(this.ctx.config.PUBLIC_WEB_URL).origin);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public,max-age=3600,immutable');
    res.type(f.mime).send(f.bytes);
  }
}
@ApiTags('Equipe e integrações')
@Controller()
class TeamController {
  private team: TeamService;
  private shipping: ShippingCredentials;
  constructor(@Inject(CONTEXT) private ctx: Context) {
    this.team = new TeamService(ctx);
    this.shipping = new ShippingCredentials(ctx);
  }
  @Get('team/invitations/:token') async invitation(@Param('token') token: string) {
    z.string().min(20).max(100).parse(token);
    return { data: await this.team.info(token) };
  }
  @Post('team/invitations/:token/accept') @HttpCode(204) async accept(
    @Param('token') token: string,
    @Body() body: unknown,
  ) {
    z.string().min(20).max(100).parse(token);
    await this.team.accept(token, body);
  }
  @Post('admin/integrations/melhor-envio/authorize') @HttpCode(200) async authorize(
    @Req() req: ApiRequest,
  ) {
    return { data: await this.shipping.authorize(req.actor) };
  }
  @Get('integrations/melhor-envio/callback') async callback(
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    res.redirect(303, await this.shipping.callback(query));
  }
}
@Module({ controllers: [OperationsController, MediaController, TeamController] })
export class OperationsModule {}
