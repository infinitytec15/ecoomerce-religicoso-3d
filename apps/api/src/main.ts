import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  Module,
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
  type ExceptionFilter,
  Catch,
  type ArgumentsHost,
  Logger,
} from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json as jsonParser, urlencoded, raw } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '@maos-em-oracao/database';
import {
  checkoutSchema,
  subscriptionSchema,
  loginSchema,
  CLIENT_IP_HEADER,
  trustedForwardedIp,
} from '@maos-em-oracao/contracts';
import { ProviderError } from '@maos-em-oracao/integrations';
import type { Context } from '@maos-em-oracao/backend-core/context';
import { rateLimit } from '@maos-em-oracao/backend-core/context';
import { AuthService } from '@maos-em-oracao/backend-core/auth';
import { constantEqual, sessionHash, token } from '@maos-em-oracao/backend-core/security';
import { DomainError, permit } from '@maos-em-oracao/backend-core/shared';
import type { ApiRequest } from './request';
import { CONTEXT, ContextModule } from './context.module';
import { OperationsModule } from './operations.module';
import { WebhooksModule } from './webhooks.module';
import {
  IdentityModule,
  CatalogModule,
  OrdersModule,
  ClubModule,
  CommunityModule,
} from './commerce.module';
@Controller('health')
class HealthController {
  constructor(@Inject(CONTEXT) private ctx: Context) {}
  @Get('live') live() {
    return { status: 'ok' };
  }
  @Get('ready') async ready() {
    try {
      await this.ctx.db.$queryRaw`SELECT 1`;
      await this.ctx.redis.ping();
      return { status: 'ok', database: 'ready', queue: 'ready' };
    } catch {
      throw new ServiceUnavailableException('Dependencies unavailable.');
    }
  }
}
@Catch()
class ApiErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp(),
      req = http.getRequest<ApiRequest>(),
      res = http.getResponse();
    let status = 500,
      code = 'INTERNAL_ERROR',
      message = 'Não foi possível concluir a operação.';
    if (error instanceof DomainError) {
      ({ status, code, message } = error);
    } else if (error instanceof z.ZodError) {
      status = 422;
      code = 'VALIDATION_ERROR';
      message = error.issues[0]?.message || 'Confira os dados informados.';
    } else if (error instanceof ProviderError) {
      status = error.status;
      code = error.code;
      message = error.message;
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        status = 409;
        code = 'CONFLICT';
        message = 'Este registro já existe.';
      } else if (error.code === 'P2025') {
        status = 404;
        code = 'NOT_FOUND';
        message = 'Registro não encontrado.';
      }
    } else if (
      error &&
      typeof error === 'object' &&
      'getStatus' in error &&
      typeof error.getStatus === 'function'
    ) {
      status = Number(error.getStatus());
      code = status === 404 ? 'NOT_FOUND' : 'REQUEST_ERROR';
      message = status === 404 ? 'Endpoint não encontrado.' : 'Solicitação não permitida.';
    } else if (error && typeof error === 'object' && 'status' in error && error.status === 413) {
      status = 413;
      code = 'PAYLOAD_TOO_LARGE';
      message = 'A solicitação excede o tamanho permitido.';
    }
    if (status >= 500)
      Logger.error(
        {
          requestId: req.requestId,
          code,
          errorType: error instanceof Error ? error.name : 'unknown',
        },
        'Request',
      );
    res.status(status).json({ error: { code, message }, requestId: req.requestId });
  }
}
@Module({
  imports: [
    ContextModule,
    IdentityModule,
    CatalogModule,
    OrdersModule,
    ClubModule,
    CommunityModule,
    OperationsModule,
    WebhooksModule,
  ],
  controllers: [HealthController],
})
class AppModule {}
export async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      bodyParser: false,
      logger: ['error', 'warn', 'log'],
    }),
    ctx = app.get<Context>(CONTEXT),
    auth = new AuthService(ctx);
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use(cookieParser());
  app.use(
    async (
      req: ApiRequest,
      res: import('express').Response,
      next: import('express').NextFunction,
    ) => {
      req.requestId = randomUUID();
      res.setHeader('X-Request-Id', req.requestId);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Integrations-Mode', ctx.config.INTEGRATIONS_MODE);
      try {
        const path = req.path,
          exempt =
            /^\/api\/v1\/media\/public\/[-a-zA-Z0-9_]+\/(image\.webp|preview\.glb|video)$/.test(
              path,
            ) ||
            /^\/api\/v1\/(health\/(live|ready)|webhooks\/[^/]+|newsletter\/one-click|integrations\/melhor-envio\/callback)$/.test(
              path,
            ) ||
            (ctx.config.NODE_ENV !== 'production' && /^\/docs(?:\/|$|-json)/.test(path));
        if (!exempt && !constantEqual(req.get('x-bff-secret') || '', ctx.config.BFF_SHARED_SECRET))
          throw new DomainError('FORBIDDEN', 'Acesso permitido somente pelo gateway da loja.', 403);
        if (
          !exempt &&
          !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
          req.get('origin') !== new URL(ctx.config.PUBLIC_WEB_URL).origin
        )
          throw new DomainError('INVALID_ORIGIN', 'Origem não permitida.', 403);
        let visitor = typeof req.cookies?.meo_visitor === 'string' ? req.cookies.meo_visitor : '';
        if (!/^[a-zA-Z0-9_-]{40,64}$/.test(visitor)) {
          visitor = token();
          res.cookie('meo_visitor', visitor, {
            httpOnly: true,
            sameSite: 'lax',
            secure: ctx.config.NODE_ENV === 'production',
            path: '/',
            maxAge: 366 * 86400000,
          });
        }
        req.visitorKey = sessionHash(visitor, ctx.config);
        // Gateway requests (secret already verified) carry the client IP the BFF read
        // from the edge proxy; public endpoints use the edge's own X-Forwarded-For.
        // The visitor cookie is only a fallback: clients can drop it at will.
        const ip = exempt
          ? trustedForwardedIp(req.get('x-forwarded-for')) || req.socket.remoteAddress
          : trustedForwardedIp(req.get(CLIENT_IP_HEADER));
        req.clientKey = ip ? sessionHash('ip/' + ip, ctx.config) : req.visitorKey;
        req.actor = await auth.actor(req.cookies?.[ctx.config.COOKIE_NAME]);
        if (!['GET', 'HEAD'].includes(req.method))
          await rateLimit(ctx, 'requests/' + (req.actor?.userId || req.clientKey), 300, 60000);
        if (
          req.method === 'PUT' &&
          /^\/api\/v1\/admin\/media\/uploads\/[^/]+\/content$/.test(path)
        ) {
          permit(req.actor, 'catalog');
          return raw({ type: () => true, limit: '32mb' })(req, res, next);
        }
        return next();
      } catch (error) {
        return new ApiErrors().catch(error, {
          switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
        } as unknown as ArgumentsHost);
      }
    },
  );
  app.use(
    jsonParser({
      limit: '256kb',
      verify: (req, _res, buf) => {
        (req as ApiRequest).rawBody = buf;
      },
    }),
  );
  app.use(urlencoded({ extended: false, limit: '4kb' }));
  app.useGlobalFilters(new ApiErrors());
  app.enableShutdownHooks();
  if (ctx.config.NODE_ENV !== 'production') {
    const spec = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Mãos em Oração · API')
        .setVersion('1.0.0')
        .addApiKey({ type: 'apiKey', in: 'header', name: 'x-bff-secret' }, 'BFF')
        .addCookieAuth(ctx.config.COOKIE_NAME)
        .build(),
    );
    spec.components ??= {};
    spec.components.schemas = {
      ...spec.components.schemas,
      ...(Object.fromEntries(
        Object.entries({
          CheckoutInput: checkoutSchema,
          SubscribeInput: subscriptionSchema,
          LoginInput: loginSchema,
        }).map(([name, schema]) => [name, z.toJSONSchema(schema, { target: 'openapi-3.0' })]),
      ) as unknown as NonNullable<typeof spec.components.schemas>),
    };
    SwaggerModule.setup('docs', app, spec);
  }
  await app.listen(ctx.config.PORT, '::');
  Logger.log(
    `API pronta na porta ${ctx.config.PORT}; integrações ${ctx.config.INTEGRATIONS_MODE}.`,
    'Bootstrap',
  );
  return app;
}
if (process.env.MEO_BOOTSTRAP !== 'false')
  bootstrap().catch((error) => {
    console.error(
      'Falha ao iniciar API:',
      error instanceof z.ZodError
        ? 'configuração inválida'
        : error instanceof Error
          ? error.name
          : 'unknown',
    );
    process.exitCode = 1;
  });
