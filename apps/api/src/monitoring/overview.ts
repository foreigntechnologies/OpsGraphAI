import type { HttpCheck } from '@prisma/client';
import { db } from '../db.js';
import { config } from '../config.js';

export const WINDOW_SECONDS = 300;

export function summarizeChecks(checks: HttpCheck[], now = new Date()) {
  const ordered = [...checks].sort((a, b) => b.checkedAt.getTime() - a.checkedAt.getTime());
  const latest = ordered[0];
  const recent = ordered.filter((check) => check.checkedAt.getTime() >= now.getTime() - WINDOW_SECONDS * 1000 && check.checkedAt <= now);
  const failedChecks = recent.filter((check) => !check.success).length;
  const latencies = recent.filter((check) => check.success).map((check) => check.durationMs).sort((a, b) => a - b);
  const availability = recent.length ? 100 * (recent.length - failedChecks) / recent.length : null;
  const stale = latest && now.getTime() - latest.checkedAt.getTime() > Math.max(config.MONITOR_INTERVAL_SECONDS * 3, config.MONITOR_TIMEOUT_MS / 1000 + config.MONITOR_INTERVAL_SECONDS) * 1000;
  const status = !latest ? 'PENDING' : stale ? 'STALE' : !latest.success ? 'DOWN' : availability != null && availability < 99.99 ? 'DEGRADED' : 'UP';
  return {
    status, availability, sampleCount: recent.length, failedChecks,
    errorRate: recent.length ? failedChecks / recent.length * 100 : null,
    latencyP95: latencies.length ? latencies[Math.ceil(latencies.length * 0.95) - 1]! : null,
    lastCheckedAt: latest?.checkedAt.toISOString() ?? null,
    lastStatusCode: latest?.statusCode ?? null, lastError: latest?.error ?? null,
    history: recent.slice(0, 60).map((check) => ({ ...check, checkedAt: check.checkedAt.toISOString() })),
  };
}

export async function getMonitoringOverview() {
  const now = new Date();
  const monitors = await db.httpMonitor.findMany({
    where: { enabled: true }, orderBy: { name: 'asc' },
    include: { checks: { orderBy: { checkedAt: 'desc' }, take: 120 } },
  });
  return {
    source: 'HTTP', windowSeconds: WINDOW_SECONDS, intervalSeconds: config.MONITOR_INTERVAL_SECONDS,
    generatedAt: now.toISOString(),
    monitors: monitors.map(({ checks, ...monitor }) => ({ ...monitor, ...summarizeChecks(checks, now) })),
  };
}
