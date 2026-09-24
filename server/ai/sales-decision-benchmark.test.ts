import { afterAll, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { z } from 'zod';

vi.mock('../db', () => ({ getPool: async () => null }));
vi.mock('./llm', () => ({ callGPT4: vi.fn(() => { throw Error('Decision benchmark must not call a model'); }) }));
import { detectIntent } from './session-context';
import { decideSalesTurnGoal } from './sales-turn-policy';
import { isExplicitPurchaseInstruction, isPurchaseProcessQuestion, isSalesRefusal, pendingDecisionFromQuestion } from './customer-decision';

const decision = z.object({
  refusal: z.boolean(), processQuestion: z.boolean(), explicitPurchase: z.boolean(),
  pending: z.enum(['none', 'information', 'purchase', 'appointment']).optional(),
  intent: z.enum(['unknown', 'inquiring', 'ready_to_buy', 'declined', 'post_purchase', 'hesitating', 'objecting', 'comparing']),
  goal: z.enum(['respect_decline', 'resolve_existing_order', 'explain_requested_information', 'confirm_agreement',
    'understand_objection', 'compare_suitable_options', 'answer_then_qualify']),
}).strict();
const corpusFile = 'scripts/testing/fixtures/sales-decision-corpus.v1.json';
const manifest = JSON.parse(readFileSync('scripts/testing/fixtures/sales-decision-corpus.v1.manifest.json', 'utf8'));
const bytes = readFileSync(corpusFile);
const corpus = z.object({ version: z.literal(1), scope: z.string(), cases: z.array(z.object({
  id: z.string(), family: z.string(), language: z.enum(['ar', 'en']), critical: z.boolean(),
  input: z.object({ message: z.string().min(1), previous: z.string().optional() }).strict(), expected: decision,
}).strict()).min(1) }).strict().parse(JSON.parse(bytes.toString('utf8')));
const digest = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const results = corpus.cases.map(row => {
  const { message, previous } = row.input;
  const intent = detectIntent(message, undefined, undefined, previous);
  const actual = { refusal: isSalesRefusal(message), processQuestion: isPurchaseProcessQuestion(message),
    explicitPurchase: isExplicitPurchaseInstruction(message),
    ...(row.expected.pending ? { pending: pendingDecisionFromQuestion(previous) } : {}), intent,
    goal: decideSalesTurnGoal({ intent, customerMessage: message, lastAssistantMessage: previous }) };
  const mismatches = Object.keys(row.expected).filter(key => actual[key as keyof typeof actual] !== row.expected[key as keyof typeof row.expected]);
  return { ...row, actual, mismatches, passed: mismatches.length === 0 };
});

describe('frozen public sales decision corpus v1', () => {
  it('preserves the pre-repair corpus identity and separates reporting families', () => {
    expect(digest(bytes)).toBe(manifest.corpusSha256);
    expect(corpus.cases.length).toBe(manifest.caseCount);
    expect(new Set(corpus.cases.map(row => row.id)).size).toBe(corpus.cases.length);
    const groups = Object.values(manifest.partitions).flat() as string[];
    expect(new Set(groups).size).toBe(groups.length);
    expect(new Set(corpus.cases.map(row => row.family))).toEqual(new Set(groups));
  });
  it.each(results)('$id interprets the current message and previous question', row => {
    expect(row.actual, JSON.stringify(row.input)).toEqual(row.expected);
  });
});

afterAll(() => {
  const summarize = (rows: typeof results) => ({ total: rows.length, passed: rows.filter(r => r.passed).length,
    failed: rows.filter(r => !r.passed).length, critical: rows.filter(r => r.critical).length,
    criticalPassed: rows.filter(r => r.critical && r.passed).length });
  const report = { version: 1, generatedAt: new Date().toISOString(), scope: corpus.scope,
    corpusSha256: digest(bytes), runnerSha256: digest(readFileSync('server/ai/sales-decision-benchmark.test.ts')),
    sourceSha256: Object.fromEntries(['customer-decision', 'session-context', 'sales-turn-policy'].map(name =>
      [`server/ai/${name}.ts`, digest(readFileSync(`server/ai/${name}.ts`))])),
    liveModelCalls: 0, ...summarize(results),
    byFamily: Object.fromEntries([...new Set(results.map(r => r.family))].map(family => [family, summarize(results.filter(r => r.family === family))])),
    partitions: Object.fromEntries(Object.entries(manifest.partitions).map(([name, families]) => [name,
      summarize(results.filter(row => (families as string[]).includes(row.family)))])), results };
  mkdirSync('.tmp/sales-decision-benchmark', { recursive: true });
  writeFileSync('.tmp/sales-decision-benchmark/latest.json', JSON.stringify(report, null, 2) + '\n');
});
