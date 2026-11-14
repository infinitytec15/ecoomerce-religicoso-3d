import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Query,
  Req,
  Res,
  Inject,
  Module,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBody } from '@nestjs/swagger';
import type { Response } from 'express';
import type { Context } from '@maos-em-oracao/backend-core/context';
import { AuthService } from '@maos-em-oracao/backend-core/auth';
import { CatalogService } from '@maos-em-oracao/backend-core/catalog';
import { OrdersService } from '@maos-em-oracao/backend-core/orders';
import { SubscriptionsService } from '@maos-em-oracao/backend-core/subscriptions';
import { ContentService } from '@maos-em-oracao/backend-core/content';
import { ReviewsService } from '@maos-em-oracao/backend-core/reviews';
import { GroupBuysService } from '@maos-em-oracao/backend-core/group-buys';
import { MediaService } from '@maos-em-oracao/backend-core/media';
import { DomainError } from '@maos-em-oracao/backend-core/shared';
import { sessionHash } from '@maos-em-oracao/backend-core/security';
import { CONTEXT } from './context.module';
import type { ApiRequest } from './request';
const result = <T>(data: T) => ({ data });
/** The cookie lives exactly as long as the server session (staff 8h, guest 1d, customer 7d). */
async function sessionCookie(res: Response, ctx: Context, raw: string) {
  const session = await ctx.db.session.findUnique({
    where: { tokenHash: sessionHash(raw, ctx.config) },
    select: { expiresAt: true },
  });
  res.cookie(ctx.config.COOKIE_NAME, raw, {
    httpOnly: true,
    secure: ctx.config.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.max(60000, (session?.expiresAt.getTime() ?? Date.now()) - Date.now()),
  });
}
@ApiTags('Identidade')
@Controller('auth')
class IdentityController {
  private service: AuthService;
  constructor(@Inject(CONTEXT) private ctx: Context) {
    this.service = new AuthService(ctx);
  }
  @Get('session') session(@Req() req: ApiRequest) {
    return result(req.actor ? this.service.publicSession(req.actor) : null);
  }
  @Post('login')
  @HttpCode(200)
  @ApiBody({ schema: { $ref: '#/components/schemas/LoginInput' } })
  async login(
    @Body() body: unknown,
    @Req() req: ApiRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.service.login(body, req.clientKey);
    await sessionCookie(res, this.ctx, r.raw);
    return result(r.session);
  }
  @Post('logout') @HttpCode(204) async logout(
    @Req() req: ApiRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.service.logout(req.cookies?.[this.ctx.config.COOKIE_NAME]);
    res.clearCookie(this.ctx.config.COOKIE_NAME, {
      path: '/',
      httpOnly: true,
      secure: this.ctx.config.NODE_ENV === 'production',
      sameSite: 'lax',
    });
  }
  @Post('recover') @HttpCode(200) async recover(@Body() body: unknown, @Req() req: ApiRequest) {
    return result(await this.service.recover(body, req.clientKey));
  }
  @Post('verify') @HttpCode(204) async verify(@Body() body: unknown) {
    await this.service.consume(body, 'verify-email');
  }
  @Post('reset') @HttpCode(204) async reset(@Body() body: unknown) {
    await this.service.consume(body, 'password-reset');
  }
  @Post('email-change') @HttpCode(204) async changeEmail(@Body() body: unknown) {
    await this.service.consume(body, 'email-change');
  }
  @Post('guest-order') @HttpCode(200) async guestOrder(
    @Req() req: ApiRequest,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.service.guestOrder(body, req.actor);
    if (r.raw) await sessionCookie(res, this.ctx, r.raw);
    return result({ orderId: r.orderId });
  }
}
@ApiTags('Catálogo')
@Controller()
class CatalogController {
  private service: CatalogService;
  constructor(@Inject(CONTEXT) ctx: Context) {
    this.service = new CatalogService(ctx);
  }
  @Get('catalog/products') async products(@Query() q: Record<string, string>) {
    return result(
      await this.service.list({ ...q, maxCents: q.maxCents ? Number(q.maxCents) : undefined }),
    );
  }
  @Get('catalog/products/:id') async product(@Param('id') id: string) {
    return result(await this.service.product(id));
  }
  @Get('store/settings') async settings() {
    return result(await this.service.publicSettings());
  }
}
@ApiTags('Pedidos e conta')
@Controller()
class OrdersController {
  private service: OrdersService;
  constructor(@Inject(CONTEXT) private ctx: Context) {
    this.service = new OrdersService(ctx);
  }
  @Post('checkout/estimate') @HttpCode(200) async estimate(@Body() body: unknown) {
    return result(await this.service.estimate(body));
  }
  @Post('orders')
  @HttpCode(200)
  @ApiBody({ schema: { $ref: '#/components/schemas/CheckoutInput' } })
  async checkout(
    @Body() body: unknown,
    @Req() req: ApiRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.service.checkout(
      req.actor,
      req.visitorKey,
      body,
      req.get('idempotency-key'),
    );
    if (r.raw) await sessionCookie(res, this.ctx, r.raw);
    return result(r.result);
  }
  @Post('orders/:id/payment') @HttpCode(200) async retryPayment(
    @Param('id') id: string,
    @Req() req: ApiRequest,
  ) {
    return result(await this.service.retryPix(req.actor, id, req.get('idempotency-key')));
  }
  @Get('orders/:id/payment') async payment(@Param('id') id: string, @Req() req: ApiRequest) {
    return result(await this.service.payment(req.actor, id));
  }
  @Get('account') async account(@Req() req: ApiRequest) {
    return result(await this.service.account(req.actor));
  }
  @Patch('account/profile') @HttpCode(204) async profile(
    @Body() body: unknown,
    @Req() req: ApiRequest,
  ) {
    await this.service.auth.updateProfile(req.actor, body);
  }
  @Post('shipping/quotes') @HttpCode(200) async quote(@Body() body: unknown) {
    return result(await this.service.quote(body));
  }
  @Get('shipping/quotes') async quoteGet(
    @Query('cep') cep: string,
    @Query('productId') productId?: string,
  ) {
    return result(
      productId ? await this.service.quote({ cep, items: [{ productId, quantity: 1 }] }) : [],
    );
  }
}
@ApiTags('Clube')
@Controller('subscriptions')
class SubscriptionsController {
  private service: SubscriptionsService;
  constructor(@Inject(CONTEXT) ctx: Context) {
    this.service = new SubscriptionsService(ctx);
  }
  @Post()
  @HttpCode(200)
  @ApiBody({ schema: { $ref: '#/components/schemas/SubscribeInput' } })
  async subscribe(@Body() body: unknown, @Req() req: ApiRequest) {
    return result(await this.service.subscribe(req.actor, body, req.get('idempotency-key')));
  }
  @Patch(':id') @HttpCode(204) async change(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() req: ApiRequest,
  ) {
    await this.service.change(req.actor, id, body);
  }
}
@ApiTags('Comunidade e atendimento')
@Controller()
class ContentController {
  private service: ContentService;
  constructor(@Inject(CONTEXT) ctx: Context) {
    this.service = new ContentService(ctx);
  }
  private key(req: ApiRequest) {
    return req.actor?.userId ? 'user/' + req.actor.userId : 'visitor/' + req.visitorKey;
  }
  @Get('community/prayers') async prayers(@Req() req: ApiRequest) {
    return result(await this.service.prayers(this.key(req)));
  }
  @Post('community/prayers') @HttpCode(204) async post(
    @Req() req: ApiRequest,
    @Body() body: unknown,
  ) {
    await this.service.postPrayer(this.key(req), body);
  }
  @Delete('community/prayers/:id') @HttpCode(204) async delete(
    @Req() req: ApiRequest,
    @Param('id') id: string,
  ) {
    await this.service.deletePrayer(this.key(req), id);
  }
  @Post('community/prayers/:id/reaction') @HttpCode(204) async react(
    @Req() req: ApiRequest,
    @Param('id') id: string,
  ) {
    await this.service.react(this.key(req), id);
  }
  @Post('community/prayers/:id/report') @HttpCode(204) async report(
    @Req() req: ApiRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.service.report(this.key(req), id, body);
  }
  @Post('newsletter') @HttpCode(200) async newsletter(
    @Req() req: ApiRequest,
    @Body() body: unknown,
  ) {
    return result(await this.service.newsletter(body, req.clientKey));
  }
  @Post('newsletter/confirm') @HttpCode(204) async confirm(@Body() body: unknown) {
    await this.service.confirmNewsletter(body);
  }
  @Post('newsletter/unsubscribe') @HttpCode(204) async unsubscribe(@Body() body: unknown) {
    await this.service.unsubscribe(body);
  }
  @Post('newsletter/one-click') @HttpCode(204) async oneClick(
    @Query('token') token: string,
    @Body() body: Record<string, unknown>,
  ) {
    if (body?.['List-Unsubscribe'] !== 'One-Click')
      throw new DomainError('INVALID_REQUEST', 'Solicitação de descadastro inválida.', 422);
    await this.service.unsubscribe({ token });
  }
  @Post('support/tickets') @HttpCode(204) async ticket(
    @Req() req: ApiRequest,
    @Body() body: unknown,
  ) {
    await this.service.createTicket(req.actor, body, req.clientKey);
  }
  @Post('support/tickets/:id/messages') @HttpCode(204) async reply(
    @Req() req: ApiRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    await this.service.reply(req.actor, id, body);
  }
}
@ApiTags('Avaliações')
@Controller()
class ReviewsController {
  private service: ReviewsService;
  private media: MediaService;
  constructor(@Inject(CONTEXT) ctx: Context) {
    this.service = new ReviewsService(ctx);
    this.media = new MediaService(ctx);
  }
  @Get('catalog/products/:id/reviews') async list(
    @Param('id') id: string,
    @Query('rating') rating?: string,
  ) {
    return result(await this.service.forProduct(id, rating));
  }
  @Post('reviews/uploads') @HttpCode(200) async uploadCreate(
    @Req() req: ApiRequest,
    @Body() body: unknown,
  ) {
    return result(await this.media.customerCreate(req.actor, body));
  }
  @Put('reviews/uploads/:id/content') @HttpCode(204) async uploadContent(
    @Req() req: ApiRequest,
    @Param('id') id: string,
    @Body() body: Buffer,
  ) {
    if (!Buffer.isBuffer(body))
      throw new DomainError('INVALID_UPLOAD', 'Envie o conteúdo binário do arquivo.');
    await this.media.customerContent(req.actor, id, body);
  }
  @Post('reviews/uploads/:id/complete') @HttpCode(200) async uploadComplete(
    @Req() req: ApiRequest,
    @Param('id') id: string,
  ) {
    return result(await this.media.customerComplete(req.actor, id));
  }
  @Post('reviews/opt-out') @HttpCode(204) async optOut(@Body() body: unknown) {
    await this.service.optOut(body);
  }
  @Post('reviews') @HttpCode(201) async create(@Req() req: ApiRequest, @Body() body: unknown) {
    return result(await this.service.create(req.actor, body));
  }
}
@Module({ controllers: [IdentityController] })
export class IdentityModule {}
@Module({ controllers: [CatalogController] })
export class CatalogModule {}
@Module({ controllers: [OrdersController] })
export class OrdersModule {}
@Module({ controllers: [SubscriptionsController] })
export class ClubModule {}
@Module({ controllers: [ContentController] })
export class CommunityModule {}
@ApiTags('Compra coletiva')
@Controller()
class GroupBuysController {
  private service: GroupBuysService;
  constructor(@Inject(CONTEXT) ctx: Context) {
    this.service = new GroupBuysService(ctx);
  }
  @Get('group-buys') async list() {
    return result(await this.service.publicList());
  }
  @Get('group-buys/:id') async one(@Param('id') id: string) {
    return result(await this.service.publicOne(id));
  }
}
@Module({ controllers: [ReviewsController] })
export class ReviewsModule {}
@Module({ controllers: [GroupBuysController] })
export class GroupBuysModule {}
