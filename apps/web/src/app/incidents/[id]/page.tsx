'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

interface TimelineEvent {
  id: string;
  timestamp: string;
  agent: string;
  type: string;
  message: string;
  status: string;
}

interface Hypothesis {
  id: string;
  cause: string;
  confidence: number;
  evidence: string;
  isPrimary: boolean;
}

interface RemediationAction {
  id: string;
  order: number;
  title: string;
  description: string;
  riskLevel: string;
  riskScore: number;
  requiresApproval: boolean;
  status: string;
  executedAt?: string | null;
}

interface Postmortem {
  id: string;
  title: string;
  summary: string;
  rootCause: string;
  timelineMarkdown: string;
  contributingFactors: string;
  correctiveActions: string;
}

interface IncidentDetail {
  id: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  category?: string | null;
  serviceName: string;
  startedAt: string;
  resolvedAt?: string | null;
  mttdSeconds?: number | null;
  mttrSeconds?: number | null;
  timeline: TimelineEvent[];
  hypotheses: Hypothesis[];
  remediationPlan: RemediationAction[];
  postmortem?: Postmortem | null;
}

export default function IncidentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchIncident = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch('http://127.0.0.1:4000/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query GetIncident($id: ID!) {
            incident(id: $id) {
              id
              title
              description
              severity
              status
              category
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
              hypotheses {
                id
                cause
                confidence
                evidence
                isPrimary
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
          }`,
          variables: { id },
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json?.data?.incident) {
          setIncident(json.data.incident);
        }
      }
    } catch {
      // Graceful error handling
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchIncident();
    const interval = setInterval(fetchIncident, 3000);
    return () => clearInterval(interval);
  }, [fetchIncident]);

  const handleApprove = async (actionId?: string) => {
    if (!id) return;
    setActionLoading(true);
    setActionMsg(null);
    try {
      const res = await fetch('http://127.0.0.1:4000/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation Approve($incidentId: ID!, $actionId: ID) {
            approveRemediation(incidentId: $incidentId, actionId: $actionId) {
              id
              status
            }
          }`,
          variables: { incidentId: id, actionId },
        }),
      });
      const data = await res.json();
      if (data?.errors) {
        setActionMsg({ text: data.errors[0]?.message || 'Approval failed', type: 'error' });
      } else {
        setActionMsg({ text: 'Remediation approved! Runtime restore triggered.', type: 'success' });
        await fetchIncident();
      }
    } catch (err: unknown) {
      setActionMsg({ text: err instanceof Error ? err.message : 'Execution error', type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!id) return;
    setActionLoading(true);
    setActionMsg(null);
    try {
      const res = await fetch('http://127.0.0.1:4000/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `mutation Reject($incidentId: ID!) {
            rejectRemediation(incidentId: $incidentId, reason: "Operator manual review required") {
              id
              status
            }
          }`,
          variables: { incidentId: id },
        }),
      });
      const data = await res.json();
      if (data?.errors) {
        setActionMsg({ text: data.errors[0]?.message || 'Rejection failed', type: 'error' });
      } else {
        setActionMsg({ text: 'Remediation rejected. Incident escalated for manual review.', type: 'success' });
        await fetchIncident();
      }
    } catch (err: unknown) {
      setActionMsg({ text: err instanceof Error ? err.message : 'Execution error', type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <p style={{ color: 'var(--muted)' }}>Loading incident investigation telemetry...</p>
      </main>
    );
  }

  if (!incident) {
    return (
      <main className="offline">
        <span className="brand">⬡ OpsGraph <b>AI</b></span>
        <h1>Incident Not Found</h1>
        <p>No active or historical incident matching ID: {id}</p>
        <Link className="button" href="/dashboard">Return to Dashboard</Link>
      </main>
    );
  }

  const isResolved = incident.status === 'RESOLVED';
  const isAwaiting = incident.status === 'AWAITING_APPROVAL';
  const isMonitoring = incident.status === 'MONITORING';

  return (
    <div className="shell">
      {/* Sidebar */}
      <aside>
        <Link href="/dashboard" className="brand">
          ⬡ OpsGraph <b>AI</b>
        </Link>
        <div className="workspace">
          SRE PLATFORM
          <span>Incident Response</span>
        </div>

        <nav>
          <Link href="/dashboard">◈ Reliability Overview</Link>
          <Link href="/dashboard#services">▦ Platform Services</Link>
          <Link href="/chaos">⬢ Chaos Engineering</Link>
        </nav>

        <div className="aside-note">
          <span className="dot dot-pulse" /> Incident Triage Mode
          <p>
            Autonomous LangGraph investigation with human-in-the-loop remediation controls.
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="content">
        <header>
          <span>
            Incidents <span className="muted">/</span> {incident.id} <span className="muted">/</span> {incident.serviceName}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span className={`badge ${incident.severity === 'SEV-1' ? 'danger' : 'amber'}`}>
              {incident.severity}
            </span>
            <span className={`badge ${isResolved ? 'healthy' : isAwaiting ? 'amber' : 'danger'}`}>
              {incident.status}
            </span>
            <span className="avatar">AI</span>
          </div>
        </header>

        <main>
          {/* Title Area */}
          <div className="page-title">
            <div>
              <div className="eyebrow">AUTONOMOUS SRE INCIDENT INVESTIGATION</div>
              <h1>{incident.title}</h1>
              <p>{incident.description}</p>
            </div>
            <div>
              <Link className="button" href="/dashboard">← Back to Dashboard</Link>
            </div>
          </div>

          {/* Feedback banner */}
          {actionMsg && (
            <div
              style={{
                marginTop: '16px',
                padding: '12px 16px',
                borderRadius: '6px',
                fontSize: '12px',
                background: actionMsg.type === 'success' ? '#132c29' : '#321d2a',
                border: `1px solid ${actionMsg.type === 'success' ? '#235045' : '#783446'}`,
                color: actionMsg.type === 'success' ? '#58d9ae' : '#ff7d8c',
              }}
            >
              {actionMsg.text}
            </div>
          )}

          {/* Incident Metadata Strip */}
          <div className="summary" style={{ marginTop: '20px' }}>
            <span>Service: <strong style={{ color: '#fff' }}>{incident.serviceName}</strong></span>
            <span className="divider">/</span>
            <span>Category: <strong style={{ color: '#fff' }}>{incident.category || 'PERFORMANCE'}</strong></span>
            <span className="divider">/</span>
            <span>Started: <strong style={{ color: '#fff' }}>{new Date(incident.startedAt).toLocaleTimeString()} UTC</strong></span>
            {incident.resolvedAt && (
              <>
                <span className="divider">/</span>
                <span className="healthy">Resolved in {incident.mttrSeconds ?? '—'}s MTTR</span>
              </>
            )}
          </div>

          {/* Multi-Agent Orchestration Workflow Graph */}
          <section className="panel" style={{ marginTop: '24px' }}>
            <div className="panel-heading">
              <h2>Multi-Agent LangGraph Workflow</h2>
              <span className="muted">Autonomous investigation & validation state</span>
            </div>
            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '10px' }}>
              {[
                { name: 'Triage Agent', status: 'COMPLETED' },
                { name: 'Observability Collector', status: 'COMPLETED' },
                { name: 'Root Cause Synthesis', status: 'COMPLETED' },
                { name: 'Remediation Planner', status: isAwaiting ? 'WAITING' : 'COMPLETED' },
                { name: 'Human Operator Approval', status: isAwaiting ? 'ACTIVE' : isMonitoring || isResolved ? 'COMPLETED' : 'PENDING' },
                { name: 'Recovery Verification', status: isResolved ? 'COMPLETED' : isMonitoring ? 'ACTIVE' : 'PENDING' },
              ].map((node, i) => (
                <div
                  key={node.name}
                  style={{
                    flex: '1',
                    minWidth: '150px',
                    padding: '12px',
                    borderRadius: '6px',
                    background: node.status === 'ACTIVE' ? '#261b33' : node.status === 'COMPLETED' ? '#11221f' : '#101722',
                    border: `1px solid ${node.status === 'ACTIVE' ? '#a58ff7' : node.status === 'COMPLETED' ? '#235045' : 'var(--line)'}`,
                    fontSize: '11px',
                  }}
                >
                  <div style={{ color: 'var(--muted)', marginBottom: '4px' }}>Step {i + 1}</div>
                  <strong style={{ color: node.status === 'ACTIVE' ? '#c4b8ff' : node.status === 'COMPLETED' ? '#58d9ae' : '#fff' }}>
                    {node.name}
                  </strong>
                  <div style={{ marginTop: '6px' }}>
                    <span className={`badge ${node.status === 'COMPLETED' ? 'healthy' : node.status === 'ACTIVE' ? 'amber' : 'muted'}`}>
                      {node.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Remediation Plan & Human-in-the-Loop Approval Action */}
          {incident.remediationPlan && incident.remediationPlan.length > 0 && (
            <section className="panel" style={{ marginTop: '24px', border: isAwaiting ? '1px solid #783446' : '1px solid var(--line)' }}>
              <div className="panel-heading">
                <h2>Remediation Action (Human-in-the-Loop)</h2>
                <span className="badge amber">SAFE LOCAL CATALOG</span>
              </div>
              {incident.remediationPlan.map((action) => (
                <div key={action.id} style={{ padding: '16px', background: '#0d1420', borderRadius: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                      <h3 style={{ margin: 0, color: '#ff9eac' }}>{action.title}</h3>
                      <p style={{ margin: '6px 0 10px 0', fontSize: '12px', color: 'var(--muted)' }}>
                        {action.description}
                      </p>
                      <div style={{ display: 'flex', gap: '12px', fontSize: '11px' }}>
                        <span>Risk Level: <strong style={{ color: '#58d9ae' }}>{action.riskLevel}</strong></span>
                        <span>Risk Score: <strong style={{ color: '#fff' }}>{action.riskScore}/100</strong></span>
                        <span>Requires Approval: <strong style={{ color: '#fff' }}>{action.requiresApproval ? 'YES' : 'NO'}</strong></span>
                        <span>Status: <strong className={action.status === 'COMPLETED' ? 'healthy' : 'amber'}>{action.status}</strong></span>
                      </div>
                    </div>

                    {isAwaiting && action.status === 'PENDING' && (
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          type="button"
                          className="button"
                          disabled={actionLoading}
                          onClick={() => handleApprove(action.id)}
                          style={{ background: '#1c4238', borderColor: '#2f7462', color: '#58d9ae', cursor: 'pointer' }}
                        >
                          {actionLoading ? 'Processing...' : '✓ Approve & Execute Remediation'}
                        </button>
                        <button
                          type="button"
                          className="btn-danger"
                          disabled={actionLoading}
                          onClick={handleReject}
                          style={{ cursor: 'pointer' }}
                        >
                          ✕ Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* Hypotheses & Evidence */}
          {incident.hypotheses && incident.hypotheses.length > 0 && (
            <section className="panel" style={{ marginTop: '24px' }}>
              <div className="panel-heading">
                <h2>Root Cause Synthesis & Evidence</h2>
                <span className="muted">Generated by Multi-Agent RAG</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {incident.hypotheses.map((h) => {
                  let evidenceList: string[] = [];
                  try {
                    evidenceList = JSON.parse(h.evidence);
                  } catch {
                    evidenceList = [h.evidence];
                  }
                  return (
                    <div key={h.id} style={{ padding: '14px', background: '#0e1622', borderRadius: '6px', border: '1px solid var(--line)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ color: '#efbd67', fontSize: '13px' }}>{h.cause}</strong>
                        <span className="badge amber">Confidence: {(h.confidence * 100).toFixed(0)}%</span>
                      </div>
                      <div style={{ marginTop: '10px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Telemetric Evidence:</span>
                        <ul style={{ margin: '6px 0 0 16px', fontSize: '12px', color: 'var(--text)' }}>
                          {evidenceList.map((ev, idx) => (
                            <li key={idx}>{ev}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Investigation Timeline */}
          <section className="panel" style={{ marginTop: '24px' }}>
            <div className="panel-heading">
              <h2>Investigation Timeline</h2>
              <span className="muted">{incident.timeline?.length || 0} event records</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(incident.timeline || []).map((event) => (
                <div
                  key={event.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '14px',
                    padding: '12px',
                    background: '#0d1520',
                    borderRadius: '6px',
                    border: '1px solid var(--line)',
                  }}
                >
                  <div style={{ minWidth: '70px', fontSize: '11px', color: 'var(--muted)' }}>
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </div>
                  <div style={{ minWidth: '150px' }}>
                    <span className="badge muted" style={{ fontSize: '10px' }}>{event.agent}</span>
                  </div>
                  <div style={{ flex: '1', fontSize: '12px' }}>
                    <span className={`badge ${event.type === 'ANOMALY' ? 'danger' : event.type === 'ACTION' ? 'amber' : 'healthy'}`} style={{ marginRight: '8px' }}>
                      {event.type}
                    </span>
                    <span>{event.message}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Postmortem Section (if generated) */}
          {incident.postmortem && (
            <section className="panel" style={{ marginTop: '24px', border: '1px solid #235045' }}>
              <div className="panel-heading">
                <h2>{incident.postmortem.title}</h2>
                <span className="badge healthy">OFFICIAL POSTMORTEM</span>
              </div>
              <div style={{ padding: '16px', background: '#0f1c1a', borderRadius: '6px', fontSize: '12px', lineHeight: '1.6' }}>
                <p><strong>Executive Summary:</strong> {incident.postmortem.summary}</p>
                <p style={{ marginTop: '10px' }}><strong>Root Cause Analysis:</strong> {incident.postmortem.rootCause}</p>
                <p style={{ marginTop: '10px' }}><strong>Contributing Factors:</strong> {incident.postmortem.contributingFactors}</p>
                <p style={{ marginTop: '10px' }}><strong>Corrective Actions:</strong> {incident.postmortem.correctiveActions}</p>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
