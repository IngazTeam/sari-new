import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getPool } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { getPlaybook, runDailyAnalysis, runWeeklyAnalysis, getBestStrategy, isGoldenHour } from './sales-conductor';

describe.skipIf(!process.env.DATABASE_URL)('durable descriptive sales playbook', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, conversationId: number;
  const query = async (sql: string, args: unknown[] = []): Promise<any> => (await (await getPool())!.execute(sql, args))[0];
  beforeEach(async () => {
    owner = await createDisposableMerchant('playbook');
    conversationId = (await query("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500000119')", [owner.merchantId])).insertId;
    for (let n = 0; n < 3; n++) await query(`INSERT INTO sari_learning_signals
      (merchant_id,conversation_id,signal_type,customer_message) VALUES (?,?,'price_objection','أحمد لا يناسبه السعر')`, [owner.merchantId, conversationId]);
  });
  afterEach(async () => cleanupDisposableMerchants([owner.userId]));
  afterAll(closeDb);
  it('persists observed objection counts without inventing a winning strategy or exposing customer names', async () => {
    await runWeeklyAnalysis(owner.merchantId);
    const playbook = await getPlaybook(owner.merchantId);
    expect(playbook.topObjections).toEqual([{ objection: 'price_objection', frequency: 3,
      independentConversations: 1, bestStrategy: null, winRate: null }]);
    expect(JSON.stringify(playbook)).not.toContain('أحمد');
    expect(playbook.lastWeeklyUpdate).toBeInstanceOf(Date);
    expect(getBestStrategy(owner.merchantId, 'hesitating')).toBeNull(); expect(isGoldenHour(owner.merchantId)).toBe(false);
  });
  it('concurrent daily and weekly jobs preserve both analyses in one durable record', async () => {
    await Promise.all([runDailyAnalysis(owner.merchantId), runWeeklyAnalysis(owner.merchantId)]);
    const saved = await getPlaybook(owner.merchantId);
    expect(saved.lastDailyUpdate).toBeInstanceOf(Date); expect(saved.lastWeeklyUpdate).toBeInstanceOf(Date);
    expect(saved.topObjections).toHaveLength(1);
    expect(await query('SELECT revision FROM ai_sales_playbooks WHERE merchant_id=?', [owner.merchantId])).toEqual([{ revision: 2 }]);
  });
  it('reads external worker updates on the next call, instead of serving an old process Map', async () => {
    await runWeeklyAnalysis(owner.merchantId);
    expect((await getPlaybook(owner.merchantId)).topObjections).toHaveLength(1);
    await query('UPDATE ai_sales_playbooks SET weekly_analysis=? WHERE merchant_id=?', [JSON.stringify({ schemaVersion: 1, topObjections: [] }), owner.merchantId]);
    expect((await getPlaybook(owner.merchantId)).topObjections).toHaveLength(0);
  });
  it('isolates tenants and recalculates counts after source conversations are deleted', async () => {
    const other = await createDisposableMerchant('other-playbook');
    try {
      await runWeeklyAnalysis(owner.merchantId);
      expect((await getPlaybook(other.merchantId)).topObjections).toEqual([]);
      await query('DELETE FROM conversations WHERE id=? AND merchantId=?', [conversationId, owner.merchantId]);
      await runWeeklyAnalysis(owner.merchantId);
      expect((await getPlaybook(owner.merchantId)).topObjections).toEqual([]);
    } finally { await cleanupDisposableMerchants([other.userId]); }
  });
});
