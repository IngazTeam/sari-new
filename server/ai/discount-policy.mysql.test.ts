import { beforeEach, afterEach, afterAll, describe, expect, it } from 'vitest';
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { getDiscountPolicy, updateDiscountPolicy, ensureBotSettingsRow } from './discount-policy';
import { defaultDiscountPolicy, discountPolicyUpdateSchema } from '../../shared/discount-policy';
import { generateAutoDiscount } from './auto-discount';
import { getBotSettings, updateBotSettings } from '../db';

describe.skipIf(!process.env.DATABASE_URL)('reviewed discount policy on MySQL', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner;
  const query = async (sql: string, values: any[] = []) => (await (await getPool())!.execute<any>(sql, values))[0];
  const rows = () => query('SELECT * FROM bot_settings WHERE merchant_id=?', [owner.merchantId]);
  const input = async (policy = { enabled: true, maxPercent: 3, expireHours: 24 }) => {
    const current = await getDiscountPolicy(owner.merchantId);
    return { policy, reviewed: true as const, expectedRevision: current.revision, evidence: current.evidence, merchantId: owner.merchantId, actorUserId: owner.userId };
  };
  const request = async (phone = '966550123456', content = 'ممكن خصم؟') => {
    const c = await query('INSERT INTO conversations (merchantId,customerPhone) VALUES (?,?)', [owner.merchantId, phone]);
    const m = await query("INSERT INTO messages (conversationId,direction,content) VALUES (?,'incoming',?)", [c.insertId, content]);
    return { merchantId: owner.merchantId, conversationId: c.insertId, incomingMessageId: m.insertId, customerPhone: phone, customerMessage: content };
  };
  beforeEach(async () => { owner = await createDisposableMerchant('discount-policy'); other = await createDisposableMerchant('other-policy'); });
  afterEach(async () => { await cleanupDisposableMerchants([owner.userId, other.userId]); });
  afterAll(closeDb);
  it('reads disabled defaults without creating authority or audit history', async () => {
    expect(await getDiscountPolicy(owner.merchantId)).toMatchObject({ policy: defaultDiscountPolicy, revision: 0, history: [] });
    expect(await rows()).toHaveLength(0);
  });
  it('initializes the original Arabic bot defaults while leaving issuance disabled', async () => {
    const settings = await getBotSettings(owner.merchantId);
    expect(settings.welcomeMessage).toBe('مرحباً! أنا مساعدك الذكي. كيف أقدر أساعدك اليوم؟ 😊');
    expect(settings.outOfHoursMessage).toBe('شكراً لتواصلك! نحن حالياً خارج أوقات العمل. سنرد عليك في أقرب وقت ممكن ⏰');
    expect(settings).toMatchObject({ autoReplyEnabled: true, workingHoursEnabled: false, workingDays: '1,2,3,4,5', autoDiscountEnabled: 0 });
  });
  it('waits for a committed authority change before issuing, including an existing customer limit row', async () => {
    await updateDiscountPolicy(await input()); const source = await request();
    await query('INSERT INTO sales_offer_limits (merchant_id,customer_phone) VALUES (?,?)', [owner.merchantId, source.customerPhone]);
    const connection = await (await getPool())!.getConnection();
    let pending: Promise<unknown> | undefined;
    try {
      await connection.beginTransaction();
      await connection.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE', [owner.merchantId]);
      pending = generateAutoDiscount(source);
      await connection.execute('UPDATE bot_settings SET auto_discount_enabled=0,auto_discount_revision=2 WHERE merchant_id=?', [owner.merchantId]);
      await connection.commit();
      expect(await pending).toBeNull();
      expect(await query('SELECT id FROM discount_codes WHERE merchantId=?', [owner.merchantId])).toEqual([]);
      expect(await query('SELECT id FROM sales_offer_attempts WHERE merchant_id=?', [owner.merchantId])).toEqual([]);
    } finally { await connection.rollback(); connection.release(); await pending; }
  });
  it('preserves legacy authorization below five percent and does not invent its actor', async () => {
    await query('INSERT INTO bot_settings (merchant_id,auto_discount_enabled,auto_discount_max_percent,auto_discount_expire_hours) VALUES (?,1,3,24)', [owner.merchantId]);
    expect(await getDiscountPolicy(owner.merchantId)).toMatchObject({ policy: { enabled: true, maxPercent: 3, expireHours: 24 }, revision: 0, history: [] });
  });
  it('records exact before/after policy, authenticated actor and issuance authorization atomically', async () => {
    const change = await input();
    const saved = await updateDiscountPolicy(change);
    expect(saved).toMatchObject({ revision: 1, policy: change.policy, history: [{ revision: 1, actorUserId: owner.userId, beforePolicy: defaultDiscountPolicy, afterPolicy: change.policy }] });
    expect(saved.history[0].createdAt).toMatch(/Z$/);
    const issued = await generateAutoDiscount(await request()); expect(issued?.value).toBe(3);
    const attempts = await query('SELECT issuance_authorization FROM sales_offer_attempts WHERE merchant_id=?', [owner.merchantId]);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].issuance_authorization).toMatchObject({ revision: 1, policy: change.policy });
    expect((await getDiscountPolicy(other.merchantId)).history).toEqual([]);
  });
  it('a saved disable blocks new issuance but preserves previously issued terms', async () => {
    await updateDiscountPolicy(await input()); const issued = await generateAutoDiscount(await request()); expect(issued).not.toBeNull();
    await updateDiscountPolicy(await input({ enabled: false, maxPercent: 1, expireHours: 1 }));
    expect(await generateAutoDiscount(await request('966550123457'))).toBeNull();
    const codes = await query('SELECT value,isActive FROM discount_codes WHERE merchantId=?', [owner.merchantId]);
    expect(codes).toEqual([{ value: 3, isActive: 1 }]);
  });
  it('requires an explicit discount request even when policy is enabled', async () => {
    await updateDiscountPolicy(await input());
    expect(await generateAutoDiscount(await request('966550123456', 'غالي'))).toBeNull();
  });
  it('accepts only one concurrent revision and rejects replay without another audit', async () => {
    const change = await input();
    const outcomes = await Promise.allSettled([updateDiscountPolicy(change), updateDiscountPolicy({ ...change, policy: { ...change.policy, maxPercent: 9 } })]);
    expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(r => r.status === 'rejected')).toHaveLength(1);
    await expect(updateDiscountPolicy(change)).rejects.toThrow('changed');
    expect((await getDiscountPolicy(owner.merchantId)).history).toHaveLength(1);
  });
  it('does not record a no-op as a new human grant', async () => {
    const unchanged = await input(defaultDiscountPolicy);
    expect(await updateDiscountPolicy(unchanged)).toMatchObject({ revision: 0, history: [] });
    expect(await rows()).toHaveLength(0);
  });
  it('detects out-of-band value edits even when revision is unchanged', async () => {
    await ensureBotSettingsRow(owner.merchantId); const change = await input();
    await query('UPDATE bot_settings SET auto_discount_max_percent=2 WHERE merchant_id=?', [owner.merchantId]);
    await expect(updateDiscountPolicy(change)).rejects.toThrow('changed');
    expect((await rows())[0].auto_discount_max_percent).toBe(2);
  });
  it('rejects evidence copied from another merchant', async () => {
    const change = await input(); change.evidence = (await getDiscountPolicy(other.merchantId)).evidence;
    await expect(updateDiscountPolicy(change)).rejects.toThrow('changed');
    expect(await rows()).toHaveLength(0);
  });
  it('fails closed on duplicate settings without selecting or rewriting an arbitrary row', async () => {
    await query('INSERT INTO bot_settings (merchant_id,auto_discount_enabled) VALUES (?,1),(?,0)', [owner.merchantId, owner.merchantId]);
    await expect(getDiscountPolicy(owner.merchantId)).rejects.toThrow('Ambiguous');
    await expect(updateDiscountPolicy({ merchantId: owner.merchantId, actorUserId: owner.userId, policy: defaultDiscountPolicy, expectedRevision: 0, evidence: 'a'.repeat(64), reviewed: true })).rejects.toThrow('Ambiguous');
    expect(await generateAutoDiscount(await request())).toBeNull(); expect(await rows()).toHaveLength(2);
  });
  it.each([0, -1, 51])('does not hide an invalid stored ceiling %s behind a default', async max => {
    await query('INSERT INTO bot_settings (merchant_id,auto_discount_enabled,auto_discount_max_percent) VALUES (?,1,?)', [owner.merchantId, max]);
    await expect(getDiscountPolicy(owner.merchantId)).rejects.toThrow();
    expect(await generateAutoDiscount(await request())).toBeNull();
  });
  it('keeps the legacy null defaults unchanged across read and issuance', async () => {
    await query('INSERT INTO bot_settings (merchant_id,auto_discount_enabled,auto_discount_max_percent,auto_discount_expire_hours) VALUES (?,1,NULL,NULL)', [owner.merchantId]);
    expect((await getDiscountPolicy(owner.merchantId)).policy).toEqual({ ...defaultDiscountPolicy, enabled: true });
    expect((await generateAutoDiscount(await request()))?.value).toBe(5);
  });
  it('rolls back the settings update when its audit insert fails', async () => {
    await ensureBotSettingsRow(owner.merchantId); const change = await input();
    await query(`INSERT INTO sales_discount_policy_changes (merchant_id,actor_user_id,revision,evidence_hash,before_policy,after_policy) VALUES (?,?,1,?,?,?)`,
      [owner.merchantId, owner.userId, 'a'.repeat(64), JSON.stringify(defaultDiscountPolicy), JSON.stringify(defaultDiscountPolicy)]);
    await expect(updateDiscountPolicy(change)).rejects.toThrow();
    expect((await rows())[0]).toMatchObject({ auto_discount_enabled: 0, auto_discount_revision: 0, auto_discount_max_percent: 15 });
  });
  it('serializes first-use initialization with policy saves without duplicating settings', async () => {
    const change = await input();
    const outcomes = await Promise.allSettled([updateDiscountPolicy(change), ...Array.from({ length: 8 }, () => getBotSettings(owner.merchantId))]);
    expect(outcomes.slice(1).every(r => r.status === 'fulfilled')).toBe(true);
    expect(await rows()).toHaveLength(1);
    const stored = await getDiscountPolicy(owner.merchantId);
    expect(stored.policy.enabled).toBe(outcomes[0].status === 'fulfilled');
    expect(stored.history.length).toBe(outcomes[0].status === 'fulfilled' ? 1 : 0);
  });
  it.each(['autoDiscountEnabled', 'autoDiscountMaxPercent', 'autoDiscountExpireHours', 'autoDiscountRevision'])('blocks generic database writes to %s', async key => {
    await expect(updateBotSettings(owner.merchantId, { [key]: 1 } as any)).rejects.toThrow('reviewed'); expect(await rows()).toHaveLength(0);
  });
  it('saves general bot settings without touching money authority', async () => {
    await updateDiscountPolicy(await input());
    await updateBotSettings(owner.merchantId, { tone: 'professional', customInstructions: 'ابدأ بفهم احتياج العميل' });
    expect((await getDiscountPolicy(owner.merchantId))).toMatchObject({ revision: 1, policy: { enabled: true, maxPercent: 3, expireHours: 24 } });
  });
  it.each([{ reviewed: false }, { expectedRevision: -1 }, { policy: { enabled: true, maxPercent: 1.5, expireHours: 24 } },
    { policy: { enabled: true, maxPercent: 10, expireHours: 1.5 } }, { policy: { enabled: true, maxPercent: 10, expireHours: 24, margin: 10 } },
    { evidence: 'forged' }, { actorUserId: 1 }, { merchantId: 1 }])('rejects unsafe API policy contract %j', attack => {
    expect(discountPolicyUpdateSchema.safeParse({ policy: defaultDiscountPolicy, expectedRevision: 0, evidence: 'a'.repeat(64), reviewed: true, ...attack }).success).toBe(false);
  });
});
