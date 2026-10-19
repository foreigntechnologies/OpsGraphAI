import { performance } from 'node:perf_hooks';
import { db } from '../db.js';
import { config } from '../config.js';
import { monitorId, publicUrl, targetHeaders, type MonitorTarget } from './targets.js';

export async function probe(target: MonitorTarget, timeoutMs = config.MONITOR_TIMEOUT_MS) {
  const headers = targetHeaders(target);
  const started = performance.now();
  const checkedAt = new Date();
  try {
    const response = await fetch(target.url, {
      method: 'GET', headers, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
    });
    const durationMs = Math.round(performance.now() - started);
    await response.body?.cancel();
    const success = response.status >= 200 && response.status < 300;
    return { checkedAt, durationMs, success, statusCode: response.status, error: success ? null : `HTTP ${response.status}` };
  } catch (error) {
    return {
      checkedAt, durationMs: Math.round(performance.now() - started), success: false, statusCode: null,
      error: (error as Error).name === 'TimeoutError' ? 'Connection timeout exceeded' : 'Connection failure or TLS error',
    };
  }
}

export async function registerTargets(targets: MonitorTarget[]) {
  targets.forEach(targetHeaders);
  await db.$transaction(async (tx) => {
    await tx.httpMonitor.updateMany({ data: { enabled: false } });
    for (const target of targets) {
      await tx.httpMonitor.upsert({
        where: { id: monitorId(target) }, update: { enabled: true },
        create: { id: monitorId(target), name: target.name, url: publicUrl(target.url) },
      });
    }
  });
}

export async function collectTargets(targets: MonitorTarget[]) {
  const results = await Promise.allSettled(targets.map(async (target) => {
    const result = await probe(target);
    await db.httpCheck.create({ data: { ...result, monitorId: monitorId(target) } });
  }));
  if (results.some((result) => result.status === 'rejected')) throw new Error('Failed to persist one or more HTTP checks');
}

export function startCollector(targets: MonitorTarget[]) {
  let running: Promise<void> | null = null;
  const tick = () => {
    if (running) return;
    running = collectTargets(targets).catch(() => {
      console.error('HTTP monitoring collection failed; inspect database connectivity and target configuration.');
    }).finally(() => { running = null; });
  };
  tick();
  const timer = setInterval(tick, config.MONITOR_INTERVAL_SECONDS * 1000);
  return async () => { clearInterval(timer); await running; };
}
