import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  PrometheusMetricsProvider,
  LokiLogsProvider,
  TempoTracingProvider,
  ChaosControllerProvider,
} from './index.js';
import { ChaosEngine } from '@opsgraph/service-kit';

describe('Real Observability Providers', () => {
  it('PrometheusMetricsProvider reports DISCONNECTED when Prometheus is down', async () => {
    const provider = new PrometheusMetricsProvider('http://127.0.0.1:59999');
    const result = await provider.getServiceReliability('payments-api');

    expect(result.state).toBe('DISCONNECTED');
    expect(result.data).toBeNull();
    expect(result.source).toBe('prometheus');
    expect(result.error).toBeDefined();
  });

  it('LokiLogsProvider reports DISCONNECTED when Loki is down', async () => {
    const provider = new LokiLogsProvider('http://127.0.0.1:59999');
    const result = await provider.searchLogs('payments-api');

    expect(result.state).toBe('DISCONNECTED');
    expect(result.data).toBeNull();
  });

  it('TempoTracingProvider reports DISCONNECTED when Tempo is down', async () => {
    const provider = new TempoTracingProvider('http://127.0.0.1:59999');
    const result = await provider.searchTraces('payments-api');

    expect(result.state).toBe('DISCONNECTED');
    expect(result.data).toBeNull();
  });

  it('PrometheusMetricsProvider parses mock Prometheus server responses cleanly', async () => {
    const mockServer = createServer((req, res) => {
      const url = new URL(req.url || '', 'http://localhost');
      if (url.pathname === '/-/ready') {
        res.writeHead(200);
        res.end('Prometheus is Ready.');
        return;
      }
      if (url.pathname === '/api/v1/query') {
        const query = url.searchParams.get('query') || '';
        let val = '0';
        if (query.includes('http_requests_total') && !query.includes('status_code')) {
          val = '12.5'; // 12.5 req/s
        } else if (query.includes('status_code!~"5.."')) {
          val = '99.99'; // 99.99% availability (matches 99.99% SLO target)
        } else if (query.includes('status_code=~"5.."')) {
          val = '0.015'; // 0.015% error rate for 99.99% SLO
        } else if (query.includes('0.50')) {
          val = '45.0'; // 45ms
        } else if (query.includes('0.95')) {
          val = '148.0'; // 148ms
        } else if (query.includes('0.99')) {
          val = '220.0'; // 220ms
        } else if (query.includes('le="0.5"')) {
          val = '99.5'; // 99.5%
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'success',
            data: {
              resultType: 'vector',
              result: [{ metric: { service: 'payments-api' }, value: [Date.now() / 1000, val] }],
            },
          }),
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
    const port = (mockServer.address() as AddressInfo).port;
    const provider = new PrometheusMetricsProvider(`http://127.0.0.1:${port}`);

    const result = await provider.getServiceReliability('payments-api');
    expect(result.state).toBe('LIVE');
    expect(result.data).toBeDefined();
    expect(result.data?.service).toBe('payments-api');
    expect(result.data?.requestsPerSecond).toBe(12.5);
    expect(result.data?.availability).toBe(99.99);
    expect(result.data?.latencyP95).toBe(148);
    expect(result.data?.errorRate).toBe(0.01);
    expect(result.data?.burnRate).toBe(1.5);
    expect(result.data?.burnLevel).toBe('WARNING');
    expect(result.data?.sloStatus).toBe('AT_RISK');

    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  });

  it('ChaosEngine safely records, activates, and resets fault injection', () => {
    const logger = {
      info: () => {},
      warn: () => {},
      error: () => {},
    } as any;

    const chaos = new ChaosEngine('payments-api', logger, true);
    expect(chaos.getChaosState().activeScenarios).toHaveLength(0);

    // Inject database latency
    chaos.setScenario('DATABASE_LATENCY', { latencyMs: 1500 }, 5);
    let state = chaos.getChaosState();
    expect(state.activeScenarios).toHaveLength(1);
    expect(state.activeScenarios[0]?.type).toBe('DATABASE_LATENCY');
    expect(state.activeScenarios[0]?.params.latencyMs).toBe(1500);

    // Reset
    chaos.resetAll();
    state = chaos.getChaosState();
    expect(state.activeScenarios).toHaveLength(0);
  });
});
