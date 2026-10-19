export interface HttpCheck {
  id: string;
  checkedAt: string;
  success: boolean;
  durationMs: number;
  statusCode: number | null;
  error: string | null;
}

export interface HttpMonitor {
  id: string;
  name: string;
  url: string;
  status: string;
  availability: number | null;
  latencyP95: number | null;
  errorRate: number | null;
  sampleCount: number;
  failedChecks: number;
  lastCheckedAt: string | null;
  lastStatusCode: number | null;
  lastError: string | null;
  history: HttpCheck[];
}

export interface MonitoringOverview {
  source: string;
  windowSeconds: number;
  intervalSeconds: number;
  generatedAt: string;
  monitors: HttpMonitor[];
}

export type DataState = 'LIVE' | 'STALE' | 'NO_DATA' | 'DISCONNECTED' | 'DEGRADED';
export type SloState = 'HEALTHY' | 'AT_RISK' | 'BREACHED';
export type IntegrationStatus = 'CONNECTED' | 'DEGRADED' | 'DISCONNECTED';

export interface ProviderHealth {
  status: IntegrationStatus;
  latencyMs: number | null;
  lastCheckedAt: string;
  error: string | null;
}

export interface ObservabilityHealth {
  prometheus: ProviderHealth;
  loki: ProviderHealth;
  tempo: ProviderHealth;
  grafana: ProviderHealth;
  collector: ProviderHealth;
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
  burnLevel: string | null;
  sloStatus: SloState | null;
}

export interface ServiceHealth {
  service: string;
  url: string;
  status: string;
  version: string | null;
  latencyMs: number | null;
  lastCheckedAt: string;
  error: string | null;
}

export interface ChaosScenario {
  type: string;
  service: string;
  enabled: boolean;
  expiresAt: string | null;
}

export interface ChaosState {
  enabled: boolean;
  environment: string;
  activeScenarios: ChaosScenario[];
}

export interface LogEntry {
  timestamp: string;
  level: string;
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

export interface IncidentTimelineEvent {
  id: string;
  incidentId: string;
  timestamp: string;
  agent: string;
  type: string;
  message: string;
  status: string;
  metadata?: string | null;
}

export interface Hypothesis {
  id: string;
  incidentId: string;
  cause: string;
  confidence: number;
  evidence: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface RemediationAction {
  id: string;
  incidentId: string;
  order: number;
  title: string;
  description: string;
  riskLevel: string;
  riskScore: number;
  requiresApproval: boolean;
  status: string;
  executedAt?: string | null;
  createdAt: string;
}

export interface Postmortem {
  id: string;
  incidentId: string;
  title: string;
  summary: string;
  rootCause: string;
  timelineMarkdown: string;
  contributingFactors: string;
  correctiveActions: string;
}

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  category?: string | null;
  serviceId: string;
  serviceName: string;
  startedAt: string;
  resolvedAt?: string | null;
  mttdSeconds?: number | null;
  mttrSeconds?: number | null;
  timeline: IncidentTimelineEvent[];
  hypotheses: Hypothesis[];
  remediationPlan: RemediationAction[];
  postmortem?: Postmortem | null;
  createdAt: string;
  updatedAt: string;
}

export interface RealDashboardData {
  monitoring: MonitoringOverview;
  observabilityHealth: ObservabilityHealth;
  servicesReliability: ServiceReliability[];
  servicesHealth: ServiceHealth[];
  chaosState: ChaosState;
  activeIncidents: Incident[];
}

const GRAPHQL_URL = process.env.API_URL ?? 'http://127.0.0.1:4000/graphql';

async function fetchGraphQL<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(6000),
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`GraphQL returned HTTP ${response.status}`);
  }

  const result = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (result.errors?.length || !result.data) {
    const errorMsg = result.errors?.[0]?.message ?? 'Unknown GraphQL error';
    throw new Error(errorMsg);
  }

  return result.data;
}

export async function getDashboard(): Promise<MonitoringOverview> {
  const data = await fetchGraphQL<{ monitoring: MonitoringOverview }>(`
    query Dashboard {
      monitoring {
        source
        windowSeconds
        intervalSeconds
        generatedAt
        monitors {
          id
          name
          url
          status
          availability
          latencyP95
          errorRate
          sampleCount
          failedChecks
          lastCheckedAt
          lastStatusCode
          lastError
          history {
            id
            checkedAt
            success
            durationMs
            statusCode
            error
          }
        }
      }
    }
  `);
  return data.monitoring;
}

export async function getRealDashboardData(): Promise<RealDashboardData> {
  const query = `
    query RealDashboard {
      monitoring {
        source
        windowSeconds
        intervalSeconds
        generatedAt
        monitors {
          id
          name
          url
          status
          availability
          latencyP95
          errorRate
          sampleCount
          failedChecks
          lastCheckedAt
          lastStatusCode
          lastError
          history {
            id
            checkedAt
            success
            durationMs
            statusCode
            error
          }
        }
      }
      observabilityHealth {
        prometheus { status latencyMs lastCheckedAt error }
        loki { status latencyMs lastCheckedAt error }
        tempo { status latencyMs lastCheckedAt error }
        grafana { status latencyMs lastCheckedAt error }
        collector { status latencyMs lastCheckedAt error }
      }
      servicesReliability {
        service
        state
        window
        lastUpdatedAt
        observedAt
        requestsPerSecond
        availability
        latencyP50
        latencyP95
        latencyP99
        latencySli
        errorRate
        burnRate
        burnLevel
        sloStatus
      }
      servicesHealth {
        service
        url
        status
        version
        latencyMs
        lastCheckedAt
        error
      }
      chaosState {
        enabled
        environment
        activeScenarios {
          type
          service
          enabled
          expiresAt
        }
      }
      activeIncidents {
        id
        title
        description
        severity
        status
        category
        serviceId
        serviceName
        startedAt
        resolvedAt
        mttdSeconds
        mttrSeconds
        timeline {
          id
          timestamp
          agent
          type
          message
          status
        }
        remediationPlan {
          id
          order
          title
          description
          riskLevel
          riskScore
          requiresApproval
          status
        }
      }
    }
  `;
  return fetchGraphQL<RealDashboardData>(query);
}

export async function getServiceLogs(
  service: string,
  range = '15m',
  level?: string,
  limit = 30,
): Promise<LogEntry[]> {
  const query = `
    query ServiceLogs($service: String!, $range: String, $level: String, $limit: Int) {
      serviceLogs(service: $service, range: $range, level: $level, limit: $limit) {
        timestamp
        level
        service
        environment
        traceId
        spanId
        requestId
        message
        durationMs
        route
        statusCode
        error
      }
    }
  `;
  const data = await fetchGraphQL<{ serviceLogs: LogEntry[] }>(query, {
    service,
    range,
    level,
    limit,
  });
  return data.serviceLogs;
}

export async function getServiceTraces(
  service: string,
  minDurationMs = 0,
  onlyErrors = false,
  limit = 10,
): Promise<Trace[]> {
  const query = `
    query ServiceTraces($service: String!, $minDurationMs: Int, $onlyErrors: Boolean, $limit: Int) {
      serviceTraces(service: $service, minDurationMs: $minDurationMs, onlyErrors: $onlyErrors, limit: $limit) {
        id
        name
        totalDurationMs
        spans {
          id
          name
          service
          startOffsetMs
          durationMs
          isAnomalous
          statusCode
          error
        }
      }
    }
  `;
  const data = await fetchGraphQL<{ serviceTraces: Trace[] }>(query, {
    service,
    minDurationMs,
    onlyErrors,
    limit,
  });
  return data.serviceTraces;
}

export async function getTrace(traceId: string): Promise<Trace | null> {
  const query = `
    query GetTrace($traceId: ID!) {
      trace(traceId: $traceId) {
        id
        name
        totalDurationMs
        spans {
          id
          name
          service
          startOffsetMs
          durationMs
          isAnomalous
          statusCode
          error
        }
      }
    }
  `;
  const data = await fetchGraphQL<{ trace: Trace | null }>(query, { traceId });
  return data.trace;
}

export async function getIncident(id: string): Promise<Incident | null> {
  const query = `
    query GetIncident($id: ID!) {
      incident(id: $id) {
        id
        title
        description
        severity
        status
        category
        serviceId
        serviceName
        startedAt
        resolvedAt
        mttdSeconds
        mttrSeconds
        timeline {
          id
          timestamp
          agent
          type
          message
          status
          metadata
        }
        hypotheses {
          id
          cause
          confidence
          evidence
          isPrimary
          createdAt
        }
        remediationPlan {
          id
          order
          title
          description
          riskLevel
          riskScore
          requiresApproval
          status
          executedAt
          createdAt
        }
        postmortem {
          id
          title
          summary
          rootCause
          timelineMarkdown
          contributingFactors
          correctiveActions
        }
      }
    }
  `;
  const data = await fetchGraphQL<{ incident: Incident | null }>(query, { id });
  return data.incident;
}

export async function approveRemediation(incidentId: string, actionId?: string): Promise<Incident | null> {
  const query = `
    mutation ApproveRemediation($incidentId: ID!, $actionId: ID) {
      approveRemediation(incidentId: $incidentId, actionId: $actionId) {
        id
        status
        resolvedAt
        mttrSeconds
        timeline {
          id
          timestamp
          agent
          type
          message
          status
        }
        remediationPlan {
          id
          status
          executedAt
        }
      }
    }
  `;
  const data = await fetchGraphQL<{ approveRemediation: Incident | null }>(query, { incidentId, actionId });
  return data.approveRemediation;
}

export async function rejectRemediation(incidentId: string, reason?: string): Promise<Incident | null> {
  const query = `
    mutation RejectRemediation($incidentId: ID!, $reason: String) {
      rejectRemediation(incidentId: $incidentId, reason: $reason) {
        id
        status
        timeline {
          id
          timestamp
          agent
          type
          message
          status
        }
        remediationPlan {
          id
          status
        }
      }
    }
  `;
  const data = await fetchGraphQL<{ rejectRemediation: Incident | null }>(query, { incidentId, reason });
  return data.rejectRemediation;
}

export async function enableChaos(
  service: string,
  scenario: string,
  paramsJson?: string,
  ttlMinutes = 10,
): Promise<boolean> {
  const query = `
    mutation EnableChaos($service: String!, $scenario: String!, $paramsJson: String, $ttlMinutes: Int) {
      enableChaos(service: $service, scenario: $scenario, paramsJson: $paramsJson, ttlMinutes: $ttlMinutes)
    }
  `;
  const data = await fetchGraphQL<{ enableChaos: boolean }>(query, {
    service,
    scenario,
    paramsJson,
    ttlMinutes,
  });
  return data.enableChaos;
}

export async function resetAllChaos(): Promise<boolean> {
  const query = `
    mutation ResetAllChaos {
      resetAllChaos
    }
  `;
  const data = await fetchGraphQL<{ resetAllChaos: boolean }>(query);
  return data.resetAllChaos;
}
