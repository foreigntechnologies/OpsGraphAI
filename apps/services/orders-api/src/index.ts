import { initTelemetry, createService, fetchWithTrace } from '@opsgraph/service-kit';

initTelemetry('orders-api', '1.0.0');

const paymentsUrl = process.env.PAYMENTS_API_URL || 'http://127.0.0.1:8082';
const notificationsUrl = process.env.NOTIFICATIONS_SERVICE_URL || 'http://127.0.0.1:8084';

const { app, logger, chaos, start } = createService({
  name: 'orders-api',
  version: '1.0.0',
  port: Number(process.env.PORT || 8083),
});

app.post('/orders', async (req, res) => {
  const { customerId = 'cust_9012', items = [{ id: 'item_1', price: 99.00 }] } = req.body || {};
  const orderId = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const total = items.reduce((acc: number, it: { price: number }) => acc + (it.price || 0), 0);

  // Normal dependency timeout is 1500ms; during chaos, may be shorter or payment is delayed
  const timeoutMs = chaos.getDependencyTimeout() > 0 ? 1000 : 1800;

  try {
    // 1. Charge payment via payments-api
    const chargeRes = await fetchWithTrace(
      `${paymentsUrl}/internal/charge`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, amount: total }),
        timeoutMs,
      },
      logger,
    );

    if (!chargeRes.ok) {
      logger.error({ orderId, status: chargeRes.status }, 'payment charge rejected');
      return res.status(502).json({ error: 'PaymentFailed', statusCode: chargeRes.status });
    }

    const paymentData = (await chargeRes.json()) as { paymentId?: string };

    // 2. Fire and forget notification
    fetchWithTrace(
      `${notificationsUrl}/notify`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'email', recipient: 'customer@example.com', subject: `Order ${orderId}` }),
        timeoutMs: 1000,
      },
      logger,
    ).catch((err) => {
      logger.warn({ orderId, error: (err as Error).message }, 'notification delivery failed');
    });

    logger.info({ orderId, customerId, total, paymentId: paymentData.paymentId }, 'order created successfully');

    res.status(201).json({
      orderId,
      customerId,
      total,
      status: 'CONFIRMED',
      payment: paymentData,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    const isTimeout = (err as Error).name === 'AbortError';
    logger.error({ orderId, isTimeout, error: (err as Error).message }, isTimeout ? 'dependency timeout on payments-api' : 'order creation failed');
    res.status(isTimeout ? 504 : 500).json({
      error: isTimeout ? 'DependencyTimeout' : 'OrderCreationError',
      message: (err as Error).message,
    });
  }
});

app.get('/orders/:id', async (req, res) => {
  const { id } = req.params;
  res.json({
    orderId: id,
    status: 'CONFIRMED',
    total: 99.00,
    retrievedAt: new Date().toISOString(),
  });
});

await start();
