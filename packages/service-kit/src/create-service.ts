import express, { type Express, type Request, type Response } from 'express';
import { trace, SpanStatusCode, SpanKind, context, propagation } from '@opentelemetry/api';
import { createLogger, type Logger } from './logger.js';
import { createMetrics, type Metrics } from './metrics.js';
import { createHealthRoutes, type HealthCheckFn } from './health.js';
import { ChaosEngine } from './chaos.js';

export interface ServiceOptions {
  name: string;
  version?: string;
  port?: number;
  dependencyChecks?: Record<string, HealthCheckFn>;
}

export interface ServiceContext {
  app: Express;
  logger: Logger;
  metrics: Metrics;
  chaos: ChaosEngine;
  start: () => Promise<void>;
}

export function createService(options: ServiceOptions): ServiceContext {
  const { name, version = '1.0.0', port = 8080, dependencyChecks = {} } = options;

  const logger = createLogger(name);
  const metrics = createMetrics(name, version);
  const chaos = new ChaosEngine(name, logger);
  const health = createHealthRoutes(name, version, dependencyChecks);

  const app = express();
  app.use(express.json());

  // Tracing middleware: creates OpenTelemetry spans for all business routes
  app.use((req: Request, res: Response, next) => {
    if (req.path.startsWith('/health') || req.path.startsWith('/metrics')) {
      return next();
    }

    const tracer = trace.getTracer(name);
    const parentContext = propagation.extract(context.active(), req.headers);

    const span = tracer.startSpan(`${req.method} ${req.path}`, {
      kind: SpanKind.SERVER,
      attributes: {
        'http.method': req.method,
        'http.route': req.path,
        'http.target': req.originalUrl || req.url,
        'service.name': name,
      },
    }, parentContext);

    const originalEnd = res.end.bind(res);
    res.end = function (...args: any[]) {
      span.setAttribute('http.status_code', res.statusCode);
      if (res.statusCode >= 500) {
        span.setStatus({ code: SpanStatusCode.ERROR });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }
      span.end();
      return (originalEnd as any)(...args);
    };

    context.with(trace.setSpan(parentContext, span), () => {
      next();
    });
  });

  // Metrics middleware (measures duration and increments requests_total)
  app.use(metrics.middleware);

  // Health and metrics endpoints (bypasses chaos)
  app.get('/health', health.healthHandler);
  app.get('/health/live', health.liveHandler);
  app.get('/health/ready', health.readyHandler);
  app.get('/metrics', async (_req: Request, res: Response) => {
    res.setHeader('Content-Type', metrics.register.contentType);
    res.send(await metrics.register.metrics());
  });

  // Chaos admin endpoints
  app.get('/admin/chaos', (_req: Request, res: Response) => {
    res.json(chaos.getChaosState());
  });

  app.post('/admin/chaos', (req: Request, res: Response) => {
    try {
      const { scenario, params, ttlMinutes } = req.body;
      chaos.setScenario(scenario, params || {}, ttlMinutes);
      res.json({ ok: true, state: chaos.getChaosState() });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete('/admin/chaos', (_req: Request, res: Response) => {
    chaos.resetAll();
    res.json({ ok: true, state: chaos.getChaosState() });
  });

  // Chaos injection middleware for all following business routes
  app.use(chaos.middleware());

  function start(): Promise<void> {
    return new Promise((resolve) => {
      const server = app.listen(port, () => {
        logger.info({ port, version }, `${name} listening on port ${port}`);
        resolve();
      });

      const shutdown = () => {
        logger.info(`Shutting down ${name}...`);
        server.close(() => process.exit(0));
      };
      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    });
  }

  return { app, logger, metrics, chaos, start };
}
