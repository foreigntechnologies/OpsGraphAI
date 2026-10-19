import type { Request, Response } from 'express';

export type HealthCheckFn = () => Promise<{ ok: boolean; message?: string }>;

export function createHealthRoutes(
  serviceName: string,
  serviceVersion = '1.0.0',
  dependencyChecks: Record<string, HealthCheckFn> = {},
) {
  const startedAt = new Date().toISOString();

  async function checkAll(): Promise<{ allOk: boolean; checks: Record<string, string> }> {
    const results: Record<string, string> = {};
    let allOk = true;

    for (const [name, fn] of Object.entries(dependencyChecks)) {
      try {
        const res = await fn();
        results[name] = res.ok ? 'ok' : res.message ?? 'failed';
        if (!res.ok) allOk = false;
      } catch (err) {
        results[name] = (err as Error).message;
        allOk = false;
      }
    }

    return { allOk, checks: results };
  }

  async function healthHandler(_req: Request, res: Response) {
    const { allOk, checks } = await checkAll();
    const status = allOk ? 'healthy' : 'degraded';
    res.status(allOk ? 200 : 503).json({
      status,
      service: serviceName,
      version: serviceVersion,
      startedAt,
      timestamp: new Date().toISOString(),
      checks,
    });
  }

  function liveHandler(_req: Request, res: Response) {
    res.status(200).json({ status: 'live', service: serviceName, timestamp: new Date().toISOString() });
  }

  async function readyHandler(_req: Request, res: Response) {
    const { allOk, checks } = await checkAll();
    res.status(allOk ? 200 : 503).json({
      status: allOk ? 'ready' : 'not_ready',
      service: serviceName,
      timestamp: new Date().toISOString(),
      checks,
    });
  }

  return { healthHandler, liveHandler, readyHandler };
}
