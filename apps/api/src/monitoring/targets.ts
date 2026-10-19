import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { config } from '../config.js';

const targetSchema = z.object({
  name: z.string().trim().min(1).max(100),
  url: z.url().refine((value) => {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  }, 'Use HTTP(S) without credentials in the URL'),
  headersEnv: z.string().regex(/^[A-Z_][A-Z0-9_]*$/).optional(),
});
export type MonitorTarget = z.infer<typeof targetSchema>;
export const targetListSchema = z.array(targetSchema).min(1).max(50).refine(
  (targets) => new Set(targets.map((target) => target.name)).size === targets.length,
  'Monitor names must be unique',
);
export const monitorId = (target: MonitorTarget) => createHash('sha256').update(`${target.name}\0${target.url}`).digest('hex').slice(0, 24);
export const publicUrl = (value: string) => { const url = new URL(value); return `${url.origin}${url.pathname}`; };

export async function loadTargets(): Promise<MonitorTarget[]> {
  const path = resolve(fileURLToPath(new URL('../../../../', import.meta.url)), config.MONITOR_TARGETS_FILE);
  let content: string;
  try { content = await readFile(path, 'utf8'); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    if (config.MONITOR_TARGETS_FILE !== 'monitors.json') throw new Error('Configured monitor targets file was not found');
    const host = config.HOST === '0.0.0.0' ? '127.0.0.1' : config.HOST;
    return [{ name: 'OpsGraph API · self-check', url: `http://${host}:${config.PORT}/health` }];
  }
  return targetListSchema.parse(JSON.parse(content));
}

export function targetHeaders(target: MonitorTarget): Record<string, string> {
  if (!target.headersEnv) return {};
  const value = process.env[target.headersEnv];
  if (!value) throw new Error(`Missing environment variable ${target.headersEnv}`);
  return z.record(z.string(), z.string()).parse(JSON.parse(value));
}
