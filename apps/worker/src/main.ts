import { createServer } from 'node:http';
import { createContext, closeContext } from '@maos-em-oracao/backend-core/context';
import { WorkerEngine } from '@maos-em-oracao/backend-core/worker';
const ctx = createContext();
await ctx.db.$connect();
await ctx.redis.connect();
const engine = new WorkerEngine(ctx);
await engine.start();
let closing = false;
const server = createServer(async (req, res) => {
  if (req.url !== '/health/ready' && req.url !== '/health/live') {
    res.writeHead(404).end();
    return;
  }
  try {
    if (req.url === '/health/ready') {
      await ctx.db.$queryRaw`SELECT 1`;
      await ctx.redis.ping();
    }
    res
      .writeHead(closing ? 503 : 200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ status: closing ? 'closing' : 'ok' }));
  } catch {
    res.writeHead(503).end('{"status":"unavailable"}');
  }
});
const port = Number(process.env.WORKER_PORT || process.env.PORT || ctx.config.WORKER_PORT);
server.listen(port, '::');
console.log(`Worker pronto na porta ${port}; integrações ${ctx.config.INTEGRATIONS_MODE}.`);
async function shutdown() {
  if (closing) return;
  closing = true;
  server.close();
  const timeout = setTimeout(() => process.exit(1), 25000);
  await engine.close();
  await closeContext(ctx);
  clearTimeout(timeout);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
