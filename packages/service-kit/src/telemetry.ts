import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION, SEMRESATTRS_DEPLOYMENT_ENVIRONMENT } from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';

import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';

export function initTelemetry(serviceName: string, serviceVersion = '1.0.0', environment = process.env.NODE_ENV ?? 'development') {
  const otelEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://127.0.0.1:4318';
  const tracesEndpoint = `${otelEndpoint.replace(/\/$/, '')}/v1/traces`;

  const traceExporter = new OTLPTraceExporter({
    url: tracesEndpoint,
  });

  const sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: serviceName,
      [SEMRESATTRS_SERVICE_VERSION]: serviceVersion,
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: environment,
    }),
    spanProcessor: new SimpleSpanProcessor(traceExporter),
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook(req) {
          const url = req.url ?? '';
          return url.startsWith('/health') || url.startsWith('/metrics');
        },
      }),
      new ExpressInstrumentation(),
    ],
  });

  try {
    sdk.start();
  } catch {
    // If collector is unreachable or fails to bind, log warning safely without crashing
    console.warn(`[OTel] Telemetry initialization warning for ${serviceName}: exporter endpoint at ${tracesEndpoint}`);
  }

  process.on('SIGTERM', () => {
    sdk.shutdown().catch(() => {}).finally(() => process.exit(0));
  });

  return sdk;
}
