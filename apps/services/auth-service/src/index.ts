import { initTelemetry, createService } from '@opsgraph/service-kit';

initTelemetry('auth-service', '1.0.0');

const { app, logger, start } = createService({
  name: 'auth-service',
  version: '1.0.0',
  port: Number(process.env.PORT || 8081),
});

app.post('/verify', async (req, res) => {
  const token = req.headers.authorization || req.body?.token || 'anonymous';
  // Simulate small auth token verification latency (15-30ms)
  await new Promise((r) => setTimeout(r, 15 + Math.random() * 15));

  logger.info({ user: 'service-account', tokenPresent: Boolean(token) }, 'token verified');
  res.json({
    valid: true,
    user: { id: 'usr_prod_8912', role: 'customer', authenticatedAt: new Date().toISOString() },
  });
});

await start();
