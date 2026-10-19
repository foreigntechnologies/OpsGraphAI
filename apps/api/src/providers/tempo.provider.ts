import { config } from '../config.js';
import type { ProviderResult, Trace, TraceSpan } from '@opsgraph/shared';

export interface TempoSearchTrace {
  traceID: string;
  rootServiceName?: string;
  rootTraceName?: string;
  startTimeUnixNano?: string;
  durationMs?: number;
  spanSet?: {
    spans: Array<{
      spanID: string;
      startTimeUnixNano: string;
      durationNanos: number;
      attributes?: Array<{ key: string; value: { stringValue?: string; intValue?: number } }>;
    }>;
  };
}

export class TempoTracingProvider {
  constructor(private baseUrl = config.TEMPO_URL) {}

  public async searchTraces(
    service: string,
    minDurationMs = 0,
    onlyErrors = false,
    limit = 10,
  ): Promise<ProviderResult<Trace[]>> {
    const fetchedAt = new Date().toISOString();

    try {
      // 1. Check if Tempo is reachable
      const pingController = new AbortController();
      const pingTimer = setTimeout(() => pingController.abort(), 2000);
      const pingRes = await fetch(`${this.baseUrl}/ready`, { signal: pingController.signal }).catch(() => null);
      clearTimeout(pingTimer);

      if (!pingRes || !pingRes.ok) {
        return {
          state: 'DISCONNECTED',
          data: null,
          source: 'tempo',
          fetchedAt,
          observedAt: null,
          error: 'Tempo endpoint unreachable or returning non-200',
        };
      }

      // 2. Build TraceQL or query parameters
      const url = new URL('/api/search', this.baseUrl);
      let query = `{ resource.service.name = "${service}"`;
      if (minDurationMs > 0) {
        query += ` && duration > ${minDurationMs}ms`;
      }
      if (onlyErrors) {
        query += ` && status = error`;
      }
      query += ` }`;

      url.searchParams.set('q', query);
      url.searchParams.set('limit', String(limit));

      const queryController = new AbortController();
      const queryTimer = setTimeout(() => queryController.abort(), 3000);
      const res = await fetch(url.toString(), { signal: queryController.signal });
      clearTimeout(queryTimer);

      if (!res.ok) {
        return {
          state: 'DEGRADED',
          data: [],
          source: 'tempo',
          fetchedAt,
          observedAt: null,
          error: `Tempo returned HTTP ${res.status}`,
        };
      }

      const json = (await res.json()) as { traces?: TempoSearchTrace[] };
      const rawTraces = json.traces || [];

      // Convert search hits to lightweight Trace summaries
      const traces: Trace[] = rawTraces.map((t) => {
        const totalDurationMs = t.durationMs ?? 0;
        const spans: TraceSpan[] = (t.spanSet?.spans || []).map((s) => {
          const durMs = Math.round(s.durationNanos / 1e6);
          return {
            id: s.spanID,
            name: t.rootTraceName || 'operation',
            service,
            startOffsetMs: 0,
            durationMs: durMs,
            isAnomalous: durMs > 1000 || durMs > totalDurationMs * 0.7,
          };
        });

        return {
          id: t.traceID,
          name: t.rootTraceName || `${service} trace`,
          totalDurationMs,
          spans,
        };
      });

      return {
        state: traces.length > 0 ? 'LIVE' : 'NO_DATA',
        data: traces,
        source: 'tempo',
        fetchedAt,
        observedAt: fetchedAt,
      };
    } catch (err) {
      return {
        state: 'DISCONNECTED',
        data: null,
        source: 'tempo',
        fetchedAt,
        observedAt: null,
        error: (err as Error).message,
      };
    }
  }

  public async getTrace(traceId: string): Promise<ProviderResult<Trace>> {
    const fetchedAt = new Date().toISOString();

    try {
      const url = new URL(`/api/traces/${traceId}`, this.baseUrl);
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(3000) });
      if (!res.ok) {
        return {
          state: 'NO_DATA',
          data: null,
          source: 'tempo',
          fetchedAt,
          observedAt: null,
          error: `Trace ${traceId} not found in Tempo`,
        };
      }

      const data = (await res.json()) as {
        batches?: Array<{
          resource?: { attributes?: Array<{ key: string; value: { stringValue?: string } }> };
          scopeSpans?: Array<{
            spans?: Array<{
              spanId: string;
              name: string;
              startTimeUnixNano: string;
              endTimeUnixNano: string;
              status?: { code?: number; message?: string };
            }>;
          }>;
        }>;
      };

      const spans: TraceSpan[] = [];
      let minStartTime = Infinity;
      let maxEndTime = 0;

      for (const batch of data.batches || []) {
        const serviceAttr = batch.resource?.attributes?.find((a) => a.key === 'service.name');
        const serviceName = serviceAttr?.value?.stringValue || 'unknown-service';

        for (const scope of batch.scopeSpans || []) {
          for (const s of scope.spans || []) {
            const startNano = Number(s.startTimeUnixNano);
            const endNano = Number(s.endTimeUnixNano);
            if (startNano < minStartTime) minStartTime = startNano;
            if (endNano > maxEndTime) maxEndTime = endNano;

            const durationMs = Math.round((endNano - startNano) / 1e6);
            spans.push({
              id: s.spanId,
              name: s.name,
              service: serviceName,
              startOffsetMs: 0, // adjusted below
              durationMs,
              isAnomalous: durationMs > 1000,
              statusCode: s.status?.code,
              error: s.status?.message,
            });
          }
        }
      }

      const totalDurationMs = maxEndTime > minStartTime ? Math.round((maxEndTime - minStartTime) / 1e6) : 0;

      // Highlight the longest span as anomalous if it accounts for > 60% of request latency
      const maxSpan = spans.length > 0 
        ? spans.reduce((prev, curr) => (curr.durationMs > prev.durationMs ? curr : prev))
        : undefined;
      if (maxSpan && maxSpan.durationMs > totalDurationMs * 0.6 && maxSpan.durationMs > 200) {
        maxSpan.isAnomalous = true;
      }

      return {
        state: 'LIVE',
        data: {
          id: traceId,
          name: spans[0]?.name || 'distributed-trace',
          totalDurationMs,
          spans,
        },
        source: 'tempo',
        fetchedAt,
        observedAt: fetchedAt,
      };
    } catch (err) {
      return {
        state: 'DISCONNECTED',
        data: null,
        source: 'tempo',
        fetchedAt,
        observedAt: null,
        error: (err as Error).message,
      };
    }
  }
}
