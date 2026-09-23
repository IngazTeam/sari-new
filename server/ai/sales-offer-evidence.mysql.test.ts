import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const calls = vi.hoisted(() => ({ llm: vi.fn() }));
const transport = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('../channels/whatsapp/providers', () => ({ getWhatsAppProvider: () => ({ send: transport.send }) }));
vi.mock('../_core/llm', () => ({ invokeLLM: calls.llm }));
import { closeDb, getPool } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { loadArsenal } from './sales-arsenal';
import { loadLightweightArsenal } from './lightweight-arsenal';
import { loadNBAContext } from './next-best-action';
import { executeAction } from './action-selector';
import { generateAIResponse } from '../ai';

describe.skipIf(!process.env.DATABASE_URL)('sales offer truth on real MySQL', () => {
  let owner: Awaited<ReturnType<typeof createDisposableMerchant>>, other: typeof owner;
  let phone: string, otherPhone: string, conversationId: number, privateId: number, incomingMessageId: number;
  let sequence = 0;
  const query = async (sql: string, values: any[] = []) =>
    (await (await getPool())!.execute<any>(sql, values))[0];
  const code = async (
    merchantId: number,
    name: string,
    customerPhone: string | null,
    maxUses: number | null = null,
  ) => {
    const r = await query(
      `INSERT INTO discount_codes (merchantId,code,type,value,minOrderAmount,usedCount,maxUses,isActive,customer_phone)
      VALUES (?,?,'fixed',25,200,0,?,1,?)`,
      [merchantId, name, maxUses, customerPhone],
    );
    return Number(r.insertId);
  };
  beforeEach(async () => {
    vi.clearAllMocks();
    calls.llm.mockResolvedValue({ choices: [{ message: { content: 'fixture reply' } }] });
    owner = await createDisposableMerchant('offers');
    other = await createDisposableMerchant('other-offers');
    await query("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,status,is_primary) VALUES (?,?,'fixture','active',1)", [owner.merchantId,`offer-${owner.merchantId}`]);
    phone = '966510' + String(++sequence).padStart(6, '0');
    otherPhone = '966520' + String(sequence).padStart(6, '0');
    const conv = await query('INSERT INTO conversations (merchantId,customerPhone) VALUES (?,?)', [
      owner.merchantId,
      phone,
    ]);
    conversationId = Number(conv.insertId);
    const source = await query("INSERT INTO messages (conversationId,direction,content) VALUES (?,'incoming','هل يوجد خصم؟')", [conversationId]);
    incomingMessageId = Number(source.insertId);
    privateId = await code(owner.merchantId, 'PRIVATE25', phone, 1);
    await code(owner.merchantId, 'OTHER-CUSTOMER', otherPhone, 1);
    await code(other.merchantId, 'OTHER-TENANT', phone);
  });
  afterEach(async () => cleanupDisposableMerchants([owner.userId, other.userId]));
  afterAll(closeDb);

  it.each([
    ['full', loadArsenal],
    ['fast', loadLightweightArsenal],
  ] as const)('%s loads canonical type/value and only the current owner’s offer', async (_name, load) => {
    const result = await load(owner.merchantId, phone);
    expect(result.activeDiscounts).toHaveLength(1);
    expect(result.activeDiscounts[0]).toMatchObject({
      id: privateId,
      type: 'fixed',
      value: 25,
      minOrderAmount: 200,
    });
    expect((await load(owner.merchantId, otherPhone)).activeDiscounts.map((o) => o.code)).toEqual([
      'OTHER-CUSTOMER',
    ]);
    expect((await load(owner.merchantId, 'group_' + phone)).activeDiscounts).toEqual([]);
  });
  it.each(['isActive=0', 'usedCount=1', 'expiresAt=UTC_TIMESTAMP()', 'value=-20', 'minOrderAmount=-1'])(
    'fast and full paths observe live invalidation: %s',
    async (change) => {
      expect((await loadLightweightArsenal(owner.merchantId, phone)).activeDiscounts).toHaveLength(1);
      await query(`UPDATE discount_codes SET ${change} WHERE id=?`, [privateId]);
      expect((await loadLightweightArsenal(owner.merchantId, phone)).activeDiscounts).toEqual([]);
      expect((await loadArsenal(owner.merchantId, phone)).activeDiscounts).toEqual([]);
    },
  );
  it('loads NBA eligibility from the owned conversation and ignores another customer’s active code', async () => {
    expect(
      (await loadNBAContext(owner.merchantId, conversationId, 'هل يوجد خصم؟', 'inquiring')).hasDiscount,
    ).toBe(true);
    await query('UPDATE discount_codes SET isActive=0 WHERE id=?', [privateId]);
    expect(
      (await loadNBAContext(owner.merchantId, conversationId, 'هل يوجد خصم؟', 'inquiring')).hasDiscount,
    ).toBe(false);
    expect(
      (await loadNBAContext(other.merchantId, conversationId, 'هل يوجد خصم؟', 'inquiring')).hasDiscount,
    ).toBe(false);
  });
  it('the legacy provider prompt receives only current permitted codes and their exact conditions', async () => {
    const errors = vi.spyOn(console, 'error');
    expect(await generateAIResponse(owner.merchantId, 'هل يوجد خصم؟', [], phone)).toBe('fixture reply');
    const system = calls.llm.mock.calls.at(-1)![0].messages[0].content;
    expect(system).toContain('PRIVATE25');
    expect(system).toContain('minOrderAmount');
    expect(system).toContain('200');
    expect(system).not.toMatch(/OTHER-CUSTOMER|OTHER-TENANT/);
    await query('UPDATE discount_codes SET isActive=0 WHERE id=?', [privateId]);
    await generateAIResponse(owner.merchantId, 'هل يوجد خصم؟', [], phone);
    expect(calls.llm.mock.calls.at(-1)![0].messages[0].content).not.toContain('PRIVATE25');
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
  it('checks actual customer ownership again at action execution and does not consume the code by sharing it', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    transport.send.mockImplementation(async (_config,request) => {
      await send(request.to,request.text);
      return { accepted:true,outcome:'accepted',status:'sent',providerMessageId:`fixture-${crypto.randomUUID()}` };
    });
    await executeAction({
      merchantId: owner.merchantId,
      customerPhone: phone,
      conversationId,
      incomingMessageId,
      customerMessage: 'هل يوجد خصم؟',
      sendMessage: send,
      action: { type: 'offer_discount', reason: 'customer request' },
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][1]).toContain('PRIVATE25');
    expect(send.mock.calls[0][1]).toContain('200 ر.س');
    expect(send.mock.calls[0][1]).not.toContain('OTHER-CUSTOMER');
    const rows = await query('SELECT usedCount FROM discount_codes WHERE id=?', [privateId]);
    expect(rows[0].usedCount).toBe(0);
  });
  it('a coupon removed after generation is not shared by the supplementary action', async () => {
    expect((await loadArsenal(owner.merchantId, phone)).activeDiscounts).toHaveLength(1);
    await query('DELETE FROM discount_codes WHERE id=?', [privateId]);
    const send = vi.fn();
    await executeAction({
      merchantId: owner.merchantId,
      customerPhone: phone,
      conversationId,
      incomingMessageId,
      customerMessage: 'هل يوجد خصم؟',
      sendMessage: send,
      action: { type: 'offer_discount', reason: 'stale generation' },
    });
    expect(send).not.toHaveBeenCalled();
  });
  it('does not broaden a missing customer identity in the legacy path into private coupon access', async () => {
    await generateAIResponse(owner.merchantId, 'هل يوجد خصم؟', []);
    expect(calls.llm.mock.calls.at(-1)![0].messages[0].content).not.toMatch(
      /PRIVATE25|OTHER-CUSTOMER|OTHER-TENANT/,
    );
  });
});
