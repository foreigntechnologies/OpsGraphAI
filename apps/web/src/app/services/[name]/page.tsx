'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface LogEntry {
  timestamp: string;
  level: string;
  service: string;
  traceId?: string;
  message: string;
  statusCode?: number;
  error?: string;
}

interface TraceSpan {
  id: string;
  name: string;
  service: string;
  startOffsetMs: number;
  durationMs: number;
  isAnomalous: boolean;
  statusCode?: number;
}

interface Trace {
  id: string;
  name: string;
  totalDurationMs: number;
  spans: TraceSpan[];
}

interface ServiceMetrics {
  service: string;
  state: string;
  requestsPerSecond: number | null;
  availability: number | null;
  latencyP50: number | null;
  latencyP95: number | null;
  latencyP99: number | null;
  errorRate: number | null;
  burnRate: number | null;
  sloStatus: string | null;
}

export default function ServiceDetailPage() {
  const params = useParams();
  const rawName = Array.isArray(params?.name) ? params.name[0] : params?.name;
  const serviceName = rawName ? decodeURIComponent(rawName) : 'payments-api';

  const [metrics, setMetrics] = useState<ServiceMetrics | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [logFilter, setLogFilter] = useState<'ALL' | 'INFO' | 'WARN' | 'ERROR'>('ALL');
  const [activeTab, setActiveTab] = useState<'metrics' | 'logs' | 'traces'>('metrics');
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('http://127.0.0.1:4000/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query ServiceDetails($service: String!) {
            serviceReliability(service: $service) {
              service
              state
              requestsPerSecond
              availability
              latencyP50
              latencyP95
              latencyP99
              errorRate
              burnRate
              sloStatus
            }
            serviceLogs(service: $service, limit: 30) {
              timestamp
              level
              service
              traceId
              message
              statusCode
              error
            }
            serviceTraces(service: $service, limit: 10) {
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
              }
            }
          }`,
          variables: { service: serviceName },
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          setMetrics(json.data.serviceReliability);
          setLogs(json.data.serviceLogs || []);
          setTraces(json.data.serviceTraces || []);
        }
      }
    } catch {
      // Graceful error handling
    } finally {
      setLoading(false);
    }
  }, [serviceName]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const filteredLogs = logs.filter((log) => {
    if (logFilter === 'ALL') return true;
    return log.level.toUpperCase() === logFilter;
  });

  if (loading && !metrics) {
    return (
      <main className="shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <p style={{ color: 'var(--muted)' }}>Loading real telemetry for {serviceName}...</p>
      </main>
    );
  }

  const availability = metrics?.availability;
  const p95 = metrics?.latencyP95;
  const errorRate = metrics?.errorRate;
  const burnRate = metrics?.burnRate;
  const isHealthy = metrics?.sloStatus === 'HEALTHY' || (availability != null && availability >= 99.99);

  return (
    <div className="shell">
      {/* Sidebar */}
      <aside>
        <Link href="/dashboard" className="brand">
          ⬡ OpsGraph <b>AI</b>
        </Link>
        <div className="workspace">
          SRE PLATFORM
          <span>Service Deep Dive</span>
        </div>

        <nav>
          <Link href="/dashboard">◈ Reliability Overview</Link>
          <Link className="selected" href="/dashboard#services">▦ Platform Services</Link>
          <Link href="/chaos">⬢ Chaos Engineering</Link>
        </nav>

        <div className="aside-note">
          <span className="dot dot-pulse" /> Telemetry Inspector
          <p>
            Real whitebox metrics from Prometheus, traces from Tempo, and logs from Loki.
          </p>
        </div>
      </aside>

      {/* Main Content */}
      <div className="content">
        <header>
          <span>
            Platform Services <span className="muted">/</span> {serviceName}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <span className={`badge ${metrics?.state === 'LIVE' ? 'healthy' : 'muted'}`}>
              {metrics?.state || 'LIVE'}
            </span>
            <span className={`badge ${isHealthy ? 'healthy' : 'danger'}`}>
              {metrics?.sloStatus || 'HEALTHY'}
            </span>
            <span className="avatar">SR</span>
          </div>
        </header>

        <main>
          {/* Title Area */}
          <div className="page-title">
            <div>
              <div className="eyebrow">MICROSERVICE OBSERVABILITY & RELIABILITY</div>
              <h1>{serviceName}</h1>
              <p>Real-time distributed telemetry, structured logs, and span waterfalls.</p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <Link className="button" href="/dashboard">← Back to Dashboard</Link>
              <Link className="button" href="/chaos">⬢ Chaos Controller</Link>
            </div>
          </div>

          {/* Quick Metrics Cards */}
          <section className="metrics" style={{ marginTop: '20px' }}>
            <article className="metric availability healthy">
              <div className="metric-heading">
                <span>HTTP Availability</span>
                <span className="metric-window">1m window</span>
              </div>
              <strong className="availability-value">
                {availability != null ? `${availability.toFixed(2)}%` : '—'}
              </strong>
              <small>SLO Target: ≥ 99.99%</small>
            </article>

            <article className="metric">
              <span>p95 Latency (Histogram)</span>
              <strong className={p95 != null && p95 > 500 ? 'amber' : 'healthy'}>
                {p95 != null ? `${Math.round(p95)} ms` : '—'}
              </strong>
              <small>
                {metrics?.latencyP50 != null ? `p50: ${Math.round(metrics.latencyP50)}ms · ` : ''}
                {metrics?.latencyP99 != null ? `p99: ${Math.round(metrics.latencyP99)}ms` : 'SLO Limit: 500ms'}
              </small>
            </article>

            <article className="metric">
              <span>Error Rate & Throughput</span>
              <strong className={errorRate != null && errorRate > 1 ? 'danger' : 'healthy'}>
                {errorRate != null ? `${errorRate.toFixed(2)}%` : '0.00%'}
              </strong>
              <small>
                {metrics?.requestsPerSecond != null
                  ? `Throughput: ${metrics.requestsPerSecond.toFixed(1)} req/s`
                  : 'Traffic in window'}
              </small>
            </article>

            <article className="metric">
              <span>Burn Rate (5m PromQL)</span>
              <strong className={burnRate != null && burnRate >= 2 ? 'amber' : 'healthy'}>
                {burnRate != null ? `${burnRate.toFixed(1)}x` : '0.0x'}
              </strong>
              <small>Error budget consumption rate</small>
            </article>
          </section>

          {/* Tabs for Navigation */}
          <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid var(--line)', margin: '28px 0 20px 0', paddingBottom: '8px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('metrics')}
              style={{
                background: 'transparent',
                border: 'none',
                color: activeTab === 'metrics' ? '#c4b8ff' : 'var(--muted)',
                fontWeight: activeTab === 'metrics' ? 'bold' : 'normal',
                cursor: 'pointer',
                padding: '6px 12px',
                borderBottom: activeTab === 'metrics' ? '2px solid #8c7adb' : 'none',
              }}
            >
              ◈ Observability Summary
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              style={{
                background: 'transparent',
                border: 'none',
                color: activeTab === 'logs' ? '#c4b8ff' : 'var(--muted)',
                fontWeight: activeTab === 'logs' ? 'bold' : 'normal',
                cursor: 'pointer',
                padding: '6px 12px',
                borderBottom: activeTab === 'logs' ? '2px solid #8c7adb' : 'none',
              }}
            >
              ☰ Structured Logs ({logs.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('traces')}
              style={{
                background: 'transparent',
                border: 'none',
                color: activeTab === 'traces' ? '#c4b8ff' : 'var(--muted)',
                fontWeight: activeTab === 'traces' ? 'bold' : 'normal',
                cursor: 'pointer',
                padding: '6px 12px',
                borderBottom: activeTab === 'traces' ? '2px solid #8c7adb' : 'none',
              }}
            >
              ☷ Distributed Traces ({traces.length})
            </button>
          </div>

          {/* Tab 1: Observability Summary */}
          {activeTab === 'metrics' && (
            <section className="panel">
              <div className="panel-heading">
                <h2>Service Runtime Information</h2>
                <span className="muted">Instrumented OpenTelemetry endpoints</span>
              </div>
              <div style={{ padding: '16px', fontSize: '13px', lineHeight: '1.8' }}>
                <p><strong>Service Identifier:</strong> <code>{serviceName}</code></p>
                <p><strong>Environment:</strong> <code>production (local cluster)</code></p>
                <p><strong>Prometheus Target:</strong> <code>http://host.docker.internal:{serviceName === 'api-gateway' ? '8080' : serviceName === 'auth-service' ? '8081' : serviceName === 'payments-api' ? '8082' : serviceName === 'orders-api' ? '8083' : '8084'}/metrics</code></p>
                <p><strong>Health Check Endpoint:</strong> <code>/health/ready</code></p>
                <p><strong>Observability Integrations:</strong> Prometheus (metrics), Loki (Pino logs with traceId), Tempo (OTLP distributed tracing).</p>
              </div>
            </section>
          )}

          {/* Tab 2: Structured Logs (Loki) */}
          {activeTab === 'logs' && (
            <section className="panel">
              <div className="panel-heading" style={{ flexWrap: 'wrap', gap: '10px' }}>
                <h2>Correlated Structured Logs (Loki)</h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['ALL', 'INFO', 'WARN', 'ERROR'] as const).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setLogFilter(lvl)}
                      style={{
                        background: logFilter === lvl ? '#201c35' : '#111824',
                        border: `1px solid ${logFilter === lvl ? '#8c7adb' : 'var(--line)'}`,
                        color: logFilter === lvl ? '#c4b8ff' : 'var(--muted)',
                        padding: '4px 10px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              {filteredLogs.length === 0 ? (
                <div style={{ padding: '20px', color: 'var(--muted)', fontSize: '12px' }}>
                  No logs matching filter in recent 15m window.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {filteredLogs.map((log, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        background: '#0d1520',
                        border: '1px solid var(--line)',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                      }}
                    >
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <span style={{ color: 'var(--muted)', fontSize: '11px' }}>
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </span>
                        <span
                          className={`badge ${
                            log.level === 'error' ? 'danger' : log.level === 'warn' ? 'amber' : 'healthy'
                          }`}
                          style={{ fontSize: '10px', padding: '2px 6px' }}
                        >
                          {log.level.toUpperCase()}
                        </span>
                        {log.traceId && (
                          <span style={{ color: '#8c7adb', fontSize: '11px' }}>
                            trace: {log.traceId.slice(0, 16)}...
                          </span>
                        )}
                      </div>
                      <div style={{ color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {log.message}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Tab 3: Distributed Tracing (Tempo) */}
          {activeTab === 'traces' && (
            <section className="panel">
              <div className="panel-heading">
                <h2>Distributed Traces (Tempo / OpenTelemetry)</h2>
                <span className="muted">{traces.length} recent traces recorded</span>
              </div>

              {traces.length === 0 ? (
                <div style={{ padding: '20px', color: 'var(--muted)', fontSize: '12px' }}>
                  No traces retrieved from Tempo yet. Ensure services are receiving requests.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {traces.map((trace) => (
                    <div
                      key={trace.id}
                      style={{
                        padding: '14px',
                        borderRadius: '6px',
                        background: '#0e1622',
                        border: '1px solid var(--line)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <div>
                          <strong>{trace.name}</strong>
                          <span style={{ color: 'var(--muted)', fontSize: '11px', marginLeft: '10px' }}>
                            ID: <code>{trace.id}</code>
                          </span>
                        </div>
                        <span className={`badge ${trace.totalDurationMs > 500 ? 'amber' : 'healthy'}`}>
                          {trace.totalDurationMs} ms
                        </span>
                      </div>

                      {/* Spans waterfall */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
                        {trace.spans.map((span) => {
                          const widthPct = Math.max(
                            8,
                            Math.min(100, (span.durationMs / (trace.totalDurationMs || 1)) * 100)
                          );
                          return (
                            <div key={span.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px' }}>
                              <div style={{ width: '180px', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {span.service}: {span.name}
                              </div>
                              <div style={{ flex: '1', background: '#111824', height: '14px', borderRadius: '3px', position: 'relative' }}>
                                <div
                                  style={{
                                    width: `${widthPct}%`,
                                    height: '100%',
                                    borderRadius: '3px',
                                    background: span.isAnomalous ? '#ff5468' : '#7b68ee',
                                  }}
                                />
                              </div>
                              <div style={{ width: '60px', textAlign: 'right', color: span.isAnomalous ? '#ff7d8c' : 'var(--text)' }}>
                                {span.durationMs}ms
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
