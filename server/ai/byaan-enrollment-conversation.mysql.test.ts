import {randomUUID} from 'node:crypto';
import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({post:vi.fn(),pin:vi.fn(),send:vi.fn(),llm:vi.fn()}));
vi.mock('axios',()=>({default:Object.assign(mocks.post,{create:()=>({get:vi.fn(),post:vi.fn()})})}));
vi.mock('../integrations/byaan-security',async original=>({...await original<typeof import('../integrations/byaan-security')>(),createPinnedByaanHttpsAgent:mocks.pin}));
vi.mock('../channels/whatsapp/providers',()=>({getWhatsAppProvider:()=>({send:mocks.send})}));
vi.mock('./openai',()=>({callGPT4:mocks.llm}));
import {getPool,closeDb} from '../db/connection';
import {assertDisposableDatabase,createDisposableMerchant,createDisposableTrialSubscription,cleanupDisposableMerchants} from '../tests/helpers/disposable-merchant';
import {buildReplyPlan,dispatchReplyPlan} from '../messaging/reply-plan';
import {sendMerchantWhatsApp} from '../channels/whatsapp/service';
import {withInboundExecution,type InboundExecution} from '../messaging/inbound-context';
import {handleByaanEnrollment as handle} from './byaan-enrollment-conversation';
import {readByaanEnrollmentReply,canDispatchByaanEnrollmentReply,BYAAN_ENROLLMENT_CLARIFY as CLARIFY,
  BYAAN_ENROLLMENT_UNCERTAIN as UNCERTAIN,BYAAN_ENROLLMENT_CHANGED as CHANGED,BYAAN_ENROLLMENT_DECLINED as DECLINED} from './byaan-enrollment-agreements';
import {stageInteraction} from './interaction-jobs';
import {ordinaryReplyDigest} from './reply-reservation';
import {parseAICommands} from '../ai';
import type {CheckoutIdentity} from './checkout-agreements';

describe.skipIf(!process.env.DATABASE_URL)('Byaan conversation through real SQL and WhatsApp dispatch with mocked transports',()=>{
  const q=async(sql:string,args:any[]=[]):Promise<any>=>(await(await getPool())!.execute(sql,args))[0];
  let identity:CheckoutIdentity,product:number,instance:number,users:number[];
  const incoming=async(content:string)=>({...identity,incomingMessageId:Number((await q("INSERT INTO messages(conversationId,direction,messageType,content) VALUES (?,'incoming','text',?)",[identity.conversationId,content])).insertId)});
  const row=async()=>(await q('SELECT * FROM sales_quotations WHERE merchant_id=? ORDER BY id DESC LIMIT 1',[identity.merchantId]))[0];
  const plan=(source:CheckoutIdentity,text:string,welcome?:string)=>buildReplyPlan({...source,instanceId:instance,providerAccount:'fixture',eventId:String(source.incomingMessageId),to:identity.customerPhone,text,welcome});
  async function deliver(source:CheckoutIdentity,text:string,welcome?:string){
    const rich=await parseAICommands(text,identity.merchantId);expect(rich.text).toBe(text);expect(rich.media).toEqual([]);
    expect(await dispatchReplyPlan(plan(source,text,welcome))).toBe('sent');
    await q("INSERT INTO messages(conversationId,direction,sender_type,messageType,content,aiResponse,isProcessed) VALUES (?,'outgoing','assistant','text',?,?,1)",[identity.conversationId,text,text]);
  }
  const route=(source:CheckoutIdentity,message:string,cutoff=0)=>handle({...source,message,memoryHistoryCutoff:cutoff});
  async function offered(){const text=await route(identity,'سجلني في دورة ساري');expect(text).toContain('[BE-');await deliver(identity,text!);return await row();}
  async function reported(){await offered();const consent=await incoming('نعم'),text=await route(consent,'نعم');expect(text).toContain('ورد تأكيد التسجيل من بيان');return {consent,text:text!,quote:await row()};}
  const execution=(assertOwned:()=>Promise<void>):InboundExecution=>({id:1,merchantId:identity.merchantId,instanceId:instance,token:randomUUID(),eventKey:'synthetic',partitionKey:'synthetic',assertOwned,sendOrdinal:0});
  beforeEach(async()=>{
    assertDisposableDatabase();vi.restoreAllMocks();vi.clearAllMocks();users=[];
    const owner=await createDisposableMerchant('byaan-chat');users.push(owner.userId);await createDisposableTrialSubscription(owner.merchantId);
    await q(`INSERT INTO byaan_connections(merchant_id,tenant_domain,api_base_url,webhook_secret,is_active,verified_at,sync_status)
      VALUES (?,'synthetic.example.com','https://synthetic.example.com/api/sari','synthetic-conversation-signing-secret-only',1,TIMESTAMPADD(MINUTE,-2,UTC_TIMESTAMP()),'active')`,[owner.merchantId]);
    const conv=await q("INSERT INTO conversations(merchantId,customerPhone,customerName,status) VALUES (?,'966501234567','عميل اختبار','active')",[owner.merchantId]);
    identity={merchantId:owner.merchantId,conversationId:conv.insertId,customerPhone:'966501234567',incomingMessageId:1};identity=await incoming('سجلني في دورة ساري');
    product=Number((await q(`INSERT INTO products(merchantId,name,price,price_unit,currency,product_type,sallaProductId,lastSyncedAt,registration_open,track_inventory)
      VALUES (?,'دورة ساري',10000,'minor','SAR','service','byaan:c-1',UTC_TIMESTAMP(3),1,0)`,[owner.merchantId])).insertId);
    instance=Number((await q("INSERT INTO whatsapp_instances(merchant_id,instance_id,token,provider,status,is_primary) VALUES (?,?,'fixture','green_api','active',1)",[owner.merchantId,randomUUID()])).insertId);
    mocks.pin.mockResolvedValue({});mocks.post.mockResolvedValue({status:200,data:{enrollment_id:'enroll-1'}});
    mocks.send.mockImplementation(async()=>({accepted:true,status:'sent',providerMessageId:randomUUID()}));
    mocks.llm.mockResolvedValue(JSON.stringify({productId:product}));vi.spyOn(console,'warn').mockImplementation(()=>{});
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants(users);});afterAll(closeDb);
  it('extracts only the selected course, delivers exact offer, sends once and dispatches a verified acknowledgement',async()=>{
    const text=await route(identity,'سجلني في دورة ساري');expect(text).toContain('دورة ساري');expect(mocks.post).not.toHaveBeenCalled();
    await deliver(identity,text!,'مرحبًا بك');const consent=await incoming('نعم'),confirmation=await route(consent,'نعم');
    expect(confirmation).toContain('[BE-');expect(confirmation).not.toContain('تم الدفع');await deliver(consent,confirmation!);
    expect(mocks.post).toHaveBeenCalledOnce();expect(mocks.send).toHaveBeenCalledTimes(3);expect(mocks.llm).toHaveBeenCalledOnce();
    expect(mocks.llm.mock.calls[0][1]).toMatchObject({merchantId:identity.merchantId,conversationId:identity.conversationId,taskType:'sari.action.selection',noRetry:true});
    const prompt=mocks.llm.mock.calls[0][0][1].content;expect(prompt).not.toContain('signing-secret');expect(prompt).not.toContain('10000');expect(prompt).not.toContain(identity.customerPhone);
    expect(await route(consent,'نعم')).toBe(confirmation);expect(mocks.post).toHaveBeenCalledOnce();
  });
  it.each(['null','[]','{}','{"productId":1,"price":1}','{"productId":"1"}','{"productId":2147483648}','{"productId":-1}'])('rejects untrusted model authority %s',async raw=>{
    mocks.llm.mockResolvedValue(raw);expect(await route(identity,'سجلني في دورة ساري')).toBe(CLARIFY);expect(await row()).toBeUndefined();expect(mocks.post).not.toHaveBeenCalled();
  });
  it('rejects a foreign or non-Byaan catalog identifier before preparing an offer',async()=>{
    const other=await createDisposableMerchant('byaan-other');users.push(other.userId);
    const foreign=Number((await q("INSERT INTO products(merchantId,name,price) VALUES (?,'private',100)",[other.merchantId])).insertId);
    mocks.llm.mockResolvedValue(JSON.stringify({productId:foreign}));expect(await route(identity,'سجلني في دورة ساري')).toBe(CLARIFY);
    await q("UPDATE products SET sallaProductId='salla:1:1' WHERE id=?",[product]);mocks.llm.mockResolvedValue(JSON.stringify({productId:product}));
    expect(await route(identity,'سجلني في دورة ساري')).toBe(CLARIFY);expect(mocks.post).not.toHaveBeenCalled();
  });
  it.each(['كيف أسجل؟','هل أقدر أسجل؟','نعم','أريد شراء سماعة','أريد موعدًا'])('leaves unrelated or unanchored %s to the existing reply routes',async text=>{
    expect(await route(await incoming(text),text)).toBeNull();expect(mocks.llm).not.toHaveBeenCalled();expect(mocks.post).not.toHaveBeenCalled();
  });
  it('does not let course confirmation replace the latest agreement of another provider',async()=>{
    await offered();const quote=await row();await q("UPDATE sales_quotations SET external_provider='salla_cart' WHERE id=?",[quote.id]);
    expect(await route(await incoming('نعم'),'نعم')).toBeNull();expect(mocks.post).not.toHaveBeenCalled();
  });
  it('requires exact persisted request text and retains safe failure when model extraction fails',async()=>{
    expect(await route(identity,'سجلني في دورة أخرى')).toBe(UNCERTAIN);expect(mocks.llm).not.toHaveBeenCalled();
    mocks.llm.mockRejectedValue(Error('secret internal prompt'));expect(await route(identity,'سجلني في دورة ساري')).toBe(UNCERTAIN);expect(mocks.post).not.toHaveBeenCalled();
  });
  it.each(['source','course name','course reference','memory'])('discards extraction when %s changes during the model call without parking an external effect',async attack=>{
    mocks.llm.mockImplementation(async()=>{
      if(attack==='source')await q("UPDATE messages SET content='سجلني في دورة أخرى' WHERE id=?",[identity.incomingMessageId]);
      if(attack==='course name')await q("UPDATE products SET name='دورة أخرى' WHERE id=?",[product]);
      if(attack==='course reference')await q("UPDATE products SET sallaProductId='byaan:other' WHERE id=?",[product]);
      if(attack==='memory')await q('INSERT INTO customer_profiles(merchant_id,customer_phone,memory_forget_before_message_id) VALUES (?,?,?)',[identity.merchantId,identity.customerPhone,identity.incomingMessageId]);
      return JSON.stringify({productId:product});
    });
    const context=execution(async()=>{});
    expect(await withInboundExecution(context,()=>route(identity,'سجلني في دورة ساري'))).toBe(UNCERTAIN);
    expect(await row()).toBeUndefined();expect(mocks.post).not.toHaveBeenCalled();expect(context.uncertainEffect).toBeUndefined();
  });
  it('delivers a refusal without calling the model or pretending to cancel a past external enrollment',async()=>{
    await offered();mocks.llm.mockClear();const refusal=await incoming('لا تسجلني');expect(await route(refusal,'لا تسجلني')).toBe(DECLINED);
    await deliver(refusal,DECLINED);expect(mocks.llm).not.toHaveBeenCalled();expect(mocks.post).not.toHaveBeenCalled();
  });
  it.each(['price','expiry','source','human','version','connection','memory'])('blocks offer transport after %s changes',async attack=>{
    const text=await route(identity,'سجلني في دورة ساري');const quote=await row();
    if(attack==='price')await q('UPDATE products SET price=20000 WHERE id=?',[product]);
    if(attack==='expiry')await q('UPDATE sales_quotations SET offer_expires_at=TIMESTAMPADD(SECOND,-1,UTC_TIMESTAMP()) WHERE id=?',[quote.id]);
    if(attack==='source')await q("UPDATE messages SET content='غير ذلك' WHERE id=?",[identity.incomingMessageId]);
    if(attack==='human')await q('UPDATE conversations SET human_takeover=1 WHERE id=?',[identity.conversationId]);
    if(attack==='version')await q('UPDATE conversations SET handoff_version=1 WHERE id=?',[identity.conversationId]);
    if(attack==='connection')await q('UPDATE byaan_connections SET is_active=0 WHERE merchant_id=?',[identity.merchantId]);
    if(attack==='memory')await q('INSERT INTO customer_profiles(merchant_id,customer_phone,memory_forget_before_message_id) VALUES (?,?,?)',[identity.merchantId,identity.customerPhone,identity.incomingMessageId]);
    await dispatchReplyPlan(plan(identity,text!)).catch(()=>{});expect(mocks.send).not.toHaveBeenCalled();expect(mocks.post).not.toHaveBeenCalled();
  });
  it('releases the unspent message quota when the final Byaan gate blocks transport',async()=>{
    const text=await route(identity,'سجلني في دورة ساري');
    const before=await q('SELECT messages_used FROM merchant_subscriptions WHERE merchant_id=?',[identity.merchantId]);
    await q('UPDATE products SET price=20000 WHERE id=?',[product]);
    await expect(dispatchReplyPlan(plan(identity,text!))).rejects.toThrow();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(await q('SELECT usage_state FROM ai_interaction_jobs WHERE merchant_id=? AND incoming_message_id=?',[identity.merchantId,identity.incomingMessageId])).toEqual([{usage_state:'released'}]);
    expect(await q('SELECT messages_used FROM merchant_subscriptions WHERE merchant_id=?',[identity.merchantId])).toEqual(before);
  });
  it.each(['missing ledger','seal','projection','tracking','connection','human','version','new message','memory','text','marker removed','media'])('suppresses confirmation transport after %s changes without re-enrollment',async attack=>{
    const {consent,text,quote}=await reported();mocks.send.mockClear();let changed=text;
    if(attack==='missing ledger')await q('DELETE FROM byaan_sales_operations WHERE merchant_id=?',[identity.merchantId]);
    if(attack==='seal')await q("UPDATE byaan_sales_operations SET result_hash=REPEAT('0',64) WHERE merchant_id=?",[identity.merchantId]);
    if(attack==='projection')await q("UPDATE sales_quotations SET external_result=JSON_SET(external_result,'$.value.receipt.enrollmentId','forged') WHERE id=?",[quote.id]);
    if(attack==='tracking')await q('DELETE FROM api_conversion_observations WHERE merchant_id=?',[identity.merchantId]);
    if(attack==='connection')await q("UPDATE byaan_connections SET webhook_secret='changed-synthetic-signing-secret-only' WHERE merchant_id=?",[identity.merchantId]);
    if(attack==='human')await q('UPDATE conversations SET human_takeover=1 WHERE id=?',[identity.conversationId]);
    if(attack==='version')await q('UPDATE conversations SET handoff_version=1 WHERE id=?',[identity.conversationId]);
    if(attack==='new message')await incoming('لا تكمل');
    if(attack==='memory')await q('INSERT INTO customer_profiles(merchant_id,customer_phone,memory_forget_before_message_id) VALUES (?,?,?)',[identity.merchantId,identity.customerPhone,consent.incomingMessageId]);
    if(attack==='text')changed=text.replace('enroll-1','forged');
    if(attack==='marker removed')changed='تم التسجيل والدفع بنجاح';
    const p=plan(consent,changed);if(attack==='media')p.effects.push({...p.effects[0],idempotencyKey:p.effects[0].idempotencyKey+'_image',kind:'image',mediaUrl:'https://example.com/p.png'});
    await dispatchReplyPlan(p).catch(()=>{});expect(mocks.send).not.toHaveBeenCalled();expect(mocks.post).toHaveBeenCalledOnce();
    if(attack==='missing ledger')expect(await q('SELECT id FROM byaan_sales_operations WHERE merchant_id=?',[identity.merchantId])).toEqual([]);
  });
  it('denies unanchored or copied enrollment markers and recipient replacement',async()=>{
    const {consent,text}=await reported();mocks.send.mockClear();
    const p=plan(consent,text);await stageInteraction(p);const guard={conversationId:consent.conversationId,incomingMessageId:consent.incomingMessageId,version:0,reservationDigest:ordinaryReplyDigest(p)};
    expect(await canDispatchByaanEnrollmentReply({...p.effects[0],to:'966500000002',replyGuard:guard})).toBe(false);
    const result=await sendMerchantWhatsApp({...p.effects[0],idempotencyKey:'synthetic-unanchored-'+randomUUID()});
    expect(result).toMatchObject({accepted:false,errorCode:'byaan_enrollment_superseded'});expect(mocks.send).not.toHaveBeenCalled();expect(mocks.post).toHaveBeenCalledOnce();
  });
  it('does not send a confirmation if a new message arrives during result verification',async()=>{
    const {consent,text}=await reported();mocks.send.mockClear();const pool=(await getPool())!,get=pool.getConnection.bind(pool);let hit=false;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get(),execute=c.execute.bind(c);vi.spyOn(c,'execute').mockImplementation((async(sql:string,args:any[])=>{
      const result=await execute(sql,args);if(sql.includes('SELECT * FROM byaan_sales_operations')&&!hit){hit=true;await execute("INSERT INTO messages(conversationId,direction,messageType,content) VALUES (?,'incoming','text','توقف')",[identity.conversationId]);}return result;
    })as any);return c;});
    await dispatchReplyPlan(plan(consent,text)).catch(()=>{});expect(hit).toBe(true);expect(mocks.send).not.toHaveBeenCalled();expect(mocks.post).toHaveBeenCalledOnce();
  });
  it('marks provider timeout for review and sends only the safe uncertainty response',async()=>{
    await offered();const consent=await incoming('نعم');mocks.post.mockRejectedValue(Error('timeout'));
    expect(await route(consent,'نعم')).toBe(UNCERTAIN);await deliver(consent,UNCERTAIN);expect(mocks.post).toHaveBeenCalledOnce();
    expect(await route(consent,'نعم')).toBe(UNCERTAIN);expect(mocks.post).toHaveBeenCalledOnce();
  });
  it('does not expose a receipt or repeat POST after ownership changes while enrollment is in flight',async()=>{
    await offered();const consent=await incoming('نعم');mocks.post.mockImplementation(async()=>{await q('UPDATE conversations SET human_takeover=1 WHERE id=?',[identity.conversationId]);return {status:200,data:{enrollment_id:'late'}};});
    expect(await route(consent,'نعم')).toBe(UNCERTAIN);expect((await row()).execution_state).toBe('succeeded');expect(mocks.post).toHaveBeenCalledOnce();
  });
  it.each(['selection','dispatch'])('stops an expired inbound worker during %s',async phase=>{
    let lost=false;const context=execution(async()=>{if(lost)throw Error('Lease lost');});
    if(phase==='selection')mocks.llm.mockImplementation(async()=>{lost=true;return JSON.stringify({productId:product});});
    if(phase==='dispatch'){await offered();identity=await incoming('نعم');mocks.pin.mockImplementation(async()=>{lost=true;return {};});}
    const result=await withInboundExecution(context,()=>route(identity,phase==='selection'?'سجلني في دورة ساري':'نعم'));
    expect(result).toBe(UNCERTAIN);expect(mocks.post).not.toHaveBeenCalled();expect(!!context.uncertainEffect).toBe(phase==='dispatch');
  });
  it('filters withdrawn history and never accepts consent to a forgotten offer',async()=>{
    const quote=await offered(),consent=await incoming('نعم');expect(await route(consent,'نعم',identity.incomingMessageId)).toBe(CHANGED);expect(mocks.post).not.toHaveBeenCalled();
    await q('INSERT INTO customer_profiles(merchant_id,customer_phone,memory_forget_before_message_id) VALUES (?,?,?)',[identity.merchantId,identity.customerPhone,identity.incomingMessageId]);
    await expect(readByaanEnrollmentReply(identity,quote.id)).rejects.toThrow();
    identity=await incoming('سجلني في دورة ساري');mocks.llm.mockClear();await route(identity,'سجلني في دورة ساري');
    expect(JSON.parse(mocks.llm.mock.calls[0][0][1].content).history.some((m:any)=>m.content==='سجلني في دورة ساري')).toBe(false);
  });
});
