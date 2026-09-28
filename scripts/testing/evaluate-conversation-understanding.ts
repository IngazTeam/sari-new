import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { conversationUnderstandingCases as cases } from './conversation-understanding-cases';

const args = process.argv.slice(2);
if (!args.includes('--live')) {
  console.log(JSON.stringify({ mode: 'dry-run', cases: cases.map(c => ({ id: c.id, expected: c.expected, mustNotExecute: !!c.mustNotExecute })),
    liveCommand: 'node --import tsx scripts/testing/evaluate-conversation-understanding.ts --live --merchant-id <test-merchant-id>',
    note: 'Live mode bills the centrally selected provider through the shared platform budget. No orders, bookings or WhatsApp messages are created.' }, null, 2));
} else {
  const merchantId = Number(args[args.indexOf('--merchant-id') + 1]);
  if (!args.includes('--merchant-id') || !Number.isSafeInteger(merchantId) || merchantId < 1) throw Error('A test merchant identity is required');
  const { callGPT4 } = await import('../../server/ai/openai');
  const { getTextGenerationSettings } = await import('../../server/db_ai_settings');
  const { understandingMessages, validateUnderstanding } = await import('../../server/ai/conversation-understanding');
  const { closeDb, getPool } = await import('../../server/db/connection');
  const results = [];
  try {
    const pool = await getPool(); if (!pool) throw Error('Database unavailable');
    const [rows] = await pool.execute<any[]>('SELECT id FROM merchants WHERE id=?', [merchantId]);
    if (!rows.length) throw Error('Merchant not found');
    const settings = await getTextGenerationSettings();
    for (const item of cases) {
      const started = Date.now();
      try {
        const raw = await callGPT4(understandingMessages(item.input), { merchantId, taskType: 'sari.customer.intent', model: settings?.model || undefined, temperature: 0, maxTokens: 1800, noRetry: true });
        const result = validateUnderstanding(raw, item.input);
        const executable = result.confidence >= 0.85 && !result.ambiguous && !result.conditional
          && ['request_purchase', 'confirm_offer', 'request_booking', 'confirm_booking', 'select_session'].includes(result.action);
        const criticalFailure = !!item.mustNotExecute && executable;
        const passed = !criticalFailure && Object.entries(item.expected).every(([key, value]) => result[key as keyof typeof result] === value);
        results.push({ id: item.id, passed, criticalFailure, durationMs: Date.now() - started, result });
      } catch { results.push({ id: item.id, passed: false, criticalFailure: false, durationMs: Date.now() - started, error: 'provider_or_validation_failure' }); }
    }
    const report = { at: new Date().toISOString(), configuredProvider: settings?.textGenerationProvider ?? 'runtime-default', configuredOpenAiModel: settings?.model, configuredZahyPiModel: settings?.zahyPiModel,
      total: cases.length, passed: results.filter(r => r.passed).length, criticalFailures: results.filter(r => r.criticalFailure).length,
      scope: 'Synthetic live model evaluation. No business actions. Human review still required; not conversion-rate evidence.', results };
    const directory = resolve('.tmp/conversation-understanding-evaluations'); await mkdir(directory, { recursive: true });
    const file = resolve(directory, new Date().toISOString().replace(/[:.]/g, '-') + '.json'); await writeFile(file, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ file, total: report.total, passed: report.passed, criticalFailures: report.criticalFailures }));
    if (report.criticalFailures || report.passed !== report.total) process.exitCode = 1;
  } finally { await closeDb(); }
}
