import { config } from '../config.js';
import type { LogEntry, ProviderResult } from '@opsgraph/shared';

export interface LokiStream {
  stream: Record<string, string>;
  values: Array<[string, string]>; // [nanoTimestamp, logLine]
}

export interface LokiQueryResponse {
  status: string;
  data?: {
    resultType: 'streams' | 'matrix';
    result: LokiStream[];
  };
}

export class LokiLogsProvider {
  constructor(private baseUrl = config.LOKI_URL) {}

  public async searchLogs(
    service: string,
    timeRange = '15m',
    level?: string,
    limit = 30,
  ): Promise<ProviderResult<LogEntry[]>> {
    const fetchedAt = new Date().toISOString();

    try {
      // 1. Check if Loki is reachable
      const pingController = new AbortController();
      const pingTimer = setTimeout(() => pingController.abort(), 2000);
      const pingRes = await fetch(`${this.baseUrl}/ready`, { signal: pingController.signal }).catch(() => null);
      clearTimeout(pingTimer);

      if (!pingRes || !pingRes.ok) {
        return {
          state: 'DISCONNECTED',
          data: null,
          source: 'loki',
          fetchedAt,
          observedAt: null,
          error: 'Loki endpoint unreachable or returning non-200',
        };
      }

      // 2. Build LogQL query
      let logql = `{service_name="${service}"}`;
      if (level) {
        logql += ` | json | level=~"(?i)${level}"`;
      }

      const url = new URL('/loki/api/v1/query_range', this.baseUrl);
      url.searchParams.set('query', logql);
      url.searchParams.set('limit', String(limit));

      const queryController = new AbortController();
      const queryTimer = setTimeout(() => queryController.abort(), 3000);
      const res = await fetch(url.toString(), { signal: queryController.signal });
      clearTimeout(queryTimer);

      if (!res.ok) {
        return {
          state: 'DEGRADED',
          data: [],
          source: 'loki',
          fetchedAt,
          observedAt: null,
          error: `Loki returned HTTP ${res.status}`,
        };
      }

      const json = (await res.json()) as LokiQueryResponse;
      const entries: LogEntry[] = [];

      for (const item of json.data?.result || []) {
        for (const [nanoTs, rawLine] of item.values || []) {
          try {
            const parsed = JSON.parse(rawLine);
            entries.push({
              timestamp: parsed.timestamp || new Date(Number(nanoTs.slice(0, 13))).toISOString(),
              level: (parsed.level || item.stream.level || 'INFO').toUpperCase(),
              service: parsed.service || service,
              environment: parsed.environment || item.stream.environment,
              traceId: parsed.traceId,
              spanId: parsed.spanId,
              requestId: parsed.requestId,
              message: parsed.message || parsed.msg || rawLine,
              durationMs: parsed.durationMs,
              route: parsed.route,
              statusCode: parsed.statusCode,
              error: parsed.error || parsed.err,
            });
          } catch {
            entries.push({
              timestamp: new Date(Number(nanoTs.slice(0, 13))).toISOString(),
              level: 'INFO',
              service,
              message: rawLine,
            });
          }
        }
      }

      return {
        state: entries.length > 0 ? 'LIVE' : 'NO_DATA',
        data: entries,
        source: 'loki',
        fetchedAt,
        observedAt: entries[0]?.timestamp || null,
      };
    } catch (err) {
      return {
        state: 'DISCONNECTED',
        data: null,
        source: 'loki',
        fetchedAt,
        observedAt: null,
        error: (err as Error).message,
      };
    }
  }
}
