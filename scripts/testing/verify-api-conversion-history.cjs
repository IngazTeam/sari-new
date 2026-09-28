const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const root = process.cwd(), output = path.resolve('.tmp/api-conversion-history-verification');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const units = ['server/api-conversion-history-pentest.test.ts','server/api-conversion-ledger-pentest.test.ts','server/api-key-scope-pentest.test.ts','server/sales-conversion-pentest.test.ts','server/byaan-dashboard-hardening-pentest.test.ts','server/byaan-settings-sync-pentest.test.ts','server/byaan-trainee-sync-pentest.test.ts','server/training-byaan-marketing-pentest.test.ts','server/salla-checkout-review-pentest.test.ts','server/salla-checkout-evidence-transport-pentest.test.ts','server/salla-checkout-evidence-api-pentest.test.ts','server/salla-conversation-cart-pentest.test.ts','server/checkout-offer-evidence-pentest.test.ts','server/whatsapp-delivery-safety.test.ts','server/ai/checkout-conversation.test.ts','server/ai/reply-reservation-pentest.test.ts','server/salla-checkout-cart-pentest.test.ts','server/salla-confirmation-pentest.test.ts','server/automation/order-from-chat-utils.test.ts','server/salla-order-items-pentest.test.ts','server/salla-order-result-pentest.test.ts','server/salla-extraction-pentest.test.ts','server/conversation-order-payment-link-pentest.test.ts','server/notice-delivery-pentest.test.ts','server/salla-sheet-receipts-pentest.test.ts','server/salla-effect-review-pentest.test.ts','server/deployment-release-pentest.test.ts', 'server/runtime-schema-pentest.test.ts',
  'server/salla-catalog-pentest.test.ts', 'server/salla-order-projection-pentest.test.ts',
  'server/salla-order-creation-pentest.test.ts', 'server/salla-webhook-receipts-pentest.test.ts',
  'server/salla-webhook-ingress-pentest.test.ts', 'server/salla-order-money.test.ts',
  'server/salla-creation-effects-transport.test.ts','server/sheets-inventory-access.test.ts',
  'server/merchant-order-boundary-pentest.test.ts','server/order-status-notification-outbox-pentest.test.ts',
  'server/zid-order-notification-outbox-pentest.test.ts'];
const database=['server/integrations/api-conversion-history.mysql.test.ts','server/integrations/salla-checkout-evidence.mysql.test.ts','server/ai/salla-sales-observations.mysql.test.ts','server/ai/salla-checkout-conversation.mysql.test.ts','server/ai/checkout-offer-evidence.mysql.test.ts','server/whatsappDeliverySafety.mysql.test.ts','server/ai/conversation-handoff.mysql.test.ts','server/ai/reply-reservation.mysql.test.ts','server/ai/checkout-agreements.mysql.test.ts','server/ai/zid-checkout-agreements.mysql.test.ts','server/integrations/salla-checkout-carts.mysql.test.ts','server/integrations/salla-effect-review.mysql.test.ts','server/integrations/salla-creation-effects.mysql.test.ts','server/integrations/salla-order-creation.mysql.test.ts',
  'server/integrations/salla-catalog.mysql.test.ts','server/integrations/salla-order-projection.mysql.test.ts','server/merchant-notification-email.mysql.test.ts'];
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
  checks.push(run('types', ['node_modules/typescript/bin/tsc', '--noEmit']));
  checks.push(run('migration',['scripts/testing/verify-salla-cart-migration.cjs'],{SARI_TEST_DATABASE_URL:url.toString(),SARI_SALLA_CART_MIGRATION_OUTPUT:path.join(output,'migration.json')}));
  checks.push(run('audit-migration',['scripts/testing/verify-salla-checkout-audit-migration.cjs'],{SARI_TEST_DATABASE_URL:url.toString(),SARI_SALLA_CHECKOUT_AUDIT_MIGRATION_OUTPUT:path.join(output,'audit-migration.json')}));
  checks.push(run('conversion-migration',['scripts/testing/verify-api-conversion-history-migration.cjs'],{SARI_TEST_DATABASE_URL:url.toString(),SARI_CONVERSION_HISTORY_MIGRATION_OUTPUT:path.join(output,'conversion-migration.json')}));
  checks.push(run('database',['scripts/testing/run-isolated.mjs','--with-database','--no-file-parallelism',...database,'--reporter=default','--reporter=json',`--outputFile.json=${path.join(output,'database.json')}`],{SARI_TEST_DATABASE_URL:url.toString()}));
  const baseCommit = cp.execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
  const toolingCommand = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts['test:tooling'].split(' ');
  if (toolingCommand.shift() !== 'node' || toolingCommand[0] !== '--test'
    || toolingCommand.slice(1).some(file => !/^scripts\/[a-z-]+\.test\.mjs$/.test(file))) throw Error('Unexpected tooling command');
  // Shell/TypeScript child-process fixtures are costly on Windows; run files
  // serially so concurrent work cannot turn process startup into false failures.
  checks.push(run('tooling', ['--test-reporter=tap', '--test-concurrency=1', ...toolingCommand]));
  checks.push(run('unit-security', ['scripts/testing/run-isolated.mjs', '--no-file-parallelism', ...units, '--reporter=default',
    '--reporter=json', `--outputFile.json=${path.join(output, 'unit-security.json')}`]));
  checks.push(run('schema',['node_modules/drizzle-kit/bin.cjs','check']));
  checks.push(run('translations', ['--import', 'tsx', 'scripts/check-translation-keys.ts']));
  checks.push(run('build', ['.tmp/tools/pnpm-10.4.1/package/bin/pnpm.cjs', 'run', 'build'], { NODE_ENV: 'production' }));
  checks.push(run('browser',['scripts/testing/verify-salla-effect-review-ui.cjs'],{SARI_SALLA_EFFECT_REVIEW_UI_OUTPUT:path.join(output,'browser')}));
  checks.push(run('checkout-browser',['scripts/testing/verify-salla-checkout-review-ui.cjs'],{SARI_SALLA_CHECKOUT_REVIEW_UI_OUTPUT:path.join(output,'checkout-browser')}));
  const checkoutBrowser=JSON.parse(fs.readFileSync(path.join(output,'checkout-browser/results.json')));
  if(checkoutBrowser.errors.length||checkoutBrowser.results.length!==114||checkoutBrowser.results.some(r=>!r.passed))throw Error('Incomplete checkout browser verification');
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
  const report = { version: 'api-conversion-history.v1', startedAt, finishedAt: new Date().toISOString(),
    baseCommit, sourceStableBeforeAndAfter: true, sourceSha256: before, checks,
    scope: 'Atomic first-observation history for reported API and internal conversions; persisted credential and merchant authority, replay and commit recovery, no verified payment or sales attribution. Real local REST and synthetic MySQL; external transports mocked and production excluded.',
    tooling: { ...counts, testNames }, unitSecurity: { passed: result.numPassedTests, failed: 0, skipped: 0,
      tests: result.testResults.flatMap(file => file.assertionResults.map(test => ({
        file: path.relative(root, file.name).replaceAll('\\', '/'), name: test.fullName, status: test.status }))) },
    database:{passed:dbResult.numPassedTests,failed:0,skipped:0,tests:dbResult.testResults.flatMap(file=>file.assertionResults.map(test=>({file:path.relative(root,file.name).replaceAll('\\','/'),name:test.fullName,status:test.status})))},
    conversionMigration:JSON.parse(fs.readFileSync(path.join(output,'conversion-migration.json'))),
    auditMigration:JSON.parse(fs.readFileSync(path.join(output,'audit-migration.json'))),
    migration:JSON.parse(fs.readFileSync(path.join(output,'migration.json'))),
    browser, checkoutBrowser, totalTests: counts.pass + result.numPassedTests + dbResult.numPassedTests, translations, productionAccess: false, externalNetworkBlocked: true };
  fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ tests: report.totalTests, tooling: counts.pass, unitSecurity: result.numPassedTests, checks: checks.length }));
} catch (error) { console.error(error.message); process.exitCode = 1; }
