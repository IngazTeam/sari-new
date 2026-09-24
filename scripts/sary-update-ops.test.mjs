import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { managedRelease, migrationTasks, runMigrationTasks, assertReady, probe, verifyPublic } from './sary-update-ops.mjs';

const directory = '/var/www/sari-release-12345678-aBc123';
const processes = () => ['sari', 'sari-inbound'].map(name => ({ name, pm2_env: {
  status: 'online', pm_cwd: directory, pm_exec_path: `${directory}/dist/${name === 'sari' ? 'index' : 'worker'}.js`,
} }));
const manifest = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const deployment = fs.readFileSync(new URL('./deploy-production.sh', import.meta.url), 'utf8');

test('selects only the Sary pair and permits multiple web workers', () => {
  assert.equal(managedRelease([...processes(), processes()[0], { name: 'another-service' }]), directory);
  assert.equal(managedRelease(processes(), directory), directory);
});

test('rejects missing workers, mixed releases, stale executables and stopped processes', () => {
  assert.throws(() => managedRelease(processes().slice(0, 1)));
  assert.throws(() => managedRelease([]));
  for (const field of ['status', 'pm_cwd', 'pm_exec_path']) {
    const state = processes();
    state[1].pm2_env[field] = field === 'status' ? 'errored' : '/var/www/old-release';
    assert.throws(() => managedRelease(state));
  }
  assert.throws(() => managedRelease(processes(), '/var/www/sari-release-other'));
  assert.throws(() => managedRelease([...processes(), processes()[1]]));
});

test('runs the existing migration checks, including admin-managed AI deployment checks', () => {
  const tasks = migrationTasks(deployment, manifest);
  const migration = tasks.findIndex(task => task.name === 'db:migrate');
  assert.equal(tasks.filter(task => task.name === 'db:migrate').length, 1);
  assert.ok(migration >= 10);
  assert.ok(tasks.length - migration - 1 >= 10);
  assert.ok(tasks.slice(migration + 1).some(task => task.name === 'preflight:ai-deployment'));
  assert.ok(!tasks.some(task => task.name === 'preflight:ai-budget'));
  assert.deepEqual(tasks[migration].args, ['--import', 'tsx', 'scripts/mysql-drizzle-migrate.mjs']);
});

test('fails closed on unsupported check-list changes or shell commands in package scripts', () => {
  assert.throws(() => migrationTasks(deployment.replace('run_pre_migration_checks()', 'renamed()'), manifest));
  assert.throws(() => migrationTasks(deployment.replace('preflight:ai-deployment', 'preflight:ai-budget'), manifest));
  assert.throws(() => migrationTasks(deployment.replace('corepack pnpm preflight:zid-product-identity', 'echo skipped'), manifest));
  for (const command of ['node scripts/a.mjs && echo unsafe', 'node ../outside.mjs', 'bash unsafe.sh']) {
    assert.throws(() => migrationTasks(deployment, { scripts: { ...manifest.scripts, 'db:migrate': command } }));
  }
});

test('a failing preflight never reaches migration; a failed migration never runs postflights', async () => {
  const tasks = migrationTasks(deployment, manifest);
  for (const failure of [tasks[0].name, 'db:migrate']) {
    const calls = [];
    await assert.rejects(runMigrationTasks(tasks, async task => {
      calls.push(task.name);
      if (task.name === failure) throw new Error('simulated failure');
    }), /simulated failure/);
    assert.equal(calls.at(-1), failure);
    assert.equal(calls.length, tasks.findIndex(task => task.name === failure) + 1);
  }
});

test('readiness requires both live database connectivity and the current schema', () => {
  assert.doesNotThrow(() => assertReady({ status: 'ready', checks: { database: 'connected', schema: 'current' } }));
  for (const body of [null, { status: 'ready' }, { status: 'ready', checks: { database: 'connected', schema: 'outdated' } },
    { status: 'ready', checks: { database: 'disconnected', schema: 'current' } }]) {
    assert.throws(() => assertReady(body));
  }
});

test('probe retries stale bodies and HTTP errors, then succeeds on validated readiness', async () => {
  let calls = 0;
  let waits = 0;
  await probe('http://127.0.0.1:3000/ready', async response => assertReady(await response.json()), {
    attempts: 3, pause: async () => { waits++; },
    fetchImpl: async (_url, options) => {
      assert.equal(options.redirect, 'error');
      calls++;
      if (calls === 1) return { ok: false };
      return { ok: true, json: async () => calls === 2 ? { status: 'ready' }
        : { status: 'ready', checks: { database: 'connected', schema: 'current' } } };
    },
  });
  assert.equal(calls, 3);
  assert.equal(waits, 2);
});

test('persistent probe failure never becomes success', async () => {
  let calls = 0;
  await assert.rejects(probe('http://127.0.0.1:3000/ready', async () => {}, {
    attempts: 2, pause: async () => {}, fetchImpl: async () => { calls++; throw new Error('network'); },
  }), /RELEASE_PROBE_FAILED/);
  assert.equal(calls, 2);
});

test('public validation requires the unique deployment marker and both language pages', async () => {
  const sha = 'a'.repeat(40), token = 'b'.repeat(32), urls = [];
  const fetchImpl = async url => {
    urls.push(url);
    return { ok: true, json: async () => ({ sha, token }), text: async () =>
      `<html lang="${new URL(url).searchParams.get('lang')}"><main id="central-main"></main></html>` };
  };
  await verifyPublic(sha, token, { fetchImpl, pause: async () => {}, attempts: 1 });
  assert.equal(urls.length, 3);
  assert.equal(urls[0], `https://sary.live/_deploy/${token}.json`);
  assert.ok(urls[1].includes('lang=ar'));
  assert.ok(urls[2].includes('lang=en'));
});

test('a stale proxy marker or wrong-language page fails public verification', async () => {
  const sha = 'a'.repeat(40), token = 'b'.repeat(32);
  for (const marker of [{ sha: 'c'.repeat(40), token }, { sha, token: 'd'.repeat(32) }, { sha, token }]) {
    await assert.rejects(verifyPublic(sha, token, {
      attempts: 1, pause: async () => {}, fetchImpl: async () => ({ ok: true,
        json: async () => marker, text: async () => '<html lang="en"><main id="central-main"></main></html>' }),
    }), /RELEASE_PROBE_FAILED/);
  }
});

test('shipped shell entry points parse and refuse destructive in-place deployment', () => {
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
  for (const name of ['update-sary.sh', 'backup-sary.sh']) {
    const file = new URL(name, import.meta.url);
    const result = spawnSync(bash, ['-n', process.platform === 'win32' ? file.pathname.slice(1) : file.pathname],
      { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /reset --hard|git clean|db:push/);
  }
  const updater = fs.readFileSync(new URL('update-sary.sh', import.meta.url), 'utf8');
  assert.ok(updater.indexOf('build_task production build') < updater.indexOf('phase=ENCRYPTED_BACKUP'));
  assert.ok(updater.indexOf('phase=ENCRYPTED_BACKUP') < updater.indexOf('phase=MIGRATIONS_AND_CHECKS'));
  assert.ok(updater.indexOf('phase=MIGRATIONS_AND_CHECKS') < updater.indexOf('phase=ACTIVATE'));
  assert.ok(updater.indexOf('phase=PUBLIC_CHECK') < updater.indexOf('DEPLOY_OK'));
  assert.match(updater, /NODE_OPTIONS=--max-old-space-size=4096/);
});
