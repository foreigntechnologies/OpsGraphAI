import client from 'prom-client';
import type { Request, Response, NextFunction } from 'express';

export function createMetrics(serviceName: string, serviceVersion = '1.0.0', environment = process.env.NODE_ENV ?? 'development') {
  const register = new client.Registry();
  client.collectDefaultMetrics({ register, prefix: `${serviceName.replace(/-/g, '_')}_` });

  const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests processed',
    labelNames: ['service', 'method', 'route', 'status_code', 'environment'] as const,
    registers: [register],
  });

  const httpRequestDurationSeconds = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['service', 'method', 'route', 'environment'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 1, 1.5, 2.5, 5, 10],
    registers: [register],
  });

  const httpRequestErrorsTotal = new client.Counter({
    name: 'http_request_errors_total',
    help: 'Total number of HTTP request errors',
    labelNames: ['service', 'method', 'route', 'error_type'] as const,
    registers: [register],
  });

  const serviceHealth = new client.Gauge({
    name: 'service_health',
    help: 'Health status of the service (1 = healthy, 0 = unhealthy)',
    labelNames: ['service', 'check'] as const,
    registers: [register],
  });
  serviceHealth.set({ service: serviceName, check: 'ready' }, 1);

  const serviceBuildInfo = new client.Gauge({
    name: 'service_build_info',
    help: 'Build and version info for the service',
    labelNames: ['service', 'version', 'commit'] as const,
    registers: [register],
  });
  serviceBuildInfo.set({ service: serviceName, version: serviceVersion, commit: process.env.GIT_COMMIT ?? 'dev' }, 1);

  function middleware(req: Request, res: Response, next: NextFunction) {
    const path = req.path || req.url || '';
    if (path.startsWith('/health') || path.startsWith('/metrics')) {
      return next();
    }

    const start = process.hrtime();

    res.on('finish', () => {
      const diff = process.hrtime(start);
      const durationSeconds = diff[0] + diff[1] / 1e9;
      const route = req.route?.path || req.baseUrl || (path === '/' ? '/' : 'unmatched');
      const statusCode = String(res.statusCode);

      httpRequestsTotal.inc({
        service: serviceName,
        method: req.method,
        route,
        status_code: statusCode,
        environment,
      });

      httpRequestDurationSeconds.observe({
        service: serviceName,
        method: req.method,
        route,
        environment,
      }, durationSeconds);

      if (res.statusCode >= 500) {
        httpRequestErrorsTotal.inc({
          service: serviceName,
          method: req.method,
          route,
          error_type: 'http_5xx',
        });
      }
    });

    next();
  }

  return {
    register,
    middleware,
    httpRequestsTotal,
    httpRequestDurationSeconds,
    httpRequestErrorsTotal,
    serviceHealth,
    serviceBuildInfo,
  };
}

export type Metrics = ReturnType<typeof createMetrics>;
