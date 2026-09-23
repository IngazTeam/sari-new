import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ send: vi.fn(), instance: vi.fn(), teach: vi.fn() }));
vi.mock('../channels/whatsapp/providers', () => ({ getWhatsAppProvider: () => ({ send: mock.send }) }));
vi.mock('../knowledge/merchant-teaching', () => ({ saveMerchantTeaching: mock.teach }));
vi.mock('../db', async original => ({ ...await original<typeof import('../db')>(), getPrimaryWhatsAppInstance: mock.instance, getWhatsAppInstanceById: mock.instance }));
import { getPool, closeDb } from '../db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { createSourcedEscalation, sendSourcedEscalationAlert, relayEscalationReply } from './escalation-relay';
import { listEscalationRelays, reviewEscalationRelay, reconcileEscalationRelay, runEscalationReconciliationBatch } from './escalation-reconciliation';
import { expireStaleEscalations } from '../db/learning';

describe.skipIf(!process.env.DATABASE_URL)('durable escalation reconciliation and review', () => {
  let fixture: Awaited<ReturnType<typeof createDisposableMerchant>>, conversationId: number, escalationId: number, relayId: number, instanceId: number, deliveryId: number;
  const author='966500000082', customer='966500000083'; let seq=0;
  const query=async (sql: string, values: any[]=[]) => (await (await getPool())!.execute<any>(sql,values))[0];
  const list=() => listEscalationRelays(fixture.merchantId,conversationId);
  const repair=() => reconcileEscalationRelay(fixture.merchantId,relayId);
  const review=async () => { const item=(await list()).items[0]; return { merchantId: fixture.merchantId, actorUserId: fixture.userId,
    conversationId, relayId, expectedRevision: item.revision, evidence: item.evidence, reviewed: true as const, note: 'راجعت سجل المحادثة، سأتابع الحالة.' }; };
  const due=() => query('UPDATE sales_escalation_relays SET created_at=TIMESTAMPADD(MINUTE,-3,UTC_TIMESTAMP()),next_reconcile_at=UTC_TIMESTAMP() WHERE id=?',[relayId]);
  const unknown=() => query("UPDATE whatsapp_message_deliveries SET status='queued',provider_message_id=NULL WHERE id=?",[deliveryId]);
  const failProjection=async () => {
    const pool=(await getPool())!, original=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async () => {
      const c=await original(), execute=c.execute.bind(c);
      vi.spyOn(c,'execute').mockImplementation(((sql: string,values: any[]) => {
        if(sql.includes('INSERT INTO messages')) throw new Error('fixture projection failure'); return execute(sql,values);
      }) as any); return c;
    });
  };
  beforeEach(async () => {
    fixture=await createDisposableMerchant('reconcile');
    await query('UPDATE merchants SET phone=? WHERE id=?',[author,fixture.merchantId]);
    conversationId=Number((await query("INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,?,'active')",[fixture.merchantId,customer])).insertId);
    const sourceId=Number((await query("INSERT INTO messages (conversationId,direction,messageType,content,sender_type) VALUES (?,'incoming','text','هل يتوفر موعد مسائي؟','customer')",[conversationId])).insertId);
    instanceId=Number((await query("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,status,is_primary) VALUES (?,?,'fixture','active',1)",[fixture.merchantId,`reconcile-${fixture.merchantId}`])).insertId);
    mock.instance.mockReset().mockResolvedValue({ id:instanceId,merchantId:fixture.merchantId,provider:'green_api',status:'active',instanceId:`fixture-${instanceId}`,token:'fixture' });
    mock.send.mockReset().mockImplementation(async () => ({ accepted:true,outcome:'accepted',providerMessageId:`reconcile-${fixture.merchantId}-${++seq}`,status:'sent' }));
    mock.teach.mockReset().mockImplementation(async input => (await vi.importActual<typeof import('../knowledge/merchant-teaching')>('../knowledge/merchant-teaching')).saveMerchantTeaching(input));
    escalationId=(await createSourcedEscalation({ merchantId:fixture.merchantId,conversationId,customerPhone:customer,incomingMessageId:sourceId,question:'هل يتوفر موعد مسائي؟' }))!;
    const alert=await sendSourcedEscalationAlert({ merchantId:fixture.merchantId,escalationId,instanceRecordId:instanceId,to:author,level:0,text:'سؤال عميل' });
    await failProjection();
    await expect(relayEscalationReply({ merchantId:fixture.merchantId,instanceRecordId:instanceId,merchantPhone:author,quotedMessageId:alert.providerMessageId!,replyText:'موعد الخميس متاح.' })).rejects.toThrow('projection failure');
    vi.restoreAllMocks();
    relayId=(await query('SELECT id FROM sales_escalation_relays WHERE merchant_id=?',[fixture.merchantId]))[0].id;
    deliveryId=(await query('SELECT id FROM whatsapp_message_deliveries WHERE merchant_id=? AND idempotency_key=?',[fixture.merchantId,`escalation_relay:${fixture.merchantId}:${escalationId}`]))[0].id;
    mock.send.mockClear();
  });
  afterEach(async () => { vi.restoreAllMocks(); await cleanupDisposableMerchants([fixture.userId]); }); afterAll(closeDb);

  it('repairs an accepted receipt after reconnection, learns only a pending proposal and preserves newer conversation activity',async () => {
    await query("UPDATE conversations SET lastMessageAt='2028-01-01 00:00:00' WHERE id=?",[conversationId]); await closeDb();
    expect(await repair()).toMatchObject({ outcome:'accepted' }); expect(mock.send).not.toHaveBeenCalled();
    expect(await query("SELECT id FROM messages WHERE conversationId=? AND direction='outgoing'",[conversationId])).toHaveLength(1);
    const [section]=await query('SELECT status,use_in_bot AS useInBot FROM knowledge_sections WHERE merchant_id=?',[fixture.merchantId]);
    expect(section).toMatchObject({ status:'pending_review',useInBot:0 });
    expect((await query('SELECT YEAR(lastMessageAt) AS year FROM conversations WHERE id=?',[conversationId]))[0].year).toBe(2028);
    expect((await list()).items[0]).toMatchObject({ projected:true,state:'accepted',outcome:'accepted' });
  });
  it('repairs once across five workers without duplicate messages or teaching changelog entries',async () => {
    await Promise.all(Array.from({length:5},repair));
    expect(await query("SELECT id FROM messages WHERE conversationId=? AND direction='outgoing'",[conversationId])).toHaveLength(1);
    expect(await query('SELECT id FROM knowledge_changelog WHERE merchant_id=?',[fixture.merchantId])).toHaveLength(1); expect(mock.send).not.toHaveBeenCalled();
  });
  it('claims due repairs across workers without requiring another employee reply',async () => {
    await due(); const counts=await Promise.all([runEscalationReconciliationBatch(),runEscalationReconciliationBatch()]);
    expect(counts.reduce((a,b)=>a+b,0)).toBe(1); expect((await list()).items[0].projected).toBe(true); expect(mock.send).not.toHaveBeenCalled();
  });
  it('does not interfere with a fresh send and leaves old missing receipts unresolved with a bounded retry',async () => {
    await unknown(); expect(await runEscalationReconciliationBatch()).toBe(0);
    await due(); expect(await runEscalationReconciliationBatch()).toBe(1); expect(await runEscalationReconciliationBatch()).toBe(0);
    expect((await list()).items[0]).toMatchObject({ projected:false,state:'pending',outcome:'unresolved' });
    expect(mock.send).not.toHaveBeenCalled(); expect(mock.teach).not.toHaveBeenCalled();
  });
  it.each(['instance','destination','group','array','text','guard','direction','empty-receipt','customer-changed','missing-delivery'])('refuses mismatched durable evidence: %s',async attack => {
    const [d]=await query('SELECT request_json FROM whatsapp_message_deliveries WHERE id=?',[deliveryId]); const request=typeof d.request_json==='string'?JSON.parse(d.request_json):d.request_json;
    if(attack==='instance') await query('UPDATE whatsapp_message_deliveries SET instance_id=NULL WHERE id=?',[deliveryId]);
    if(attack==='destination') request.to='966500000099';
    if(attack==='group') request.to=`${customer}@g.us`;
    if(attack==='array') request.to=[customer];
    if(attack==='text') request.text='نص مختلف';
    if(attack==='guard') request.escalationGuard.relayId++;
    if(attack==='direction') await query("UPDATE whatsapp_message_deliveries SET direction='incoming' WHERE id=?",[deliveryId]);
    if(attack==='empty-receipt') await query('UPDATE whatsapp_message_deliveries SET provider_message_id=NULL WHERE id=?',[deliveryId]);
    if(attack==='customer-changed') await query("UPDATE conversations SET customerPhone='966500000099' WHERE id=?",[conversationId]);
    await query('UPDATE whatsapp_message_deliveries SET request_json=? WHERE id=?',[JSON.stringify(request),deliveryId]);
    if(attack==='missing-delivery') await query('DELETE FROM whatsapp_message_deliveries WHERE id=?',[deliveryId]);
    expect(await repair()).toMatchObject({ outcome:'unresolved' });
    expect(await query("SELECT id FROM messages WHERE conversationId=? AND direction='outgoing'",[conversationId])).toHaveLength(0);
    expect(mock.send).not.toHaveBeenCalled(); expect(mock.teach).not.toHaveBeenCalled();
  });
  it('records an unresolved review and its authenticated actor without closing the escalation or resending',async () => {
    await unknown(); const input=await review(); input.note="راجعت الحالة <img src=x onerror=alert(1)> '; DROP TABLE messages; --";
    expect(await reviewEscalationRelay(input)).toMatchObject({ outcome:'unresolved' });
    expect((await list()).items[0]).toMatchObject({ revision:1,projected:false,lastReview:{actorUserId:fixture.userId,note:input.note,outcome:'unresolved'} });
    expect((await query('SELECT status FROM sari_escalation_queue WHERE id=?',[escalationId]))[0].status).toBe('pending');
    expect(mock.send).not.toHaveBeenCalled(); expect(mock.teach).not.toHaveBeenCalled();
  });
  it('serializes reviewer revisions and rejects a stale repeat of an accepted review',async () => {
    const input=await review(); const results=await Promise.allSettled([reviewEscalationRelay(input),reviewEscalationRelay(input)]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1); expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
    expect(await query('SELECT id FROM sales_escalation_reviews WHERE relay_id=?',[relayId])).toHaveLength(1); expect(mock.send).not.toHaveBeenCalled();
  });
  it('rejects a changed receipt even when the review revision did not change',async () => {
    const input=await review(); await query("UPDATE whatsapp_message_deliveries SET status='delivered' WHERE id=?",[deliveryId]);
    await expect(reviewEscalationRelay(input)).rejects.toThrow('evidence changed');
    expect(await query('SELECT id FROM sales_escalation_reviews WHERE relay_id=?',[relayId])).toHaveLength(0);
  });
  it('rolls back review, projection and answered state together on storage failure',async () => {
    const input=await review(); await failProjection(); await expect(reviewEscalationRelay(input)).rejects.toThrow('projection failure'); vi.restoreAllMocks();
    expect((await list()).items[0]).toMatchObject({ projected:false,revision:0,lastReview:null });
    expect((await query('SELECT status FROM sari_escalation_queue WHERE id=?',[escalationId]))[0].status).toBe('pending');
    expect(await reviewEscalationRelay(input)).toMatchObject({ outcome:'accepted' });
  });
  it('rolls the projected message back when appending the reviewer audit fails',async () => {
    const input=await review(),pool=(await getPool())!,original=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async () => {
      const c=await original(),execute=c.execute.bind(c);
      vi.spyOn(c,'execute').mockImplementation(((sql:string,values:any[])=>{
        if(sql.includes('INSERT INTO sales_escalation_reviews'))throw new Error('audit unavailable');return execute(sql,values);
      }) as any);return c;
    });
    await expect(reviewEscalationRelay(input)).rejects.toThrow('audit unavailable');vi.restoreAllMocks();
    expect((await list()).items[0]).toMatchObject({projected:false,revision:0,lastReview:null});
    expect(await query("SELECT id FROM messages WHERE conversationId=? AND direction='outgoing'",[conversationId])).toHaveLength(0);
    expect(mock.teach).not.toHaveBeenCalled();expect(mock.send).not.toHaveBeenCalled();
  });
  it('refuses a receipt that collides with a different conversation message',async () => {
    const [d]=await query('SELECT provider_message_id FROM whatsapp_message_deliveries WHERE id=?',[deliveryId]);
    await query("INSERT INTO messages (conversationId,direction,messageType,content,externalId,sender_type) VALUES (?,'outgoing','text','different message',?,'assistant')",[conversationId,d.provider_message_id]);
    await expect(repair()).rejects.toThrow('projection conflict');
    expect((await list()).items[0].projected).toBe(false);expect(mock.teach).not.toHaveBeenCalled();expect(mock.send).not.toHaveBeenCalled();
  });
  it('retries a failed teaching proposal from the accepted receipt without re-sending or duplicating approved knowledge',async () => {
    mock.teach.mockRejectedValueOnce(new Error('knowledge unavailable')); expect(await repair()).toMatchObject({ outcome:'accepted' });
    const [r]=await query('SELECT teaching_recorded_at,last_reconcile_error FROM sales_escalation_relays WHERE id=?',[relayId]);
    expect(r).toMatchObject({teaching_recorded_at:null,last_reconcile_error:'teaching_pending'});
    await due(); await runEscalationReconciliationBatch();
    await query("UPDATE knowledge_sections SET status='approved',use_in_bot=1 WHERE merchant_id=?",[fixture.merchantId]);
    await query('UPDATE sales_escalation_relays SET teaching_recorded_at=NULL WHERE id=?',[relayId]); await repair();
    expect((await query('SELECT status,use_in_bot AS useInBot FROM knowledge_sections WHERE merchant_id=?',[fixture.merchantId]))[0]).toMatchObject({status:'approved',useInBot:1});
    expect(mock.send).not.toHaveBeenCalled();
  });
  it('distinguishes a later delivery failure from the historical provider acceptance',async () => {
    await repair(); await query("UPDATE whatsapp_message_deliveries SET status='failed' WHERE id=?",[deliveryId]);
    expect((await list()).items[0]).toMatchObject({state:'failed',outcome:'accepted',projected:true}); expect(await repair()).toMatchObject({outcome:'accepted'});
  });
  it('does not learn or create a delivered conversation message from a rejected receipt',async () => {
    await query("UPDATE whatsapp_message_deliveries SET status='failed' WHERE id=?",[deliveryId]);
    expect(await repair()).toMatchObject({outcome:'failed'}); expect(mock.teach).not.toHaveBeenCalled();
    expect(await query("SELECT id FROM messages WHERE conversationId=? AND direction='outgoing'",[conversationId])).toHaveLength(0);
  });
  it('isolates reads and reviews across merchants and conversations',async () => {
    await expect(listEscalationRelays(fixture.merchantId+1,conversationId)).rejects.toThrow('unavailable');
    const input=await review(); await expect(reviewEscalationRelay({...input,merchantId:fixture.merchantId+1})).rejects.toThrow('unavailable');
    await expect(reviewEscalationRelay({...input,conversationId:conversationId+1})).rejects.toThrow('unavailable'); expect(mock.send).not.toHaveBeenCalled();
  });
  it('keeps unresolved attempts out of stale-expiration writes',async () => {
    await unknown(); await query('UPDATE sari_escalation_queue SET expires_at=TIMESTAMPADD(HOUR,-1,UTC_TIMESTAMP()) WHERE id=?',[escalationId]);
    await expireStaleEscalations(); expect((await query('SELECT status FROM sari_escalation_queue WHERE id=?',[escalationId]))[0].status).toBe('pending');
  });
  it('bounds the worker batch and paginates records without hiding older unresolved attempts',async () => {
    await due();
    for(let i=0;i<20;i++) {
      const copied=await query(`INSERT INTO sari_escalation_queue (merchant_id,conversation_id,customer_phone,question,source_message_id,handoff_version,expires_at)
        SELECT merchant_id,conversation_id,customer_phone,question,source_message_id,handoff_version,expires_at FROM sari_escalation_queue WHERE id=?`,[escalationId]);
      await query(`INSERT INTO sales_escalation_relays (merchant_id,escalation_id,instance_id,author_phone,quoted_message_id,reply_text,ownership_version,created_at,next_reconcile_at)
        SELECT merchant_id,?,instance_id,author_phone,quoted_message_id,reply_text,ownership_version,created_at,UTC_TIMESTAMP() FROM sales_escalation_relays WHERE id=?`,[copied.insertId,relayId]);
    }
    const first=await list(),second=await listEscalationRelays(fixture.merchantId,conversationId,first.nextCursor!);
    const third=await listEscalationRelays(fixture.merchantId,conversationId,second.nextCursor!);
    expect([first.items.length,second.items.length,third.items.length]).toEqual([10,10,1]);
    expect(new Set([...first.items,...second.items,...third.items].map(i=>i.id)).size).toBe(21); expect(third.nextCursor).toBeNull();
    expect(await runEscalationReconciliationBatch()).toBe(20); expect(await runEscalationReconciliationBatch()).toBe(1); expect(await runEscalationReconciliationBatch()).toBe(0);
    expect(mock.send).not.toHaveBeenCalled();
  });
});
