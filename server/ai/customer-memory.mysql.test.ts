import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const model=vi.hoisted(()=>vi.fn());
vi.mock('./openai',()=>({callGPT4:model}));
vi.mock('../db_ai_settings',()=>({getTextGenerationSettings:async()=>({model:'central-memory-test',isActive:true,textGenerationProvider:'openai'})}));
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { captureDirectCustomerMemory, captureContextualCustomerMemory, readCustomerMemory, groundCustomerProfile } from './customer-memory';
import { understandConversation } from './conversation-understanding';
import { memoryUnderstandingFixture } from '../tests/helpers/memory-understanding-fixture';
import { getOrCreateProfile, buildProfileContext } from '../db/customer-intelligence';
import { createSessionWithPersist, getSessionWithFallback } from './session-store';

describe.skipIf(!process.env.DATABASE_URL)('source-bound customer memory with real MySQL', () => {
  let fixture: Awaited<ReturnType<typeof createDisposableMerchant>>;
  let conversationId: number;
  const phone = '966500000087';
  const sql = async (query: string, args: any[] = []) => (await (await getPool())!.execute<any>(query, args))[0];
  beforeEach(async () => {
    fixture = await createDisposableMerchant('memory-facts');
    conversationId = (await sql("INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,?,'active')", [fixture.merchantId, phone])).insertId;
  });
  afterEach(async () => cleanupDisposableMerchants([fixture.userId]));
  afterAll(closeDb);
  const message = async (content: string, conv = conversationId, direction = 'incoming') =>
    (await sql('INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?, ?, \'text\', ?)', [conv, direction, content])).insertId as number;
  // Fixed expected model outputs for these storage scenarios, not a substitute for language evaluation.
  const syntheticFacts:Record<string,Parameters<typeof memoryUnderstandingFixture>[1]>={
    'ميزانيتي 500 ريال':[{field:'budget',value:{amountMinor:50000,currency:'SAR'}}],
    'عدّل ميزانيتي إلى 800 ريال':[{field:'budget',value:{amountMinor:80000,currency:'SAR'}}],
    'ميزانيتي 800 ريال':[{field:'budget',value:{amountMinor:80000,currency:'SAR'}}],
    'ميزانيتي 900 ريال':[{field:'budget',value:{amountMinor:90000,currency:'SAR'}}],
    'ميزانيتي 600 ريال':[{field:'budget',value:{amountMinor:60000,currency:'SAR'}}],
    'نادني أمل':[{field:'preferredName',value:'أمل'}], 'نادني أم محمد':[{field:'preferredName',value:'أم محمد'}],
    'الجودة أهم شيء عندي':[{field:'qualityFocused',value:true}],
    'السعر ليس أولويتي':[{field:'priceConscious',value:false}], 'السعر أهم شيء عندي':[{field:'priceConscious',value:true}],
  };
  const capture = async (id: number, overrides = {}) => {
    const identity={merchantId:fixture.merchantId,customerPhone:phone,conversationId,incomingMessageId:id,...overrides};
    const privacy=await captureDirectCustomerMemory(identity);
    if(privacy.reply||id<=privacy.forgetBeforeMessageId)return privacy;
    const [source]=await sql('SELECT content FROM messages WHERE id=?',[id]);
    if(!syntheticFacts[source.content])return privacy;
    model.mockImplementation(async messages=>{
      const context=JSON.parse(messages[1].content),current=context.messages.find((m:any)=>m.id===context.currentMessageId);
      return JSON.stringify(memoryUnderstandingFixture(context,syntheticFacts[current.content]||[]));
    });
    try { if(await understandConversation({...identity,message:source.content}))await captureContextualCustomerMemory(identity); }
    catch(error){if(!(error instanceof Error)||!error.message.includes('superseded'))throw error;}
    return privacy;
  };
  const read = () => readCustomerMemory(fixture.merchantId, phone);
  const infer = async (id: number, facts: any[], overrides = {}, beforeCapture?: () => Promise<unknown>) => {
    const identity={merchantId:fixture.merchantId,customerPhone:phone,conversationId,incomingMessageId:id,...overrides};
    const [source]=await sql('SELECT content FROM messages WHERE id=?',[id]);
    model.mockImplementation(async messages=>{
      const context=JSON.parse(messages[1].content);
      const analysis=memoryUnderstandingFixture(context,facts.map(f=>({field:f.field,value:f.value,kind:'inferred'})));
      analysis.memoryFacts!.forEach((fact,index)=>{ const evidence=context.messages.find((m:any)=>m.id===facts[index].sourceMessageId);
        fact.evidence=[{messageId:facts[index].sourceMessageId,excerpt:evidence?.content.slice(0,300)||'unavailable'}]; });
      return JSON.stringify(analysis);
    });
    if(!await understandConversation({...identity,message:source.content}))throw Error('Memory evidence invalid');
    await beforeCapture?.();
    return captureContextualCustomerMemory(identity);
  };
  const profileContext = async () => buildProfileContext(groundCustomerProfile(await getOrCreateProfile(fixture.merchantId, phone), await read()));

  it('captures a first-message budget immediately and correction replaces it across conversation restart', async () => {
    const first = await message('ميزانيتي 500 ريال'); await capture(first);
    const second = await message('عدّل ميزانيتي إلى 800 ريال'); await capture(second);
    const memory = await read();
    expect(memory.facts).toEqual([expect.objectContaining({ field: 'budget', value: { amountMinor: 80000, currency: 'SAR' },
      kind: 'explicit', sourceMessageId: second, conversationId, revision: 2 })]);
    const otherConv = (await sql("INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,?,'active')", [fixture.merchantId, phone])).insertId;
    await capture(await message('مرحبا مجددا', otherConv), { conversationId: otherConv });
    expect(await profileContext()).toContain('80000');
    expect(await profileContext()).not.toContain('50000');
  });
  it('does not renew expiration or revision on duplicate replay, including concurrent delivery', async () => {
    const id = await message('ميزانيتي 500 ريال');
    await Promise.all([capture(id), capture(id)]);
    const before = await read(); await capture(id);
    expect(await read()).toEqual(before);
    expect(before.facts[0].revision).toBe(1);
  });
  it('does not let an older concurrent message overwrite a newer direct correction', async () => {
    const old = await message('ميزانيتي 500 ريال'), latest = await message('ميزانيتي 900 ريال');
    await Promise.all([capture(latest), capture(old)]);
    expect((await read()).facts[0]).toMatchObject({ value: { amountMinor: 90000 }, sourceMessageId: latest });
  });
  it('expires each field separately and does not renew unrelated fields', async () => {
    const name = await message('نادني أمل'); await capture(name);
    const budget = await message('ميزانيتي 500 ريال'); await capture(budget);
    await sql("UPDATE customer_memory_facts SET expires_at=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP()) WHERE merchant_id=? AND field_key='budget'", [fixture.merchantId]);
    await capture(await message('الجودة أهم شيء عندي'));
    expect((await read()).facts.map(f => f.field).sort()).toEqual(['preferredName', 'qualityFocused']);
    expect(await profileContext()).not.toContain('50000');
  });
  it('uses source time, not worker time, to expire delayed extraction', async () => {
    const id = await message('أريد شيئا رخيصا');
    await sql('UPDATE messages SET createdAt=TIMESTAMPADD(DAY,-31,UTC_TIMESTAMP()) WHERE id=?', [id]);
    await infer(id, [{ field: 'priceConscious', value: true, sourceMessageId: id }]);
    expect((await read()).facts).toEqual([]);
  });
  it('keeps explicit false ahead of later inferred true and preserves each source independently', async () => {
    const direct = await message('السعر ليس أولويتي'); await capture(direct);
    const id = await message('هل يوجد شيء أرخص؟');
    await infer(id, [{ field: 'priceConscious', value: true, sourceMessageId: id }, { field: 'lastObjection', value: 'price', sourceMessageId: id }]);
    expect((await read()).facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'priceConscious', value: false, kind: 'explicit', sourceMessageId: direct }),
      expect.objectContaining({ field: 'lastObjection', value: 'price', kind: 'inferred', sourceMessageId: id }),
    ]));
  });
  it('replaces superseded inference and clears a list instead of accumulating stale pain points', async () => {
    const first = await message('التوصيل تأخر'); await infer(first, [{ field: 'painPoints', value: ['تأخر التوصيل'], sourceMessageId: first }]);
    const next = await message('انحلت مشكلة التوصيل'); await infer(next, [{ field: 'painPoints', value: [], sourceMessageId: next }]);
    expect((await read()).facts[0]).toMatchObject({ value: [], sourceMessageId: next, revision: 2 });
    expect(await profileContext()).not.toContain('تأخر التوصيل');
  });
  it('does not extend a source TTL when a new extraction cites the same old evidence', async () => {
    const first = await message('أريد شيئا رخيصا'); await infer(first, [{ field: 'priceConscious', value: true, sourceMessageId: first }]);
    const before = (await read()).facts[0];
    const next = await message('مرحبا'); await expect(infer(next, [{ field: 'priceConscious', value: true, sourceMessageId: first }])).rejects.toThrow('Memory evidence');
    expect((await read()).facts[0]).toEqual(before);
  });
  it.each(['merchant', 'phone', 'conversation', 'outgoing'])('rejects a forged direct source: %s', async attack => {
    const id = await message('ميزانيتي 500 ريال', conversationId, attack === 'outgoing' ? 'outgoing' : 'incoming');
    const overrides = attack === 'merchant' ? { merchantId: fixture.merchantId + 1000000 } : attack === 'phone'
      ? { customerPhone: '966500000088' } : attack === 'conversation' ? { conversationId: conversationId + 1000000 } : {};
    await expect(capture(id, overrides)).rejects.toThrow('ownership');
    expect((await read()).facts).toEqual([]);
  });
  it.each(['outgoing', 'foreign', 'future', 'unseen'])('rejects inferred source substitution and rolls back the whole extraction: %s', async attack => {
    const first = await message('أريد شيئا رخيصا');
    const foreign = (await sql("INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,?,'active')", [fixture.merchantId, '966500000088'])).insertId;
    const bad = attack === 'outgoing' ? await message('هو يحب الرخيص', conversationId, 'outgoing') : attack === 'foreign'
      ? await message('أريد الرخيص', foreign) : await message('رسالة أخرى');
    const through = attack === 'future' ? first : await message('مرحبا');
    await expect(infer(through, [{ field: 'priceConscious', value: true, sourceMessageId: first },
      { field: 'qualityFocused', value: true, sourceMessageId: bad }], attack === 'unseen' ? { allowedMessageIds: [first] } : {})).rejects.toThrow(/Memory evidence|superseded/);
    expect((await read()).facts).toEqual([]);
  });
  it.each(['version', 'handoff', 'source', 'phone'])('fences a shared inference whose authority changes before commit: %s', async attack => {
    const id = await message('غالي');
    await getOrCreateProfile(fixture.merchantId,phone);
    await expect(infer(id, [{ field: 'priceConscious', value: true, sourceMessageId: id }], {}, async()=>{
      if(attack==='version')await sql('UPDATE customer_profiles SET memory_version=memory_version+1 WHERE merchant_id=?',[fixture.merchantId]);
      else if(attack==='handoff')await sql('UPDATE conversations SET handoff_version=handoff_version+1 WHERE id=?',[conversationId]);
      else if(attack==='phone')await sql("UPDATE conversations SET customerPhone='966500000088' WHERE id=?",[conversationId]);
      else await sql("UPDATE messages SET content='changed' WHERE id=?",[id]);
    })).rejects.toThrow();
    expect((await read()).facts).toEqual([]);
  });
  it('excludes facts when their source is removed, and never reads another tenant', async () => {
    const id = await message('ميزانيتي 500 ريال'); await capture(id);
    expect((await readCustomerMemory(fixture.merchantId + 1000000, phone)).facts).toEqual([]);
    await sql('DELETE FROM messages WHERE id=?', [id]);
    expect((await read()).facts).toEqual([]);
  });
  it('validates customer ownership even when the model returns no facts', async () => {
    const id = await message('مرحبا');
    await expect(infer(id, [], { customerPhone: '966500000088' })).rejects.toThrow();
    expect(await sql("SELECT id FROM customer_profiles WHERE merchant_id=? AND customer_phone='966500000088'", [fixture.merchantId])).toHaveLength(0);
  });
  it('deletes the budget value and blocks historical extraction while keeping unrelated explicit facts', async () => {
    const id = await message('ميزانيتي 500 ريال'); await capture(id);
    await capture(await message('نادني أمل'));
    const deletion = await message('انس ميزانيتي');
    expect((await capture(deletion)).reply).toContain('حذفت الميزانية');
    expect((await read()).facts.map(f => f.field)).toEqual(['preferredName']);
    const tombstone = (await sql("SELECT value_json,deleted FROM customer_memory_facts WHERE merchant_id=? AND field_key='budget'", [fixture.merchantId]))[0];
    expect(tombstone).toEqual({ value_json: null, deleted: 1 });
    await capture(id); expect((await read()).facts.map(f => f.field)).toEqual(['preferredName']);
    const latest = await message('مرحبا');
    await expect(infer(latest, [{ field: 'priceConscious', value: true, sourceMessageId: id }])).rejects.toThrow('Memory evidence');
    await capture(await message('ميزانيتي 800 ريال'));
    expect((await read()).facts).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'budget', value: { amountMinor: 80000, currency: 'SAR' } })]));
  });
  it('erases all personalization and tombstones durable sessions without deleting conversation or payment history', async () => {
    await capture(await message('ميزانيتي 500 ريال')); await capture(await message('نادني أم محمد'));
    await sql("UPDATE customer_profiles SET preferences=?,pain_points=?,nickname='legacy',purchase_history='[\"order item\"]',verified_purchase_count=1 WHERE merchant_id=?",
      [JSON.stringify({ _enrichment: { old: true } }), '["private complaint"]', fixture.merchantId]);
    await createSessionWithPersist({ merchantId: fixture.merchantId, conversationId, initialIntent: 'exploring', initialSentiment: 'neutral' } as any);
    const id = await message('احذف ذاكرة المبيعات الخاصة بي');
    expect((await capture(id)).reply).toContain('حذفت ذاكرة المبيعات');
    expect((await read()).facts).toEqual([]);
    expect((await read()).forgetBeforeMessageId).toBe(id);
    expect(await getSessionWithFallback(fixture.merchantId, conversationId)).toBeNull();
    const profile = await getOrCreateProfile(fixture.merchantId, phone);
    expect(profile).toMatchObject({ preferences: {}, nickname: null, displayName: null, painPoints: [], verifiedPurchaseCount: 1, purchaseHistory: ['order item'] });
    expect(await profileContext()).toBe('');
    expect((await sql('SELECT id FROM messages WHERE conversationId=?', [conversationId])).length).toBe(3);
    const before = await read(); expect((await capture(id)).reply).toContain('سبق تطبيق'); expect(await read()).toEqual(before);
  });
  it('does not apply a stale deletion after a newer customer message', async () => {
    await capture(await message('ميزانيتي 500 ريال'));
    const stale = await message('احذف ذاكرة المبيعات الخاصة بي');
    await capture(await message('ميزانيتي 800 ريال'));
    expect((await capture(stale)).reply).toContain('رسالة أحدث');
    expect((await read()).facts[0]).toMatchObject({ value: { amountMinor: 80000 } });
  });
  it('retains only the current sourced facts over fifteen turns and a fresh database connection', async () => {
    const turns = ['نادني أمل', 'ميزانيتي 500 ريال', 'هل يوجد لون أسود؟', 'أحتاج قطعتين', 'هل يشمل التوصيل؟',
      'عدّل ميزانيتي إلى 800 ريال', 'ما الضمان؟', 'سأعود لاحقا', 'رجعت للمقارنة', 'السعر ليس أولويتي',
      'هل يوجد مقاس أصغر؟', 'السعر أهم شيء عندي', 'انس ميزانيتي', 'مرحبا', 'ميزانيتي 600 ريال'];
    for (let index = 0; index < turns.length; index++) {
      const id = await message(turns[index]); await capture(id);
      if (index === 7) await closeDb();
      const current = await read();
      expect(current.facts.find(f => f.field === 'preferredName')?.value).toBe('أمل');
      const budget = current.facts.find(f => f.field === 'budget')?.value;
      const amount = index < 1 || (index >= 12 && index < 14) ? undefined : index < 5 ? 50000 : index < 14 ? 80000 : 60000;
      expect(budget).toEqual(amount === undefined ? undefined : { amountMinor: amount, currency: 'SAR' });
      if (index >= 9) expect(current.facts.find(f => f.field === 'priceConscious')?.value).toBe(index >= 11);
    }
    expect((await getOrCreateProfile(fixture.merchantId, phone)).totalConversations).toBe(1);
  });
});
