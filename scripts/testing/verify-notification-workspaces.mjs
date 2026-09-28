// Only operates on disposable databases in the tenant audit's owned local MySQL.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';

const root = process.cwd(), url = new URL(process.env.SARI_TEST_DATABASE_URL || '');
assert.equal(url.protocol, 'mysql:'); assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '3317');
assert.equal(url.pathname, '/sari_pages_test'); assert.equal(url.search, ''); assert.equal(url.hash, '');
const journal = JSON.parse(fs.readFileSync('drizzle/meta/_journal.json', 'utf8'));
const entry = journal.entries.find(e => e.tag === '0146_tenant_notification_workspaces'); assert.ok(entry);
const directory = path.resolve('.tmp/notification-workspace-migration');
fs.mkdirSync(directory, {recursive: true});
const prepare = (name, entries) => {
  const destination = path.join(directory, name);
  fs.mkdirSync(path.join(destination, 'drizzle/meta'), {recursive: true});
  for (const migration of entries) fs.copyFileSync(`drizzle/${migration.tag}.sql`, path.join(destination, `drizzle/${migration.tag}.sql`));
  fs.writeFileSync(path.join(destination, 'drizzle/meta/_journal.json'), JSON.stringify({...journal, entries}));
  return destination;
};
const previous = prepare('prior', journal.entries.filter(e => e.when < entry.when));
const current = prepare('current', journal.entries.filter(e => e.when <= entry.when));
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMDATA|HOMEDRIVE|HOMEPATH|NUMBER_OF_PROCESSORS|CI)$/i.test(key)));
const runMigration = (database, cwd) => {
  const target = new URL(url); target.pathname = '/' + database;
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/mysql-drizzle-migrate.mjs')], {cwd, env: {...cleanEnv, DATABASE_URL: target.toString()}, encoding: 'utf8', windowsHide: true});
  fs.writeFileSync(path.join(directory, database + '.log'), result.stdout + result.stderr);
  assert.equal(result.status, 0, 'Migration failed; inspect the local log');
};
const connection = await mysql.createConnection(url.toString()), created = [], results = [];
const ddl = fs.readFileSync('drizzle/0146_tenant_notification_workspaces.sql', 'utf8');
try {
  const [[identity]] = await connection.query('SELECT @@port AS port, @@datadir AS directory');
  assert.equal(Number(identity.port), 3317);
  const relative = path.relative(path.resolve('.tmp'), path.resolve(identity.directory));
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), 'MySQL must use a workspace-owned temporary directory');
  for (const mode of ['fresh', 'upgrade']) {
    const database = `sari_notification_${mode}_${Date.now()}_test`;
    assert.match(database, /^sari_notification_(fresh|upgrade)_\d+_test$/);
    await connection.query(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); created.push(database);
    runMigration(database, mode === 'fresh' ? current : previous);
    await connection.query(`USE ${database}`);
    // Simulate legacy installations where tables already exist before registration.
    if (mode === 'upgrade') for (const statement of ddl.split('--> statement-breakpoint')) await connection.query(statement);
    const [user] = await connection.execute("INSERT INTO users(openId,name,role,account_status) VALUES (?,'Synthetic','user','active')", ['notification-' + mode]);
    const [merchant] = await connection.execute("INSERT INTO merchants(userId,businessName,status) VALUES (?,'Synthetic','active')", [user.insertId]);
    await connection.execute("INSERT INTO scheduled_reports(merchant_id,name,report_type,include_orders,include_revenue) VALUES (?,'Preserve existing','weekly',FALSE,FALSE)", [merchant.insertId]);
    const before = JSON.stringify((await connection.query('SELECT * FROM scheduled_reports'))[0]);
    runMigration(database, current); runMigration(database, current);
    assert.equal(JSON.stringify((await connection.query('SELECT * FROM scheduled_reports'))[0]), before);
    const [[count]] = await connection.query('SELECT COUNT(*) AS n FROM __drizzle_migrations');
    assert.equal(Number(count.n), journal.entries.filter(e => e.when <= entry.when).length);
    results.push({mode, migrations: Number(count.n), preservesExistingRows: true, rerunSafe: true, passed: true});
    if (mode === 'fresh') {
      const target = new URL(url); target.pathname = '/' + database;
      const test = spawnSync(process.execPath, [path.join(root, 'scripts/testing/run-isolated.mjs'), '--with-database', 'server/notification-workspaces.mysql.test.ts'], {cwd: root, env: {...cleanEnv, SARI_TEST_DATABASE_URL: target.toString()}, encoding: 'utf8', windowsHide: true});
      fs.writeFileSync(path.join(directory, 'mysql-tests.log'), test.stdout + test.stderr);
      assert.equal(test.status, 0, 'Database contracts failed; inspect mysql-tests.log');
    }
  }
  if (process.argv.includes('--apply-local')) {
    runMigration(url.pathname.slice(1), current);
    results.push({mode: 'local-audit-database', migration: entry.tag, passed: true});
  }
  const output = process.env.SARI_NOTIFICATION_AUDIT_OUTPUT || path.join(directory, 'results.json');
  fs.mkdirSync(path.dirname(output), {recursive: true}); fs.writeFileSync(output, JSON.stringify({date: new Date().toISOString(), results}, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await connection.query('USE sari_pages_test');
  for (const database of created) {
    assert.match(database, /^sari_notification_(fresh|upgrade)_\d+_test$/);
    await connection.query(`DROP DATABASE ${database}`);
  }
  await connection.end();
}
