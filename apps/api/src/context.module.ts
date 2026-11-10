import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createContext, closeContext, type Context } from '@maos-em-oracao/backend-core/context';
export const CONTEXT = Symbol('Context');
class Lifecycle implements OnApplicationShutdown {
  constructor(@Inject(CONTEXT) private ctx: Context) {}
  async onApplicationShutdown() {
    await closeContext(this.ctx);
  }
}
@Global()
@Module({
  providers: [
    {
      provide: CONTEXT,
      useFactory: async () => {
        const ctx = createContext();
        await ctx.db.$connect();
        await ctx.redis.connect();
        return ctx;
      },
    },
    Lifecycle,
  ],
  exports: [CONTEXT],
})
export class ContextModule {}
