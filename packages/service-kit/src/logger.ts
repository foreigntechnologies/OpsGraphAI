import pino from 'pino';
import { Writable } from 'node:stream';
import { trace, context } from '@opentelemetry/api';

const lokiUrl = process.env.LOKI_URL || 'http://127.0.0.1:3100';

class LokiStream extends Writable {
  private buffer: Array<[string, string]> = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(private serviceName: string, private environment: string) {
    super();
  }

  _write(chunk: any, _encoding: string, callback: () => void) {
    const rawLine = chunk.toString();
    const nanoTs = String(Date.now()) + '000000';
    this.buffer.push([nanoTs, rawLine]);

    if (this.buffer.length >= 10) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), 1000);
    }
    callback();
  }

  private flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.buffer.length === 0) return;
    const batch = this.buffer;
    this.buffer = [];

    const payload = {
      streams: [
        {
          stream: {
            service_name: this.serviceName,
            environment: this.environment,
          },
          values: batch,
        },
      ],
    };

    fetch(`${lokiUrl}/loki/api/v1/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Non-blocking background push
    });
  }
}

export function createLogger(serviceName: string, environment = process.env.NODE_ENV ?? 'development') {
  const lokiStream = new LokiStream(serviceName, environment);
  const streams = pino.multistream([
    { stream: process.stdout },
    { stream: lokiStream },
  ]);

  return pino({
    level: process.env.LOG_LEVEL ?? 'info',
    formatters: {
      level(label) {
        return { level: label.toUpperCase() };
      },
    },
    mixin() {
      const activeSpan = trace.getSpan(context.active());
      if (!activeSpan) return { service: serviceName, environment };
      const spanContext = activeSpan.spanContext();
      return {
        service: serviceName,
        environment,
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
      };
    },
  }, streams);
}

export type Logger = ReturnType<typeof createLogger>;
