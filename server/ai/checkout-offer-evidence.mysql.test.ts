import { randomUUID } from 'node:crypto';
import { beforeEach,afterEach,afterAll,describe,it,expect,vi } from 'vitest';
const provider=vi.hoisted(()=>({send:vi.fn()}));
vi.mock('../channels/whatsapp/providers',()=>({getWhatsAppProvider:()=>provider}));
import {getPool,closeDb} from '../db/connection';
import {createDisposableMerchant,createDisposableTrialSubscription,cleanupDisposableMerchants} from '../tests/helpers/disposable-merchant';
import {prepareCheckoutQuote,acceptCheckoutQuote,type CheckoutIdentity} from './checkout-agreements';
import {buildReplyPlan,dispatchReplyPlan} from '../messaging/reply-plan';
import {stageInteraction,finishInteractionDelivery} from './interaction-jobs';

describe.skipIf(!process.env.DATABASE_URL)('checkout consent with real SQL and mocked channel transport',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,identity:CheckoutIdentity,productId:number,instanceId:number;
  const query=async(sql:string,args:any[]=[])=>(await(await getPool())!.execute<any>(sql,args))[0];
  const incoming=async(content='نعم')=>({...identity,incomingMessageId:(await query("INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text',?)",[identity.conversationId,content])).insertId});
  const orders=()=>query('SELECT id FROM orders WHERE merchantId=?',[owner.merchantId]);
  beforeEach(async()=>{
    owner=await createDisposableMerchant('offer-proof');await createDisposableTrialSubscription(owner.merchantId);
    const c=await query("INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,'966500000987','active')",[owner.merchantId]);
    identity={merchantId:owner.merchantId,conversationId:c.insertId,customerPhone:'966500000987',incomingMessageId:1};
    identity=await incoming('أريد شراء سماعتين');
    productId=(await query("INSERT INTO products (merchantId,name,price,price_unit,currency,stock) VALUES (?,'سماعة',10000,'minor','SAR',10)",[owner.merchantId])).insertId;
    instanceId=(await query("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,provider,status,is_primary) VALUES (?,?,'fixture','green_api','active',1)",[owner.merchantId,randomUUID()])).insertId;
    provider.send.mockReset().mockImplementation(async()=>({accepted:true,status:'sent',providerMessageId:randomUUID()}));
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants([owner.userId]);});afterAll(closeDb);
  async function offer(mode='normal'){
    if(mode==='chunks')await query('UPDATE products SET name=? WHERE id=?',['😀'.repeat(240),productId]);
    const selection=[{productId,variantId:null,quantity:2}];
    // Ten distinct products make an offer exceed the channel's 4096-unit chunk boundary.
    if(mode==='chunks')for(let i=0;i<9;i++){
      const p=await query("INSERT INTO products (merchantId,name,price,price_unit,currency,stock) VALUES (?, ?,10000,'minor','SAR',10)",[owner.merchantId,`${i}${'😀'.repeat(240)}`]);
      selection.push({productId:p.insertId,variantId:null,quantity:2});
    }
    const q=await prepareCheckoutQuote(identity,selection);if(q.kind!=='quote')throw Error(q.text);
    const text=mode==='tampered'?q.text.replace('× 2','× 1'):q.text;
    if(mode==='tampered')expect(text).not.toBe(q.text);
    const plan=buildReplyPlan({...identity,instanceId,providerAccount:'fixture',eventId:String(identity.incomingMessageId),to:identity.customerPhone,text,
      ...(mode==='welcome'?{welcome:'مرحباً بك'}:{})});
    if(mode==='boolean'){await stageInteraction(plan);await finishInteractionDelivery(plan,true);}
    else expect(await dispatchReplyPlan(plan)).toBe('sent');
    if(mode!=='no projection')await query(`INSERT INTO messages (conversationId,direction,sender_type,messageType,content,aiResponse,isProcessed)
      VALUES (?,'outgoing','assistant','text',?,?,1)`,[identity.conversationId,text,text]);
    return {q,plan};
  }
  it('records one provisional order and supports replay after actual channel acceptance',async()=>{
    const {q}=await offer(),consent=await incoming();
    expect(provider.send).toHaveBeenCalledOnce();
    const results=await Promise.all([acceptCheckoutQuote(consent,q.quotationId),acceptCheckoutQuote(consent,q.quotationId)]);
    expect(results.every(r=>r.kind==='order')).toBe(true);expect(await orders()).toHaveLength(1);
    const [row]=await query('SELECT payment_status,checkout_review_required FROM orders WHERE merchantId=?',[owner.merchantId]);
    expect(row).toEqual({payment_status:'unpaid',checkout_review_required:1});
  });
  it.each(['boolean','no projection','tampered'])('blocks %s without creating an order',async mode=>{
    const {q}=await offer(mode);expect((await acceptCheckoutQuote(await incoming(),q.quotationId)).kind).toBe('clarify');expect(await orders()).toEqual([]);
  });
  it('allows a separate accepted welcome before the final exact offer',async()=>{
    const {q,plan}=await offer('welcome');expect(plan.effects).toHaveLength(2);
    expect((await acceptCheckoutQuote(await incoming(),q.quotationId)).kind).toBe('order');expect(await orders()).toHaveLength(1);
  });
  it.each([true,false])('requires every accepted chunk, complete=%s',async complete=>{
    const {q,plan}=await offer('chunks');expect(plan.effects.length).toBeGreaterThan(1);
    expect(provider.send).toHaveBeenCalledTimes(plan.effects.length);
    if(!complete)await query('DELETE FROM whatsapp_message_deliveries WHERE idempotency_key=?',[plan.effects.at(-1)!.idempotencyKey]);
    expect((await acceptCheckoutQuote(await incoming(),q.quotationId)).kind).toBe(complete?'order':'clarify');
    expect(await orders()).toHaveLength(complete?1:0);
  });
  it.each(['missing','failed','queued','received','id','recipient','text','guard','instance','human projection','unprocessed','projection text','projection ai',
    'version','disabled merchant','correction','waiting','suppressed'])('fails closed after %s changes',async attack=>{
    const {q,plan}=await offer();const key=plan.effects[0].idempotencyKey;
    if(attack==='missing')await query('DELETE FROM whatsapp_message_deliveries WHERE idempotency_key=?',[key]);
    if(['failed','queued','received'].includes(attack))await query('UPDATE whatsapp_message_deliveries SET status=? WHERE idempotency_key=?',[attack,key]);
    if(attack==='id')await query('UPDATE whatsapp_message_deliveries SET provider_message_id=NULL WHERE idempotency_key=?',[key]);
    if(attack==='recipient')await query("UPDATE whatsapp_message_deliveries SET request_json=JSON_SET(request_json,'$.to','966599999999') WHERE idempotency_key=?",[key]);
    if(attack==='text')await query("UPDATE whatsapp_message_deliveries SET request_json=JSON_SET(request_json,'$.text','[Q-1]') WHERE idempotency_key=?",[key]);
    if(attack==='guard')await query("UPDATE whatsapp_message_deliveries SET request_json=JSON_SET(request_json,'$.replyGuard.version',77) WHERE idempotency_key=?",[key]);
    if(attack==='instance')await query('UPDATE whatsapp_message_deliveries SET instance_id=NULL WHERE idempotency_key=?',[key]);
    if(attack==='human projection')await query("UPDATE messages SET sender_type='merchant' WHERE conversationId=? AND direction='outgoing'",[identity.conversationId]);
    if(attack==='unprocessed')await query("UPDATE messages SET isProcessed=0 WHERE conversationId=? AND direction='outgoing'",[identity.conversationId]);
    if(attack==='projection text')await query("UPDATE messages SET content=CONCAT(content,' هل تريد الاتصال؟') WHERE conversationId=? AND direction='outgoing'",[identity.conversationId]);
    if(attack==='projection ai')await query("UPDATE messages SET aiResponse='changed' WHERE conversationId=? AND direction='outgoing'",[identity.conversationId]);
    if(attack==='version')await query('UPDATE conversations SET handoff_version=handoff_version+1 WHERE id=?',[identity.conversationId]);
    if(attack==='disabled merchant')await query("UPDATE merchants SET status='suspended' WHERE id=?",[owner.merchantId]);
    if(attack==='correction')await incoming('لا، أريد كمية أخرى');
    if(['waiting','suppressed'].includes(attack)){
      const newer=await incoming('أرسل التفاصيل');
      const next=buildReplyPlan({...newer,instanceId,providerAccount:'fixture',eventId:String(newer.incomingMessageId),to:identity.customerPhone,text:'هل أشرح لك؟'});
      await stageInteraction(next);if(attack==='suppressed')await finishInteractionDelivery(next,false);
    }
    expect((await acceptCheckoutQuote(await incoming(),q.quotationId)).kind).toBe('clarify');expect(await orders()).toEqual([]);
  });
  it.each(['consent','receipt','projection','deadline'])('rechecks %s after a catalog wait',async attack=>{
    const {q}=await offer(),consent=await incoming(),pool=(await getPool())!,get=pool.getConnection.bind(pool);let hit=false;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{
      const c=await get();return new Proxy(c,{get(target,key){
        if(key==='execute')return async(sql:any,args:any)=>{
          const result=await target.execute(sql,args);
          if(!hit&&String(sql).includes('SELECT * FROM products')){hit=true;
            // Simulate a mutation committed while a catalog row lock was awaited.
            if(attack==='consent')await query("UPDATE messages SET content='لا أريد الشراء' WHERE id=?",[consent.incomingMessageId]);
            if(attack==='receipt')await query("UPDATE whatsapp_message_deliveries SET status='failed' WHERE merchant_id=?",[owner.merchantId]);
            if(attack==='projection')await query("UPDATE messages SET content='هل تريد الاتصال؟' WHERE conversationId=? AND direction='outgoing'",[identity.conversationId]);
            // Quote is locked by this transaction. A DB-clock expiry is reproduced on its own connection.
            if(attack==='deadline')await target.execute('UPDATE sales_quotations SET offer_expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE id=?',[q.quotationId]);
          }return result;
        };const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
      }});
    });
    if(attack==='deadline')await expect(acceptCheckoutQuote(consent,q.quotationId)).rejects.toThrow('expired before commitment');
    else expect((await acceptCheckoutQuote(consent,q.quotationId)).kind).toBe('clarify');
    expect(hit).toBe(true);expect(await orders()).toEqual([]);
    expect(await query('SELECT id FROM ai_sales_order_facts WHERE merchant_id=?',[owner.merchantId])).toEqual([]);
  });
});
