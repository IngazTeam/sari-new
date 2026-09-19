import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2).filter(value => value !== '--');
const withDatabase = args.includes('--with-database');
const vitestArgs = args.filter(value => value !== '--with-database');
// Inherit OS/runtime paths only. Real provider and database credentials must not
// leak into old integration tests via the caller's environment or local .env.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(?:PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|TMPDIR|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMDATA|HOMEDRIVE|HOMEPATH|NUMBER_OF_PROCESSORS|CI)$/i.test(key)));
const directory = resolve('.tmp/isolated-tests');
mkdirSync(directory, { recursive: true });
const emptyEnv = resolve(directory, 'empty.env');
writeFileSync(emptyEnv, '# Isolated test environment; deliberately no credentials.\n');
Object.assign(env, { NODE_ENV: 'test', SARI_ENV_FILE: emptyEnv, DOTENV_CONFIG_PATH: emptyEnv,
  NODE_OPTIONS: `--require "${resolve('scripts/testing/block-external-network.cjs').replaceAll('\\', '/')}"` });
if (withDatabase) {
  const url = new URL(process.env.SARI_TEST_DATABASE_URL || '');
  if (!['mysql:', 'mysql2:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || !/^\/[a-z0-9_]*test[a-z0-9_]*$/i.test(url.pathname) || url.search || url.hash) {
    throw new Error('SARI_TEST_DATABASE_URL must identify a loopback disposable test database');
  }
  env.DATABASE_URL = url.toString();
}
const result = spawnSync(process.execPath, [resolve('node_modules/vitest/vitest.mjs'), 'run', '--maxWorkers=2', ...vitestArgs],
  { env, stdio: 'inherit', windowsHide: true });
if (result.error) console.error('Unable to start isolated test process');
process.exitCode = result.status ?? 1;
