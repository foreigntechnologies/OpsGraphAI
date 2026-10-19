'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface ActiveScenario {
  service: string;
  type: string;
  enabled: boolean;
  expiresAt: string | null;
}

export default function ChaosPage() {
  const [activeScenarios, setActiveScenarios] = useState<ActiveScenario[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Scenario config states
  const [dbLatency, setDbLatency] = useState(1500);
  const [errorRate, setErrorRate] = useState(25);
  const [depTimeout, setDepTimeout] = useState(3000);
  const [ttlMinutes, setTtlMinutes] = useState(10);

  const fetchChaosState = useCallback(async () => {
    try {
      const directRes = await fetch('http://127.0.0.1:4000/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query ChaosState {
            chaosState {
              enabled
              environment
              activeScenarios {
                service
                type
                enabled
                expiresAt
              }
            }
          }`,
        }),
      });
      if (directRes.ok) {
        const data = await directRes.json();
        if (data?.data?.chaosState?.activeScenarios) {
          setActiveScenarios(data.data.chaosState.activeScenarios);
        }
      }
    } catch {
      // Graceful fallback if api is restarting
    }
  }, []);

  useEffect(() => {
    fetchChaosState();
    const interval = setInterval(fetchChaosState, 4000);
    return () => clearInterval(interval);
  }, [fetchChaosState]);

  const runMutation = async (query: string, variables: Record<string, unknown>) => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch('http://127.0.0.1:4000/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
      });

      const res = await response.json();
      if (res.errors) {
        setMessage({ text: res.errors[0]?.message || 'Failed to execute mutation', type: 'error' });
      } else {
        setMessage({ text: 'Chaos command executed successfully!', type: 'success' });
        await fetchChaosState();
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'GraphQL API communication error (port 4000)';
      setMessage({ text: errorMsg, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleEnableChaos = (service: string, scenario: string, params: Record<string, unknown>) => {
    runMutation(
      `mutation EnableChaos($service: String!, $scenario: String!, $paramsJson: String, $ttlMinutes: Int) {
        enableChaos(service: $service, scenario: $scenario, paramsJson: $paramsJson, ttlMinutes: $ttlMinutes)
      }`,
      {
        service,
        scenario,
        paramsJson: JSON.stringify(params),
        ttlMinutes,
      }
    );
  };

  const handleResetAll = () => {
    runMutation(
      `mutation ResetAll {
        resetAllChaos
      }`,
      {}
    );
  };

  return (
    <div className="shell">
      <aside>
        <Link href="/dashboard" className="brand">
          ⬡ OpsGraph <b>AI</b>
        </Link>
        <div className="workspace">
          SRE PLATFORM
          <span>Chaos Controller</span>
        </div>

        <nav>
          <Link href="/dashboard">◈ Reliability Overview</Link>
          <Link href="/dashboard#services">▦ Platform Services</Link>
          <Link className="selected" href="/chaos">⬢ Chaos Engineering</Link>
        </nav>

        <div className="aside-note">
          <span className="dot dot-pulse" /> Controlled Fault Injection
          <p>
            Alters real runtime service behavior via secure in-memory HTTP management calls.
          </p>
        </div>
      </aside>

      <div className="content">
        <header>
          <span>Chaos Engineering <span className="muted">/</span> Fault Injection Controller</span>
          <div>
            <span className="badge amber">LOCAL / DEMO ONLY</span>
            <span className="avatar">CH</span>
          </div>
        </header>

        <main>
          {/* Header Title */}
          <div className="page-title">
            <div>
              <div className="eyebrow">CONTROLLED FAULT INJECTION</div>
              <h1>Chaos Engineering Controller</h1>
              <p>
                Inject real database latency, HTTP 500 error spikes, and dependency timeouts to validate SRE detection and multi-agent AI triage.
              </p>
            </div>
            <div>
              <button
                onClick={handleResetAll}
                disabled={loading}
                className="btn-danger"
                style={{ padding: '12px 20px', fontSize: '13px', cursor: 'pointer' }}
              >
                {loading ? 'Processing...' : '⚠️ RESET ALL CHAOS (RESTORE)'}
              </button>
            </div>
          </div>

          {/* Feedback message */}
          {message && (
            <div
              style={{
                marginTop: '18px',
                padding: '12px 16px',
                borderRadius: '6px',
                fontSize: '12px',
                background: message.type === 'success' ? '#132c29' : '#321d2a',
                border: `1px solid ${message.type === 'success' ? '#235045' : '#69303e'}`,
                color: message.type === 'success' ? '#58d9ae' : '#ff7d8c',
              }}
            >
              {message.text}
            </div>
          )}

          {/* Active Chaos Status Box */}
          <section className="panel" style={{ marginTop: '22px' }}>
            <div className="panel-heading">
              <h2>Active Injection Status</h2>
              <span className="muted">Automatic TTL protection active</span>
            </div>
            {activeScenarios.length === 0 ? (
              <div style={{ color: 'var(--green)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="dot dot-pulse" />
                <span>No active faults. The system is operating in a healthy baseline (100% no-fault).</span>
              </div>
            ) : (
              <div>
                <p style={{ color: 'var(--amber)', fontSize: '12px', marginBottom: '12px' }}>
                  Warning: The following chaos scenarios are actively generating degraded telemetry across running services:
                </p>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {activeScenarios.map((sc) => (
                    <div
                      key={`${sc.service}-${sc.type}`}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '6px',
                        background: '#321d2a',
                        border: '1px solid #783446',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                      }}
                    >
                      <strong style={{ color: '#ff9eac' }}>{sc.service}</strong>
                      <span className="badge danger">{sc.type}</span>
                      <small style={{ color: 'var(--muted)' }}>
                        Expires at: {sc.expiresAt ? new Date(sc.expiresAt).toLocaleTimeString() : 'Default TTL'}
                      </small>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Safety Settings */}
          <div style={{ marginBottom: '22px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>Automatic Safety TTL:</span>
            {[5, 10, 15, 30].map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => setTtlMinutes(mins)}
                style={{
                  background: ttlMinutes === mins ? '#201c35' : '#111824',
                  border: `1px solid ${ttlMinutes === mins ? '#8c7adb' : 'var(--line)'}`,
                  color: ttlMinutes === mins ? '#c4b8ff' : 'var(--muted)',
                  padding: '6px 12px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                {mins} minutes
              </button>
            ))}
          </div>

          {/* 3 Real Scenarios Cards */}
          <div className="grid-3">
            {/* Scenario 1: Database Latency */}
            <div className="chaos-card">
              <div>
                <span className="badge amber">DATABASE</span>
                <h3>PostgreSQL Query Latency</h3>
                <p>
                  Injects real <code>SELECT pg_sleep()</code> during payment transaction execution in <code>payments-api</code>.
                </p>
                <div style={{ margin: '14px 0', fontSize: '11px', color: 'var(--muted)' }}>
                  Query Delay:
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    {[500, 1000, 1500, 3000].map((ms) => (
                      <button
                        key={ms}
                        type="button"
                        onClick={() => setDbLatency(ms)}
                        style={{
                          background: dbLatency === ms ? '#30281b' : '#101722',
                          border: `1px solid ${dbLatency === ms ? '#efbd67' : 'var(--line)'}`,
                          color: dbLatency === ms ? '#efbd67' : 'var(--muted)',
                          padding: '5px 8px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          cursor: 'pointer',
                        }}
                      >
                        {ms}ms
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn-danger"
                disabled={loading}
                onClick={() =>
                  handleEnableChaos('payments-api', 'DATABASE_LATENCY', { delayMs: dbLatency })
                }
              >
                Inject {dbLatency}ms Latency in payments-api
              </button>
            </div>

            {/* Scenario 2: Error Spike */}
            <div className="chaos-card">
              <div>
                <span className="badge danger">HTTP 500 ERRORS</span>
                <h3>HTTP Error Spike</h3>
                <p>
                  Chaos middleware intercepts incoming requests and returns HTTP 500 Internal Server Error with OTel exception traces.
                </p>
                <div style={{ margin: '14px 0', fontSize: '11px', color: 'var(--muted)' }}>
                  Error Fraction:
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    {[10, 25, 50].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setErrorRate(pct)}
                        style={{
                          background: errorRate === pct ? '#321d2a' : '#101722',
                          border: `1px solid ${errorRate === pct ? '#ff7d8c' : 'var(--line)'}`,
                          color: errorRate === pct ? '#ff7d8c' : 'var(--muted)',
                          padding: '5px 8px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          cursor: 'pointer',
                        }}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn-danger"
                disabled={loading}
                onClick={() =>
                  handleEnableChaos('auth-service', 'ERROR_SPIKE', { rate: errorRate / 100 })
                }
              >
                Inject {errorRate}% Errors in auth-service
              </button>
            </div>

            {/* Scenario 3: Dependency Timeout */}
            <div className="chaos-card">
              <div>
                <span className="badge muted">CASCADE TIMEOUT</span>
                <h3>Dependency Timeout</h3>
                <p>
                  Delays <code>payments-api</code> responses by {depTimeout}ms, exceeding <code>orders-api</code> client timeout (1500ms) to trigger HTTP 504.
                </p>
                <div style={{ margin: '14px 0', fontSize: '11px', color: 'var(--muted)' }}>
                  Charge Delay:
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    {[2000, 3000, 5000].map((ms) => (
                      <button
                        key={ms}
                        type="button"
                        onClick={() => setDepTimeout(ms)}
                        style={{
                          background: depTimeout === ms ? '#201c35' : '#101722',
                          border: `1px solid ${depTimeout === ms ? '#8c7adb' : 'var(--line)'}`,
                          color: depTimeout === ms ? '#c4b8ff' : 'var(--muted)',
                          padding: '5px 8px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          cursor: 'pointer',
                        }}
                      >
                        {ms}ms
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn-danger"
                disabled={loading}
                onClick={() =>
                  handleEnableChaos('payments-api', 'DEPENDENCY_TIMEOUT', { delayMs: depTimeout })
                }
              >
                Inject Timeout on orders ➔ payments
              </button>
            </div>
          </div>

          <div style={{ marginTop: '28px', padding: '16px', background: '#0e1520', borderRadius: '6px', border: '1px solid var(--line)', fontSize: '11px', color: 'var(--muted)', lineHeight: '1.6' }}>
            <strong style={{ color: 'var(--text)' }}>SRE Note:</strong> When injecting a fault, monitor the <Link href="/dashboard" style={{ color: '#c4b8ff', textDecoration: 'underline' }}>Reliability Dashboard</Link> to watch p95 latency or error rates surge, and observe Error Budget Burn Rate acceleration in PromQL windows. For fast presentations, screenshots, or short videos, use the <Link href="/demo" style={{ color: '#c4b8ff', textDecoration: 'underline' }}>/demo</Link> presentation route.
          </div>
        </main>
      </div>
    </div>
  );
}
