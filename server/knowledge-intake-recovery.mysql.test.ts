import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const model = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('./ai/openai', () => ({ callGPT4: model.call }));
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { ensureKnowledgeIntakeTestSchema } from './tests/helpers/knowledge-intake-schema';
import { reserveIntake, finishIntake, getIntakeReceipt, recoverIntake } from './knowledge/intake-receipt-store';
import { runIntakeExecution, assertIntakeCheckpoint, renewIntakeLease, runKnowledgeWrite, type IntakeExecution } from './knowledge/intake-execution';
import { createSection, updateSection, logChange, storeSectionEmbedding, invalidateCache, getSectionById } from './db/knowledge';
import { classifyContent, ingestContent } from './ai/knowledge-engine';
import { removeKnowledgeSource } from './knowledge/source-lifecycle';
import { reviewedKnowledgeInput } from './tests/helpers/knowledge-reviewed-input';

describe.skipIf(!process.env.DATABASE_URL)('interrupted knowledge intake recovery (local MySQL)', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner, execution: IntakeExecution, requestId: string;
  const source = () => ({ requestId: randomUUID(), content: 'Local source for safe recovery testing.', contentType: 'document' as const });
  const reserve = async () => reserveIntake(owner.merchantId, await reviewedKnowledgeInput(owner.merchantId, source()));
  const expire = () => (getPool().then(pool => pool!.execute('UPDATE knowledge_intake_receipts SET lease_expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 SECOND) WHERE merchant_id = ? AND request_id = ?', [owner.merchantId, requestId])));
  beforeAll(ensureKnowledgeIntakeTestSchema);
  beforeEach(async () => {
    vi.clearAllMocks(); owner = await createDisposableMerchant('intake-recovery'); other = await createDisposableMerchant('recovery-other');
    const reserved = await reserve(); execution = reserved.execution!; requestId = execution.requestId;
  });
  afterEach(async () => { await cleanupDisposableMerchants([owner.userId, other.userId]); });
  afterAll(closeDb);
  const create = () => createSection({ merchantId: owner.merchantId, title: 'Saved before interruption', content: 'Partial saved knowledge', sectionType: 'custom', source: 'document' });
  it('keeps live work protected and exposes recovery without leaking its execution token', async () => {
    const receipt = await getIntakeReceipt(owner.merchantId, requestId); expect(receipt).toMatchObject({ recovery: 'waiting', recoveredAt: null });
    expect(receipt).not.toHaveProperty('executionToken'); expect(JSON.stringify(receipt)).not.toContain(execution.token);
    await expect(recoverIntake(owner.merchantId, requestId)).rejects.toMatchObject({ code: 'CONFLICT' });
    await renewIntakeLease(execution); await runIntakeExecution(execution, () => assertIntakeCheckpoint(owner.merchantId));
  });
  it('closes expired work once, retains partial sections and archive, and permits a different intake', async () => {
    const sectionId = await runIntakeExecution(execution, create); await expire();
    expect((await getIntakeReceipt(owner.merchantId, requestId))?.recovery).toBe('available');
    const results = await Promise.all([recoverIntake(owner.merchantId, requestId), recoverIntake(owner.merchantId, requestId)]);
    expect(results.every(r => r.state === 'uncertain' && r.recoveredAt && r.recovery === null && r.documentId)).toBe(true);
    expect((await getSectionById(sectionId, owner.merchantId))?.content).toBe('Partial saved knowledge');
    const [audit] = await (await getPool())!.execute<any[]>('SELECT COUNT(*) AS n FROM sari_activity_log WHERE merchant_id = ? AND action_type = ?', [owner.merchantId, 'knowledge_intake_recovered']);
    expect(Number(audit[0].n)).toBe(1); expect((await reserve()).created).toBe(true);
  });
  it('fences all old pipeline writes, embeddings, cache mutation and further provider calls after recovery', async () => {
    const id = await runIntakeExecution(execution, create); const section = (await getSectionById(id, owner.merchantId))!;
    await expire(); await recoverIntake(owner.merchantId, requestId);
    for (const write of [create, () => updateSection(id, owner.merchantId, { content: 'Late stale write' }),
      () => logChange({ merchantId: owner.merchantId, sectionId: id, action: 'add' }),
      () => storeSectionEmbedding(section, owner.merchantId, Buffer.alloc(16)), () => invalidateCache(owner.merchantId),
      () => classifyContent(owner.merchantId, 'Late source text', {})]) {
      await expect(runIntakeExecution(execution, write)).rejects.toMatchObject({ name: 'IntakeExecutionExpired' });
    }
    expect(model.call).not.toHaveBeenCalled();
    expect(await finishIntake(owner.merchantId, requestId, 'completed', { success: true, evolveResult: { added: 1, evolved: 0, conflicts: 0, unchanged: 0 }, embeddingsReady: true }, execution)).toMatchObject({ state: 'uncertain', outcome: { embeddingsReady: false, evolveResult: { added: 0 } } });
    await removeKnowledgeSource(owner.merchantId, 'document');
    await expect(runIntakeExecution(execution, create)).rejects.toMatchObject({ name: 'IntakeExecutionExpired' });
  });
  it('does not let renewal revive an expired lease and applies the absolute execution limit', async () => {
    await expire(); await expect(renewIntakeLease(execution)).rejects.toMatchObject({ name: 'IntakeExecutionExpired' });
    await (await getPool())!.execute('UPDATE knowledge_intake_receipts SET created_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 31 MINUTE), lease_expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR) WHERE merchant_id = ? AND request_id = ?', [owner.merchantId, requestId]);
    await expect(runIntakeExecution(execution, create)).rejects.toMatchObject({ name: 'IntakeExecutionExpired' });
    expect((await recoverIntake(owner.merchantId, requestId)).state).toBe('uncertain');
  });
  it('discards a late classification response after closure without starting sales analysis or writing sections', async () => {
    let enter!: () => void, respond!: (value: string) => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    model.call.mockImplementationOnce(() => new Promise<string>(resolve => { respond = resolve; enter(); }));
    const result = runIntakeExecution(execution, () => ingestContent(owner.merchantId, 'Synthetic source for delayed provider', 'document', {}));
    const blocked = expect(result).rejects.toMatchObject({ name: 'IntakeExecutionExpired' });
    await entered; await expire(); await recoverIntake(owner.merchantId, requestId);
    respond(JSON.stringify([{ sectionType: 'policies', title: 'Late policy', content: 'Must never be saved', confidence: 1 }]));
    await blocked; expect(model.call).toHaveBeenCalledTimes(1);
    const [rows] = await (await getPool())!.execute<any[]>('SELECT COUNT(*) AS n FROM knowledge_sections WHERE merchant_id = ?', [owner.merchantId]);
    expect(Number(rows[0].n)).toBe(0);
  });
  it('refuses legacy records and isolates recovery and fenced writes across tenants', async () => {
    await expect(recoverIntake(other.merchantId, requestId)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(runIntakeExecution(execution, () => createSection({ merchantId: other.merchantId, title: 'Wrong tenant', content: 'Forbidden', sectionType: 'custom', source: 'document' }))).rejects.toMatchObject({ name: 'IntakeExecutionExpired' });
    await (await getPool())!.execute('UPDATE knowledge_intake_receipts SET execution_token = NULL, lease_expires_at = NULL WHERE merchant_id = ? AND request_id = ?', [owner.merchantId, requestId]);
    expect((await getIntakeReceipt(owner.merchantId, requestId))?.recovery).toBe('legacy');
    await expect(recoverIntake(owner.merchantId, requestId)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('serializes recovery behind an already guarded write, then prevents any subsequent write', async () => {
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>(r => { enter = r; }), gate = new Promise<void>(r => { release = r; });
    const pool = (await getPool())!;
    const writing = runIntakeExecution(execution, () => runKnowledgeWrite(pool, owner.merchantId, async connection => {
      await connection.execute('UPDATE knowledge_intake_receipts SET lease_expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 SECOND) WHERE merchant_id = ? AND request_id = ?', [owner.merchantId, requestId]);
      enter(); await gate;
      await connection.execute("INSERT INTO knowledge_sections (merchant_id,section_type,title,content,source) VALUES (?,'custom','In-flight before closure','Retained','document')", [owner.merchantId]);
    }));
    await entered;
    let settled = false; const recovering = recoverIntake(owner.merchantId, requestId).finally(() => { settled = true; });
    try { await new Promise(r => setTimeout(r, 35)); expect(settled).toBe(false); } finally { release(); }
    await writing; expect((await recovering).state).toBe('uncertain');
    await expect(runIntakeExecution(execution, create)).rejects.toMatchObject({ name: 'IntakeExecutionExpired' });
  });
});
