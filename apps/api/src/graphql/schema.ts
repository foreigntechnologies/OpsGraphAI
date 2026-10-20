import { createSchema, createYoga, createPubSub } from 'graphql-yoga';
import { config } from '../config.js';
import { db } from '../db.js';
import { getMonitoringOverview } from '../monitoring/overview.js';
import {
  PrometheusMetricsProvider,
  LokiLogsProvider,
  TempoTracingProvider,
  HttpHealthProvider,
  ObservabilityHealthProvider,
  ChaosControllerProvider,
} from '../providers/index.js';
import { IncidentEvaluator } from '../evaluator/incident-evaluator.js';
import type { ChaosScenarioType } from '@opsgraph/shared';

export const pubsub = createPubSub<{
  incidentUpdated: [incident: any];
  reliabilityUpdated: [metrics: any[]];
}>();

const prometheus = new PrometheusMetricsProvider(config.PROMETHEUS_URL, true);
const loki = new LokiLogsProvider();
const tempo = new TempoTracingProvider();
const health = new HttpHealthProvider();
const obsHealth = new ObservabilityHealthProvider();
const chaos = new ChaosControllerProvider();
export const incidentEvaluator = new IncidentEvaluator(config.PROMETHEUS_URL);

const SERVICES = [
  'api-gateway',
  'auth-service',
  'payments-api',
  'orders-api',
  'notifications-service',
];

const formatIncident = (inc: any) => ({
  ...inc,
  serviceName: inc.service?.name || inc.serviceId,
  startedAt: inc.startedAt.toISOString(),
  resolvedAt: inc.resolvedAt?.toISOString() || null,
  createdAt: inc.createdAt.toISOString(),
  updatedAt: inc.updatedAt.toISOString(),
  timeline: (inc.timeline || []).map((t: any) => ({
    ...t,
    timestamp: t.timestamp.toISOString(),
  })),
  hypotheses: (inc.hypotheses || []).map((h: any) => ({
    ...h,
    createdAt: h.createdAt.toISOString(),
  })),
  remediationPlan: (inc.remediationPlan || []).map((r: any) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    executedAt: r.executedAt?.toISOString() || null,
  })),
  decisions: (inc.decisions || []).map((d: any) => ({
    ...d,
    createdAt: d.createdAt.toISOString(),
  })),
});

export function createApi() {
  return createYoga({
    graphqlEndpoint: '/graphql',
    cors: { origin: config.WEB_ORIGIN, credentials: false },
    schema: createSchema({
      typeDefs: /* GraphQL */ `
        enum DataState {
          LIVE
          STALE
          NO_DATA
          DISCONNECTED
          DEGRADED
        }

        enum SloState {
          HEALTHY
          AT_RISK
          BREACHED
        }

        enum IntegrationStatus {
          CONNECTED
          DEGRADED
          DISCONNECTED
        }

        type ProviderHealth {
          status: IntegrationStatus!
          latencyMs: Int
          lastCheckedAt: String!
          error: String
        }

        type ObservabilityHealth {
          prometheus: ProviderHealth!
          loki: ProviderHealth!
          tempo: ProviderHealth!
          grafana: ProviderHealth!
          collector: ProviderHealth!
        }

        type ServiceReliability {
          service: String!
          state: DataState!
          window: String!
          lastUpdatedAt: String!
          observedAt: String
          requestsPerSecond: Float
          availability: Float
          latencyP50: Float
          latencyP95: Float
          latencyP99: Float
          latencySli: Float
          errorRate: Float
          burnRate: Float
          burnLevel: String
          sloStatus: SloState
        }

        type ServiceHealth {
          service: String!
          url: String!
          status: String!
          version: String
          latencyMs: Int
          lastCheckedAt: String!
          error: String
        }

        type LogEntry {
          timestamp: String!
          level: String!
          service: String!
          environment: String
          traceId: String
          spanId: String
          requestId: String
          message: String!
          durationMs: Int
          route: String
          statusCode: Int
          error: String
        }

        type TraceSpan {
          id: ID!
          name: String!
          service: String!
          startOffsetMs: Int!
          durationMs: Int!
          isAnomalous: Boolean!
          statusCode: Int
          error: String
        }

        type Trace {
          id: ID!
          name: String!
          totalDurationMs: Int!
          spans: [TraceSpan!]!
        }

        type ChaosScenario {
          type: String!
          service: String!
          enabled: Boolean!
          expiresAt: String
        }

        type ChaosState {
          enabled: Boolean!
          environment: String!
          activeScenarios: [ChaosScenario!]!
        }

        type HttpCheck {
          id: ID!
          checkedAt: String!
          success: Boolean!
          durationMs: Int!
          statusCode: Int
          error: String
        }

        type HttpMonitor {
          id: ID!
          name: String!
          url: String!
          status: String!
          availability: Float
          latencyP95: Int
          errorRate: Float
          sampleCount: Int!
          failedChecks: Int!
          lastCheckedAt: String
          lastStatusCode: Int
          lastError: String
          history: [HttpCheck!]!
        }

        type MonitoringOverview {
          source: String!
          windowSeconds: Int!
          intervalSeconds: Int!
          generatedAt: String!
          monitors: [HttpMonitor!]!
        }

        type IncidentTimelineEvent {
          id: ID!
          incidentId: String!
          timestamp: String!
          agent: String!
          type: String!
          message: String!
          status: String!
          metadata: String
        }

        type Hypothesis {
          id: ID!
          incidentId: String!
          cause: String!
          confidence: Float!
          evidence: String!
          isPrimary: Boolean!
          createdAt: String!
        }

        type RemediationAction {
          id: ID!
          incidentId: String!
          order: Int!
          title: String!
          description: String!
          riskLevel: String!
          riskScore: Int!
          requiresApproval: Boolean!
          status: String!
          executedAt: String
          createdAt: String!
        }

        type RemediationDecision {
          id: ID!
          incidentId: String!
          actionId: String
          actionTitle: String
          decidedBy: String!
          decision: String!
          category: String
          reason: String
          originalPlan: String
          editedPlan: String
          createdAt: String!
        }

        type CategoryBreakdown {
          category: String!
          count: Int!
        }

        type DecisionStats {
          totalDecisions: Int!
          approvedCount: Int!
          rejectedCount: Int!
          editedCount: Int!
          approvalRate: Float!
          rejectionRate: Float!
          rejectionsByCategory: [CategoryBreakdown!]!
          recentDecisions: [RemediationDecision!]!
        }

        type Postmortem {
          id: ID!
          incidentId: String!
          title: String!
          summary: String!
          rootCause: String!
          timelineMarkdown: String!
          contributingFactors: String!
          correctiveActions: String!
        }

        type Incident {
          id: ID!
          title: String!
          description: String!
          severity: String!
          status: String!
          category: String
          serviceId: String!
          serviceName: String!
          startedAt: String!
          resolvedAt: String
          mttdSeconds: Int
          mttrSeconds: Int
          timeline: [IncidentTimelineEvent!]!
          hypotheses: [Hypothesis!]!
          remediationPlan: [RemediationAction!]!
          decisions: [RemediationDecision!]!
          postmortem: Postmortem
          createdAt: String!
          updatedAt: String!
        }

        type Query {
          monitoring: MonitoringOverview!
          observabilityHealth: ObservabilityHealth!
          serviceReliability(service: String!, window: String): ServiceReliability
          servicesReliability(window: String): [ServiceReliability!]!
          servicesHealth: [ServiceHealth!]!
          serviceLogs(service: String!, range: String, level: String, limit: Int): [LogEntry!]!
          serviceTraces(service: String!, minDurationMs: Int, onlyErrors: Boolean, limit: Int): [Trace!]!
          trace(traceId: ID!): Trace
          chaosState: ChaosState!
          activeIncidents: [Incident!]!
          incidents(limit: Int): [Incident!]!
          incident(id: ID!): Incident
          decisionStats: DecisionStats!
        }

        type Mutation {
          enableChaos(service: String!, scenario: String!, paramsJson: String, ttlMinutes: Int): Boolean!
          resetAllChaos: Boolean!
          approveRemediation(
            incidentId: ID!
            actionId: ID
            decidedBy: String
            reason: String
            editedPlanJson: String
          ): Incident
          rejectRemediation(
            incidentId: ID!
            reason: String
            category: String
            decidedBy: String
          ): Incident
          resolveIncident(id: ID!): Incident
        }

        type Subscription {
          incidentUpdated: Incident
          reliabilityUpdated: [ServiceReliability!]!
        }
      `,
      resolvers: {
        Query: {
          monitoring: getMonitoringOverview,
          observabilityHealth: () => obsHealth.getHealth(),
          serviceReliability: async (_parent, args: { service: string; window?: string }) => {
            const res = await prometheus.getServiceReliability(args.service, args.window || config.RELIABILITY_WINDOW);
            return res.data;
          },
          servicesReliability: async (_parent, args: { window?: string }) => {
            const results = await Promise.all(
              SERVICES.map(async (svc) => {
                const res = await prometheus.getServiceReliability(svc, args.window || config.RELIABILITY_WINDOW);
                return (
                  res.data || {
                    service: svc,
                    state: res.state,
                    window: args.window || config.RELIABILITY_WINDOW,
                    lastUpdatedAt: res.fetchedAt,
                    observedAt: null,
                    requestsPerSecond: null,
                    availability: null,
                    latencyP50: null,
                    latencyP95: null,
                    latencyP99: null,
                    latencySli: null,
                    errorRate: null,
                    burnRate: null,
                    burnLevel: null,
                    sloStatus: null,
                  }
                );
              }),
            );
            return results;
          },
          servicesHealth: () => health.getAllHealth(),
          serviceLogs: async (_parent, args: { service: string; range?: string; level?: string; limit?: number }) => {
            const res = await loki.searchLogs(args.service, args.range || '15m', args.level, args.limit || 30);
            return res.data || [];
          },
          serviceTraces: async (
            _parent,
            args: { service: string; minDurationMs?: number; onlyErrors?: boolean; limit?: number },
          ) => {
            const res = await tempo.searchTraces(args.service, args.minDurationMs || 0, args.onlyErrors || false, args.limit || 10);
            return res.data || [];
          },
          trace: async (_parent, args: { traceId: string }) => {
            const res = await tempo.getTrace(args.traceId);
            return res.data;
          },
          chaosState: () => chaos.getAggregatedChaosState(),
          activeIncidents: async () => {
            const list = await db.incident.findMany({
              where: {
                status: {
                  in: [
                    'DETECTED',
                    'TRIAGING',
                    'INVESTIGATING',
                    'AWAITING_APPROVAL',
                    'MITIGATING',
                    'MONITORING',
                  ],
                },
              },
              include: {
                service: true,
                timeline: { orderBy: { timestamp: 'asc' } },
                hypotheses: true,
                remediationPlan: { orderBy: { order: 'asc' } },
                decisions: { orderBy: { createdAt: 'desc' } },
                postmortem: true,
              },
              orderBy: { startedAt: 'desc' },
            });
            return list.map(formatIncident);
          },
          incidents: async (_parent, args: { limit?: number }) => {
            const list = await db.incident.findMany({
              take: args.limit || 20,
              include: {
                service: true,
                timeline: { orderBy: { timestamp: 'asc' } },
                hypotheses: true,
                remediationPlan: { orderBy: { order: 'asc' } },
                decisions: { orderBy: { createdAt: 'desc' } },
                postmortem: true,
              },
              orderBy: { startedAt: 'desc' },
            });
            return list.map(formatIncident);
          },
          incident: async (_parent, args: { id: string }) => {
            const inc = await db.incident.findUnique({
              where: { id: args.id },
              include: {
                service: true,
                timeline: { orderBy: { timestamp: 'asc' } },
                hypotheses: true,
                remediationPlan: { orderBy: { order: 'asc' } },
                decisions: { orderBy: { createdAt: 'desc' } },
                postmortem: true,
              },
            });
            return inc ? formatIncident(inc) : null;
          },
          decisionStats: () => incidentEvaluator.getDecisionStats(),
        },
        Mutation: {
          enableChaos: async (
            _parent,
            args: { service: string; scenario: string; paramsJson?: string; ttlMinutes?: number },
          ) => {
            let params = {};
            if (args.paramsJson) {
              try {
                params = JSON.parse(args.paramsJson);
              } catch {}
            }
            return chaos.enableScenario(
              args.service,
              args.scenario as ChaosScenarioType,
              params,
              args.ttlMinutes || 10,
            );
          },
          resetAllChaos: () => chaos.resetAllChaos(),
          approveRemediation: async (
            _parent,
            args: {
              incidentId: string;
              actionId?: string;
              decidedBy?: string;
              reason?: string;
              editedPlanJson?: string;
            },
          ) => {
            let editedPlan: any = undefined;
            if (args.editedPlanJson) {
              try {
                editedPlan = JSON.parse(args.editedPlanJson);
              } catch {}
            }
            const inc = await incidentEvaluator.approveAction(
              args.incidentId,
              args.actionId,
              args.decidedBy,
              args.reason,
              editedPlan,
            );
            const formatted = inc ? formatIncident(inc) : null;
            if (formatted) pubsub.publish('incidentUpdated', formatted);
            return formatted;
          },
          rejectRemediation: async (
            _parent,
            args: {
              incidentId: string;
              reason?: string;
              category?: string;
              decidedBy?: string;
            },
          ) => {
            const inc = await incidentEvaluator.rejectAction(
              args.incidentId,
              args.reason,
              args.category,
              args.decidedBy,
            );
            const formatted = inc ? formatIncident(inc) : null;
            if (formatted) pubsub.publish('incidentUpdated', formatted);
            return formatted;
          },
          resolveIncident: async (_parent, args: { id: string }) => {
            const now = new Date();
            const inc = await db.incident.update({
              where: { id: args.id },
              data: { status: 'RESOLVED', resolvedAt: now },
              include: {
                service: true,
                timeline: { orderBy: { timestamp: 'asc' } },
                hypotheses: true,
                remediationPlan: true,
                postmortem: true,
              },
            });
            const formatted = formatIncident(inc);
            pubsub.publish('incidentUpdated', formatted);
            return formatted;
          },
        },
        Subscription: {
          incidentUpdated: {
            subscribe: () => pubsub.subscribe('incidentUpdated'),
            resolve: (payload: any) => payload,
          },
          reliabilityUpdated: {
            subscribe: () => pubsub.subscribe('reliabilityUpdated'),
            resolve: (payload: any) => payload,
          },
        },
      },
    }),
  });
}
