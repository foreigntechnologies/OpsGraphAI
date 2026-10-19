import { createServer } from 'node:http';
import { config } from './config.js';
import { db } from './db.js';
import { createApi, incidentEvaluator } from './graphql/schema.js';
import { loadTargets } from './monitoring/targets.js';
import { registerTargets, startCollector } from './monitoring/collector.js';

await db.$connect();
const targets = await loadTargets();
await registerTargets(targets);
const api = createApi();
let stopCollector: (() => Promise<void>) | undefined;

const server = createServer(async (request, response) => {
  if (request.url === '/health') {
    try {
      await db.$queryRaw`SELECT 1`;
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ status: 'ok', checkedAt: new Date().toISOString() }));
    } catch {
      response.writeHead(503, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'database_unavailable' }));
    }
    return;
  }
  void api(request, response);
});

server.listen(config.PORT, config.HOST, () => {
  console.log(`OpsGraph GraphQL: http://${config.HOST}:${config.PORT}/graphql`);
  stopCollector = startCollector(targets);
  incidentEvaluator.start();
});

server.on('error', async (error) => {
  console.error(error);
  incidentEvaluator.stop();
  await db.$disconnect();
  process.exitCode = 1;
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    incidentEvaluator.stop();
    void (async () => {
      await stopCollector?.();
      server.close(() => {
        void db.$disconnect();
      });
    })();
    server.closeIdleConnections();
  });
}
