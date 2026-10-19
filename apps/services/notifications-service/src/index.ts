import { initTelemetry, createService } from '@opsgraph/service-kit';

initTelemetry('notifications-service', '1.0.0');

const { app, logger, start } = createService({
  name: 'notifications-service',
  version: '1.0.0',
  port: Number(process.env.PORT || 8084),
});

app.post('/notify', async (req, res) => {
  const { channel = 'email', recipient = 'customer@example.com', subject = 'Update' } = req.body || {};
  // Simulate dispatch work (10-25ms)
  await new Promise((r) => setTimeout(r, 10 + Math.random() * 15));

  const notificationId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  logger.info({ notificationId, channel, recipient }, 'notification dispatched successfully');

  res.json({
    sent: true,
    notificationId,
    dispatchedAt: new Date().toISOString(),
  });
});

await start();
