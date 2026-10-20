import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { db } from '../db.js';
import { createApi } from './schema.js';
import { collectTargets, probe, registerTargets } from '../monitoring/collector.js';
import { getMonitoringOverview, summarizeChecks } from '../monitoring/overview.js';
import { monitorId, publicUrl, targetListSchema, type MonitorTarget } from '../monitoring/targets.js';

let status = 200;
let baseUrl: string;
const server = createServer((request, response) => {
  if (request.url === '/timeout') return;
  if (request.url === '/redirect') { response.writeHead(302, { Location: '/health' }); response.end(); return; }
  response.writeHead(status);
  response.end('health response');
});
const api = createApi();
async function query(query: string) {
  const response = await api.fetch('http://localhost/graphql', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
  });
  return response.json();
}
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
});

describe('real HTTP collection, persistence and GraphQL', () => {
  it('starts empty, without pre-populated services or invented telemetry', async () => {
    const result = await query('{ monitoring { source monitors { name sampleCount availability } } }');
    expect(result.errors).toBeUndefined();
    expect(result.data.monitoring).toEqual({ source: 'HTTP', monitors: [] });
  });

  it('measures actual HTTP success, failure and recovery without erasing failures', async () => {
    const targets: MonitorTarget[] = [{ name: 'Test health endpoint', url: `${baseUrl}/health?private=hidden` }];
    await registerTargets(targets);
    let overview = await getMonitoringOverview();
    expect(overview.monitors[0]).toMatchObject({ status: 'PENDING', availability: null, latencyP95: null, sampleCount: 0 });
    await collectTargets(targets);
    overview = await getMonitoringOverview();
    expect(overview.monitors[0]).toMatchObject({ status: 'UP', availability: 100, sampleCount: 1, lastStatusCode: 200 });
    status = 503;
    await collectTargets(targets);
    overview = await getMonitoringOverview();
    expect(overview.monitors[0]).toMatchObject({ status: 'DOWN', availability: 50, failedChecks: 1, lastError: 'HTTP 503' });
    status = 200;
    await collectTargets(targets);
    const result = await query('{ monitoring { monitors { name url status availability sampleCount failedChecks history { checkedAt success statusCode durationMs } } } }');
    expect(result.errors).toBeUndefined();
    expect(result.data.monitoring.monitors[0]).toMatchObject({ status: 'DEGRADED', sampleCount: 3, failedChecks: 1 });
    expect(result.data.monitoring.monitors[0].availability).toBeCloseTo(200 / 3);
    expect(result.data.monitoring.monitors[0].url).not.toContain('private');
    expect(result.data.monitoring.monitors[0].history).toHaveLength(3);
    expect(await db.httpCheck.count({ where: { monitorId: monitorId(targets[0]!) } })).toBe(3);
  });

  it('records real timeouts and rejects redirects instead of following them', async () => {
    expect(await probe({ name: 'Timeout endpoint', url: `${baseUrl}/timeout` }, 100)).toMatchObject({
      success: false, statusCode: null, error: 'Connection timeout exceeded',
    });
    expect(await probe({ name: 'Redirect endpoint', url: `${baseUrl}/redirect` })).toMatchObject({
      success: false, statusCode: 302, error: 'HTTP 302',
    });
  });

  it('reports stale collection and does not create success for missing windows', async () => {
    const checks = await db.httpCheck.findMany();
    const later = new Date(Date.now() + 600_000);
    expect(summarizeChecks(checks, later)).toMatchObject({
      status: 'STALE', availability: null, latencyP95: null, errorRate: null, sampleCount: 0,
    });
    expect(summarizeChecks([])).toMatchObject({ status: 'PENDING', availability: null });
  });

  it('does not expose the old seeded scenario through GraphQL', async () => {
    const result = await query('{ incidents { id } }');
    expect(result.errors).toBeUndefined();
    expect(result.data.incidents).toEqual([]);
  });

  it('preserves previous measurements when the configured target changes', async () => {
    await registerTargets([{ name: 'Replacement target', url: `${baseUrl}/other` }]);
    const overview = await getMonitoringOverview();
    expect(overview.monitors).toHaveLength(1);
    expect(overview.monitors[0]).toMatchObject({ name: 'Replacement target', availability: null, status: 'PENDING' });
    expect(await db.httpCheck.count()).toBe(3);
  });
});

describe('target configuration', () => {
  it('rejects unsafe protocols and credentials embedded in URLs', () => {
    for (const url of ['file:///tmp/data', 'ftp://example.com', 'https://user:password@example.com']) {
      expect(targetListSchema.safeParse([{ name: 'Service', url }]).success).toBe(false);
    }
  });
  it('rejects duplicate names and strips sensitive query data from public URLs', () => {
    expect(targetListSchema.safeParse([{ name: 'same', url: 'https://example.com' }, { name: 'same', url: 'https://example.org' }]).success).toBe(false);
    expect(publicUrl('https://example.com/health?token=secret#fragment')).toBe('https://example.com/health');
  });
});

describe('structured remediation decisions and approval tracking', () => {
  it('queries decisionStats and records approval and rejection decisions with categories', async () => {
    // Initial stats check
    const initialRes = await query('{ decisionStats { totalDecisions approvalRate rejectionRate rejectionsByCategory { category count } } }');
    expect(initialRes.errors).toBeUndefined();
    expect(initialRes.data.decisionStats).toBeDefined();

    // Create a real service and incident for testing approval/rejection audit trail
    const service = await db.service.create({
      data: {
        name: `test-service-${Date.now()}`,
        version: '1.0.0',
        owner: 'SRE Team',
      },
    });

    const incident = await db.incident.create({
      data: {
        title: 'High Latency on Test Service',
        description: 'p95 latency spike detected in test',
        serviceId: service.id,
        status: 'AWAITING_APPROVAL',
        remediationPlan: {
          create: [
            {
              order: 1,
              title: 'Restart downstream pool',
              description: 'Recycle connection pool to relieve locks',
              riskLevel: 'LOW',
              riskScore: 20,
              requiresApproval: true,
              status: 'PENDING',
            },
          ],
        },
      },
      include: { remediationPlan: true },
    });

    // Test structured rejection with categorized reason and operator identity
    const rejectRes = await query(`
      mutation {
        rejectRemediation(
          incidentId: "${incident.id}"
          reason: "Database locks were transient, restart unnecessary"
          category: "FALSE_POSITIVE"
          decidedBy: "operator@opsgraph.io"
        ) {
          id
          status
          decisions {
            decision
            category
            reason
            decidedBy
          }
        }
      }
    `);

    expect(rejectRes.errors).toBeUndefined();
    expect(rejectRes.data.rejectRemediation.status).toBe('INVESTIGATING');
    expect(rejectRes.data.rejectRemediation.decisions).toHaveLength(1);
    expect(rejectRes.data.rejectRemediation.decisions[0]).toMatchObject({
      decision: 'REJECTED',
      category: 'FALSE_POSITIVE',
      reason: 'Database locks were transient, restart unnecessary',
      decidedBy: 'operator@opsgraph.io',
    });

    // Test structured approval with operator identity
    const approveRes = await query(`
      mutation {
        approveRemediation(
          incidentId: "${incident.id}"
          decidedBy: "lead-sre@opsgraph.io"
          reason: "Second assessment confirmed restart is safe"
        ) {
          id
          status
          decisions {
            decision
            decidedBy
          }
        }
      }
    `);

    expect(approveRes.errors).toBeUndefined();
    expect(approveRes.data.approveRemediation.status).toBe('MONITORING');
    expect(approveRes.data.approveRemediation.decisions).toHaveLength(2);

    // Verify decision stats aggregation
    const statsRes = await query('{ decisionStats { totalDecisions approvedCount rejectedCount rejectionsByCategory { category count } } }');
    expect(statsRes.errors).toBeUndefined();
    expect(statsRes.data.decisionStats.totalDecisions).toBeGreaterThanOrEqual(2);
    expect(statsRes.data.decisionStats.rejectedCount).toBeGreaterThanOrEqual(1);
    expect(statsRes.data.decisionStats.approvedCount).toBeGreaterThanOrEqual(1);
    const fpCategory = statsRes.data.decisionStats.rejectionsByCategory.find((c: any) => c.category === 'FALSE_POSITIVE');
    expect(fpCategory).toBeDefined();
    expect(fpCategory.count).toBeGreaterThanOrEqual(1);
  });
});

