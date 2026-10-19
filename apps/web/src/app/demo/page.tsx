'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface StepData {
  step: number;
  title: string;
  subtitle: string;
  status: 'HEALTHY' | 'DEGRADED' | 'BREACHED' | 'TRIAGING' | 'RECOVERED';
  availability: number;
  latencyP95: number;
  errorRate: number;
  burnRate: number;
  deployment?: string;
  activeNode?: string;
  logs?: Array<{ level: string; msg: string; time: string }>;
  trace?: {
    name: string;
    totalMs: number;
    spans: Array<{ name: string; durationMs: number; isAnomalous?: boolean; service: string }>;
  };
  rootCause?: { title: string; confidence: number; evidence: string };
  remediation?: { action: string; risk: string; target: string; requiresApproval: boolean };
}

const DEMO_STEPS: StepData[] = [
  {
    step: 1,
    title: '1. Healthy Baseline State',
    subtitle: 'payments-api operating with high availability and full compliance with 99.99% SLO.',
    status: 'HEALTHY',
    availability: 99.99,
    latencyP95: 210,
    errorRate: 0.01,
    burnRate: 0.1,
    deployment: 'payments-api v2.18.2 (production)',
  },
  {
    step: 2,
    title: '2. Production Deployment Event',
    subtitle: 'New release v2.18.3 deployed to production via automated CI/CD pipeline.',
    status: 'HEALTHY',
    availability: 99.99,
    latencyP95: 240,
    errorRate: 0.01,
    burnRate: 0.2,
    deployment: '🚀 DEPLOYMENT: payments-api v2.18.3 released',
    logs: [
      { time: '14:22:01', level: 'INFO', msg: 'Container started: payments-api:v2.18.3' },
      { time: '14:22:04', level: 'INFO', msg: 'Database connection pool initialized (pool_size=5)' },
    ],
  },
  {
    step: 3,
    title: '3. Telemetry Degradation & SLO Breach',
    subtitle: 'p95 latency surges to 4.2s. Error rate spikes to 14.2%. Error budget burning at 14.2x.',
    status: 'BREACHED',
    availability: 98.72,
    latencyP95: 4200,
    errorRate: 14.2,
    burnRate: 14.2,
    deployment: 'payments-api v2.18.3 (critical)',
    logs: [
      { time: '14:23:10', level: 'WARN', msg: 'Query execution exceeded threshold (2140ms)' },
      { time: '14:23:25', level: 'ERROR', msg: 'Database connection pool exhausted: 5 of 5 active' },
      { time: '14:23:38', level: 'ERROR', msg: 'HTTP 504 Gateway Timeout on POST /v1/charges' },
    ],
  },
  {
    step: 4,
    title: '4. Multi-Agent AI Triage (LangGraph)',
    subtitle: 'Multi-agent orchestration workflow triggered automatically upon continuous anomaly confirmation (3 windows).',
    status: 'TRIAGING',
    availability: 98.65,
    latencyP95: 4180,
    errorRate: 14.5,
    burnRate: 14.5,
    activeNode: 'Observability & Metric Collector Agent',
  },
  {
    step: 5,
    title: '5. Multi-Signal Investigation (Traces & Logs)',
    subtitle: 'Correlating OpenTelemetry distributed spans with Loki structured logs using trace_id.',
    status: 'TRIAGING',
    availability: 98.65,
    latencyP95: 4180,
    errorRate: 14.5,
    burnRate: 14.5,
    activeNode: 'Root Cause Synthesis Agent',
    trace: {
      name: 'POST /v1/charges [HTTP 504]',
      totalMs: 4210,
      spans: [
        { service: 'api-gateway', name: 'POST /v1/charges', durationMs: 4210 },
        { service: 'auth-service', name: 'POST /verify-token', durationMs: 18 },
        { service: 'payments-api', name: 'POST /internal/charge', durationMs: 4185 },
        { service: 'payments-api', name: 'pg: SELECT pg_sleep / lock_wait', durationMs: 4120, isAnomalous: true },
      ],
    },
    logs: [
      { time: '14:23:42', level: 'WARN', msg: 'Lock wait timeout waiting for free connection pool slot' },
      { time: '14:23:45', level: 'ERROR', msg: 'Transaction rollback: client canceled query' },
    ],
  },
  {
    step: 6,
    title: '6. Root Cause Diagnosis & RAG Knowledge Retrieval',
    subtitle: 'RAG retrieves database runbooks and past postmortems from Qdrant to validate causal hypothesis.',
    status: 'TRIAGING',
    availability: 98.65,
    latencyP95: 4180,
    errorRate: 14.5,
    burnRate: 14.5,
    activeNode: 'SRE Remediation Planner Agent',
    rootCause: {
      title: 'PostgreSQL connection pool exhaustion introduced in deployment v2.18.3',
      confidence: 96,
      evidence: 'Anomalous span of 4.12s in "pg: lock_wait" + parameter pool_size reduced from 25 to 5 in commit #d8a1c9.',
    },
  },
  {
    step: 7,
    title: '7. Remediation Plan & Human-in-the-Loop Approval',
    subtitle: 'Agent produces safe catalog rollback action and awaits explicit operator authorization.',
    status: 'TRIAGING',
    availability: 98.65,
    latencyP95: 4180,
    errorRate: 14.5,
    burnRate: 14.5,
    activeNode: 'Human Approval Gate',
    remediation: {
      action: 'Immediate Rollback: payments-api v2.18.3 ➔ v2.18.2',
      risk: 'LOW (previous version validated and healthy)',
      target: 'payments-api (production)',
      requiresApproval: true,
    },
  },
  {
    step: 8,
    title: '8. Mitigation Execution & Recovery Verification',
    subtitle: 'Remediation executed successfully. Live recovery window monitored in real time.',
    status: 'RECOVERED',
    availability: 99.95,
    latencyP95: 310,
    errorRate: 0.04,
    burnRate: 0.4,
    deployment: 'payments-api v2.18.2 (restored)',
    logs: [
      { time: '14:25:02', level: 'INFO', msg: 'Executing rollback to image payments-api:v2.18.2' },
      { time: '14:25:12', level: 'INFO', msg: 'Service payments-api healthy. 0 active connection wait locks.' },
    ],
  },
  {
    step: 9,
    title: '9. Incident Resolved & Postmortem Generated',
    subtitle: 'SLO restored. MTTD: 42s · MTTR: 1m 58s. Comprehensive postmortem generated and indexed in knowledge base.',
    status: 'HEALTHY',
    availability: 99.99,
    latencyP95: 215,
    errorRate: 0.01,
    burnRate: 0.1,
    deployment: 'payments-api v2.18.2 (production)',
  },
];

export default function DemoPage() {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2 | 3>(1);
  const [approved, setApproved] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const step: StepData = DEMO_STEPS[currentStepIndex] ?? (DEMO_STEPS[0] as StepData);

  useEffect(() => {
    if (isPlaying) {
      const intervalMs = speed === 3 ? 1400 : speed === 2 ? 3000 : 5500;
      timerRef.current = setTimeout(() => {
        if (currentStepIndex < DEMO_STEPS.length - 1) {
          setCurrentStepIndex((prev) => prev + 1);
        } else {
          setIsPlaying(false);
        }
      }, intervalMs);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isPlaying, currentStepIndex, speed]);

  const handleNext = () => {
    if (currentStepIndex < DEMO_STEPS.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentStepIndex(0);
    setApproved(false);
  };

  const statusColors = {
    HEALTHY: { bg: 'rgba(88, 217, 174, 0.12)', border: '#58d9ae', text: '#58d9ae' },
    DEGRADED: { bg: 'rgba(239, 189, 103, 0.12)', border: '#efbd67', text: '#efbd67' },
    BREACHED: { bg: 'rgba(255, 125, 140, 0.15)', border: '#ff7d8c', text: '#ff7d8c' },
    TRIAGING: { bg: 'rgba(196, 184, 255, 0.15)', border: '#8c7adb', text: '#c4b8ff' },
    RECOVERED: { bg: 'rgba(88, 217, 174, 0.12)', border: '#58d9ae', text: '#58d9ae' },
  };

  const currColor = statusColors[step.status];

  return (
    <div style={{ minHeight: '100vh', background: '#070a0f', color: '#e7ecf5', fontFamily: 'Arial, sans-serif' }}>
      {/* Top Demo Bar */}
      <header
        style={{
          borderBottom: '1px solid #1c2637',
          padding: '12px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#0a0f18',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <Link href="/dashboard" style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff', textDecoration: 'none' }}>
            ⬡ OpsGraph <span style={{ color: '#c2b4ff', background: '#30254d', padding: '3px 6px', borderRadius: '4px', fontSize: '11px' }}>AI</span>
          </Link>
          <span style={{ fontSize: '11px', color: '#8c9bb1' }}>|</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#a89bff', letterSpacing: '1px' }}>
            EXECUTIVE SRE DEMO EXPERIENCE
          </span>
        </div>

        {/* Demo Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            style={{
              background: isPlaying ? '#321d2a' : '#1c2638',
              border: `1px solid ${isPlaying ? '#ff7d8c' : '#3d4f6c'}`,
              color: isPlaying ? '#ff9eac' : '#e7ecf5',
              padding: '7px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '12px',
            }}
          >
            {isPlaying ? '⏸ PAUSE' : '▶ AUTO-PLAY'}
          </button>

          <button
            onClick={handlePrev}
            disabled={currentStepIndex === 0}
            style={{
              background: '#131924',
              border: '1px solid #233147',
              color: currentStepIndex === 0 ? '#465268' : '#e7ecf5',
              padding: '7px 12px',
              borderRadius: '6px',
              cursor: currentStepIndex === 0 ? 'not-allowed' : 'pointer',
              fontSize: '12px',
            }}
          >
            ◀ Previous Step
          </button>

          <button
            onClick={handleNext}
            disabled={currentStepIndex === DEMO_STEPS.length - 1}
            style={{
              background: '#201c35',
              border: '1px solid #5a4b82',
              color: currentStepIndex === DEMO_STEPS.length - 1 ? '#465268' : '#c4b8ff',
              padding: '7px 14px',
              borderRadius: '6px',
              cursor: currentStepIndex === DEMO_STEPS.length - 1 ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            Next Step ▶
          </button>

          <button
            onClick={handleReset}
            style={{
              background: '#131924',
              border: '1px solid #233147',
              color: '#8c9bb1',
              padding: '7px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            ↻ Reset Demo
          </button>

          {/* Speed Toggle */}
          <div style={{ display: 'flex', border: '1px solid #233147', borderRadius: '6px', overflow: 'hidden' }}>
            {([1, 2, 3] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                style={{
                  background: speed === s ? '#8c7adb' : '#111824',
                  color: speed === s ? '#000' : '#8c9bb1',
                  border: 'none',
                  padding: '6px 10px',
                  fontSize: '10px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {s === 1 ? '1x' : s === 2 ? '2x' : 'Fast'}
              </button>
            ))}
          </div>

          <Link
            href="/dashboard"
            style={{
              marginLeft: '14px',
              color: '#8c9bb1',
              fontSize: '11px',
              textDecoration: 'none',
              border: '1px solid #233147',
              padding: '6px 12px',
              borderRadius: '6px',
            }}
          >
            Exit to Dashboard
          </Link>
        </div>
      </header>

      {/* Progress Track */}
      <div style={{ display: 'flex', height: '4px', background: '#121824' }}>
        {DEMO_STEPS.map((s, idx) => (
          <div
            key={s.step}
            onClick={() => setCurrentStepIndex(idx)}
            style={{
              flex: 1,
              background:
                idx === currentStepIndex
                  ? '#a89bff'
                  : idx < currentStepIndex
                  ? '#58d9ae'
                  : '#1f2a3c',
              cursor: 'pointer',
              transition: 'background 0.3s ease',
            }}
            title={s.title}
          />
        ))}
      </div>

      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px 28px' }}>
        {/* Step Banner */}
        <div
          style={{
            background: currColor.bg,
            border: `1px solid ${currColor.border}`,
            borderRadius: '10px',
            padding: '20px 24px',
            marginBottom: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', letterSpacing: '1.5px', color: currColor.text, fontWeight: 'bold' }}>
              STEP {step.step} OF {DEMO_STEPS.length}
            </div>
            <h1 style={{ fontSize: '24px', margin: '6px 0', color: '#fff' }}>{step.title}</h1>
            <p style={{ margin: 0, fontSize: '13px', color: '#a0aec0' }}>{step.subtitle}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span
              style={{
                display: 'inline-block',
                background: currColor.border,
                color: '#070a0f',
                padding: '6px 14px',
                borderRadius: '6px',
                fontWeight: 'bold',
                fontSize: '12px',
                letterSpacing: '0.8px',
              }}
            >
              {step.status}
            </span>
            {step.deployment && (
              <div style={{ marginTop: '8px', fontSize: '11px', color: '#8c9bb1' }}>
                {step.deployment}
              </div>
            )}
          </div>
        </div>

        {/* Realtime Animated Metrics Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
          {/* Availability */}
          <div
            style={{
              background: '#101722',
              border: '1px solid #1f2a3c',
              borderRadius: '8px',
              padding: '20px',
              borderTop: `3px solid ${step.availability >= 99.99 ? '#58d9ae' : '#ff7d8c'}`,
            }}
          >
            <div style={{ fontSize: '11px', color: '#8c9bb1' }}>REAL AVAILABILITY (SLO: 99.99%)</div>
            <div
              style={{
                fontSize: '34px',
                fontWeight: 'bold',
                margin: '12px 0 8px',
                color: step.availability >= 99.99 ? '#58d9ae' : '#ff7d8c',
              }}
            >
              {step.availability.toFixed(2)}%
            </div>
            <div style={{ fontSize: '11px', color: '#8c9bb1' }}>
              {step.availability >= 99.99 ? '● Within Target SLO' : '▲ SLO BREACH DETECTED'}
            </div>
          </div>

          {/* p95 Latency */}
          <div
            style={{
              background: '#101722',
              border: '1px solid #1f2a3c',
              borderRadius: '8px',
              padding: '20px',
              borderTop: `3px solid ${step.latencyP95 >= 1000 ? '#ff7d8c' : step.latencyP95 >= 500 ? '#efbd67' : '#58d9ae'}`,
            }}
          >
            <div style={{ fontSize: '11px', color: '#8c9bb1' }}>p95 LATENCY (TRANSACTIONS)</div>
            <div
              style={{
                fontSize: '34px',
                fontWeight: 'bold',
                margin: '12px 0 8px',
                color: step.latencyP95 >= 1000 ? '#ff7d8c' : step.latencyP95 >= 500 ? '#efbd67' : '#58d9ae',
              }}
            >
              {step.latencyP95 >= 1000 ? `${(step.latencyP95 / 1000).toFixed(1)}s` : `${step.latencyP95}ms`}
            </div>
            <div style={{ fontSize: '11px', color: '#8c9bb1' }}>
              {step.latencyP95 > 500 ? '▲ Critical Degradation' : '● Operational Baseline'}
            </div>
          </div>

          {/* Error Rate */}
          <div
            style={{
              background: '#101722',
              border: '1px solid #1f2a3c',
              borderRadius: '8px',
              padding: '20px',
              borderTop: `3px solid ${step.errorRate > 0.05 ? '#ff7d8c' : '#58d9ae'}`,
            }}
          >
            <div style={{ fontSize: '11px', color: '#8c9bb1' }}>HTTP 5xx ERROR RATE</div>
            <div
              style={{
                fontSize: '34px',
                fontWeight: 'bold',
                margin: '12px 0 8px',
                color: step.errorRate > 0.05 ? '#ff7d8c' : '#58d9ae',
              }}
            >
              {step.errorRate.toFixed(2)}%
            </div>
            <div style={{ fontSize: '11px', color: '#8c9bb1' }}>
              {step.errorRate > 0.05 ? '▲ Firing SEV-1 Alerts' : '● Stable Residual Rate'}
            </div>
          </div>

          {/* Burn Rate */}
          <div
            style={{
              background: '#101722',
              border: '1px solid #1f2a3c',
              borderRadius: '8px',
              padding: '20px',
              borderTop: `3px solid ${step.burnRate >= 14 ? '#ff7d8c' : step.burnRate >= 2 ? '#efbd67' : '#58d9ae'}`,
            }}
          >
            <div style={{ fontSize: '11px', color: '#8c9bb1' }}>BURN RATE (5m WINDOW)</div>
            <div
              style={{
                fontSize: '34px',
                fontWeight: 'bold',
                margin: '12px 0 8px',
                color: step.burnRate >= 14 ? '#ff7d8c' : step.burnRate >= 2 ? '#efbd67' : '#58d9ae',
              }}
            >
              {step.burnRate.toFixed(1)}x
            </div>
            <div style={{ fontSize: '11px', color: '#8c9bb1' }}>
              {step.burnRate >= 14 ? '▲ Exhaustion in < 2h' : '● Budget Preserved'}
            </div>
          </div>
        </div>

        {/* Visual LangGraph Agent Orchestration Map */}
        <section
          style={{
            background: '#0d131e',
            border: '1px solid #1f2a3c',
            borderRadius: '10px',
            padding: '24px',
            marginBottom: '28px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <h2 style={{ fontSize: '16px', margin: 0 }}>
              🧠 Multi-Agent Triage Workflow (LangGraph Graph)
            </h2>
            <span style={{ fontSize: '11px', color: '#8c9bb1' }}>Autonomous SRE Engineering Execution</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '12px',
            }}
          >
            {[
              { id: 'triage', name: 'Triage Agent', desc: 'Classifies severity and isolates affected service' },
              { id: 'observability', name: 'Observability Agent', desc: 'Queries live PromQL metrics, traces, and Loki logs' },
              { id: 'rag', name: 'RAG Retrieval Agent', desc: 'Retrieves runbooks and historical postmortems from Qdrant' },
              { id: 'sre', name: 'SRE Remediation Agent', desc: 'Synthesizes root cause and formulates catalog action' },
              { id: 'human', name: 'Human Approval Gate', desc: 'Requires mandatory human authorization before mitigation' },
            ].map((node, i) => {
              const isActive = step.step >= 4 && (step.step === 4 ? i <= 1 : step.step === 5 ? i <= 2 : step.step === 6 ? i <= 3 : true);
              const isCurrent = (step.step === 4 && i === 1) || (step.step === 5 && i === 2) || (step.step === 6 && i === 3) || (step.step === 7 && i === 4);

              return (
                <div
                  key={node.id}
                  style={{
                    background: isCurrent ? '#201c35' : isActive ? '#131b28' : '#0a0e16',
                    border: `1px solid ${isCurrent ? '#8c7adb' : isActive ? '#2b3a50' : '#17202d'}`,
                    borderRadius: '8px',
                    padding: '16px',
                    transition: 'all 0.3s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: isCurrent ? '#c4b8ff' : isActive ? '#58d9ae' : '#3d4f6c',
                      }}
                    />
                    <strong style={{ fontSize: '12px', color: isCurrent ? '#c4b8ff' : isActive ? '#fff' : '#68788f' }}>
                      {node.name}
                    </strong>
                  </div>
                  <p style={{ margin: 0, fontSize: '10px', color: '#8c9bb1', lineHeight: '1.4' }}>{node.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Deep Dive: Traces & Logs (Visible during investigation) */}
        {(step.trace || step.logs) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '20px', marginBottom: '28px' }}>
            {/* Distributed Trace Waterfall */}
            {step.trace && (
              <div
                style={{
                  background: '#101722',
                  border: '1px solid #1f2a3c',
                  borderRadius: '10px',
                  padding: '20px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <h3 style={{ fontSize: '14px', margin: 0 }}>📍 Distributed Trace Waterfall (OpenTelemetry)</h3>
                  <code style={{ fontSize: '11px', color: '#ff7d8c' }}>{step.trace.totalMs} ms total</code>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {step.trace.spans.map((span, idx) => (
                    <div key={idx} style={{ fontSize: '11px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span>
                          <strong style={{ color: span.isAnomalous ? '#ff7d8c' : '#c4b8ff' }}>{span.service}</strong>
                          <span style={{ color: '#8c9bb1', marginLeft: '8px' }}>{span.name}</span>
                        </span>
                        <strong style={{ color: span.isAnomalous ? '#ff7d8c' : '#8c9bb1' }}>
                          {span.durationMs}ms {span.isAnomalous && '🚨 [ANOMALOUS SPAN]'}
                        </strong>
                      </div>
                      <div style={{ width: '100%', height: '7px', background: '#17202d', borderRadius: '3px' }}>
                        <div
                          style={{
                            width: `${Math.min(100, (span.durationMs / step.trace!.totalMs) * 100)}%`,
                            height: '100%',
                            background: span.isAnomalous ? '#ff7d8c' : '#8c7adb',
                            borderRadius: '3px',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Correlated Structured Logs */}
            {step.logs && (
              <div
                style={{
                  background: '#101722',
                  border: '1px solid #1f2a3c',
                  borderRadius: '10px',
                  padding: '20px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <h3 style={{ fontSize: '14px', margin: 0 }}>📜 Correlated Loki Logs</h3>
                  <span style={{ fontSize: '11px', color: '#8c9bb1' }}>trace_id correlated</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'monospace', fontSize: '11px' }}>
                  {step.logs.map((log, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '6px 10px',
                        background: '#0a0e16',
                        borderRadius: '4px',
                        borderLeft: `3px solid ${log.level === 'ERROR' ? '#ff7d8c' : log.level === 'WARN' ? '#efbd67' : '#58d9ae'}`,
                      }}
                    >
                      <span style={{ color: '#8c9bb1', marginRight: '8px' }}>{log.time}</span>
                      <strong style={{ color: log.level === 'ERROR' ? '#ff7d8c' : log.level === 'WARN' ? '#efbd67' : '#58d9ae', marginRight: '8px' }}>
                        [{log.level}]
                      </strong>
                      <span style={{ color: '#e7ecf5' }}>{log.msg}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Root Cause & Human-in-the-Loop Action Card */}
        {step.rootCause && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(140, 122, 219, 0.1), #101722)',
              border: '1px solid #8c7adb',
              borderRadius: '10px',
              padding: '24px',
              marginBottom: '28px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '10px', letterSpacing: '1px', color: '#c4b8ff', fontWeight: 'bold' }}>
                  AI ROOT CAUSE DIAGNOSIS (RAG + TEMPO + LOKI)
                </span>
                <h3 style={{ fontSize: '18px', color: '#fff', margin: '8px 0' }}>{step.rootCause.title}</h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#a0aec0', maxWidth: '800px', lineHeight: '1.6' }}>
                  {step.rootCause.evidence}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '11px', color: '#8c9bb1' }}>Confidence Level</span>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#58d9ae' }}>
                  {step.rootCause.confidence}%
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Remediation Approval Card */}
        {step.remediation && (
          <div
            style={{
              background: '#131e2b',
              border: '1px solid #284466',
              borderRadius: '10px',
              padding: '24px',
              marginBottom: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <span style={{ fontSize: '10px', letterSpacing: '1px', color: '#efbd67', fontWeight: 'bold' }}>
                RECOMMENDED SRE ACTION (HUMAN-IN-THE-LOOP REQUIRED)
              </span>
              <h3 style={{ fontSize: '17px', color: '#fff', margin: '6px 0' }}>{step.remediation.action}</h3>
              <div style={{ fontSize: '12px', color: '#8c9bb1' }}>
                Target: <strong style={{ color: '#fff' }}>{step.remediation.target}</strong> · Risk:{' '}
                <strong style={{ color: '#58d9ae' }}>{step.remediation.risk}</strong>
              </div>
            </div>

            <div>
              {approved || step.step >= 8 ? (
                <div style={{ color: '#58d9ae', fontWeight: 'bold', fontSize: '13px' }}>
                  ✓ REMEDIATION APPROVED & EXECUTED
                </div>
              ) : (
                <button
                  onClick={() => {
                    setApproved(true);
                    handleNext();
                  }}
                  style={{
                    background: '#58d9ae',
                    color: '#070a0f',
                    border: 'none',
                    padding: '12px 24px',
                    borderRadius: '6px',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    cursor: 'pointer',
                    boxShadow: '0 0 15px rgba(88, 217, 174, 0.4)',
                  }}
                >
                  [ APPROVE IMMEDIATE ROLLBACK ]
                </button>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
