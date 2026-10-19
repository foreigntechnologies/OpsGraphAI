import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

export default function setup() {
  const directory = mkdtempSync(join(tmpdir(), 'opsgraph-test-'));
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = `file:${join(directory, 'test.db').replaceAll('\\', '/')}`;
  const cleanup = () => {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    // Teardown runs after test workers exit and release native SQLite handles on Windows.
    rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  };
  try {
    execFileSync(process.execPath, [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--config', resolve('apps/api/prisma.config.ts')], { env: process.env, stdio: 'pipe' });
  } catch (error) {
    cleanup();
    throw error;
  }
  return cleanup;
}
