import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

export function managedRelease(processes, expected) {
  const apps = processes.filter(app => ['sari', 'sari-inbound'].includes(app.name));
  const directories = [...new Set(apps.map(app => app.pm2_env?.pm_cwd))];
  if (!apps.some(app => app.name === 'sari') || apps.filter(app => app.name === 'sari-inbound').length !== 1
    || directories.length !== 1 || typeof directories[0] !== 'string'
    || !/^\/var\/www\/sari-release-[A-Za-z0-9-]+$/.test(directories[0])) {
    throw new Error('PM2_RELEASE_IDENTITY_MISSING');
  }
  const directory = directories[0];
  if ((expected && directory !== expected) || apps.some(app => app.pm2_env.status !== 'online'
    || app.pm2_env.pm_exec_path !== `${directory}/dist/${app.name === 'sari' ? 'index' : 'worker'}.js`)) {
    throw new Error('PM2_RELEASE_MISMATCH');
  }
  return directory;
}

export function migrationTasks(deployment, manifest) {
  const tasksFor = name => {
    const body = deployment.match(new RegExp(`${name}\\(\\) \\{([\\s\\S]*?)\\r?\\n\\}`))?.[1];
    const lines = (body || '').trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length < 10 || lines.some(line => !/^corepack pnpm [a-z0-9:-]+$/.test(line))) {
      throw new Error('UNSUPPORTED_DEPLOYMENT_CHECK_LIST');
    }
    return lines.map(line => line.slice('corepack pnpm '.length));
  };
  const before = tasksFor('run_pre_migration_checks');
  const after = tasksFor('run_post_migration_checks');
  if (!after.includes('preflight:ai-deployment') || [...before, ...after].includes('preflight:ai-budget')) {
    throw new Error('AI_DEPLOYMENT_CHECK_MISSING');
  }
  return [...before, 'db:migrate', ...after].map(name => {
    const [runtime, script, ...args] = (manifest.scripts[name] || '').trim().split(/\s+/);
    if (!['node', 'tsx'].includes(runtime) || !/^scripts\/[A-Za-z0-9_./-]+\.(mjs|ts)$/.test(script || '')
      || script.includes('..') || args.some(arg => !/^--[a-z-]+$/.test(arg))) {
      throw new Error('UNSUPPORTED_DEPLOYMENT_TASK');
    }
    return { name, args: ['--import', 'tsx', script, ...args] };
  });
}

export async function runMigrationTasks(tasks, run) {
  for (const task of tasks) await run(task);
}

export function assertReady(body) {
  if (body?.status !== 'ready' || body?.checks?.database !== 'connected' || body?.checks?.schema !== 'current') {
    throw new Error('APPLICATION_NOT_READY');
  }
}

export async function probe(url, validate, { fetchImpl = fetch, pause = delay, attempts = 12 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000), redirect: 'error',
        headers: { 'Cache-Control': 'no-cache' } });
      if (!response.ok) throw new Error('HTTP_NOT_READY');
      await validate(response);
      return;
    } catch { /* Retry startup, proxy propagation and temporary network failures. */ }
    if (attempt + 1 < attempts) await pause(2000);
  }
  throw new Error('RELEASE_PROBE_FAILED');
}

export async function verifyPublic(sha, token, options) {
  if (!/^[0-9a-f]{40}$/.test(sha) || !/^[0-9a-f]{32}$/.test(token)) throw new Error('INVALID_RELEASE_MARKER');
  await probe(`https://sary.live/_deploy/${token}.json`, async response => {
    const marker = await response.json();
    if (marker.sha !== sha || marker.token !== token) throw new Error('PUBLIC_RELEASE_MISMATCH');
  }, options);
  for (const lang of ['ar', 'en']) {
    await probe(`https://sary.live/?lang=${lang}&release=${token}`, async response => {
      const html = await response.text();
      if (!new RegExp(`<html\\b[^>]*\\blang=["']${lang}["']`, 'i').test(html)
        || !html.includes('central-main')) throw new Error('PUBLIC_PAGE_NOT_READY');
    }, options);
  }
}

async function main([action, ...args]) {
  if (action === 'pm2-current' || action === 'pm2-match') {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    const directory = managedRelease(JSON.parse(input), args[0]);
    if (action === 'pm2-current') process.stdout.write(directory);
  } else if (action === 'migrate') {
    await import('../server/_core/loadEnv.ts');
    const { validateEnv } = await import('../server/_core/validateEnv.ts');
    validateEnv();
    const tasks = migrationTasks(fs.readFileSync('scripts/deploy-production.sh', 'utf8'),
      JSON.parse(fs.readFileSync('package.json', 'utf8')));
    await runMigrationTasks(tasks, task => {
      console.log(`[update] ${task.name}`);
      execFileSync(process.execPath, task.args, { env: process.env, stdio: 'inherit' });
    });
  } else if (action === 'ready') {
    await probe('http://127.0.0.1:3000/ready', async response => assertReady(await response.json()));
    console.log('APPLICATION=READY');
  } else if (action === 'public') {
    await verifyPublic(args[0], args[1]);
    console.log('PUBLIC_RELEASE=VERIFIED; LANGUAGES=ar,en');
  } else throw new Error('UNKNOWN_UPDATE_ACTION');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    const code = /^[A-Z0-9_]+$/.test(error.message || '') ? error.message : 'UPDATE_OPERATION_FAILED';
    console.error(code);
    process.exitCode = 1;
  });
}
