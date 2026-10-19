import { config } from '../config.js';
import type { ObservabilityHealth, ProviderHealth } from '@opsgraph/shared';

export class ObservabilityHealthProvider {
  constructor(
    private prometheusUrl = config.PROMETHEUS_URL,
    private lokiUrl = config.LOKI_URL,
    private tempoUrl = config.TEMPO_URL,
    private grafanaUrl = config.GRAFANA_URL,
    private collectorUrl = config.OTEL_COLLECTOR_URL,
  ) {}

  private async ping(url: string, timeoutMs = 1500): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      const latencyMs = Date.now() - start;
      const isOk = res.ok || res.status === 200 || res.status === 204;
      return {
        status: isOk ? 'CONNECTED' : 'DEGRADED',
        latencyMs,
        lastCheckedAt: new Date().toISOString(),
        error: isOk ? undefined : `HTTP ${res.status}`,
      };
    } catch (err) {
      return {
        status: 'DISCONNECTED',
        latencyMs: Date.now() - start,
        lastCheckedAt: new Date().toISOString(),
        error: (err as Error).message,
      };
    }
  }

  public async getHealth(): Promise<ObservabilityHealth> {
    const [prometheus, loki, tempo, grafana, collector] = await Promise.all([
      this.ping(`${this.prometheusUrl}/-/ready`),
      this.ping(`${this.lokiUrl}/ready`),
      this.ping(`${this.tempoUrl}/ready`),
      this.ping(`${this.grafanaUrl}/api/health`),
      this.ping(`${this.collectorUrl}/`),
    ]);

    return {
      prometheus,
      loki,
      tempo,
      grafana,
      collector,
    };
  }
}
