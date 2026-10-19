import { initTelemetry, createService, fetchWithTrace } from '@opsgraph/service-kit';

initTelemetry('api-gateway', '1.0.0');

const authUrl = process.env.AUTH_SERVICE_URL || 'http://127.0.0.1:8081';
const paymentsUrl = process.env.PAYMENTS_API_URL || 'http://127.0.0.1:8082';
const ordersUrl = process.env.ORDERS_API_URL || 'http://127.0.0.1:8083';

const { app, logger, start } = createService({
  name: 'api-gateway',
  version: '1.0.0',
  port: Number(process.env.PORT || 8080),
});

app.post('/api/payments', async (req, res) => {
  try {
    // 1. Authenticate request via auth-service
    const authRes = await fetchWithTrace(
      `${authUrl}/verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: req.headers.authorization || 'Bearer test_token',
        },
        body: JSON.stringify({ token: req.headers.authorization }),
        timeoutMs: 1000,
      },
      logger,
    );

    if (!authRes.ok) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 2. Forward to payments-api
    const paymentRes = await fetchWithTrace(
      `${paymentsUrl}/payments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        timeoutMs: 5000,
      },
      logger,
    );

    const data = await paymentRes.json();
    res.status(paymentRes.status).json(data);
  } catch (err) {
    logger.error({ error: (err as Error).message }, 'gateway payment routing failed');
    res.status(502).json({ error: 'GatewayRoutingError', message: (err as Error).message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    // 1. Authenticate request via auth-service
    const authRes = await fetchWithTrace(
      `${authUrl}/verify`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: req.headers.authorization || 'Bearer test_token',
        },
        body: JSON.stringify({ token: req.headers.authorization }),
        timeoutMs: 1000,
      },
      logger,
    );

    if (!authRes.ok) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 2. Forward to orders-api
    const orderRes = await fetchWithTrace(
      `${ordersUrl}/orders`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        timeoutMs: 5000,
      },
      logger,
    );

    const data = await orderRes.json();
    res.status(orderRes.status).json(data);
  } catch (err) {
    logger.error({ error: (err as Error).message }, 'gateway order routing failed');
    res.status(502).json({ error: 'GatewayRoutingError', message: (err as Error).message });
  }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    const orderRes = await fetchWithTrace(`${ordersUrl}/orders/${req.params.id}`, { timeoutMs: 2000 }, logger);
    const data = await orderRes.json();
    res.status(orderRes.status).json(data);
  } catch (err) {
    res.status(502).json({ error: 'GatewayRoutingError', message: (err as Error).message });
  }
});

await start();
