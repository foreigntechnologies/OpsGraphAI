import { context, trace, propagation } from '@opentelemetry/api';
import type { Logger } from './logger.js';

export interface HttpClientOptions extends RequestInit {
  timeoutMs?: number;
}

export async function fetchWithTrace(
  url: string,
  options: HttpClientOptions = {},
  logger?: Logger,
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const headers = new Headers(options.headers);

  // Inject W3C trace context into outbound request headers
  propagation.inject(context.active(), headers, {
    set(carrier, key, value) {
      carrier.set(key, value);
    },
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    return res;
  } catch (error) {
    const durationMs = Date.now() - start;
    const isTimeout = (error as Error).name === 'AbortError';
    logger?.error({
      url,
      durationMs,
      timeoutMs,
      isTimeout,
      error: (error as Error).message,
    }, isTimeout ? 'dependency request timed out' : 'dependency request failed');
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
