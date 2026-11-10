import { Controller, Post, Inject, Module, Req, HttpCode } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { Context } from '@maos-em-oracao/backend-core/context';
import { rateLimit } from '@maos-em-oracao/backend-core/context';
import { Notifications } from '@maos-em-oracao/backend-core/notifications';
import { digest } from '@maos-em-oracao/backend-core/security';
import { DomainError } from '@maos-em-oracao/backend-core/shared';
import { CONTEXT } from './context.module';
import type { ApiRequest } from './request';
@ApiTags('Webhooks assinados')
@Controller('webhooks')
class WebhooksController {
  private mail: Notifications;
  constructor(@Inject(CONTEXT) private ctx: Context) {
    this.mail = new Notifications(ctx);
  }
  @Post('mercado-pago') @HttpCode(200) async payments(@Req() req: ApiRequest) {
    await rateLimit(this.ctx, 'webhook/mp/' + req.clientKey, 600, 60000);
    const queryId = typeof req.query['data.id'] === 'string' ? req.query['data.id'] : undefined,
      input = z
        .object({
          id: z.union([z.string(), z.number()]).optional(),
          type: z.enum([
            'payment',
            'subscription_preapproval',
            'subscription_authorized_payment',
            'chargebacks',
          ]),
          data: z.object({ id: z.union([z.string(), z.number()]) }),
        })
        .parse(req.body),
      id = String(queryId || input.data.id);
    if (queryId && queryId !== String(input.data.id))
      throw new DomainError('WEBHOOK_ID_MISMATCH', 'Identificador do webhook inválido.', 401);
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id))
      throw new DomainError('INVALID_RESOURCE', 'Recurso inválido.');
    this.ctx.payments.verifyWebhook({
      signature: req.get('x-signature') || '',
      requestId: req.get('x-request-id') || '',
      dataId: id,
    });
    await this.mail.inbox(
      'mercado-pago',
      String(input.id || digest(req.rawBody?.toString() || JSON.stringify(input))),
      input.type,
      { resourceId: id, type: input.type },
    );
    return { received: true };
  }
  @Post('resend') @HttpCode(200) async resend(@Req() req: ApiRequest) {
    await rateLimit(this.ctx, 'webhook/resend/' + req.clientKey, 600, 60000);
    const headers = {
      id: req.get('svix-id') || '',
      timestamp: req.get('svix-timestamp') || '',
      signature: req.get('svix-signature') || '',
    };
    let event;
    try {
      event = this.mail.verifyResend(req.rawBody?.toString('utf8') || '', headers);
    } catch {
      throw new DomainError('INVALID_SIGNATURE', 'Assinatura do webhook inválida.', 401);
    }
    await this.mail.inbox('resend', headers.id, event.type, event);
    return { received: true };
  }
  @Post('bunny-stream') @HttpCode(200) async bunny(@Req() req: ApiRequest) {
    if (
      req.get('x-bunnystream-signature-version') !== 'v1' ||
      req.get('x-bunnystream-signature-algorithm') !== 'hmac-sha256'
    )
      throw new DomainError('INVALID_SIGNATURE', 'Versão de assinatura inválida.', 401);
    this.ctx.media.verifyWebhook(
      req.rawBody?.toString('utf8') || '',
      req.get('x-bunnystream-signature') || '',
    );
    const value = z
      .object({
        VideoGuid: z.string().uuid(),
        VideoLibraryId: z.number(),
        Status: z.number(),
        EventId: z.string().uuid(),
        Timestamp: z.string(),
      })
      .parse(req.body);
    if (String(value.VideoLibraryId) !== this.ctx.config.BUNNY_STREAM_LIBRARY_ID)
      throw new DomainError('INVALID_LIBRARY', 'Biblioteca não reconhecida.', 401);
    await this.mail.inbox('bunny-stream', value.EventId, 'video.status', value);
    return { received: true };
  }
  @Post('melhor-envio') @HttpCode(200) async shipping(@Req() req: ApiRequest) {
    await rateLimit(this.ctx, 'webhook/me/' + req.clientKey, 60, 60000);
    const input = z
        .object({
          id: z.string().max(100).optional(),
          data: z.object({ id: z.string().max(100) }).optional(),
        })
        .parse(req.body),
      id = input.data?.id || input.id;
    if (id && (await this.ctx.db.shipment.findUnique({ where: { providerId: id } })))
      await this.mail.inbox(
        'melhor-envio',
        digest(req.rawBody?.toString() || JSON.stringify(input)),
        'tracking.hint',
        { providerId: id },
      );
    return { received: true };
  }
}
@Module({ controllers: [WebhooksController] })
export class WebhooksModule {}
