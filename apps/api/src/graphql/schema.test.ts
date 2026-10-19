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
