const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const root = process.cwd(), output = path.resolve('.tmp/byaan-sales-review-verification');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const units = [
  'server/byaan-sales-review-pentest.test.ts',
  'server/ai/ordinary-reply-usage-pentest.test.ts',
  'server/byaan-conversation-routing.test.ts', 'server/salla-conversation-cart-pentest.test.ts', 'server/appointment-reminder-pentest.test.ts', 'server/ai/customer-memory-chat.test.ts', 'server/ai/checkout-conversation.test.ts', 'server/checkout-offer-evidence-pentest.test.ts',
  'server/byaan-enrollment-consent-pentest.test.ts',
  'server/byaan-sales-boundary-pentest.test.ts', 'server/api-conversion-history-pentest.test.ts',
  'server/api-conversion-ledger-pentest.test.ts', 'server/api-key-scope-pentest.test.ts',
  'server/byaan-dashboard-hardening-pentest.test.ts', 'server/byaan-faq-knowledge-pentest.test.ts',
  'server/byaan-pagination-pentest.test.ts', 'server/byaan-settings-sync-pentest.test.ts',
  'server/byaan-trainee-sync-pentest.test.ts', 'server/training-byaan-marketing-pentest.test.ts',
  'server/whatsapp-byaan-channel-pentest.test.ts', 'server/api-resource-abuse-pentest.test.ts',
  'server/api-read-model-pentest.test.ts', 'server/api-faq-source-sync-pentest.test.ts', 'server/runtime-schema-pentest.test.ts',
];
const database = ['server/integrations/byaan-sales-review.mysql.test.ts', 'server/ai/ordinary-reply-usage.mysql.test.ts', 'server/ai/byaan-enrollment-conversation.mysql.test.ts', 'server/ai/salla-checkout-conversation.mysql.test.ts', 'server/ai/byaan-enrollment-agreements.mysql.test.ts', 'server/ai/checkout-offer-evidence.mysql.test.ts', 'server/integrations/byaan-sales-operations.mysql.test.ts', 'server/integrations/byaan-sales-boundary.mysql.test.ts', 'server/integrations/api-conversion-history.mysql.test.ts'];
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync('.tmp/isolated-tests', { recursive: true });
fs.writeFileSync('.tmp/isolated-tests/empty.env', '# Synthetic local verification only.\n');
const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(?:PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMDATA|HOMEDRIVE|HOMEPATH|NUMBER_OF_PROCESSORS|CI)$/i.test(key)));
const env = { ...inherited, PATH: path.dirname(process.execPath) + path.delimiter + (inherited.PATH || inherited.Path || ''),
  NODE_ENV: 'test', SARI_ENV_FILE: path.resolve('.tmp/isolated-tests/empty.env'), DOTENV_CONFIG_PATH: path.resolve('.tmp/isolated-tests/empty.env'),
  NODE_OPTIONS: `--require "${path.resolve('scripts/testing/block-external-network.cjs').replaceAll('\\', '/')}"` };
function manifest() {
  const files = cp.execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean);
  return Object.fromEntries([...new Set(files)].sort().filter(file => /^(server|client|shared|scripts|drizzle)\//.test(file) || /^[^/]+\.(json|yaml|ts|mjs|cjs)$/.test(file))
    .map(file => [file, sha(fs.readFileSync(file))]));
}
function run(name, args, extra = {}) {
  const log = path.join(output, `${name}.log`), fd = fs.openSync(log, 'w');
  let result;
  try { result = cp.spawnSync(process.execPath, args, { env: { ...env, ...extra }, stdio: ['ignore', fd, fd], windowsHide: true }); }
  finally { fs.closeSync(fd); }
  console.log(`${name}: ${result.status}`);
  if (result.error || result.status !== 0) throw Error(`${name} failed; see ${path.relative(root, log)}`);
  return { name, exitCode: result.status, logSha256: sha(fs.readFileSync(log)) };
}
function testReport(name, files) {
  const report = JSON.parse(fs.readFileSync(path.join(output, `${name}.json`)));
  if (!report.success || !report.numPassedTests || report.numFailedTests || report.numPendingTests || report.numTodoTests) throw Error(`Incomplete ${name} results`);
  const actual = report.testResults.map(file => path.relative(root, file.name).replaceAll('\\', '/')).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...files].sort())) throw Error(`Unexpected ${name} selection`);
  return { passed: report.numPassedTests, failed: 0, skipped: 0, tests: report.testResults.flatMap(file => file.assertionResults.map(test => ({
    file: path.relative(root, file.name).replaceAll('\\', '/'), name: test.fullName, status: test.status,
  }))) };
}
try {
  const url = new URL(process.env.SARI_TEST_DATABASE_URL || '');
  if (url.protocol !== 'mysql:' || url.hostname !== '127.0.0.1' || url.port !== '33089' || !/^\/sari_[a-z0-9_]*_test$/.test(url.pathname) || url.search || url.hash) throw Error('Use owned synthetic MySQL');
  const startedAt = new Date().toISOString(), sourceSha256 = manifest(), checks = [];
  const baseCommit = cp.execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
  checks.push(run('types', ['node_modules/typescript/bin/tsc', '--noEmit']));
  checks.push(run('unit-security', ['scripts/testing/run-isolated.mjs', '--no-file-parallelism', ...units,
    '--reporter=default', '--reporter=json', `--outputFile.json=${path.join(output, 'unit-security.json')}`]));
  checks.push(run('schema', ['node_modules/drizzle-kit/bin.cjs', 'check'], { DATABASE_URL: url.toString() }));
  checks.push(run('database', ['scripts/testing/run-isolated.mjs', '--with-database', '--no-file-parallelism', ...database,
    '--reporter=default', '--reporter=json', `--outputFile.json=${path.join(output, 'database.json')}`], { SARI_TEST_DATABASE_URL: url.toString() }));
  checks.push(run('translations', ['--import', 'tsx', 'scripts/check-translation-keys.ts']));
  checks.push(run('build', ['.tmp/tools/pnpm-10.4.1/package/bin/pnpm.cjs', 'run', 'build'], { NODE_ENV: 'production' }));
  checks.push(run('browser', ['scripts/testing/verify-byaan-sales-review-ui.cjs']));
  const browser = JSON.parse(fs.readFileSync('.tmp/byaan-sales-review-ui/results/verification.json'));
  if (browser.failed || !browser.passed || browser.pageErrors.length) throw Error('Browser verification failed');
  if (JSON.stringify(sourceSha256) !== JSON.stringify(manifest())) throw Error('Source changed during verification');
  const translations = JSON.parse(fs.readFileSync(path.join(output, 'translations.log')));
  if (translations.missing.length || translations.unresolvedDynamicCalls.length || translations.interpolationErrors.length) throw Error('Translation failures');
  const unitSecurity = testReport('unit-security', units), sql = testReport('database', database);
  const report = { version: 'byaan-sales-review.v1', startedAt, finishedAt: new Date().toISOString(), baseCommit,
    scope: 'Merchant and authorized team review of local Byaan operations, SQL permission and receipt integrity checks; actual React and production CSS with synthetic API responses. No provider reconciliation or live payment verification.',
    checks, sourceStableBeforeAndAfter: true, sourceSha256, unitSecurity, database: sql, totalTests: unitSecurity.passed + sql.passed,
    translations, productionAccess: false, externalNetworkBlocked: true, providerTransportMocked: true,
    browserRun: true, browser, migrationChange: false };
  fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ tests: report.totalTests, unitSecurity: unitSecurity.passed, database: sql.passed, checks: checks.length }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
