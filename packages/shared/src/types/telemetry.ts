import { z } from 'zod';
import { requestWindowSchema } from '../sre/calculations.js';

export type DataState = 'LIVE' | 'STALE' | 'NO_DATA' | 'DISCONNECTED' | 'DEGRADED';
export type SloState = 'HEALTHY' | 'AT_RISK' | 'BREACHED';
export type BurnLevel = 'HEALTHY' | 'WARNING' | 'HIGH' | 'CRITICAL';
export type ProviderSource = 'prometheus' | 'loki' | 'tempo' | 'health' | 'synthetic';
export type IntegrationStatus = 'CONNECTED' | 'DEGRADED' | 'DISCONNECTED';

export interface ProviderResult<T> {
  state: DataState;
  data: T | null;
  source: ProviderSource;
  fetchedAt: string;
  observedAt: string | null;
  window?: string;
  error?: string;
}

export interface ServiceReliability {
  service: string;
  state: DataState;
  window: string;
  lastUpdatedAt: string;
  observedAt: string | null;
  requestsPerSecond: number | null;
  availability: number | null;
  latencyP50: number | null;
  latencyP95: number | null;
  latencyP99: number | null;
  latencySli: number | null;
  errorRate: number | null;
  burnRate: number | null;
  burnLevel: BurnLevel | null;
  sloStatus: SloState | null;
}

export interface LogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  service: string;
  environment?: string;
  traceId?: string;
  spanId?: string;
  requestId?: string;
  message: string;
  durationMs?: number;
  route?: string;
  statusCode?: number;
  error?: string;
}

export interface TraceSpan {
  id: string;
  name: string;
  service: string;
  startOffsetMs: number;
  durationMs: number;
  isAnomalous: boolean;
  statusCode?: number;
  error?: string;
}

export interface Trace {
  id: string;
  name: string;
  totalDurationMs: number;
  spans: TraceSpan[];
}

export interface ProviderHealth {
  status: IntegrationStatus;
  latencyMs?: number;
  lastCheckedAt: string;
  error?: string;
}

export interface ObservabilityHealth {
  prometheus: ProviderHealth;
  loki: ProviderHealth;
  tempo: ProviderHealth;
  grafana: ProviderHealth;
  collector: ProviderHealth;
}

export type ChaosScenarioType = 'DATABASE_LATENCY' | 'ERROR_SPIKE' | 'DEPENDENCY_TIMEOUT';

export interface ChaosScenario {
  type: ChaosScenarioType;
  service: string;
  enabled: boolean;
  params: Record<string, unknown>;
  expiresAt: string | null;
}

export interface ChaosState {
  enabled: boolean;
  environment: string;
  activeScenarios: ChaosScenario[];
}

// Backward compatibility alias during refactor
export const telemetrySchema = z.object({
  timestamp: z.iso.datetime(),
  latencyP50: z.number().int().nonnegative(),
  latencyP95: z.number().int().nonnegative(),
  latencyP99: z.number().int().nonnegative(),
  errorRate: z.number().min(0).max(100),
  requestsSec: z.number().int().nonnegative(),
  cpuUsage: z.number().min(0).max(100),
  memoryUsage: z.number().min(0).max(100),
  phase: z.enum(['BASELINE', 'INCIDENT', 'MITIGATING', 'RECOVERED']).optional(),
  availabilityWindow: requestWindowSchema.optional(),
  burnRateWindow: requestWindowSchema.optional(),
  budgetWindow: requestWindowSchema.optional(),
});
export type TelemetrySnapshot = z.infer<typeof telemetrySchema>;
export type TelemetryPhase = 'BASELINE' | 'INCIDENT' | 'MITIGATING' | 'RECOVERED';
