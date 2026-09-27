const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const root = process.cwd(), output = path.resolve('.tmp/checkout-offer-verification');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const units = [
  "server/checkout-offer-evidence-pentest.test.ts",
  "server/ai/checkout-conversation.test.ts",
  "server/ai/checkout-discount.test.ts",
  "server/ai/checkout-margin.test.ts",
  "server/ai/reply-reservation-pentest.test.ts",
  "server/ai/sales-order-fact-pentest.test.ts",
  "server/ai/sales-order-link-pentest.test.ts",
  "server/ai/sales-order-report-pentest.test.ts",
  "server/ai/sales-order-settlement-pentest.test.ts",
  "server/ai/sales-order-worker-pentest.test.ts",
  "server/conversation-order-payment-link-pentest.test.ts",
  "server/checkout-reconciliation-pentest.test.ts",
  "server/booking-checkout-pentest.test.ts",
  "server/merchant-order-boundary-pentest.test.ts"
];
const database = [
  "server/ai/checkout-offer-evidence.mysql.test.ts",
  "server/ai/checkout-agreements.mysql.test.ts",
  "server/ai/zid-checkout-agreements.mysql.test.ts",
  "server/ai/checkout-discount.mysql.test.ts",
  "server/ai/checkout-discount-release.mysql.test.ts",
  "server/ai/checkout-margin.mysql.test.ts",
  "server/ai/sales-order-links.mysql.test.ts",
  "server/ai/sales-order-attribution.mysql.test.ts",
  "server/ai/sales-order-report.mysql.test.ts",
  "server/ai/reply-reservation.mysql.test.ts"
];
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync('.tmp/isolated-tests', { recursive: true });
fs.writeFileSync('.tmp/isolated-tests/empty.env', '# No credentials for release transition verification.\n');
const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(?:PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMDATA|HOMEDRIVE|HOMEPATH|NUMBER_OF_PROCESSORS|CI)$/i.test(key)));
const env = { ...inherited, PATH: path.dirname(process.execPath) + path.delimiter + inherited.PATH,
  NODE_ENV: 'test', SARI_ENV_FILE: path.resolve('.tmp/isolated-tests/empty.env'),
  DOTENV_CONFIG_PATH: path.resolve('.tmp/isolated-tests/empty.env'),
  NODE_OPTIONS: `--require "${path.resolve('scripts/testing/block-external-network.cjs').replaceAll('\\', '/')}"` };
function manifest() {
  const files = cp.execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8', windowsHide: true }).split('\0').filter(Boolean);
  return Object.fromEntries([...new Set(files)].sort().filter(file =>
    /^(server|client|shared|scripts|drizzle)\//.test(file) || /^[^/]+\.(json|yaml|ts|mjs|cjs)$/.test(file))
    .map(file => [file, sha(fs.readFileSync(file))]));
}
function run(name, args, overrides = {}) {
  const log = path.join(output, `${name}.log`), fd = fs.openSync(log, 'w');
  let result;
  try { result = cp.spawnSync(process.execPath, args, { env: { ...env, ...overrides },
    stdio: ['ignore', fd, fd], windowsHide: true }); } finally { fs.closeSync(fd); }
  console.log(`${name}: ${result.status}`);
  if (result.error || result.status !== 0) throw Error(`${name} failed; see ${path.relative(root, log)}`);
  return { name, exitCode: result.status, logSha256: sha(fs.readFileSync(log)) };
}
try {
  const url=new URL(process.env.SARI_TEST_DATABASE_URL||'');
  if(url.protocol!=='mysql:'||url.hostname!=='127.0.0.1'||url.port!=='33089'||!/^\/sari_[a-z0-9_]*_test$/.test(url.pathname)||url.search||url.hash)throw Error('Use owned synthetic MySQL');
  env.DATABASE_URL=url.toString();
  const startedAt = new Date().toISOString(), before = manifest(), checks = [];
  checks.push(run('database',['scripts/testing/run-isolated.mjs','--with-database','--no-file-parallelism',...database,'--reporter=default','--reporter=json',`--outputFile.json=${path.join(output,'database.json')}`],{SARI_TEST_DATABASE_URL:url.toString()}));
  const baseCommit = cp.execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
  const toolingCommand = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts['test:tooling'].split(' ');
  if (toolingCommand.shift() !== 'node' || toolingCommand[0] !== '--test'
    || toolingCommand.slice(1).some(file => !/^scripts\/[a-z-]+\.test\.mjs$/.test(file))) throw Error('Unexpected tooling command');
  checks.push(run('tooling', ['--test-reporter=tap', ...toolingCommand]));
  checks.push(run('unit-security', ['scripts/testing/run-isolated.mjs', ...units, '--reporter=default',
    '--reporter=json', `--outputFile.json=${path.join(output, 'unit-security.json')}`]));
  checks.push(run('types', ['node_modules/typescript/bin/tsc', '--noEmit']));
  checks.push(run('schema',['node_modules/drizzle-kit/bin.cjs','check']));
  checks.push(run('translations', ['--import', 'tsx', 'scripts/check-translation-keys.ts']));
  checks.push(run('build', ['.tmp/tools/pnpm-10.4.1/package/bin/pnpm.cjs', 'run', 'build'], { NODE_ENV: 'production' }));
  checks.push(run('browser',['scripts/testing/verify-salla-effect-review-ui.cjs'],{SARI_SALLA_EFFECT_REVIEW_UI_OUTPUT:path.join(output,'browser')}));
  const browser=JSON.parse(fs.readFileSync(path.join(output,'browser/results.json')));
  if(browser.errors.length||browser.results.length!==54||browser.results.some(r=>!r.passed))throw Error('Incomplete browser verification');
  if (JSON.stringify(before) !== JSON.stringify(manifest())) throw Error('Source changed during verification');
  const toolingLog = fs.readFileSync(path.join(output, 'tooling.log'), 'utf8');
  const counts = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map(key => {
    const value = toolingLog.match(new RegExp(`^# ${key} (\\d+)\\r?$`, 'm'));
    if (!value) throw Error(`Missing tooling count ${key}`);
    return [key, Number(value[1])];
  }));
  const testNames = [...toolingLog.matchAll(/^ok \d+ - (.+)\r?$/gm)].map(match => match[1].trim());
  if (!counts.tests || counts.tests !== counts.pass || counts.fail || counts.cancelled || counts.skipped || counts.todo
    || testNames.length !== counts.pass) throw Error('Incomplete tooling verification');
  const result = JSON.parse(fs.readFileSync(path.join(output, 'unit-security.json')));
  if (!result.success || !result.numPassedTests || result.numFailedTests || result.numPendingTests || result.numTodoTests) {
    throw Error('Incomplete security test report');
  }
  const tested = result.testResults.map(file => path.relative(root, file.name).replaceAll('\\', '/')).sort();
  if (JSON.stringify(tested) !== JSON.stringify([...units].sort())) throw Error('Unexpected security test selection');
  const translations = JSON.parse(fs.readFileSync(path.join(output, 'translations.log')));
  if (translations.missing.length || translations.unresolvedDynamicCalls.length || translations.interpolationErrors.length) {
    throw Error('Translation errors');
  }
  const dbResult=JSON.parse(fs.readFileSync(path.join(output,'database.json')));
  if(!dbResult.success||dbResult.numFailedTests||dbResult.numPendingTests||dbResult.numTodoTests)throw Error('Incomplete DB report');
  const dbFiles=dbResult.testResults.map(file=>path.relative(root,file.name).replaceAll('\\','/')).sort();
  if(JSON.stringify(dbFiles)!==JSON.stringify([...database].sort()))throw Error('Unexpected DB test selection');
  const report = { version: 'checkout-offer-evidence.v1', startedAt, finishedAt: new Date().toISOString(),
    baseCommit, sourceStableBeforeAndAfter: true, sourceSha256: before, checks,
    scope: 'Exact local/Zid checkout offer text, scoped per-effect channel acceptances, current conversation ownership, latest question and consent revalidation after SQL/provider waits. Real SQL with synthetic channel/provider transport. No schema change, production access or live provider claim.',
    tooling: { ...counts, testNames }, unitSecurity: { passed: result.numPassedTests, failed: 0, skipped: 0,
      tests: result.testResults.flatMap(file => file.assertionResults.map(test => ({
        file: path.relative(root, file.name).replaceAll('\\', '/'), name: test.fullName, status: test.status }))) },
    database:{passed:dbResult.numPassedTests,failed:0,skipped:0,tests:dbResult.testResults.flatMap(file=>file.assertionResults.map(test=>({file:path.relative(root,file.name).replaceAll('\\','/'),name:test.fullName,status:test.status})))},
    browser, totalTests: counts.pass + result.numPassedTests + dbResult.numPassedTests, translations, productionAccess: false, externalNetworkBlocked: true };
  fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ tests: report.totalTests, tooling: counts.pass, unitSecurity: result.numPassedTests, checks: checks.length }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
