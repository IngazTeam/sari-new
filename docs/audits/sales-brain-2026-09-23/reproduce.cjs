// Read-only audit probes: actual local TypeScript modules, mocked I/O, no network or database.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const path = require('node:path');
const root = process.cwd();
const results = [];
const silent = { log() {}, warn() {}, error() {} };
function load(file, mocks = {}, extra = {}) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const sandbox = { module, exports: module.exports, require(name) { if (name in mocks) return mocks[name]; throw new Error('Unmocked dependency blocked: ' + name); }, console: silent, process: { env: { NODE_ENV: 'test' } }, Buffer, setInterval() { return { unref() {} }; }, ...extra };
  vm.runInNewContext(code, sandbox, { filename: file });
  return module.exports;
}
function record(id, data) { results.push({ id, ...data }); }
(async () => {
  const session = load('server/ai/session-context.ts');
  for (const message of ['أبغى أطلب سماعة', 'لا أريد الشراء الآن', 'لا تحجز لي الآن', 'كنت أبي أشتري لكن غيرت رأيي', 'طلبي تأخر والسعر غالي', 'نعم', 'تمام كمل الطلب']) {
    record('intent', { message, observed: session.detectIntent(message) });
  }
  const nba = load('server/ai/next-best-action.ts', { '../db': { getPool: async () => null } });
  const base = { merchantId: 1, conversationId: 1, dealStage: 'ready', lastObjection: null, paymentLinkSent: false, timeSinceLastMessage: 0, hasDiscount: false, messageCount: 6 };
  const message = 'لا أريد الشراء الآن';
  record('refusal_to_sales_decision', { message, decision: await nba.determineNextBestAction({ ...base, customerMessage: message, intent: session.detectIntent(message) }) });
  record('no_product_value_in_nba_context', { sourceHasValueAssignment: /productValue\s*:/.test(fs.readFileSync('server/ai/next-best-action.ts', 'utf8').split('export async function loadNBAContext')[1]) });

  let calls = 0;
  const action = load('server/ai/action-selector.ts', {
    './openai': { callGPT4: async () => { calls++; return '{"action":"confirm_order","details":{"items":["سماعة"]}}'; } },
    '../db': {}, './product-availability': {}, '../../shared/product-money': {}, '../messaging/inbound-context': {},
  });
  for (const text of ['نعم', 'تمام كمل الطلب', 'أريد الشراء', 'أبغى أطلب سماعة']) {
    const before = calls;
    const selected = await action.selectAction({ merchantId: 1, customerMessage: text, botResponse: 'تمام، نكمل طلب السماعة.', intent: session.detectIntent(text), profile: null });
    record('action_prefilter', { message: text, observed: selected.type, llmCalled: calls > before });
  }

  const source = fs.readFileSync('server/ai/sari-personality.ts', 'utf8');
  const ast = ts.createSourceFile('sari-personality.ts', source, ts.ScriptTarget.Latest, true);
  let fastBranch;
  function visit(n) { if (ts.isIfStatement(n) && n.expression.getText(ast) === 'existingSession && !needsTopicRebuild') fastBranch = n; ts.forEachChild(n, visit); }
  visit(ast);
  const fastText = fastBranch.thenStatement.getText(ast);
  record('fast_path_learning_hooks', { captureConversationSignals: fastText.includes('captureConversationSignals('), enrichCustomerProfile: fastText.includes('enrichCustomerProfile('), returnsBeforeFullPath: /return response\.trim\(\)/.test(fastText) });
  const criticTry = fastBranch.thenStatement.statements.find(n => ts.isTryStatement(n) && n.tryBlock.getText(ast).includes('const critique = await critiqueResponse'));
  const validatorTry = fastBranch.thenStatement.statements.find(n => ts.isTryStatement(n) && n.tryBlock.getText(ast).includes('const validation = await validateResponse'));
  for (const [name, statement] of [['critic', criticTry], ['validator', validatorTry]]) {
    const warnings = [];
    const code = ts.transpileModule(`async function probe(){let response='original';if(true){${statement.getText(ast)};return response;}const productsToShow=[];}probe()`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const result = await vm.runInNewContext(code, {
      console: { log() {}, warn(...args) { warnings.push(args.join(' ')); } },
      params: { message: 'أريد تفاصيل المنتج والسعر' }, previousMessages: [], existingSession: { relevantProducts: [{ name: 'سماعة' }] }, freshInjectedProducts: null, intent: 'inquiring',
      critiqueResponse: async () => ({ passed: false, score: 2, failures: ['quality'] }), fixResponse: async () => 'corrected', recordCritique() {},
      validateResponse: async () => ({ passed: false, correctedResponse: 'corrected', violations: [{ rule: 'test' }] }), recordValidation() {}, productDenialGuard: () => false,
    });
    record('fast_path_' + name, { finalResponse: result, warnings });
  }

  let profileCount = 1;
  const profileDb = load('server/db/customer-intelligence.ts', { '../db': { getPool: async () => ({ execute: async sql => {
    if (sql.startsWith('SELECT')) return [[{ id: 7, merchant_id: 1, customer_phone: 'test', total_conversations: profileCount, preferences: '{}', pain_points: '[]', purchase_history: '[]', customer_tier: 'new' }]];
    if (sql.includes('total_conversations = total_conversations + 1')) profileCount++;
    return [{}];
  } }) } });
  await profileDb.getOrCreateProfile(1, 'test'); await profileDb.getOrCreateProfile(1, 'test');
  record('conversation_count_on_repeated_profile_load', { before: 1, afterTwoLoads: profileCount });

  const signals = [];
  const learning = load('server/ai/learning-engine.ts', { './openai': {}, '../db/learning': { captureSignal: async value => signals.push(value), countUnanalyzedSignals: async () => 0 } });
  await learning.captureConversationSignals({ merchantId: 1, conversationId: 1, customerMessage: 'غالي وما يستاهل', botResponse: 'نفهمك، خلنا نوضح الخيارات.' });
  record('strong_price_objection_learning', { message: 'غالي وما يستاهل', capturedSignals: signals.length });

  const sql = [];
  const conductor = load('server/ai/sales-conductor.ts', { '../db': { getPool: async () => ({ execute: async statement => { sql.push(statement); return [[]]; } }) } });
  await conductor.runWeeklyAnalysis(1);
  const schema = fs.readFileSync('drizzle/0003_runtime_schema_consolidation.sql', 'utf8').match(/CREATE TABLE IF NOT EXISTS `sari_learning_signals` \([\s\S]*?\);/)[0];
  record('weekly_learning_schema_contract', { queryUsesSignalValue: sql[0].includes('signal_value'), schemaContainsSignalValue: schema.includes('signal_value'), filters: sql[0].match(/signal_type IN \([^)]*\)/)[0] });
  const cacheRows = [];
  const vector = Array(1536).fill(1);
  const rag = load('server/ai/rag-engine.ts', {
    '../../shared/product-money': {},
    '../db/knowledge': { cacheResponse: async (merchantId, question, response, embedding) => cacheRows.push({ id: 1, responseText: response, questionEmbedding: embedding }), getValidCachedResponses: async () => cacheRows, recordCacheHit: async () => {} },
    './budget-ledger': { withAiBudget: async (_, operation) => operation({ requestId: 'audit' }) },
    './zahypi-client': { resolveZahyPiRuntimeConfig: async () => ({ enabled: true }), getOptionalZahyPiRequestContext: () => ({ merchantId: 1 }) },
    '../db_ai_settings': { getOpenAiApiKey: async () => 'mock-not-a-key' },
    '../db': { getPool: async () => ({ execute: async () => [[{ cnt: 0 }]] }) },
  }, { AbortSignal, fetch: async () => ({ ok: true, json: async () => ({ data: [{ embedding: vector }] }) }) });
  const personalized = 'أهلاً أحمد، سعر العرض الخاص بحسابك 230 ريال، بناءً على اشتراكك السابق.';
  await rag.cacheSuccessfulResponse(1, 'كم سعر الدورة؟', personalized);
  const cached = await rag.findCachedResponse(1, 'كم سعر الدورة؟');
  record('personalized_response_cache', { saved: cacheRows.length, foundByMerchantAndQuestionOnly: cached?.response === personalized, response: cached?.response });

  const output = { date: '2026-09-23', scope: 'Actual module/AST-fragment probes with mocked I/O; no provider quality evaluation, database integration test or production traffic.', results };
  fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
