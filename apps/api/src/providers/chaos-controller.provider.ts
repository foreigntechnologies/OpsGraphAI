import type { ChaosScenarioType, ChaosState } from '@opsgraph/shared';

export class ChaosControllerProvider {
  private services = [
    { name: 'api-gateway', url: process.env.GATEWAY_URL || 'http://127.0.0.1:8080' },
    { name: 'auth-service', url: process.env.AUTH_SERVICE_URL || 'http://127.0.0.1:8081' },
    { name: 'payments-api', url: process.env.PAYMENTS_API_URL || 'http://127.0.0.1:8082' },
    { name: 'orders-api', url: process.env.ORDERS_API_URL || 'http://127.0.0.1:8083' },
    { name: 'notifications-service', url: process.env.NOTIFICATIONS_SERVICE_URL || 'http://127.0.0.1:8084' },
  ];

  public async getAggregatedChaosState(): Promise<ChaosState> {
    const states = await Promise.all(
      this.services.map(async (s) => {
        try {
          const res = await fetch(`${s.url}/admin/chaos`, { signal: AbortSignal.timeout(1500) });
          if (!res.ok) return null;
          return (await res.json()) as ChaosState;
        } catch {
          return null;
        }
      }),
    );

    const activeScenarios = states
      .filter((st): st is ChaosState => Boolean(st && st.activeScenarios?.length))
      .flatMap((st) => st.activeScenarios);

    return {
      enabled: process.env.NODE_ENV !== 'production',
      environment: process.env.NODE_ENV ?? 'development',
      activeScenarios,
    };
  }

  public async enableScenario(
    serviceName: string,
    scenario: ChaosScenarioType,
    params: Record<string, unknown>,
    ttlMinutes = 10,
  ): Promise<boolean> {
    const s = this.services.find((it) => it.name === serviceName);
    if (!s) throw new Error(`Unknown service: ${serviceName}`);

    const res = await fetch(`${s.url}/admin/chaos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario, params, ttlMinutes }),
      signal: AbortSignal.timeout(2000),
    });

    return res.ok;
  }

  public async resetAllChaos(): Promise<boolean> {
    await Promise.all(
      this.services.map(async (s) => {
        try {
          await fetch(`${s.url}/admin/chaos`, {
            method: 'DELETE',
            signal: AbortSignal.timeout(2000),
          });
        } catch {}
      }),
    );
    return true;
  }
}
