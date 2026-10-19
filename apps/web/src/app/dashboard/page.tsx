import Link from 'next/link';
import {
  getRealDashboardData,
  RealDashboardData,
  ServiceReliability,
  ServiceHealth,
} from '../../lib/graphql-client';
import { AVAILABILITY_CRITICAL, AVAILABILITY_TARGET, getAvailabilityStatus } from '../../lib/availability-status';
import { LiveRefresh } from './live-refresh';

export const dynamic = 'force-dynamic';

const number = (value: number | null | undefined, digits = 2) => {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
};

const time = (value: string | null | undefined) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleTimeString('en-US', { timeZone: 'UTC' });
  } catch {
    return value;
  }
};

const dataStateBadges: Record<string, { label: string; tone: string }> = {
  LIVE: { label: 'LIVE TELEMETRY', tone: 'healthy' },
  STALE: { label: 'STALE DATA', tone: 'amber' },
  NO_DATA: { label: 'NO DATA', tone: 'muted' },
  DISCONNECTED: { label: 'DISCONNECTED', tone: 'danger' },
  DEGRADED: { label: 'DEGRADED', tone: 'amber' },
};

const sloBadges: Record<string, { label: string; tone: string }> = {
  HEALTHY: { label: 'SLO HEALTHY', tone: 'healthy' },
  AT_RISK: { label: 'SLO AT RISK', tone: 'amber' },
  BREACHED: { label: 'SLO BREACHED', tone: 'danger' },
};

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ service?: string | string[]; monitor?: string | string[] }>;
}) {
  let data: RealDashboardData;
  try {
    data = await getRealDashboardData();
  } catch {
    return (
      <main className="offline">
        <span className="brand">⬡ OpsGraph <b>AI</b></span>
        <h1>Telemetry API Unavailable</h1>
        <p>Could not reach the observability GraphQL API. No simulated or mock data will be displayed.</p>
        <a className="button" href="/dashboard">Retry Connection</a>
      </main>
    );
  }

  const params = await searchParams;
  const requestedService = typeof params.service === 'string' ? params.service : 'payments-api';
  
  // Find selected service reliability & health
  const selectedReliability =
    data.servicesReliability.find((s) => s.service === requestedService) ||
    data.servicesReliability[0] ||
    ({
      service: requestedService,
      state: 'NO_DATA',
      window: '1m',
      lastUpdatedAt: new Date().toISOString(),
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
      sloStatus: 'HEALTHY',
    } as ServiceReliability);

  const selectedHealth = data.servicesHealth.find((h) => h.service === requestedService);

  const isLive = selectedReliability.state === 'LIVE';
  const obsHealth = data.observabilityHealth;
  const activeChaos = data.chaosState?.activeScenarios || [];
  const hasActiveChaos = activeChaos.length > 0;
  const activeIncidents = data.activeIncidents || [];
  const primaryIncident = activeIncidents[0];

  // Selected service metrics
  const availability = selectedReliability.availability;
  const availStatus = getAvailabilityStatus(availability);
  const p95 = selectedReliability.latencyP95;
  const errorRate = selectedReliability.errorRate;
  const burnRate = selectedReliability.burnRate;

  const currentBadge = dataStateBadges[selectedReliability.state] || dataStateBadges.NO_DATA!;
  const currentSlo = sloBadges[selectedReliability.sloStatus || 'HEALTHY'] || sloBadges.HEALTHY!;

  return (
    <div className="shell">
      <LiveRefresh intervalSeconds={data.monitoring?.intervalSeconds || 5} />
      
      {/* Sidebar */}
      <aside>
        <Link href="/dashboard" className="brand">
          ⬡ OpsGraph <b>AI</b>
        </Link>
        <div className="workspace">
          SRE PLATFORM
          <span>Real Observability</span>
        </div>

        <nav>
          <Link className="selected" href="/dashboard">◈ Reliability Overview</Link>
          <a href="#services">▦ Platform Services</a>
          <a href="#probes">◎ Synthetic Probes</a>
          <Link href="/chaos">⬢ Chaos Engineering</Link>
        </nav>

        {/* Real Observability Stack Status in Sidebar */}
        <div className="obs-group">
          <span className="obs-title">OBSERVABILITY STACK</span>
          
          <div className="obs-item">
            <span>Prometheus</span>
            <small className={obsHealth.prometheus.status === 'CONNECTED' ? 'healthy' : 'danger'}>
              ● {obsHealth.prometheus.status}
            </small>
          </div>
          
          <div className="obs-item">
            <span>Grafana Loki</span>
            <small className={obsHealth.loki.status === 'CONNECTED' ? 'healthy' : 'danger'}>
              ● {obsHealth.loki.status}
            </small>
          </div>
          
          <div className="obs-item">
            <span>Grafana Tempo</span>
            <small className={obsHealth.tempo.status === 'CONNECTED' ? 'healthy' : 'danger'}>
              ● {obsHealth.tempo.status}
            </small>
          </div>
          
          <div className="obs-item">
            <span>OTel Collector</span>
            <small className={obsHealth.collector.status === 'CONNECTED' ? 'healthy' : 'danger'}>
              ● {obsHealth.collector.status}
            </small>
          </div>

          <div className="obs-item">
            <span>Grafana UI</span>
            <small className={obsHealth.grafana.status === 'CONNECTED' ? 'healthy' : 'danger'}>
              ● {obsHealth.grafana.status}
            </small>
          </div>
        </div>

        <div className="aside-note">
          <span className={`dot ${isLive ? 'dot-pulse' : ''}`} /> Real-time Signals
          <p>
            Metrics from Prometheus & OTel<br />
            {selectedReliability.window} rolling window
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="content">
        <header>
          <span>
            SRE Platform <span className="muted">/</span> Production Telemetry
          </span>
          <div>
            <span className={`dot ${isLive ? 'dot-pulse' : ''}`} />
            <span style={{ marginRight: '14px' }}>
              {isLive ? 'Live Metrics Stream' : 'Awaiting Metrics'}
            </span>
            <span className="badge muted">LOCAL DEV</span>
            <span className="avatar">AI</span>
          </div>
        </header>

        <main>
          {/* Page Title & Status */}
          <div className="page-title">
            <div>
              <div className="eyebrow">RUNTIME OBSERVABILITY PLATFORM</div>
              <h1>Reliability & SLO Metrics</h1>
              <p>Real runtime metrics collected from running services and calculated via PromQL.</p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <Link className="button" href="/chaos">⬢ Inject Chaos (/chaos)</Link>
              <a className="button" href={`/dashboard?service=${encodeURIComponent(requestedService)}`}>↻ Refresh</a>
            </div>
          </div>

          {/* Active Incident Banner if detected */}
          {primaryIncident ? (
            <div className="danger-banner" style={{ borderLeft: '4px solid #ff5468' }}>
              <div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                  <span className="badge danger">{primaryIncident.severity}</span>
                  <span className="badge amber">{primaryIncident.status}</span>
                  <span className="muted" style={{ fontSize: '11px' }}>REAL DETECTED SRE INCIDENT</span>
                </div>
                <h3>⚠️ INCIDENT IN FOCUS: {primaryIncident.title}</h3>
                <p style={{ margin: '4px 0 8px 0' }}>{primaryIncident.description}</p>
                <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--muted)' }}>
                  <span>Service: <strong style={{ color: '#fff' }}>{primaryIncident.serviceName}</strong></span>
                  <span>Started: <strong style={{ color: '#fff' }}>{new Date(primaryIncident.startedAt).toLocaleTimeString()} UTC</strong></span>
                  <span>Timeline: <strong style={{ color: '#fff' }}>{primaryIncident.timeline?.length || 0} events</strong></span>
                </div>
              </div>
              <Link href={`/incidents/${primaryIncident.id}`} className="btn-danger" style={{ alignSelf: 'center', padding: '12px 18px' }}>
                Investigate & Remediate →
              </Link>
            </div>
          ) : hasActiveChaos ? (
            <div className="danger-banner">
              <div>
                <h3>⚠️ ACTIVE CHAOS SCENARIO DETECTED</h3>
                <p>
                  Active fault injection in {activeChaos.map((c) => `${c.service} (${c.type})`).join(', ')}.
                  Telemetry is reflecting real induced degradation.
                </p>
              </div>
              <Link href="/chaos" className="btn-danger">Open Chaos Panel</Link>
            </div>
          ) : (
            <div className="banner-healthy">
              <div className="check-icon">✓</div>
              <div>
                <h3>NO ACTIVE INCIDENTS — PLATFORM HEALTHY</h3>
                <p>
                  All 5 microservices are operating within Service Level Objectives (SLO ≥ 99.99%).
                  Error budget burn rate is stable.
                </p>
              </div>
            </div>
          )}

          {/* Summary Strip */}
          <div className="summary">
            <span className={`dot ${isLive ? 'dot-pulse' : ''}`} />
            <span>5 of 5 monitored services</span>
            <span className="divider">/</span>
            {activeIncidents.length > 0 ? (
              <span className="danger">{activeIncidents.length} firing incidents</span>
            ) : (
              <span className="healthy">0 firing alerts</span>
            )}
            <span className="divider">/</span>
            <span className="muted">SLO Target: ≥ 99.99%</span>
            <span className="summary-right">
              SOURCE: PROMETHEUS + OTEL · {time(selectedReliability.lastUpdatedAt)} UTC
            </span>
          </div>

          {/* Service Selector Tabs */}
          <div className="service-selector">
            {['payments-api', 'api-gateway', 'auth-service', 'orders-api', 'notifications-service'].map((svc) => (
              <Link
                key={svc}
                href={`/dashboard?service=${svc}`}
                className={`service-pill ${svc === requestedService ? 'active' : ''}`}
              >
                {svc}
              </Link>
            ))}
          </div>

          {/* Context for the selected service */}
          <div className="monitor-context">
            <div>
              <h2>{selectedReliability.service}</h2>
              <code>
                {selectedHealth?.url ?? `http://localhost:${requestedService === 'payments-api' ? '8082' : requestedService === 'api-gateway' ? '8080' : '8081'}`}
                {selectedHealth?.version ? ` · v${selectedHealth.version}` : ''}
              </code>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <span className={`badge ${currentBadge.tone}`}>{currentBadge.label}</span>
              <span className={`badge ${currentSlo.tone}`}>{currentSlo.label}</span>
            </div>
          </div>

          {/* Top 4 Metrics Cards */}
          <section className="metrics" aria-label={`Metrics for ${selectedReliability.service}`}>
            {/* Availability */}
            <article className={`metric availability ${availStatus.tone}`}>
              <div className="metric-heading">
                <span>HTTP Availability</span>
                <span className="metric-window">{selectedReliability.window}</span>
              </div>
              <strong className="availability-value">
                {availability != null ? `${number(availability, 2)}%` : '—'}
              </strong>
              <div className="availability-state">
                <span className="status-indicator" />
                {availStatus.label}
              </div>
              <div className="availability-thresholds">
                <small><span className="healthy">●</span> SLO ≥ {number(AVAILABILITY_TARGET, 2)}%</small>
                <small><span className="danger">●</span> Critical ≤ {number(AVAILABILITY_CRITICAL, 2)}%</small>
              </div>
            </article>

            {/* Latency p95 */}
            <article className="metric">
              <span>p95 Latency (Prometheus histogram)</span>
              <strong className={p95 == null ? 'muted' : p95 >= 500 ? 'amber' : 'healthy'}>
                {p95 != null ? `${number(p95, 0)} ms` : '—'}
              </strong>
              <small>
                {selectedReliability.latencyP50 != null ? `p50: ${number(selectedReliability.latencyP50, 0)} ms · ` : ''}
                {selectedReliability.latencyP99 != null ? `p99: ${number(selectedReliability.latencyP99, 0)} ms` : 'SLO limit: 500 ms'}
              </small>
            </article>

            {/* Error Rate */}
            <article className="metric">
              <span>HTTP 5xx Error Rate</span>
              <strong className={errorRate == null ? 'muted' : errorRate > 0.05 ? 'danger' : 'healthy'}>
                {errorRate != null ? `${number(errorRate, 2)}%` : '—'}
              </strong>
              <small>
                {selectedReliability.requestsPerSecond != null
                  ? `Throughput: ${number(selectedReliability.requestsPerSecond, 1)} req/s`
                  : 'Fraction of error responses in window'}
              </small>
            </article>

            {/* Burn Rate */}
            <article className="metric">
              <span>Burn Rate (Error Budget)</span>
              <strong className={burnRate == null ? 'muted' : burnRate >= 14 ? 'danger' : burnRate >= 2 ? 'amber' : 'healthy'}>
                {burnRate != null ? `${number(burnRate, 1)}x` : '—'}
              </strong>
              <small>
                {selectedReliability.burnLevel
                  ? `Level: ${selectedReliability.burnLevel}`
                  : 'Multiplier of budget consumption'}
              </small>
            </article>
          </section>

          {/* Platform Services Table */}
          <section className="panel" id="services">
            <div className="panel-heading">
              <h2>Platform Services</h2>
              <span className="muted">{data.servicesReliability.length} instrumented services</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>SERVICE</th>
                    <th>DATA STATE</th>
                    <th>THROUGHPUT (RPS)</th>
                    <th>AVAILABILITY</th>
                    <th>p95 LATENCY</th>
                    <th>ERROR RATE</th>
                    <th>BURN RATE</th>
                    <th>SLO STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {data.servicesReliability.map((item) => {
                    const badge = dataStateBadges[item.state] || dataStateBadges.NO_DATA!;
                    const slo = sloBadges[item.sloStatus || 'HEALTHY'] || sloBadges.HEALTHY!;
                    const isSelected = item.service === requestedService;
                    return (
                      <tr key={item.service} className={isSelected ? 'active-monitor' : ''}>
                        <td>
                          <Link href={`/services/${encodeURIComponent(item.service)}`}>
                            <strong>{item.service}</strong>
                          </Link>
                        </td>
                        <td>
                          <span className={`badge ${badge.tone}`}>{badge.label}</span>
                        </td>
                        <td>{number(item.requestsPerSecond, 1)} req/s</td>
                        <td className={item.availability != null && item.availability < 99.99 ? 'danger' : 'healthy'}>
                          {item.availability != null ? `${number(item.availability, 2)}%` : '—'}
                        </td>
                        <td className={item.latencyP95 != null && item.latencyP95 >= 500 ? 'amber' : 'healthy'}>
                          {item.latencyP95 != null ? `${number(item.latencyP95, 0)} ms` : '—'}
                        </td>
                        <td className={item.errorRate != null && item.errorRate > 0.05 ? 'danger' : 'healthy'}>
                          {item.errorRate != null ? `${number(item.errorRate, 2)}%` : '—'}
                        </td>
                        <td className={item.burnRate != null && item.burnRate >= 2 ? 'amber' : 'healthy'}>
                          {item.burnRate != null ? `${number(item.burnRate, 1)}x` : '—'}
                        </td>
                        <td>
                          <span className={`badge ${slo.tone}`}>{slo.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Synthetic Blackbox Probes Section */}
          {data.monitoring && (
            <section className="panel" id="probes">
              <div className="panel-heading">
                <h2>Synthetic Checks (Blackbox Probes)</h2>
                <span className="muted">{data.monitoring.monitors.length} HTTP targets</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ENDPOINT</th>
                      <th>URL</th>
                      <th>AVAILABILITY</th>
                      <th>p95 LATENCY</th>
                      <th>HTTP STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.monitoring.monitors.map((m) => (
                      <tr key={m.id}>
                        <td><strong>{m.name}</strong></td>
                        <td><code>{m.url}</code></td>
                        <td className={m.availability != null && m.availability >= 99.99 ? 'healthy' : 'amber'}>
                          {m.availability != null ? `${number(m.availability, 2)}%` : '—'}
                        </td>
                        <td>{m.latencyP95 != null ? `${number(m.latencyP95, 0)} ms` : '—'}</td>
                        <td>
                          <span className={`badge ${m.status === 'UP' ? 'healthy' : 'danger'}`}>
                            {m.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <footer>
            <div>OpsGraph AI · Autonomous SRE & Reliability Engineering Platform</div>
            <div>Real runtime telemetry derived from Prometheus, OpenTelemetry, Loki, and Tempo</div>
          </footer>
        </main>
      </div>
    </div>
  );
}
