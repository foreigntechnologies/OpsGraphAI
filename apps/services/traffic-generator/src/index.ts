const isEnabled = process.env.TRAFFIC_GENERATOR_ENABLED !== 'false';
const gatewayUrl = process.env.GATEWAY_URL || 'http://127.0.0.1:8080';
const targetRps = Number(process.env.TRAFFIC_RPS || 3);
const intervalMs = Math.max(100, Math.round(1000 / targetRps));

console.log(`[traffic-generator] Initialized (enabled: ${isEnabled}, targetRps: ${targetRps}, gateway: ${gatewayUrl})`);

if (!isEnabled) {
  console.log('[traffic-generator] Disabled via TRAFFIC_GENERATOR_ENABLED=false');
  process.exit(0);
}

let activeRequests = 0;
const MAX_CONCURRENT = 10;

async function sendRequest() {
  if (activeRequests >= MAX_CONCURRENT) {
    // Drop / throttle to respect backpressure
    return;
  }

  activeRequests++;
  const roll = Math.random();

  try {
    if (roll < 0.6) {
      // 60% payment requests
      const isBad = Math.random() < 0.05; // 5% 4xx invalid requests
      await fetch(`${gatewayUrl}/api/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: isBad ? '' : 'Bearer valid_token' },
        body: JSON.stringify(isBad ? {} : { orderId: `ord_${Date.now()}`, amount: 99.50 }),
      });
    } else if (roll < 0.9) {
      // 30% order creation requests
      await fetch(`${gatewayUrl}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid_token' },
        body: JSON.stringify({ customerId: 'cust_live_123', items: [{ id: 'item_pro', price: 149.00 }] }),
      });
    } else {
      // 10% order lookup requests
      await fetch(`${gatewayUrl}/api/orders/ord_sample_99`, {
        headers: { Authorization: 'Bearer valid_token' },
      });
    }
  } catch (err) {
    // Gateway may be down or starting up
  } finally {
    activeRequests--;
  }
}

// Tick periodically with jitter
const timer = setInterval(() => {
  void sendRequest();
}, intervalMs);

process.on('SIGTERM', () => clearInterval(timer));
process.on('SIGINT', () => clearInterval(timer));
