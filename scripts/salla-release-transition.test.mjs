import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertZidOrderReleaseCompatible, requiredReleaseCapabilities } from './zid-order-release.mjs';

const root = path.resolve('.');
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const oldCapabilities = requiredReleaseCapabilities.filter(value => !value.startsWith('salla-'));
const marker = capabilities => JSON.stringify({ version: 1, capabilities });
const sources = Object.fromEntries(['update-sary', 'deploy-production'].map(name =>
  [name, fs.readFileSync(`scripts/${name}.sh`, 'utf8').replaceAll('\r\n', '\n')]));

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sari-salla-transition-'));
  t.after(() => {
    assert.equal(path.dirname(directory), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('sari-salla-transition-'));
    fs.rmSync(directory, { recursive: true });
  });
  function release(name, body) {
    const target = path.join(directory, name);
    fs.mkdirSync(path.join(target, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(target, 'dist'));
    fs.writeFileSync(path.join(target, 'dist/worker.js'), '// synthetic worker');
    fs.writeFileSync(path.join(target, 'ecosystem.config.cjs'), '// synthetic PM2 config');
    fs.writeFileSync(path.join(target, 'scripts/zid-order-store-capability.json'), body);
    fs.copyFileSync('scripts/zid-order-release.mjs', path.join(target, 'scripts/zid-order-release.mjs'));
    return target;
  }
  const current = release('current release', marker(requiredReleaseCapabilities));
  const old = release('old release', marker(oldCapabilities));
  return { directory, release, current, old };
}

function application(directory, name, status = 'online', pid = 123) {
  return { name, pid, pm2_env: { status, pm_cwd: directory,
    pm_exec_path: path.join(directory, 'dist', name === 'sari' ? 'index.js' : 'worker.js') } };
}

function functionSource(name, functionName) {
  const source = sources[name].match(new RegExp(`${functionName}\\(\\) \\{[\\s\\S]*?\\n\\}`))?.[0];
  assert.ok(source, `missing ${functionName}`);
  return source;
}

// Execute the shipped Bash functions, with PM2/DDL/readiness replaced by bounded
// local doubles. The Node capability checker is real; no production env is read.
function shell(f, entry, { action = 'quiesce', before, after, failure = '', candidate = root,
  target = f.current, match = 'yes', tail = '', snapshotFailure = false } = {}) {
  before ??= ['sari', 'sari-inbound'].map(name => application(f.old, name));
  after ??= ['sari', 'sari-inbound'].map(name => application(f.old, name, 'stopped', 0));
  fs.writeFileSync(path.join(f.directory, 'before.json'), JSON.stringify(before));
  fs.writeFileSync(path.join(f.directory, 'after.json'), JSON.stringify(after));
  const activation = entry === 'update-sary' ? 'activate' : 'activate_pm2_release';
  const functionName = action === 'quiesce' ? 'quiesce_incompatible_writers' : activation;
  const input = `set -Eeuo pipefail
node_bin="$1"
release_dir="$2"
fixture_dir="$3"
target="$4"
failure="$5"
match_mode="$6"
snapshot_failure="$7"
# The mutable checkout and previous target must never supply the deciding guard.
source_dir="$fixture_dir/nonexistent-checkout"
env_file="$fixture_dir/unused.env"
PORT=3000
writers_quiesced=0
stopped_sari=0
stopped_inbound=0
match_count=0
node() { "$node_bin" "$@"; }
log() { printf '%s\\n' "$*"; }
pm_stub() {
  printf '%s\\n' "$1 \${2:-}" >> "$fixture_dir/trace"
  if [ "$failure" = "$1 \${2:-}" ]; then return 23; fi
  case "$1" in
    jlist)
      if [ "$snapshot_failure" = true ]; then return 19; fi
      if [ "$stopped_sari$stopped_inbound" = 11 ]; then cat "$fixture_dir/after.json"; else cat "$fixture_dir/before.json"; fi ;;
    stop)
      if [ "$2" = sari ]; then stopped_sari=1; else stopped_inbound=1; fi ;;
  esac
}
pm() { pm_stub "$@"; }
pm2() { pm_stub "$@"; }
# Activation is exercised without touching a real release's logs or permissions.
mkdir() { [ "$failure" != mkdir ]; }
chmod() { [ "$failure" != chmod ]; }
matches() {
  match_count=$((match_count+1))
  echo MATCH >> "$fixture_dir/trace"
  [ "$match_mode" = yes ] || { [ "$match_mode" = second ] && [ "$match_count" -eq 2 ]; }
}
pm2_release_matches() { matches "$@"; }
${functionSource(entry, functionName)}
${tail || `if ${functionName}${action === 'quiesce' ? '' : ' "$target"'}; then
  echo ${action === 'quiesce' ? 'MIGRATE' : 'ACTIVATED'} >> "$fixture_dir/trace"
else
  exit 1
fi`}
`;
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    /^(?:PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|NODE_OPTIONS)$/i.test(key)));
  const result = spawnSync(bash, ['-s', '--', process.execPath, candidate, f.directory, target, failure, match,
    String(snapshotFailure)], { input, encoding: 'utf8', windowsHide: true, timeout: 15000, env: inherited });
  assert.ifError(result.error);
  const trace = fs.existsSync(path.join(f.directory, 'trace'))
    ? fs.readFileSync(path.join(f.directory, 'trace'), 'utf8').replace(/\n$/, '').split('\n') : [];
  return { ...result, trace };
}

for (const capability of requiredReleaseCapabilities) {
  test(`a release missing ${capability} cannot activate or roll back`, t => {
    const f = fixture(t);
    const target = f.release('missing capability', marker(requiredReleaseCapabilities.filter(value => value !== capability)));
    assert.throws(() => assertZidOrderReleaseCompatible(target));
  });
}

for (const body of ['{', 'null', '[]', '{"version":1}', '{"version":1,"capabilities":{}}',
  JSON.stringify({ version: 2, capabilities: requiredReleaseCapabilities }),
  marker([...oldCapabilities, 'salla-catalog-store-identity-0139 ']), marker(['SALLA-CATALOG-STORE-IDENTITY-0139'])]) {
  test(`malformed or deceptive capability document is rejected: ${body.slice(0, 65)}`, t => {
    const f = fixture(t);
    assert.throws(() => assertZidOrderReleaseCompatible(f.release('invalid', body)));
  });
}

for (const entry of Object.keys(sources)) {
  test(`${entry}: old writers stop and are saved before migration`, t => {
    const result = shell(fixture(t), entry);
    assert.equal(result.status, 0, result.stderr);
    const trace = result.trace.filter(line => !line.startsWith('describe '));
    assert.deepEqual(trace, ['jlist ', 'stop sari', 'stop sari-inbound', 'jlist ', 'save ', 'MIGRATE']);
  });

  test(`${entry}: compatible writers continue without an unnecessary stop`, t => {
    const f = fixture(t);
    const result = shell(f, entry, { before: ['sari', 'sari-inbound'].map(name => application(f.current, name)) });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.trace, ['jlist ', 'MIGRATE']);
  });

  test(`${entry}: an old inbound worker cannot hide behind a compatible web release`, t => {
    const f = fixture(t);
    const result = shell(f, entry, { before: [application(f.current, 'sari'), application(f.old, 'sari-inbound')] });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.trace.includes('stop sari-inbound'));
  });

  test(`${entry}: invalid candidate stops before any PM2 or migration operation`, t => {
    const f = fixture(t), result = shell(f, entry, { candidate: f.old });
    assert.equal(result.status, 1);
    assert.deepEqual(result.trace, []);
  });

  for (const failure of ['stop sari', 'stop sari-inbound', 'save ']) {
    test(`${entry}: failed ${failure.trim()} prevents DDL, even in a conditional caller`, t => {
      const result = shell(fixture(t), entry, { failure });
      assert.equal(result.status, 1);
      assert.equal(result.trace.at(-1), failure);
      assert.ok(!result.trace.includes('MIGRATE'));
    });
  }

  for (const [status, pid] of [['online', 42], ['stopping', 42], ['errored', 0], ['stopped', 42]]) {
    test(`${entry}: ${status} with pid ${pid} after stop prevents migration and save`, t => {
      const f = fixture(t), result = shell(f, entry, { after: [application(f.old, 'sari-inbound', status, pid)] });
      assert.equal(result.status, 1);
      assert.ok(!result.trace.includes('MIGRATE'));
      assert.ok(!result.trace.includes('save '));
    });
  }

  test(`${entry}: unreadable PM2 state never authorizes DDL`, t => {
    const result = shell(fixture(t), entry, { snapshotFailure: true });
    assert.equal(result.status, 1);
    assert.ok(!result.trace.includes('MIGRATE'));
    assert.ok(!result.trace.includes('save '));
  });

  test(`${entry}: unrelated services are neither stopped nor treated as managed writers`, t => {
    const f = fixture(t);
    const result = shell(f, entry, { before: [application(f.current, 'sari'), application(f.current, 'sari-inbound'),
      application(f.old, 'another-service')] });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.trace, ['jlist ', 'MIGRATE']);
  });

  test(`${entry}: forged executable location requires draining even with a valid marker`, t => {
    const f = fixture(t), web = application(f.current, 'sari');
    web.pm2_env.pm_exec_path = path.join(f.old, 'dist/index.js');
    const result = shell(f, entry, { before: [web, application(f.current, 'sari-inbound')] });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.trace.includes('stop sari'));
  });

  test(`${entry}: rollback uses the prepared guard, not the previous target's permissive checker`, t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.old, 'scripts/zid-order-release.mjs'), 'process.exit(0);');
    const result = shell(f, entry, { action: 'activate', target: f.old });
    assert.equal(result.status, 1);
    assert.deepEqual(result.trace, []);
  });

  test(`${entry}: compatible activation handles release paths containing spaces`, t => {
    const result = shell(fixture(t), entry, { action: 'activate' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.trace.at(-1), 'ACTIVATED');
    assert.equal(result.trace.filter(line => line.startsWith('startOrReload ')).length, 1);
    assert.ok(!result.trace.some(line => line.startsWith('delete ')));
  });

  test(`${entry}: shell metacharacters in a release path remain literal data`, t => {
    const f = fixture(t), target = f.release('release $(exit 99); name', marker(requiredReleaseCapabilities));
    const result = shell(f, entry, { action: 'activate', target });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.trace[0], `startOrReload ${target}/ecosystem.config.cjs`);
  });

  test(`${entry}: failed startOrReload cannot be masked by a successful identity probe`, t => {
    const f = fixture(t);
    const result = shell(f, entry, { action: 'activate', failure: `startOrReload ${f.current}/ecosystem.config.cjs` });
    assert.equal(result.status, 1);
    assert.equal(result.trace.length, 1);
    assert.ok(result.trace[0].startsWith('startOrReload '));
  });

  test(`${entry}: stale PM2 metadata is recreated and verified`, t => {
    const result = shell(fixture(t), entry, { action: 'activate', match: 'second' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.trace.map(line => line.split(' ')[0]),
      ['startOrReload', 'MATCH', 'delete', 'delete', 'start', 'MATCH', 'ACTIVATED']);
  });

  test(`${entry}: failed recreation never reports activation success`, t => {
    const f = fixture(t);
    const result = shell(f, entry, { action: 'activate', match: 'second', failure: `start ${f.current}/ecosystem.config.cjs` });
    assert.equal(result.status, 1);
    assert.ok(!result.trace.includes('ACTIVATED'));
    assert.ok(result.trace.at(-1).startsWith('start '));
  });

  test(`${entry}: a failed web deletion cannot continue into a second start`, t => {
    const result = shell(fixture(t), entry, { action: 'activate', match: 'second', failure: 'delete sari' });
    assert.equal(result.status, 1);
    assert.equal(result.trace.at(-1), 'delete sari');
  });

  test(`${entry}: a final identity mismatch stays failed`, t => {
    const result = shell(fixture(t), entry, { action: 'activate', match: 'never' });
    assert.equal(result.status, 1);
    assert.equal(result.trace.at(-1), 'MATCH');
    assert.ok(!result.trace.includes('ACTIVATED'));
  });

  test(`${entry}: real failure handler refuses incompatible rollback and preserves data`, t => {
    const f = fixture(t);
    const data = JSON.stringify({ sallaOrder: 'salla:store:123', operation: 'review', product: 'salla:store:456' });
    fs.writeFileSync(path.join(f.directory, 'durable-data.json'), data);
    const tail = `previous_release="$fixture_dir/old release"
activation_attempted=1
phase=ACTIVATE
ops="$fixture_dir/must-not-run.mjs"
${functionSource(entry, entry === 'update-sary' ? 'failed' : 'rollback_activation')}
${entry === 'update-sary' ? 'failed 42' : 'trap rollback_activation ERR\n(exit 42)'}`;
    const result = shell(f, entry, { action: 'activate', tail });
    assert.equal(result.status, 42, result.stderr);
    assert.deepEqual(result.trace, []);
    assert.equal(fs.readFileSync(path.join(f.directory, 'durable-data.json'), 'utf8'), data);
    assert.doesNotMatch(result.stdout, /DEPLOY_OK|PREVIOUS_APPLICATION_RESTORED/);
  });

  test(`${entry}: migration failure after draining cannot restart old writers`, t => {
    const f = fixture(t);
    const tail = `previous_release="$fixture_dir/old release"
activation_attempted=0
phase=MIGRATIONS_AND_CHECKS
${entry === 'update-sary' ? `${functionSource(entry, 'failed')}\ntrap 'failed "$?"' ERR` : ''}
quiesce_incompatible_writers
echo MIGRATE_FAILED >> "$fixture_dir/trace"
(exit 41)`;
    const result = shell(f, entry, { tail });
    assert.equal(result.status, 41, result.stderr);
    assert.equal(result.trace.at(-1), 'MIGRATE_FAILED');
    assert.ok(result.trace.includes('save '));
    assert.ok(!result.trace.some(line => /^start|delete/.test(line)));
    if (entry === 'update-sary') assert.match(result.stdout, /WRITERS_STOPPED/);
  });

  test(`${entry}: a retry can migrate and activate from already stopped old writers`, t => {
    const f = fixture(t);
    const activation = entry === 'update-sary' ? 'activate' : 'activate_pm2_release';
    const result = shell(f, entry, {
      before: ['sari', 'sari-inbound'].map(name => application(f.old, name, 'stopped', 0)),
      tail: `${functionSource(entry, activation)}
quiesce_incompatible_writers
echo MIGRATE >> "$fixture_dir/trace"
${activation} "$target"
echo ACTIVATED >> "$fixture_dir/trace"`,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.trace.indexOf('save ') < result.trace.indexOf('MIGRATE'));
    assert.ok(result.trace.indexOf('MIGRATE') < result.trace.findIndex(line => line.startsWith('startOrReload ')));
    assert.equal(result.trace.at(-1), 'ACTIVATED');
  });

  test(`${entry}: compatible rollback still works and retains the original failure code`, t => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.directory, 'ready.mjs'), 'process.exit(0);');
    const tail = `previous_release="$target"
activation_attempted=1
phase=ACTIVATE
ops="$fixture_dir/ready.mjs"
${functionSource(entry, entry === 'update-sary' ? 'failed' : 'rollback_activation')}
${entry === 'update-sary' ? 'failed 42' : 'trap rollback_activation ERR\n(exit 42)'}`;
    const result = shell(f, entry, { action: 'activate', tail });
    assert.equal(result.status, 42, result.stderr);
    assert.equal(result.trace.at(-1), 'save ');
    assert.ok(result.trace[0].startsWith('startOrReload '));
    assert.doesNotMatch(result.stdout, /DEPLOY_OK/);
    if (entry === 'update-sary') assert.match(result.stdout, /PREVIOUS_APPLICATION_RESTORED/);
  });
}

for (const failure of ['mkdir', 'chmod']) {
  test(`general deployment: ${failure} failure blocks activation in rollback context`, t => {
    const result = shell(fixture(t), 'deploy-production', { action: 'activate', failure });
    assert.equal(result.status, 1);
    assert.deepEqual(result.trace, []);
  });
}

test('both callers invoke quiescence before DDL and run the transition tests at deployment', () => {
  for (const [name, source] of Object.entries(sources)) {
    const invocation = source.indexOf('\nquiesce_incompatible_writers\n');
    assert.ok(invocation > 0);
    const ddl = name === 'update-sary' ? '"$ops" migrate' : 'corepack pnpm db:migrate';
    assert.ok(invocation < source.indexOf(ddl));
  }
  assert.match(sources['update-sary'], /--test scripts\/zid-order-release.test.mjs scripts\/salla-release-transition.test.mjs/);
  const manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.ok(manifest.scripts['test:tooling'].includes('scripts/salla-release-transition.test.mjs'));
  assert.ok(manifest.scripts['test:tooling'].includes('scripts/zid-order-release.test.mjs'));
});
