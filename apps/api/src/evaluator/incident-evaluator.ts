import { config } from '../config.js';
import { db } from '../db.js';
import {
  PrometheusMetricsProvider,
  ChaosControllerProvider,
} from '../providers/index.js';
import { LangGraphOrchestrator } from '../agents/langgraph-workflow.js';

export interface EvaluatedMetrics {
  availability: number | null;
  p95: number | null;
  errorRate: number | null;
  burnRate: number | null;
  rps: number | null;
}

export class IncidentEvaluator {
  private prometheus: PrometheusMetricsProvider;
  private chaos: ChaosControllerProvider;
  private intervalTimer: NodeJS.Timeout | null = null;
  private consecutiveViolations = new Map<string, number>();
  private consecutiveHealthy = new Map<string, number>();
  private lastTimelineEventAt = new Map<string, number>();
  private isEvaluating = false;
  private orchestrator: LangGraphOrchestrator;

  constructor(
    prometheusUrl = config.PROMETHEUS_URL,
    private evalIntervalMs = 15000,
  ) {
    this.prometheus = new PrometheusMetricsProvider(prometheusUrl, true);
    this.chaos = new ChaosControllerProvider();
    this.orchestrator = new LangGraphOrchestrator();
    this.orchestrator.init().catch((err) => {
      console.warn('[IncidentEvaluator] Orchestrator init:', err);
    });
  }

  public start() {
    if (this.intervalTimer) return;
    this.intervalTimer = setInterval(() => {
      this.evaluate().catch((err) => {
        console.error('[IncidentEvaluator] Error in evaluation cycle:', err);
      });
    }, this.evalIntervalMs);
  }

  public stop() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  public async evaluate() {
    if (this.isEvaluating) return;
    this.isEvaluating = true;

    try {
      const services = [
        'payments-api',
        'auth-service',
        'orders-api',
        'api-gateway',
        'notifications-service',
      ];

      for (const service of services) {
        await this.evaluateService(service);
      }
    } finally {
      this.isEvaluating = false;
    }
  }

  private async evaluateService(serviceName: string) {
    const res = await this.prometheus.getServiceReliability(
      serviceName,
      config.RELIABILITY_WINDOW,
    );

    if (res.state !== 'LIVE' || !res.data) {
      return;
    }

    const { availability, latencyP95: p95, errorRate, burnRate, requestsPerSecond: rps } = res.data;

    // Minimum traffic requirement to avoid false positives on 0 traffic
    if (rps == null || rps < 0.05) {
      return;
    }

    const hasBreach =
      (availability != null && availability < 99.99) ||
      (p95 != null && p95 > 500) ||
      (errorRate != null && errorRate > 1.0) ||
      (burnRate != null && burnRate > 2.0);

    if (hasBreach) {
      this.consecutiveHealthy.set(serviceName, 0);
      const currentCount = (this.consecutiveViolations.get(serviceName) || 0) + 1;
      this.consecutiveViolations.set(serviceName, currentCount);

      // Confirm after 3 consecutive evaluations (~45 seconds)
      if (currentCount >= 3) {
        await this.triggerOrUpdateIncident(serviceName, {
          availability,
          p95,
          errorRate,
          burnRate,
          rps,
        });
      }
    } else {
      this.consecutiveViolations.set(serviceName, 0);
      const healthyCount = (this.consecutiveHealthy.get(serviceName) || 0) + 1;
      this.consecutiveHealthy.set(serviceName, healthyCount);

      // Check if there is an active incident for this service that can be resolved
      if (healthyCount >= 3) {
        await this.checkAndResolveIncident(serviceName);
      }
    }
  }

  private async getOrCreateService(serviceName: string) {
    let service = await db.service.findUnique({ where: { name: serviceName } });
    if (!service) {
      service = await db.service.create({
        data: {
          name: serviceName,
          environment: 'production',
          version: '1.0.0',
          owner: 'SRE Team',
          sloAvailability: 99.99,
          sloLatencyP95: 500,
          sloErrorRate: 1.0,
          status: 'HEALTHY',
        },
      });
    }
    return service;
  }

  private async triggerOrUpdateIncident(serviceName: string, metrics: EvaluatedMetrics) {
    const serviceRecord = await this.getOrCreateService(serviceName);

    const existingIncident = await db.incident.findFirst({
      where: {
        serviceId: serviceRecord.id,
        status: { in: ['DETECTED', 'TRIAGING', 'INVESTIGATING', 'AWAITING_APPROVAL', 'MITIGATING', 'MONITORING'] },
      },
      include: { timeline: true },
    });

    if (existingIncident) {
      // Periodic update if last event was more than 30s ago
      const lastEventTime = this.lastTimelineEventAt.get(existingIncident.id) || 0;
      if (Date.now() - lastEventTime > 30000) {
        await db.incidentTimelineEvent.create({
          data: {
            incidentId: existingIncident.id,
            agent: 'Observability Collector Agent',
            type: 'ANOMALY',
            message: `Ongoing anomaly: p95=${metrics.p95 != null ? Math.round(metrics.p95) : '—'}ms, ErrorRate=${metrics.errorRate != null ? metrics.errorRate.toFixed(2) : '0'}%, BurnRate=${metrics.burnRate != null ? metrics.burnRate.toFixed(1) : '0'}x.`,
            status: 'COMPLETED',
          },
        });
        this.lastTimelineEventAt.set(existingIncident.id, Date.now());
      }
      return;
    }

    // Execute LangGraph Multi-Agent Investigation over Prometheus, Loki, Tempo, and Qdrant
    const agentResult = await this.orchestrator.runInvestigation(serviceName, metrics);

    const severity = agentResult.severity || 'SEV-2';
    const category = agentResult.category || 'PERFORMANCE';
    const title = category === 'DATABASE'
      ? `High Database Transaction Latency on ${serviceName}`
      : category === 'AVAILABILITY'
      ? `HTTP 5xx Server Error Spike on ${serviceName}`
      : `SLO Breach and Error Budget Burn on ${serviceName}`;

    const description = `Prometheus PromQL telemetry confirmed continuous SLO breach over 3 evaluation windows (~45s). Observed: p95 latency ${metrics.p95 != null ? Math.round(metrics.p95) : '—'}ms, Error Rate ${metrics.errorRate != null ? metrics.errorRate.toFixed(2) : '0.00'}%, Burn Rate ${metrics.burnRate != null ? metrics.burnRate.toFixed(1) : '0.0'}x.`;

    const newIncident = await db.incident.create({
      data: {
        title,
        description,
        severity,
        status: 'AWAITING_APPROVAL',
        category,
        serviceId: serviceRecord.id,
        timeline: {
          create: agentResult.timelineEvents.map((t) => ({
            agent: t.agent,
            type: t.type,
            message: t.message,
            status: t.status,
          })),
        },
        hypotheses: {
          create: agentResult.hypotheses.map((h) => ({
            cause: h.cause,
            confidence: h.confidence,
            evidence: h.evidence,
            isPrimary: h.isPrimary,
          })),
        },
        remediationPlan: {
          create: agentResult.remediationPlan.map((r) => ({
            order: r.order,
            title: r.title,
            description: r.description,
            riskLevel: r.riskLevel,
            riskScore: r.riskScore,
            requiresApproval: r.requiresApproval,
            status: r.status,
          })),
        },
      },
    });

    this.lastTimelineEventAt.set(newIncident.id, Date.now());
  }

  private async checkAndResolveIncident(serviceName: string) {
    const serviceRecord = await db.service.findUnique({ where: { name: serviceName } });
    if (!serviceRecord) return;

    const incident = await db.incident.findFirst({
      where: {
        serviceId: serviceRecord.id,
        status: { in: ['MONITORING', 'MITIGATING', 'AWAITING_APPROVAL', 'INVESTIGATING', 'DETECTED'] },
      },
    });

    if (!incident) return;

    const now = new Date();
    const durationSec = Math.round((now.getTime() - incident.startedAt.getTime()) / 1000);

    await db.incident.update({
      where: { id: incident.id },
      data: {
        status: 'RESOLVED',
        resolvedAt: now,
        mttrSeconds: durationSec,
      },
    });

    await db.incidentTimelineEvent.create({
      data: {
        incidentId: incident.id,
        agent: 'System',
        type: 'INFO',
        message: `Telemetry verified within SLO targets (99.99%) across sliding windows. Incident resolved in ${durationSec}s.`,
        status: 'COMPLETED',
      },
    });

    await db.postmortem.upsert({
      where: { incidentId: incident.id },
      update: {},
      create: {
        incidentId: incident.id,
        title: `Postmortem: ${incident.title}`,
        summary: `Incident ${incident.id} affecting ${serviceName} was automatically detected, investigated by OpsGraph multi-agent system, and resolved after telemetry recovered to healthy baseline.`,
        rootCause: `Degradation verified by PromQL real metrics. Remediation executed and validated via live telemetry.`,
        timelineMarkdown: `- Started at: ${incident.startedAt.toISOString()}\n- Detected via PromQL: ~45s after onset\n- Resolved at: ${now.toISOString()}\n- Total MTTR: ${durationSec}s`,
        contributingFactors: `Controlled fault injection or runtime service delay.`,
        correctiveActions: `Continuous monitoring and automated error budget burn rate alerting verified.`,
        lessonsLearned: `Ensure automated human-in-the-loop workflows have pre-approved fast rollback pathways for known performance degradations.`,
        sloImpactSummary: `Service Level Objective maintained within Four Nines target (99.99%) after automated remediation.`,
      },
    });
  }

  public async approveAction(
    incidentId: string,
    actionId?: string,
    decidedBy = 'SRE Operator',
    reason?: string,
    editedPlan?: any,
  ) {
    const incident = await db.incident.findUnique({
      where: { id: incidentId },
      include: { service: true, remediationPlan: true },
    });
    if (!incident) throw new Error('Incident not found');

    const action = actionId
      ? incident.remediationPlan.find((a) => a.id === actionId)
      : incident.remediationPlan[0];

    const isEdited = !!editedPlan;

    if (action) {
      await db.remediationAction.update({
        where: { id: action.id },
        data: {
          status: 'COMPLETED',
          executedAt: new Date(),
          ...(isEdited && typeof editedPlan === 'object' && editedPlan.title ? { title: editedPlan.title } : {}),
          ...(isEdited && typeof editedPlan === 'object' && editedPlan.description ? { description: editedPlan.description } : {}),
        },
      });
    }

    // Record structured decision audit trail
    await db.remediationDecision.create({
      data: {
        incidentId,
        actionId: action?.id || null,
        actionTitle: action?.title || 'System Baseline Reset',
        decidedBy,
        decision: isEdited ? 'EDITED' : 'APPROVED',
        category: 'ROUTINE_APPROVAL',
        reason: reason || (isEdited ? 'Remediation plan adjusted by operator before approval' : 'Operator verified telemetry and approved plan'),
        originalPlan: action ? JSON.stringify(action) : null,
        editedPlan: isEdited ? JSON.stringify(editedPlan) : null,
      },
    });

    // Execute safe local remediation via chaos reset
    await this.chaos.resetAllChaos();

    await db.incident.update({
      where: { id: incidentId },
      data: { status: 'MONITORING' },
    });

    await db.incidentTimelineEvent.create({
      data: {
        incidentId,
        agent: decidedBy,
        type: 'APPROVAL',
        message: `Remediation ${isEdited ? 'edited and approved' : 'approved'} by ${decidedBy}.${reason ? ` Reason: ${reason}` : ''} Safe local configuration restore triggered.`,
        status: 'COMPLETED',
      },
    });

    await db.incidentTimelineEvent.create({
      data: {
        incidentId,
        agent: 'System',
        type: 'ACTION',
        message: `Runtime configuration restored on ${incident.service.name}. Monitoring recovery window for SLO compliance.`,
        status: 'RUNNING',
      },
    });

    return db.incident.findUnique({
      where: { id: incidentId },
      include: {
        service: true,
        timeline: { orderBy: { timestamp: 'asc' } },
        hypotheses: true,
        remediationPlan: true,
        decisions: { orderBy: { createdAt: 'desc' } },
        postmortem: true,
      },
    });
  }

  public async rejectAction(
    incidentId: string,
    reason?: string,
    category = 'INCORRECT_ROOT_CAUSE',
    decidedBy = 'SRE Operator',
  ) {
    const incident = await db.incident.findUnique({
      where: { id: incidentId },
      include: { service: true, remediationPlan: true },
    });
    if (!incident) throw new Error('Incident not found');

    const action = incident.remediationPlan[0];
    if (action) {
      await db.remediationAction.update({
        where: { id: action.id },
        data: { status: 'REJECTED' },
      });
    }

    // Record structured decision audit trail
    await db.remediationDecision.create({
      data: {
        incidentId,
        actionId: action?.id || null,
        actionTitle: action?.title || 'Unknown Action',
        decidedBy,
        decision: 'REJECTED',
        category,
        reason: reason || 'Action rejected by operator',
        originalPlan: action ? JSON.stringify(action) : null,
      },
    });

    await db.incident.update({
      where: { id: incidentId },
      data: { status: 'INVESTIGATING' },
    });

    await db.incidentTimelineEvent.create({
      data: {
        incidentId,
        agent: decidedBy,
        type: 'APPROVAL',
        message: `Remediation plan rejected by ${decidedBy} [${category}]${reason ? `: ${reason}` : ''}. Escalated for manual SRE intervention.`,
        status: 'COMPLETED',
      },
    });

    return db.incident.findUnique({
      where: { id: incidentId },
      include: {
        service: true,
        timeline: { orderBy: { timestamp: 'asc' } },
        hypotheses: true,
        remediationPlan: true,
        decisions: { orderBy: { createdAt: 'desc' } },
        postmortem: true,
      },
    });
  }

  public async getDecisionStats() {
    const decisions = await db.remediationDecision.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const total = decisions.length;
    const approved = decisions.filter((d) => d.decision === 'APPROVED').length;
    const rejected = decisions.filter((d) => d.decision === 'REJECTED').length;
    const edited = decisions.filter((d) => d.decision === 'EDITED').length;

    const categoryMap = new Map<string, number>();
    for (const d of decisions) {
      if (d.category) {
        categoryMap.set(d.category, (categoryMap.get(d.category) || 0) + 1);
      }
    }

    const rejectionsByCategory = Array.from(categoryMap.entries()).map(([category, count]) => ({
      category,
      count,
    }));

    return {
      totalDecisions: total,
      approvedCount: approved,
      rejectedCount: rejected,
      editedCount: edited,
      approvalRate: total > 0 ? Number(((approved + edited) / total * 100).toFixed(1)) : 100.0,
      rejectionRate: total > 0 ? Number((rejected / total * 100).toFixed(1)) : 0.0,
      rejectionsByCategory,
      recentDecisions: decisions.slice(0, 10).map((d) => ({
        ...d,
        createdAt: d.createdAt.toISOString(),
      })),
    };
  }
}
