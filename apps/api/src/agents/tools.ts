import {
  PrometheusMetricsProvider,
  LokiLogsProvider,
  TempoTracingProvider,
  HttpHealthProvider,
} from '../providers/index.js';
import { QdrantKnowledgeProvider, type SearchResult } from '../rag/qdrant.provider.js';
import { config } from '../config.js';

export interface ObservabilityEvidence {
  metrics: {
    availability: number | null;
    p95: number | null;
    errorRate: number | null;
    burnRate: number | null;
    rps: number | null;
    state: string;
  };
  logs: Array<{
    timestamp: string;
    level: string;
    message: string;
    traceId?: string;
    statusCode?: number;
    error?: string;
  }>;
  traces: Array<{
    id: string;
    name: string;
    totalDurationMs: number;
    bottleneckSpan?: {
      name: string;
      service: string;
      durationMs: number;
    };
  }>;
  runbooks: SearchResult[];
}

export class AgentTools {
  private prometheus: PrometheusMetricsProvider;
  private loki: LokiLogsProvider;
  private tempo: TempoTracingProvider;
  private health: HttpHealthProvider;
  private qdrant: QdrantKnowledgeProvider;

  constructor(
    prometheusUrl = config.PROMETHEUS_URL,
    lokiUrl = config.LOKI_URL,
    tempoUrl = config.TEMPO_URL,
  ) {
    this.prometheus = new PrometheusMetricsProvider(prometheusUrl, true);
    this.loki = new LokiLogsProvider(lokiUrl);
    this.tempo = new TempoTracingProvider(tempoUrl);
    this.health = new HttpHealthProvider();
    this.qdrant = new QdrantKnowledgeProvider();
  }

  public async init() {
    await this.qdrant.initialize();
  }

  public async getServiceMetrics(service: string, window = '1m') {
    const res = await this.prometheus.getServiceReliability(service, window);
    return res.data;
  }

  public async searchLogs(service: string, range = '15m', level?: string, limit = 20) {
    const res = await this.loki.searchLogs(service, range, level, limit);
    return res.data || [];
  }

  public async searchTraces(service: string, minDurationMs = 0, onlyErrors = false, limit = 10) {
    const res = await this.tempo.searchTraces(service, minDurationMs, onlyErrors, limit);
    return res.data || [];
  }

  public async getHealthStatus(service: string) {
    return this.health.getServiceHealth(service);
  }

  public async retrieveKnowledge(query: string, limit = 2): Promise<SearchResult[]> {
    return this.qdrant.searchKnowledge(query, limit);
  }

  /**
   * Concurrently collects real signals from Prometheus, Loki, Tempo, and Qdrant
   */
  public async collectMultiSignalEvidence(
    service: string,
    symptomQuery: string,
  ): Promise<ObservabilityEvidence> {
    const [metricsData, logsData, tracesData, runbooks] = await Promise.all([
      this.getServiceMetrics(service, '1m').catch(() => null),
      this.searchLogs(service, '15m', undefined, 15).catch(() => []),
      this.searchTraces(service, 0, false, 5).catch(() => []),
      this.retrieveKnowledge(`${service} ${symptomQuery}`, 2).catch(() => []),
    ]);

    const formattedTraces = (tracesData || []).map((t) => {
      // Find span with max duration
      let maxSpan: any = null;
      if (t.spans && t.spans.length > 0) {
        maxSpan = t.spans.reduce((prev, curr) => (!prev || curr.durationMs > prev.durationMs ? curr : prev), t.spans[0]);
      }
      return {
        id: t.id,
        name: t.name,
        totalDurationMs: t.totalDurationMs,
        bottleneckSpan: maxSpan
          ? {
              name: maxSpan.name,
              service: maxSpan.service,
              durationMs: maxSpan.durationMs,
            }
          : undefined,
      };
    });

    return {
      metrics: {
        availability: metricsData?.availability ?? null,
        p95: metricsData?.latencyP95 ?? null,
        errorRate: metricsData?.errorRate ?? null,
        burnRate: metricsData?.burnRate ?? null,
        rps: metricsData?.requestsPerSecond ?? null,
        state: metricsData?.state ?? 'UNKNOWN',
      },
      logs: (logsData || []).map((l) => ({
        timestamp: l.timestamp,
        level: l.level,
        message: l.message,
        traceId: l.traceId,
        statusCode: l.statusCode,
        error: l.error,
      })),
      traces: formattedTraces,
      runbooks,
    };
  }
}
