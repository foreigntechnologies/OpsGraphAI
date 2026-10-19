import { StateGraph, Annotation, END, START } from '@langchain/langgraph';
import { AgentTools, type ObservabilityEvidence } from './tools.js';

export interface WorkflowTimelineEvent {
  agent: string;
  type: string;
  message: string;
  status: string;
}

export interface WorkflowHypothesis {
  cause: string;
  confidence: number;
  evidence: string;
  isPrimary: boolean;
}

export interface WorkflowRemediationAction {
  order: number;
  title: string;
  description: string;
  riskLevel: string;
  riskScore: number;
  requiresApproval: boolean;
  status: string;
}

export const AgentStateAnnotation = Annotation.Root({
  service: Annotation<string>(),
  incidentId: Annotation<string>(),
  severity: Annotation<string>(),
  status: Annotation<string>(),
  category: Annotation<string>(),
  metrics: Annotation<ObservabilityEvidence['metrics']>(),
  logs: Annotation<ObservabilityEvidence['logs']>(),
  traces: Annotation<ObservabilityEvidence['traces']>(),
  runbooks: Annotation<ObservabilityEvidence['runbooks']>(),
  hypotheses: Annotation<WorkflowHypothesis[]>(),
  remediationPlan: Annotation<WorkflowRemediationAction[]>(),
  timelineEvents: Annotation<WorkflowTimelineEvent[]>({
    reducer: (curr, update) => curr.concat(update),
    default: () => [],
  }),
});

export type AgentStateType = typeof AgentStateAnnotation.State;

export class LangGraphOrchestrator {
  private tools: AgentTools;
  private workflow: ReturnType<typeof this.buildGraph>;

  constructor(tools?: AgentTools) {
    this.tools = tools || new AgentTools();
    this.workflow = this.buildGraph();
  }

  public async init() {
    await this.tools.init();
  }

  private buildGraph() {
    const triageNode = async (state: AgentStateType) => {
      const { availability, latencyP95: p95, errorRate, burnRate } = (state.metrics as any) || {};

      let severity = 'SEV-3';
      if ((availability != null && availability < 99.0) || (burnRate != null && burnRate >= 14)) {
        severity = 'SEV-1';
      } else if ((burnRate != null && burnRate >= 6) || (p95 != null && p95 >= 2000)) {
        severity = 'SEV-2';
      }

      let category = 'PERFORMANCE';
      if (p95 != null && p95 > 500) {
        category = 'DATABASE';
      } else if (errorRate != null && errorRate > 1.0) {
        category = 'AVAILABILITY';
      }

      const timelineEvent: WorkflowTimelineEvent = {
        agent: 'Triage Agent',
        type: 'INFO',
        message: `Multi-agent LangGraph workflow initiated. Service ${state.service} classified as ${severity} (${category}).`,
        status: 'COMPLETED',
      };

      return {
        severity,
        category,
        timelineEvents: [timelineEvent],
      };
    };

    const observabilityNode = async (state: AgentStateType) => {
      const evidence = await this.tools.collectMultiSignalEvidence(
        state.service,
        state.category || 'latency',
      );

      const timelineEvent: WorkflowTimelineEvent = {
        agent: 'Observability Collector Agent',
        type: 'INFO',
        message: `Correlated multi-signal telemetry: Prometheus p95=${evidence.metrics.p95 != null ? Math.round(evidence.metrics.p95) : '—'}ms, ErrorRate=${evidence.metrics.errorRate != null ? evidence.metrics.errorRate.toFixed(2) : '0'}%, BurnRate=${evidence.metrics.burnRate != null ? evidence.metrics.burnRate.toFixed(1) : '0'}x. Retrieved ${evidence.traces.length} distributed traces and ${evidence.logs.length} logs.`,
        status: 'COMPLETED',
      };

      return {
        metrics: evidence.metrics,
        logs: evidence.logs,
        traces: evidence.traces,
        runbooks: evidence.runbooks,
        timelineEvents: [timelineEvent],
      };
    };

    const rootCauseNode = async (state: AgentStateType) => {
      const { metrics, traces, runbooks } = state;
      let cause = `SLO degradation observed in ${state.service}`;
      let confidence = 0.92;
      const evidenceItems: string[] = [];

      if (metrics.p95 != null && metrics.p95 > 500) {
        cause = 'PostgreSQL transaction latency delay (SELECT pg_sleep) causing connection pool contention';
        confidence = 0.95;
        evidenceItems.push(`p95 latency reached ${Math.round(metrics.p95)}ms, violating the 500ms target.`);
      } else if (metrics.errorRate != null && metrics.errorRate > 1.0) {
        cause = 'HTTP 500 server error spike injected in request processing middleware';
        confidence = 0.94;
        evidenceItems.push(`Error rate spiked to ${metrics.errorRate.toFixed(2)}%, consuming error budget.`);
      } else {
        cause = 'Cascading timeout from downstream payment dependency';
        confidence = 0.91;
      }

      // Check trace evidence
      if (traces && traces.length > 0) {
        const slowTrace = traces.find((t) => t.totalDurationMs > 500) || traces[0];
        if (slowTrace?.bottleneckSpan) {
          evidenceItems.push(
            `Distributed trace ${slowTrace.id.slice(0, 8)} bottleneck span: ${slowTrace.bottleneckSpan.service} ➔ ${slowTrace.bottleneckSpan.name} (${slowTrace.bottleneckSpan.durationMs}ms).`
          );
        }
      }

      // Check runbook evidence from Qdrant RAG
      if (runbooks && runbooks.length > 0 && runbooks[0]?.doc) {
        const topRunbook = runbooks[0];
        evidenceItems.push(`Matched operational runbook via Qdrant RAG: ${topRunbook.doc.title} (similarity score: ${topRunbook.score}).`);
      }

      const hypothesis: WorkflowHypothesis = {
        cause,
        confidence,
        evidence: JSON.stringify(evidenceItems),
        isPrimary: true,
      };

      const timelineEvent: WorkflowTimelineEvent = {
        agent: 'Root Cause Synthesis Agent',
        type: 'ANOMALY',
        message: `Root cause identified with ${(confidence * 100).toFixed(0)}% confidence: ${cause}.`,
        status: 'COMPLETED',
      };

      return {
        hypotheses: [hypothesis],
        timelineEvents: [timelineEvent],
      };
    };

    const remediationPlannerNode = async (state: AgentStateType) => {
      const action: WorkflowRemediationAction = {
        order: 1,
        title: `Restore runtime configuration on ${state.service}`,
        description: `Trigger runtime configuration restore and clear active fault injection via /admin/chaos API.`,
        riskLevel: 'LOW',
        riskScore: 10,
        requiresApproval: true,
        status: 'PENDING',
      };

      const timelineEvent: WorkflowTimelineEvent = {
        agent: 'Remediation Planner Agent',
        type: 'ACTION',
        message: `Formulated remediation action: ${action.title}. Requires human operator approval.`,
        status: 'WAITING',
      };

      return {
        remediationPlan: [action],
        status: 'AWAITING_APPROVAL',
        timelineEvents: [timelineEvent],
      };
    };

    const approvalNode = async (_state: AgentStateType) => {
      return {};
    };

    const builder = new StateGraph(AgentStateAnnotation)
      .addNode('triage', triageNode)
      .addNode('collect_observability', observabilityNode)
      .addNode('root_cause_synthesis', rootCauseNode)
      .addNode('remediation_planner', remediationPlannerNode)
      .addNode('human_approval', approvalNode)
      .addEdge(START, 'triage')
      .addEdge('triage', 'collect_observability')
      .addEdge('collect_observability', 'root_cause_synthesis')
      .addEdge('root_cause_synthesis', 'remediation_planner')
      .addEdge('remediation_planner', 'human_approval')
      .addEdge('human_approval', END);

    return builder.compile();
  }

  public async runInvestigation(service: string, initialMetrics: any) {
    const initialState = {
      service,
      incidentId: '',
      severity: 'SEV-2',
      status: 'TRIAGING',
      category: 'PERFORMANCE',
      metrics: initialMetrics,
      logs: [],
      traces: [],
      runbooks: [],
      hypotheses: [],
      remediationPlan: [],
      timelineEvents: [],
    };

    const result = await this.workflow.invoke(initialState);
    return result;
  }
}
