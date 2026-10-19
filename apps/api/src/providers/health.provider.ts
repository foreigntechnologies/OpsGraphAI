export interface ServiceHealthSummary {
  service: string;
  url: string;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  version?: string;
  latencyMs?: number;
  lastCheckedAt: string;
  error?: string;
}

export class HttpHealthProvider {
  private services = [
    { name: 'api-gateway', url: process.env.GATEWAY_URL || 'http://127.0.0.1:8080' },
    { name: 'auth-service', url: process.env.AUTH_SERVICE_URL || 'http://127.0.0.1:8081' },
    { name: 'payments-api', url: process.env.PAYMENTS_API_URL || 'http://127.0.0.1:8082' },
    { name: 'orders-api', url: process.env.ORDERS_API_URL || 'http://127.0.0.1:8083' },
    { name: 'notifications-service', url: process.env.NOTIFICATIONS_SERVICE_URL || 'http://127.0.0.1:8084' },
  ];

  public async getServiceHealth(serviceName: string): Promise<ServiceHealthSummary> {
    const s = this.services.find((it) => it.name === serviceName);
    if (!s) {
      return {
        service: serviceName,
        url: '',
        status: 'DOWN',
        lastCheckedAt: new Date().toISOString(),
        error: 'Unknown service name',
      };
    }

    const start = Date.now();
    try {
      const res = await fetch(`${s.url}/health/ready`, { signal: AbortSignal.timeout(1500) });
      const latencyMs = Date.now() - start;
      const json = (await res.json().catch(() => ({}))) as { status?: string; version?: string };
      const isHealthy = res.status === 200 && json.status === 'ready';

      return {
        service: s.name,
        url: s.url,
        status: isHealthy ? 'HEALTHY' : 'DEGRADED',
        version: json.version,
        latencyMs,
        lastCheckedAt: new Date().toISOString(),
        error: isHealthy ? undefined : `Status code ${res.status}`,
      };
    } catch (err) {
      return {
        service: s.name,
        url: s.url,
        status: 'DOWN',
        latencyMs: Date.now() - start,
        lastCheckedAt: new Date().toISOString(),
        error: (err as Error).message,
      };
    }
  }

  public async getAllHealth(): Promise<ServiceHealthSummary[]> {
    return Promise.all(this.services.map((s) => this.getServiceHealth(s.name)));
  }
}
