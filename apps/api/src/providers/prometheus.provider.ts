import { config } from '../config.js';
import type { ProviderResult, ServiceReliability, SloState, BurnLevel } from '@opsgraph/shared';

export interface PrometheusQueryResult {
  status: 'success' | 'error';
  data?: {
    resultType: 'matrix' | 'vector';
    result: Array<{
      metric: Record<string, string>;
      value?: [number, string];
      values?: Array<[number, string]>;
    }>;
  };
  error?: string;
}

const SERVICE_PORTS: Record<string, number> = {
  'api-gateway': 8080,
  'auth-service': 8081,
  'payments-api': 8082,
  'orders-api': 8083,
  'notifications-service': 8084,
};

export class PrometheusMetricsProvider {
  constructor(
    private baseUrl = config.PROMETHEUS_URL,
    private allowDirectScrapeFallback = false,
  ) {}

  private async queryPrometheus(promql: string, timeoutMs = 3000): Promise<number | null> {
    try {
      const url = new URL('/api/v1/query', this.baseUrl);
      url.searchParams.set('query', promql);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url.toString(), { signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) return null;
      const json = (await res.json()) as PrometheusQueryResult;
      if (json.status !== 'success' || !json.data?.result?.length) return null;

      const rawVal = json.data.result[0]?.value?.[1];
      if (!rawVal || rawVal === 'NaN') return null;
      const num = Number(rawVal);
      return Number.isFinite(num) ? num : null;
    } catch {
      return null;
    }
  }

  /** Direct scrape fallback from running service's /metrics when Prometheus server is offline */
  private async scrapeDirectMetrics(service: string, window: string): Promise<ProviderResult<ServiceReliability> | null> {
    const port = SERVICE_PORTS[service];
    if (!port) return null;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`http://127.0.0.1:${port}/metrics`, { signal: controller.signal }).catch(() => null);
      clearTimeout(timer);

      if (!res || !res.ok) return null;
      const text = await res.text();
      const fetchedAt = new Date().toISOString();

      let totalRequests = 0;
      let errorRequests = 0;
      const buckets: Array<{ le: number; count: number }> = [];
      let durationSum = 0;
      let durationCount = 0;

      const lines = text.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        // Parse http_requests_total
        if (trimmed.startsWith('http_requests_total{') || trimmed.startsWith('http_requests_total ')) {
          const match = trimmed.match(/status_code="(\d+)"/);
          const parts = trimmed.split(/\s+/);
          const val = Number(parts[parts.length - 1]);
          if (Number.isFinite(val)) {
            totalRequests += val;
            if (match && match[1]?.startsWith('5')) {
              errorRequests += val;
            }
          }
        }

        // Parse histogram buckets
        if (trimmed.startsWith('http_request_duration_seconds_bucket{')) {
          const leMatch = trimmed.match(/le="([^"]+)"/);
          const parts = trimmed.split(/\s+/);
          const val = Number(parts[parts.length - 1]);
          if (leMatch && leMatch[1] && Number.isFinite(val)) {
            const le = leMatch[1] === '+Inf' ? Infinity : Number(leMatch[1]);
            buckets.push({ le, count: val });
          }
        }

        if (trimmed.startsWith('http_request_duration_seconds_sum')) {
          const parts = trimmed.split(/\s+/);
          const val = Number(parts[parts.length - 1]);
          if (Number.isFinite(val)) durationSum += val;
        }

        if (trimmed.startsWith('http_request_duration_seconds_count')) {
          const parts = trimmed.split(/\s+/);
          const val = Number(parts[parts.length - 1]);
          if (Number.isFinite(val)) durationCount += val;
        }
      }

      if (totalRequests === 0) {
        return {
          state: 'NO_DATA',
          data: {
            service,
            state: 'NO_DATA',
            window,
            lastUpdatedAt: fetchedAt,
            observedAt: null,
            requestsPerSecond: 0,
            availability: null,
            latencyP50: null,
            latencyP95: null,
            latencyP99: null,
            latencySli: null,
            errorRate: null,
            burnRate: null,
            burnLevel: null,
            sloStatus: null,
          },
          source: 'prometheus',
          fetchedAt,
          observedAt: null,
          window,
        };
      }

      const availability = totalRequests > 0 ? Number((100 * (1 - errorRequests / totalRequests)).toFixed(2)) : 100;
      const errorRate = totalRequests > 0 ? Number((100 * (errorRequests / totalRequests)).toFixed(2)) : 0;
      const rps = Number((totalRequests / 60).toFixed(1));

      // Calculate percentiles from buckets
      buckets.sort((a, b) => a.le - b.le);
      const totalHist = durationCount || totalRequests;
      const getQuantileMs = (q: number) => {
        const target = totalHist * q;
        for (const b of buckets) {
          if (b.count >= target && Number.isFinite(b.le)) {
            return Math.round(b.le * 1000);
          }
        }
        return durationCount > 0 ? Math.round((durationSum / durationCount) * 1000) : 35;
      };

      const p50 = getQuantileMs(0.5);
      const p95 = getQuantileMs(0.95);
      const p99 = getQuantileMs(0.99);

      // Latency SLI: fraction of requests <= 500ms
      const le500Bucket = buckets.find((b) => b.le === 0.5);
      const latencySli = le500Bucket && totalHist > 0 ? Number((100 * (le500Bucket.count / totalHist)).toFixed(1)) : 100;

      // Burn Rate calculation for SLO 99.99% (allowed error budget = 0.01%)
      const allowedErrorPercent = 0.01;
      const burnRate = Number((errorRate / allowedErrorPercent).toFixed(2));

      let burnLevel: BurnLevel = 'HEALTHY';
      if (burnRate > 6.0) burnLevel = 'CRITICAL';
      else if (burnRate >= 2.0) burnLevel = 'HIGH';
      else if (burnRate >= 1.0) burnLevel = 'WARNING';

      let sloStatus: SloState = 'HEALTHY';
      if (availability < 99.99 || p95 > 500 || errorRate > 0.05 || burnRate > 2.0) {
        sloStatus = 'BREACHED';
      } else if (burnRate >= 1.0 || p95 > 400) {
        sloStatus = 'AT_RISK';
      }

      return {
        state: 'LIVE',
        data: {
          service,
          state: 'LIVE',
          window,
          lastUpdatedAt: fetchedAt,
          observedAt: fetchedAt,
          requestsPerSecond: rps,
          availability,
          latencyP50: p50,
          latencyP95: p95,
          latencyP99: p99,
          latencySli,
          errorRate,
          burnRate,
          burnLevel,
          sloStatus,
        },
        source: 'prometheus',
        fetchedAt,
        observedAt: fetchedAt,
        window,
      };
    } catch {
      return null;
    }
  }

  public async getServiceReliability(
    service: string,
    window = config.RELIABILITY_WINDOW,
  ): Promise<ProviderResult<ServiceReliability>> {
    const fetchedAt = new Date().toISOString();

    try {
      // 1. Check if Prometheus is reachable
      const pingController = new AbortController();
      const pingTimer = setTimeout(() => pingController.abort(), 2000);
      const pingRes = await fetch(`${this.baseUrl}/-/ready`, { signal: pingController.signal }).catch(() => null);
      clearTimeout(pingTimer);

      if (!pingRes || !pingRes.ok) {
        if (this.allowDirectScrapeFallback) {
          const direct = await this.scrapeDirectMetrics(service, window);
          if (direct) return direct;
        }

        return {
          state: 'DISCONNECTED',
          data: null,
          source: 'prometheus',
          fetchedAt,
          observedAt: null,
          window,
          error: 'Prometheus endpoint unreachable',
        };
      }

      // 2. Fetch throughput (requests per second)
      const rpsPromql = `sum(rate(http_requests_total{service="${service}"}[${window}]))`;
      const rps = await this.queryPrometheus(rpsPromql);

      // If no requests recorded in the window, safely return NO_DATA
      if (rps === null || rps === 0) {
        return {
          state: 'NO_DATA',
          data: {
            service,
            state: 'NO_DATA',
            window,
            lastUpdatedAt: fetchedAt,
            observedAt: null,
            requestsPerSecond: 0,
            availability: null,
            latencyP50: null,
            latencyP95: null,
            latencyP99: null,
            latencySli: null,
            errorRate: null,
            burnRate: null,
            burnLevel: null,
            sloStatus: null,
          },
          source: 'prometheus',
          fetchedAt,
          observedAt: null,
          window,
        };
      }

      // 3. Compute Availability: (non-5xx requests / total requests) * 100
      const availPromql = `100 * (sum(rate(http_requests_total{service="${service}",status_code!~"5.."}[${window}])) / sum(rate(http_requests_total{service="${service}"}[${window}])))`;
      const availabilityRaw = await this.queryPrometheus(availPromql);
      const availability = availabilityRaw !== null ? Math.min(100, Math.max(0, availabilityRaw)) : null;

      // 4. Compute Error Rate (5xx requests / total requests) * 100
      const errPromql = `100 * (sum(rate(http_requests_total{service="${service}",status_code=~"5.."}[${window}])) / sum(rate(http_requests_total{service="${service}"}[${window}])))`;
      const errorRateRaw = await this.queryPrometheus(errPromql);
      const errorRate = errorRateRaw !== null ? Math.max(0, errorRateRaw) : 0;

      // 5. Latency percentiles in milliseconds
      const p50Promql = `1000 * histogram_quantile(0.50, sum by (le) (rate(http_request_duration_seconds_bucket{service="${service}"}[${window}])))`;
      const p95Promql = `1000 * histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{service="${service}"}[${window}])))`;
      const p99Promql = `1000 * histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket{service="${service}"}[${window}])))`;

      const p50 = await this.queryPrometheus(p50Promql);
      const p95 = await this.queryPrometheus(p95Promql);
      const p99 = await this.queryPrometheus(p99Promql);

      // Latency SLI: fraction of requests <= 500ms
      const latencySliPromql = `100 * (sum(rate(http_request_duration_seconds_bucket{service="${service}",le="0.5"}[${window}])) / sum(rate(http_request_duration_seconds_count{service="${service}"}[${window}])))`;
      const latencySli = await this.queryPrometheus(latencySliPromql);

      // 6. Burn Rate calculation for SLO 99.99% (allowed error ratio is 0.0001 = 0.01%)
      const allowedErrorPercent = 0.01;
      const burnRate = errorRate !== null ? Number((errorRate / allowedErrorPercent).toFixed(2)) : 0;

      let burnLevel: BurnLevel = 'HEALTHY';
      if (burnRate > 6.0) burnLevel = 'CRITICAL';
      else if (burnRate >= 2.0) burnLevel = 'HIGH';
      else if (burnRate >= 1.0) burnLevel = 'WARNING';

      // 7. SLO status determination (SLO target: 99.99%)
      let sloStatus: SloState = 'HEALTHY';
      if ((availability !== null && availability < 99.99) || (p95 !== null && p95 > 500) || (errorRate !== null && errorRate > 0.05) || burnRate > 2.0) {
        sloStatus = 'BREACHED';
      } else if (burnRate >= 1.0 || (p95 !== null && p95 > 400)) {
        sloStatus = 'AT_RISK';
      }

      return {
        state: 'LIVE',
        data: {
          service,
          state: 'LIVE',
          window,
          lastUpdatedAt: fetchedAt,
          observedAt: fetchedAt,
          requestsPerSecond: Number(rps.toFixed(2)),
          availability: availability !== null ? Number(availability.toFixed(2)) : null,
          latencyP50: p50 !== null ? Math.round(p50) : null,
          latencyP95: p95 !== null ? Math.round(p95) : null,
          latencyP99: p99 !== null ? Math.round(p99) : null,
          latencySli: latencySli !== null ? Number(latencySli.toFixed(1)) : null,
          errorRate: Number(errorRate.toFixed(2)),
          burnRate,
          burnLevel,
          sloStatus,
        },
        source: 'prometheus',
        fetchedAt,
        observedAt: fetchedAt,
        window,
      };
    } catch (err) {
      // Direct fallback
      const direct = await this.scrapeDirectMetrics(service, window);
      if (direct) return direct;

      return {
        state: 'DISCONNECTED',
        data: null,
        source: 'prometheus',
        fetchedAt,
        observedAt: null,
        window,
        error: (err as Error).message,
      };
    }
  }
}
