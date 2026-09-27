import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { assertDisposableDatabase, createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { currentAiPrice, readAiPriceHistory, saveAiPriceCard } from './price-admin';
import { readAiBudgetAdmin } from './budget-admin';
import { reserveAiBudget, settleAiBudget } from './budget-ledger';
import type { AiPriceSave } from '../../shared/ai-price-contract';

describe.skipIf(!process.env.DATABASE_URL)('central price revision MySQL security and recovery', () => {
  let actor: number, other: number;
  const users: number[] = [], models: string[] = [], scopes: string[] = [];
  const pool = async () => (await getPool())!;
  const draft = (overrides: Partial<AiPriceSave> = {}): AiPriceSave => {
    const model = `price-fixture-${randomUUID()}`; models.push(model);
    return { provider: 'openai', model, version: 'v1', inputUsdPerMillion: 1, outputUsdPerMillion: 2,
      flatUsd: 0, maxInputTokens: 32000, enabled: true, expectedRevision: null, requestId: randomUUID(), reference: 'synthetic-approved-contract', ...overrides };
  };
  const card = async (model: string) => {
    const [rows] = await (await pool()).execute<any[]>('SELECT * FROM ai_price_cards WHERE provider = ? AND model = ?', ['openai', model]);
    return rows[0] ? currentAiPrice(rows[0]) : null;
  };
  const history = (model: string, beforeId?: number) => readAiPriceHistory({ provider: 'openai', model, beforeId }, actor);
  const revise = async (input: AiPriceSave, version: string, extra: Partial<AiPriceSave> = {}) => saveAiPriceCard({ ...input, version,
    expectedRevision: (await card(input.model))!.revision, requestId: randomUUID(), ...extra }, actor);
  beforeAll(async () => {
    assertDisposableDatabase();
    for (let i = 0; i < 2; i++) { const account = await createDisposableMerchant('price-audit'); users.push(account.userId); }
    [actor, other] = users;
    await (await pool()).execute("UPDATE users SET role='admin' WHERE id IN (?, ?)", users);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    const db = await pool();
    for (const scope of scopes) {
      await db.execute('DELETE FROM ai_usage_reservations WHERE scope_key = ?', [scope]);
      await db.execute('DELETE FROM ai_budget_periods WHERE scope_key = ?', [scope]);
    }
    for (const model of models) {
      await db.execute('DELETE FROM ai_price_card_revisions WHERE provider = ? AND model = ?', ['openai', model]);
      await db.execute('DELETE FROM ai_price_cards WHERE provider = ? AND model = ?', ['openai', model]);
    }
    await cleanupDisposableMerchants(users); await closeDb();
  });
  it('creates an attributed revision, retains old prices, and exports dated history', async () => {
    const input = draft(); const saved = await saveAiPriceCard(input, actor);
    const before = await card(input.model);
    expect(before).toMatchObject({ version: 'v1', inputUsdPerMillion: 1, revision: saved.revision });
    await revise(input, 'v2', { inputUsdPerMillion: 9, enabled: false });
    const audit = await history(input.model);
    expect(audit.entries.map(row => row.card.version)).toEqual(['v2', 'v1']);
    expect(audit.entries[1]).toMatchObject({ actorId: actor, reference: input.reference, origin: 'admin', card: { inputUsdPerMillion: 1, enabled: true } });
    expect(audit.entries.every(row => !Number.isNaN(Date.parse(row.recordedAt)))).toBe(true);
    expect((await readAiBudgetAdmin(actor)).prices.find(row => row.model === input.model)).toMatchObject({ version: 'v2', enabled: false });
  });
  it('archives an untracked legacy card without inventing an author or original approval date', async () => {
    const input = draft();
    await (await pool()).execute(`INSERT INTO ai_price_cards (provider,model,version,input_micro_usd_per_million,output_micro_usd_per_million,flat_micro_usd,max_input_tokens,enabled)
      VALUES ('openai',?,'legacy-v0',1000000,2000000,0,32000,1)`, [input.model]);
    expect((await history(input.model)).entries).toEqual([]);
    await revise(input, 'v1');
    expect((await history(input.model)).entries[1]).toMatchObject({ origin: 'legacy', actorId: null, reference: null, card: { version: 'legacy-v0' } });
  });
  it('replays an acknowledged or lost-ack request without reactivating its superseded price', async () => {
    const input = draft(), first = await saveAiPriceCard(input, actor);
    await revise(input, 'v2');
    expect(await saveAiPriceCard(input, actor)).toEqual({ ...first, replayed: true });
    expect((await card(input.model))!.version).toBe('v2');
    expect((await history(input.model)).entries).toHaveLength(2);
    await expect(saveAiPriceCard({ ...input, inputUsdPerMillion: 8 }, actor)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(saveAiPriceCard(input, other)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('admits one of eight conflicting first writes and one of eight stale edits', async () => {
    const input = draft();
    const first = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => saveAiPriceCard({ ...input, version: `initial-${i}`, requestId: randomUUID() }, actor)));
    expect(first.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    const current = (await card(input.model))!;
    const edits = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => saveAiPriceCard({ ...input, version: `revision-${i}`, expectedRevision: current.revision, requestId: randomUUID() }, actor)));
    expect(edits.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    for (const result of [...first, ...edits]) if (result.status === 'rejected') expect(result.reason.code).toBe('CONFLICT');
    expect((await history(input.model)).entries).toHaveLength(2);
  });
  it('deduplicates concurrent exact retries to the same persisted revision', async () => {
    const input = draft(), results = await Promise.all(Array.from({ length: 8 }, () => saveAiPriceCard(input, actor)));
    expect(new Set(results.map(row => row.revisionId)).size).toBe(1);
    expect(results.filter(row => !row.replayed)).toHaveLength(1);
    expect((await history(input.model)).entries).toHaveLength(1);
  });
  it('blocks version reuse, case aliases, and a stale form even when the amounts are unchanged', async () => {
    const input = draft(), first = await saveAiPriceCard(input, actor);
    await expect(revise(input, 'V1')).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(revise(input, 'v2', { model: input.model.toUpperCase() })).rejects.toMatchObject({ code: 'CONFLICT' });
    await revise(input, 'v2');
    await expect(revise(input, 'v1')).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(saveAiPriceCard({ ...input, version: 'v3', expectedRevision: first.revision, requestId: randomUUID() }, actor)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
  it('refuses users with revoked or suspended admin authority, including exact retries', async () => {
    const input = draft(); await saveAiPriceCard(input, actor);
    const db = await pool();
    for (const update of ["role='user'", "role='admin', account_status='deletion_pending'"]) {
      await db.execute(`UPDATE users SET ${update} WHERE id=?`, [other]);
      await expect(saveAiPriceCard(draft(), other)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(readAiPriceHistory({ provider: 'openai', model: input.model }, other)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(readAiBudgetAdmin(other)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    }
    await db.execute("UPDATE users SET role='admin', account_status='active' WHERE id=?", [other]);
    await db.execute("UPDATE users SET role='user' WHERE id=?", [actor]);
    try { await expect(saveAiPriceCard(input, actor)).rejects.toMatchObject({ code: 'FORBIDDEN' }); }
    finally { await db.execute("UPDATE users SET role='admin' WHERE id=?", [actor]); }
  });
  it('rolls back both history and active price if the final write fails', async () => {
    const input = draft(), db = await pool(), connection = await db.getConnection(), original = connection.execute.bind(connection);
    vi.spyOn(db, 'getConnection').mockResolvedValueOnce(connection);
    vi.spyOn(connection, 'execute').mockImplementation((async (sql: any, args: any) => {
      if (String(sql).startsWith('INSERT INTO ai_price_cards')) throw new Error('injected write failure');
      return original(sql, args);
    }) as any);
    await expect(saveAiPriceCard(input, actor)).rejects.toThrow('injected write failure');
    vi.restoreAllMocks();
    expect(await card(input.model)).toBeNull(); expect((await history(input.model)).entries).toEqual([]);
    expect(await saveAiPriceCard(input, actor)).toMatchObject({ replayed: false });
  });
  it('recovers a committed write after the commit acknowledgment is lost', async () => {
    const input = draft(), db = await pool(), connection = await db.getConnection(), commit = connection.commit.bind(connection);
    vi.spyOn(db, 'getConnection').mockResolvedValueOnce(connection);
    vi.spyOn(connection, 'commit').mockImplementationOnce(async () => { await commit(); throw Error('lost acknowledgment'); });
    await expect(saveAiPriceCard(input, actor)).rejects.toThrow('lost acknowledgment');
    vi.restoreAllMocks();
    expect(await saveAiPriceCard(input, actor)).toMatchObject({ replayed: true });
    expect((await history(input.model)).entries).toHaveLength(1);
  });
  it('detects changed audit fields, snapshots, and unaudited active-card drift', async () => {
    const input = draft(), saved = await saveAiPriceCard(input, actor), db = await pool();
    await db.execute("UPDATE ai_price_card_revisions SET reference='tampered-reference' WHERE id=?", [saved.revisionId]);
    await expect(history(input.model)).rejects.toThrow('integrity');
    await expect(saveAiPriceCard(input, actor)).rejects.toThrow('integrity');
    await db.execute('UPDATE ai_price_card_revisions SET reference=? WHERE id=?', [input.reference, saved.revisionId]);
    await db.execute("UPDATE ai_price_cards SET version='outside-ledger-change' WHERE model=?", [input.model]);
    await expect(revise(input, 'v2')).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect((await history(input.model)).entries).toHaveLength(1);
  });
  it('paginates without duplication and retains audit after the author is deleted', async () => {
    const input = draft(); await saveAiPriceCard(input, actor);
    for (let i = 2; i <= 22; i++) await revise(input, `v${i}`);
    const first = await history(input.model), second = await history(input.model, first.nextBeforeId!);
    expect(first.entries).toHaveLength(20); expect(second.entries).toHaveLength(2); expect(second.nextBeforeId).toBeNull();
    expect(new Set([...first.entries, ...second.entries].map(row => row.id)).size).toBe(22);
    const disposable = await createDisposableMerchant('price-author'); users.push(disposable.userId);
    await (await pool()).execute("UPDATE users SET role='admin' WHERE id=?", [disposable.userId]);
    const orphan = draft(); await saveAiPriceCard(orphan, disposable.userId);
    await cleanupDisposableMerchants([disposable.userId]);
    expect((await history(orphan.model)).entries[0].actorId).toBe(disposable.userId);
  });
  it('settles a reservation at its original rate after a more expensive revision is disabled', async () => {
    const input = draft(), scope = `price-reservation-${randomUUID()}`; scopes.push(`platform:${scope}`);
    await saveAiPriceCard(input, actor);
    const reserved = await reserveAiBudget({ merchantId: scope, provider: input.provider, model: input.model, taskType: 'fixture.price', requestId: randomUUID(), inputTokens: 10, maxOutputTokens: 10 });
    await revise(input, 'v2', { inputUsdPerMillion: 100, enabled: false });
    await settleAiBudget(reserved, { prompt_tokens: 10, completion_tokens: 10 });
    const [[row]] = await (await pool()).execute<any[]>('SELECT price_version, settled_micro_usd FROM ai_usage_reservations WHERE reservation_key=?', [reserved.reservationKey]);
    expect(row.price_version).toBe('v1'); expect(Number(row.settled_micro_usd)).toBe(30);
    const [[policy]] = await (await pool()).execute<any[]>("SELECT daily_limit_micro_usd FROM ai_budget_policies WHERE scope_key='global'");
    expect(Number(policy.daily_limit_micro_usd)).toBe(100_000_000);
  });
});
