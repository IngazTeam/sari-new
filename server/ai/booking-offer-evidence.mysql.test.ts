import {randomUUID} from 'node:crypto';
import {beforeEach,afterEach,afterAll,describe,it,expect,vi} from 'vitest';
const transport=vi.hoisted(()=>({send:vi.fn()}));
vi.mock('../channels/whatsapp/providers',()=>({getWhatsAppProvider:()=>transport}));
import {getPool,closeDb} from '../db/connection';
import {createDisposableMerchant,createDisposableTrialSubscription,cleanupDisposableMerchants} from '../tests/helpers/disposable-merchant';
import {prepareBookingAgreement,prepareBookingAmendment,acceptBookingAgreement} from './booking-agreements';
import {getBookingConsentReview} from '../booking-consent-review';
import {updateBookingOperation} from '../booking-operations';
import {buildReplyPlan,dispatchReplyPlan} from '../messaging/reply-plan';
import {stageInteraction,finishInteractionDelivery} from './interaction-jobs';
import type {CheckoutIdentity} from './checkout-agreements';

describe.skipIf(!process.env.DATABASE_URL)('booking offers require transport and agreement evidence',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,identity:CheckoutIdentity,serviceId:number,instanceId:number;
  const date=new Date(Date.now()+2*86400000+10800000).toISOString().slice(0,10);
  const query=async(sql:string,args:any[]=[])=>(await(await getPool())!.execute<any>(sql,args))[0];
  const incoming=async(content='نعم')=>({...identity,incomingMessageId:(await query("INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text',?)",[identity.conversationId,content])).insertId});
  const bookings=()=>query('SELECT * FROM bookings WHERE merchant_id=?',[owner.merchantId]);
  const selection=(time='10:00')=>({serviceId,staffId:null,bookingDate:date,startTime:time});
  beforeEach(async()=>{
    owner=await createDisposableMerchant('booking-proof');await createDisposableTrialSubscription(owner.merchantId);
    const c=await query("INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,'966500009876','active')",[owner.merchantId]);
    identity={merchantId:owner.merchantId,conversationId:c.insertId,customerPhone:'966500009876',incomingMessageId:1};
    identity=await incoming('أريد موعد استشارة');
    serviceId=(await query("INSERT INTO services (merchant_id,name,duration_minutes,base_price,advance_booking_days) VALUES (?,'استشارة',60,12500,30)",[owner.merchantId])).insertId;
    for(const time of ['10','12'])await query("INSERT INTO booking_time_slots (merchant_id,service_id,slot_date,start_time,end_time) VALUES (?,?,?,?,?)",[owner.merchantId,serviceId,date,`${time}:00`,`${Number(time)+1}:00`]);
    instanceId=(await query("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,provider,status,is_primary) VALUES (?,?,'fixture','green_api','active',1)",[owner.merchantId,randomUUID()])).insertId;
    transport.send.mockReset().mockImplementation(async()=>({accepted:true,status:'sent',providerMessageId:randomUUID()}));
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants([owner.userId]);});afterAll(closeDb);
  async function deliver(q:any,source=identity,mode='normal') {
    const text=['altered','forged saved text'].includes(mode)?q.text.replace('10:00','10:30'):q.text;
    if(['altered','forged saved text'].includes(mode))expect(text).not.toBe(q.text);
    if(mode==='forged saved text')await query('UPDATE conversation_booking_agreements SET offer_text=? WHERE id=?',[text,q.agreementId]);
    const plan=buildReplyPlan({...source,instanceId,providerAccount:'fixture',eventId:String(source.incomingMessageId),to:source.customerPhone,text,
      ...(mode==='welcome'?{welcome:'أهلاً وسهلاً'}:{})});
    if(mode==='boolean'){await stageInteraction(plan);await finishInteractionDelivery(plan,true);}
    else expect(await dispatchReplyPlan(plan)).toBe('sent');
    if(mode!=='missing projection')await query(`INSERT INTO messages (conversationId,direction,sender_type,messageType,content,aiResponse,isProcessed)
      VALUES (?,'outgoing','assistant','text',?,?,1)`,[source.conversationId,text,text]);
    return plan;
  }
  async function offer(mode='normal'){
    const q=await prepareBookingAgreement(identity,selection());if(!q.agreementId)throw Error(q.text);
    const plan=await deliver(q,identity,mode);return {q,plan};
  }
  async function accepted(){const {q,plan}=await offer(),consent=await incoming();const result=await acceptBookingAgreement(consent,q.agreementId!);
    if(!result.bookingId)throw Error(result.text);return {q,plan,consent,bookingId:result.bookingId};}
  const confirmation=(bookingId:number,review:any)=>({bookingId,expectedStatus:'pending' as const,status:'confirmed' as const,
    operationId:randomUUID(),consentReview:{agreementId:review.agreementId,evidence:review.evidence,reviewed:true as const}});
  it('registers one pending unpaid booking after actual channel acceptance, including concurrent replay',async()=>{
    const {q}=await offer(),consent=await incoming();
    const results=await Promise.all([acceptBookingAgreement(consent,q.agreementId!),acceptBookingAgreement(consent,q.agreementId!)]);
    expect(results.every(r=>r.kind==='booking')).toBe(true);expect(await bookings()).toHaveLength(1);
    expect((await bookings())[0]).toMatchObject({status:'pending',payment_status:'unpaid',final_price:12500});
    expect(transport.send).toHaveBeenCalledOnce();expect((await getBookingConsentReview(owner.merchantId,results[0].bookingId!)).state).toBe('ready');
  });
  it('accepts a separately delivered welcome before the exact final booking offer',async()=>{
    const {q}=await offer('welcome');expect(transport.send).toHaveBeenCalledTimes(2);
    expect((await acceptBookingAgreement(await incoming(),q.agreementId!)).kind).toBe('booking');
  });
  it.each(['boolean','altered','forged saved text','missing projection'])('does not reserve a slot for %s',async mode=>{
    const {q}=await offer(mode);expect((await acceptBookingAgreement(await incoming(),q.agreementId!)).kind).toBe(mode==='forged saved text'?'changed':'clarify');
    expect(await bookings()).toEqual([]);expect(await query('SELECT id FROM booking_calendar_reschedules WHERE merchant_id=?',[owner.merchantId])).toEqual([]);
  });
  it.each(['missing receipt','failed receipt','queued receipt','guard','recipient','instance','provider id','human projection','unprocessed',
    'ownership version','incoming correction','waiting reply','suppressed reply'])('rejects %s before a booking effect',async attack=>{
    const {q,plan}=await offer(),key=plan.effects[0].idempotencyKey;
    if(attack==='missing receipt')await query('DELETE FROM whatsapp_message_deliveries WHERE idempotency_key=?',[key]);
    if(attack==='failed receipt')await query("UPDATE whatsapp_message_deliveries SET status='failed' WHERE idempotency_key=?",[key]);
    if(attack==='queued receipt')await query("UPDATE whatsapp_message_deliveries SET status='queued' WHERE idempotency_key=?",[key]);
    if(attack==='guard')await query("UPDATE whatsapp_message_deliveries SET request_json=JSON_SET(request_json,'$.replyGuard.version',9) WHERE idempotency_key=?",[key]);
    if(attack==='recipient')await query("UPDATE whatsapp_message_deliveries SET request_json=JSON_SET(request_json,'$.to','966500009999') WHERE idempotency_key=?",[key]);
    if(attack==='instance')await query('UPDATE whatsapp_message_deliveries SET instance_id=NULL WHERE idempotency_key=?',[key]);
    if(attack==='provider id')await query('UPDATE whatsapp_message_deliveries SET provider_message_id=NULL WHERE idempotency_key=?',[key]);
    if(attack==='human projection')await query("UPDATE messages SET sender_type='merchant' WHERE conversationId=? AND direction='outgoing'",[identity.conversationId]);
    if(attack==='unprocessed')await query("UPDATE messages SET isProcessed=0 WHERE conversationId=? AND direction='outgoing'",[identity.conversationId]);
    if(attack==='ownership version')await query('UPDATE conversations SET handoff_version=handoff_version+1 WHERE id=?',[identity.conversationId]);
    if(attack==='incoming correction')await incoming('لا، أريد وقتاً آخر');
    if(['waiting reply','suppressed reply'].includes(attack)){
      const source=await incoming('أرسل التفاصيل'),next=buildReplyPlan({...source,instanceId,providerAccount:'fixture',eventId:String(source.incomingMessageId),to:source.customerPhone,text:'هل أشرح الخدمة؟'});
      await stageInteraction(next);if(attack==='suppressed reply')await finishInteractionDelivery(next,false);
    }
    expect((await acceptBookingAgreement(await incoming(),q.agreementId!)).kind).toBe('clarify');expect(await bookings()).toEqual([]);
  });
  it.each(['consent','receipt','projection','deadline'])('rolls back when %s changes during capacity checks',async attack=>{
    const {q}=await offer(),consent=await incoming(),pool=(await getPool())!,get=pool.getConnection.bind(pool);let hit=false;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{
      const c=await get();return new Proxy(c,{get(target,key){
        if(key==='execute')return async(sql:any,args:any)=>{
          const result=await target.execute(sql,args);
          if(!hit&&String(sql).includes('SELECT * FROM services')){hit=true;
            if(attack==='consent')await query("UPDATE messages SET content='لا تحجز' WHERE id=?",[consent.incomingMessageId]);
            if(attack==='receipt')await query("UPDATE whatsapp_message_deliveries SET status='failed' WHERE merchant_id=?",[owner.merchantId]);
            if(attack==='projection')await query("UPDATE messages SET content='هل أشرح الخدمة؟' WHERE conversationId=? AND direction='outgoing'",[identity.conversationId]);
            if(attack==='deadline')await target.execute('UPDATE conversation_booking_agreements SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE id=?',[q.agreementId]);
          }return result;
        };const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v;
      }});
    });
    await expect(acceptBookingAgreement(consent,q.agreementId!)).rejects.toThrow();expect(hit).toBe(true);expect(await bookings()).toEqual([]);
    expect((await query('SELECT state,consent_message_id,booking_reference FROM conversation_booking_agreements WHERE id=?',[q.agreementId]))[0])
      .toEqual({state:'proposed',consent_message_id:null,booking_reference:null});
  });
  it.each(['receipt','deadline'])('rolls back a provisional INSERT after late %s changes',async attack=>{
    const {q}=await offer(),consent=await incoming(),pool=(await getPool())!,get=pool.getConnection.bind(pool);let hit=false;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get();return new Proxy(c,{get(target,key){
      if(key==='execute')return async(sql:any,args:any)=>{const result=await target.execute(sql,args);
        if(!hit&&/INSERT INTO bookings\s/.test(String(sql))){hit=true;
          if(attack==='receipt')await query("UPDATE whatsapp_message_deliveries SET status='failed' WHERE merchant_id=?",[owner.merchantId]);
          else await target.execute('UPDATE conversation_booking_agreements SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE id=?',[q.agreementId]);
        }return result;};const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v;}});});
    await expect(acceptBookingAgreement(consent,q.agreementId!)).rejects.toThrow();expect(hit).toBe(true);expect(await bookings()).toEqual([]);
  });
  it('retains historical proof for employee review after takeover without authorizing new automation',async()=>{
    const {bookingId}=await accepted();
    await query('UPDATE conversations SET human_takeover=1,handoff_version=handoff_version+1,automation_after_message_id=? WHERE id=?',[999999999,identity.conversationId]);
    const review=await getBookingConsentReview(owner.merchantId,bookingId);expect(review.state).toBe('ready');
    await updateBookingOperation(owner.merchantId,owner.userId,confirmation(bookingId,review));
    expect((await bookings())[0].status).toBe('confirmed');
    await expect(prepareBookingAgreement(await incoming('أريد موعداً آخر'),selection('12:00'))).rejects.toThrow('authority');
    expect(await bookings()).toHaveLength(1);
  });
  it.each(['receipt','projection'])('blocks employee confirmation when recorded %s is missing',async attack=>{
    const {bookingId}=await accepted(),review=await getBookingConsentReview(owner.merchantId,bookingId);
    if(attack==='receipt')await query('DELETE FROM whatsapp_message_deliveries WHERE merchant_id=?',[owner.merchantId]);
    else await query("DELETE FROM messages WHERE conversationId=? AND direction='outgoing'",[identity.conversationId]);
    expect((await getBookingConsentReview(owner.merchantId,bookingId)).state).toBe('blocked');
    await expect(updateBookingOperation(owner.merchantId,owner.userId,confirmation(bookingId,review))).rejects.toThrow();
    expect((await bookings())[0].status).toBe('pending');
  });
  it('refreshes employee attestation when delivery evidence changes',async()=>{
    const {bookingId}=await accepted(),before=await getBookingConsentReview(owner.merchantId,bookingId);
    await query("UPDATE whatsapp_message_deliveries SET status='read' WHERE merchant_id=?",[owner.merchantId]);
    const after=await getBookingConsentReview(owner.merchantId,bookingId);expect(after.state).toBe('ready');expect(after.evidence).not.toBe(before.evidence);
    await expect(updateBookingOperation(owner.merchantId,owner.userId,confirmation(bookingId,before))).rejects.toThrow();
    await updateBookingOperation(owner.merchantId,owner.userId,confirmation(bookingId,after));expect((await bookings())[0].status).toBe('confirmed');
  });
  it('does not present ready employee evidence if transport fails during a service read',async()=>{
    const {bookingId}=await accepted(),pool=(await getPool())!,get=pool.getConnection.bind(pool);let hit=false;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get();return new Proxy(c,{get(target,key){
      if(key==='execute')return async(sql:any,args:any)=>{const result=await target.execute(sql,args);
        if(!hit&&String(sql).includes('SELECT * FROM services')){hit=true;
          await query("UPDATE whatsapp_message_deliveries SET status='failed' WHERE merchant_id=?",[owner.merchantId]);
        }return result;};const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v;}});});
    expect((await getBookingConsentReview(owner.merchantId,bookingId)).state).toBe('blocked');expect(hit).toBe(true);
    expect((await bookings())[0].status).toBe('pending');
  });
  it.each(['valid','missing receipt'])('preserves the original booking until a %s amendment is accepted',async mode=>{
    const {bookingId}=await accepted(),before=(await bookings())[0],source=await incoming('عدل حجزي إلى الساعة 12');
    const q=await prepareBookingAmendment(source,selection('12:00'),bookingId);if(!q.agreementId)throw Error(q.text);
    const plan=await deliver(q,source);
    if(mode==='missing receipt')await query('DELETE FROM whatsapp_message_deliveries WHERE idempotency_key=?',[plan.effects[0].idempotencyKey]);
    const result=await acceptBookingAgreement(await incoming(),q.agreementId);
    expect(result.kind).toBe(mode==='valid'?'booking':'clarify');expect(await bookings()).toHaveLength(1);
    if(mode==='valid')expect((await bookings())[0]).toMatchObject({id:bookingId,start_time:'12:00',status:'pending'});
    else expect((await bookings())[0]).toEqual(before);
  });
});
