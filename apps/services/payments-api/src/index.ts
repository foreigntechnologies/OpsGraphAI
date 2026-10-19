import { initTelemetry, createService } from '@opsgraph/service-kit';
import pg from 'pg';

initTelemetry('payments-api', '1.0.0');

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://opsgraph:opsgraph@127.0.0.1:5432/shop',
  max: 20,
  connectionTimeoutMillis: 3000,
});

let isPostgresConnected = false;
async function checkPostgres() {
  try {
    const client = await pgPool.connect();
    await client.query('SELECT 1');
    client.release();
    isPostgresConnected = true;
    return { ok: true, message: 'connected' };
  } catch (err) {
    isPostgresConnected = false;
    return { ok: false, message: (err as Error).message };
  }
}

const { app, logger, chaos, start } = createService({
  name: 'payments-api',
  version: '1.0.0',
  port: Number(process.env.PORT || 8082),
  dependencyChecks: {
    postgres: checkPostgres,
  },
});

app.post(['/payments', '/internal/charge'], async (req, res) => {
  const { orderId = `ord_${Date.now()}`, amount = 99.00, currency = 'USD' } = req.body || {};
  const paymentId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const start = Date.now();

  try {
    // Inject database latency if chaos scenario is active
    const extraDelay = chaos.getDatabaseLatency();
    if (extraDelay > 0) {
      if (isPostgresConnected) {
        try {
          const sleepSeconds = extraDelay / 1000;
          await pgPool.query('SELECT pg_sleep($1)', [sleepSeconds]);
        } catch {
          await new Promise((r) => setTimeout(r, extraDelay));
        }
      } else {
        await new Promise((r) => setTimeout(r, extraDelay));
      }
      logger.warn({ latencyMs: extraDelay, query: 'SELECT pg_sleep', paymentId }, 'slow database query execution');
    } else {
      // Normal database latency (20-45ms)
      if (isPostgresConnected) {
        try {
          await pgPool.query(
            'INSERT INTO payments (id, amount, currency, status) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
            [paymentId, amount, currency, 'COMPLETED'],
          );
        } catch {
          await new Promise((r) => setTimeout(r, 25));
        }
      } else {
        await new Promise((r) => setTimeout(r, 20 + Math.random() * 20));
      }
    }

    const durationMs = Date.now() - start;
    logger.info({ paymentId, orderId, amount, durationMs }, 'payment processed successfully');

    res.json({
      paymentId,
      orderId,
      amount,
      currency,
      status: 'COMPLETED',
      durationMs,
      processedAt: new Date().toISOString(),
    });
  } catch (err) {
    const durationMs = Date.now() - start;
    logger.error({ paymentId, orderId, durationMs, error: (err as Error).message }, 'payment processing failed');
    res.status(500).json({
      error: 'PaymentProcessingError',
      message: (err as Error).message,
    });
  }
});

app.get('/payments/:id', async (req, res) => {
  const { id } = req.params;
  res.json({
    paymentId: id,
    status: 'COMPLETED',
    retrievedAt: new Date().toISOString(),
  });
});

await start();
