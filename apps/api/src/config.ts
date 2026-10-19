import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { z } from 'zod';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
export const config = z.object({
  DATABASE_URL: z.string().startsWith('file:').default('file:./dev.db'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('127.0.0.1'),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  MONITOR_TARGETS_FILE: z.string().default('monitors.json'),
  MONITOR_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(3600).default(30),
  MONITOR_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(5000),
  PROMETHEUS_URL: z.string().default('http://127.0.0.1:9090'),
  LOKI_URL: z.string().default('http://127.0.0.1:3100'),
  TEMPO_URL: z.string().default('http://127.0.0.1:3200'),
  GRAFANA_URL: z.string().default('http://127.0.0.1:3001'),
  OTEL_COLLECTOR_URL: z.string().default('http://127.0.0.1:13133'),
  RELIABILITY_WINDOW: z.string().default('1m'),
  RELIABILITY_POLL_SECONDS: z.coerce.number().int().default(5),
  INCIDENT_EVAL_INTERVAL_SECONDS: z.coerce.number().int().default(15),
  CHAOS_ENABLED: z.coerce.boolean().default(true),
  CHAOS_ADMIN_TOKEN: z.string().default('opsgraph-local-chaos-token'),
}).parse(process.env);
process.env.DATABASE_URL = config.DATABASE_URL;
// Resolve identically for Prisma CLI, API and tests, regardless of cwd.
export const databaseUrl = `file:${resolve(fileURLToPath(new URL('../prisma/', import.meta.url)), config.DATABASE_URL.slice(5)).replaceAll('\\', '/')}`;
