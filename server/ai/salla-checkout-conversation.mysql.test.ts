import { randomUUID } from 'node:crypto';
import { afterAll,afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({post:vi.fn(),get:vi.fn(),send:vi.fn(),llm:vi.fn()}));
vi.mock('axios',()=>({default:{create:()=>({post:mocks.post,get:mocks.get})}}));
vi.mock('../channels/whatsapp/providers',()=>({getWhatsAppProvider:()=>({send:mocks.send})}));
vi.mock('./openai',()=>({callGPT4:mocks.llm}));
import { getPool,closeDb } from '../db/connection';
import { assertDisposableDatabase,createDisposableMerchant,createDisposableTrialSubscription,cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { encryptSecret } from '../security/secrets';
import { persistSallaCatalogRead } from '../integrations/salla-catalog';
import { normalizeSallaProduct } from '../integrations/salla-product-normalization';
import { createSyncLog,updateSyncLog } from '../db';
import { buildReplyPlan,dispatchReplyPlan,type ReplyPlan } from '../messaging/reply-plan';
import { stageInteraction,finishInteractionDelivery } from './interaction-jobs';
import { prepareSallaConversationOffer,acceptSallaConversationOffer,SALLA_CART_CHANGED,SALLA_CART_DECLINED,SALLA_CART_UNCERTAIN,canDispatchSallaCheckoutReply } from './salla-checkout-agreements';
import { handleSallaCheckout } from './salla-checkout-conversation';
import type { CheckoutIdentity } from './checkout-agreements';
import { readSallaCheckoutCart } from '../integrations/salla-checkout-carts';
import { recoverSallaCart } from '../integrations/salla-cart-recovery';
import { policyArtifactDigest as digest } from './learning-policy-evaluation-bundle';

describe.skipIf(!process.env.DATABASE_URL)('Salla conversation cart with actual SQL and ordinary WhatsApp transport',()=>{
  const q=async(sql:string,args:any[]=[]):Promise<any>=>(await(await getPool())!.execute(sql,args))[0];
  let merchant:number,user:number,users:number[],productId:number,connectionId:number,instanceId:number,store:string,identity:CheckoutIdentity;
  const incoming=async(content:string)=>({...identity,incomingMessageId:Number((await q("INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text',?)",[identity.conversationId,content])).insertId)});
  const row=async()=>(await q('SELECT * FROM sales_quotations WHERE merchant_id=? ORDER BY id DESC LIMIT 1',[merchant]))[0];
  const rawCart=(empty=false):any=>({status:200,success:true,data:{id:'cart123',store_id:store,checkout_url:'https://salla.sa/synthetic/checkout/cart123',currency:{code:'SAR'},amounts:{total:{amount:{value:empty?0:2.3,currency:'SAR'}}},items:empty?[]:[{id:'line1',product_id:'123',sku:'SKU-123',quantity:2,variant_id:null,options:[]}]}});
  const plan=(source:CheckoutIdentity,text:string):ReplyPlan=>buildReplyPlan({...source,instanceId,providerAccount:'fixture',eventId:String(source.incomingMessageId),to:identity.customerPhone,text});
  async function deliver(source:CheckoutIdentity,text:string){
    const p=plan(source,text);expect(await dispatchReplyPlan(p)).toBe('sent');
    await q(`INSERT INTO messages (conversationId,direction,sender_type,messageType,content,aiResponse,isProcessed) VALUES (?,'outgoing','assistant','text',?,?,1)`,[identity.conversationId,text,text]);return p;
  }
  async function offer(delivered=true){
    const text=await prepareSallaConversationOffer(identity,[{productId,quantity:2}]);if(delivered)await deliver(identity,text);return {text,quote:await row()};
  }
  async function approved(){const {quote}=await offer();const consent=await incoming('نعم');const text=await acceptSallaConversationOffer(consent,quote.id);expect(text).toContain('/checkout/cart123');return {consent,text,quote:await row()};}
  beforeEach(async()=>{
    assertDisposableDatabase();vi.stubEnv('FIELD_ENCRYPTION_KEY','synthetic-salla-conversation-cart-encryption-only');users=[];
    const owner=await createDisposableMerchant('salla-chat-cart');merchant=owner.merchantId;user=owner.userId;users.push(user);await createDisposableTrialSubscription(merchant);
    store=String(800000000+merchant);connectionId=Number((await q("INSERT INTO salla_connections(merchantId,salla_store_id,storeUrl,accessToken,syncStatus) VALUES (?,?,'https://salla.sa/synthetic',?,'active')",[merchant,store,encryptSecret('synthetic-token')])).insertId);
    const revision=await createSyncLog(merchant,'single_product','in_progress');
    productId=(await persistSallaCatalogRead({merchantId:merchant,connectionId,storeId:store,accessToken:'synthetic-token'},revision,'123',normalizeSallaProduct({id:123,sku:'SKU-123',name:'سماعة ساري',price:{amount:1,currency:'SAR'},quantity:5,unlimited_quantity:false,status:'sale',is_available:true,type:'product',options:[],skus:[]}))).localProductId!;
    await updateSyncLog(revision,'success',1);
    const conversation=await q("INSERT INTO conversations(merchantId,customerPhone,status) VALUES (?,'966500001234','active')",[merchant]);
    identity={merchantId:merchant,conversationId:conversation.insertId,incomingMessageId:1,customerPhone:'966500001234'};identity=await incoming('أريد شراء عدد 2 سماعة ساري');
    instanceId=Number((await q("INSERT INTO whatsapp_instances(merchant_id,instance_id,token,provider,status,is_primary) VALUES (?,?,'fixture','green_api','active',1)",[merchant,randomUUID()])).insertId);
    mocks.post.mockReset().mockImplementation(async(url:string)=>({data:url.endsWith('/generate')?rawCart(true):{status:200,success:true}}));mocks.get.mockReset().mockImplementation(async()=>({data:rawCart()}));
    mocks.send.mockReset().mockImplementation(async()=>({accepted:true,status:'sent',providerMessageId:randomUUID()}));mocks.llm.mockReset().mockResolvedValue(JSON.stringify([{productId,quantity:2}]));
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants(users);vi.unstubAllEnvs();});afterAll(closeDb);
  const decode=(v:any)=>typeof v==='string'?JSON.parse(v):v;
  async function parked(recover=true){
    const {quote}=await offer(),consent=await incoming('نعم');mocks.get.mockRejectedValueOnce(Error('lost final read'));
    expect(await acceptSallaConversationOffer(consent,quote.id)).toBe(SALLA_CART_UNCERTAIN);
    const saved=await row(),requestId=decode(saved.external_snapshot).value.requestId;
    if(recover)await recoverSallaCart(merchant,user,{requestId});
    return {quote:saved,consent,requestId};
  }
  async function rejectedBeforeDispatch(){
    const {quote}=await offer(),consent=await incoming('نعم'),pool=(await getPool())!,get=pool.getConnection.bind(pool);let hit=false;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get(),execute=c.execute.bind(c);
      vi.spyOn(c,'execute').mockImplementation((async(sql:string,args:any[])=>{
        if(sql.includes("UPDATE salla_checkout_carts SET state='dispatching'")){hit=true;throw Error('synthetic pre-dispatch failure');}return execute(sql,args);
      })as any);return c;});
    expect(await acceptSallaConversationOffer(consent,quote.id)).toBe(SALLA_CART_UNCERTAIN);vi.restoreAllMocks();expect(hit).toBe(true);
    expect(mocks.post).not.toHaveBeenCalled();expect(mocks.get).not.toHaveBeenCalled();
    expect((await q('SELECT * FROM salla_checkout_carts WHERE merchant_id=?',[merchant]))[0]).toMatchObject({state:'rejected',snapshot:null,result_json:null});
    return {quote:await row(),consent};
  }
  it('supersedes a recovered agreement locally and requires a separately delivered offer and new consent',async()=>{
    const {quote,consent,requestId}=await parked(),oldCart=(await q('SELECT * FROM salla_checkout_carts WHERE merchant_id=?',[merchant]))[0];
    const request=await incoming('غير الكمية إلى 3');mocks.post.mockClear();mocks.get.mockClear();mocks.llm.mockResolvedValue(JSON.stringify([{productId,quantity:3}]));
    const text=await handleSallaCheckout({...request,message:'غير الكمية إلى 3'}),next=await row();expect(text).toContain(`SC-${next.id}`);expect(next.id).not.toBe(quote.id);
    expect(text).toContain('× 3');expect(next).toMatchObject({execution_state:'ready',consent_message_id:null,external_result:null});
    expect(decode(next.external_snapshot).value.requestId).not.toBe(requestId);
    const previous=(await q('SELECT * FROM sales_quotations WHERE id=?',[quote.id]))[0],record=decode(previous.external_reconciliation);
    expect(previous).toMatchObject({status:'expired',execution_state:'unknown',consent_message_id:consent.incomingMessageId,execution_attempt_id:requestId});
    expect(record.digest).toBe(digest(record.value));expect(record.value).toMatchObject({version:'salla-cart-supersede.v1',quoteId:quote.id,
      consentMessageId:consent.incomingMessageId,incomingMessageId:request.incomingMessageId,replacementQuoteId:next.id,operationState:'ready',remoteCancellation:'not_performed',operationDigest:digest(oldCart)});
    expect(mocks.post).not.toHaveBeenCalled();expect(mocks.get).not.toHaveBeenCalled();
    expect((await q('SELECT * FROM salla_checkout_carts WHERE merchant_id=?',[merchant]))[0]).toEqual(oldCart);
    await deliver(request,text!);const yes=await incoming('نعم');
    mocks.post.mockImplementation(async(url:string)=>{const cart=rawCart(true);cart.data.id='cart456';cart.data.checkout_url='https://salla.sa/synthetic/checkout/cart456';return {data:url.endsWith('/generate')?cart:{status:200,success:true}};});
    mocks.get.mockImplementation(async()=>{const cart=rawCart();cart.data.id='cart456';cart.data.checkout_url='https://salla.sa/synthetic/checkout/cart456';cart.data.items[0].quantity=3;return{data:cart};});
    const link=await acceptSallaConversationOffer(yes,next.id);expect(link).toContain('/checkout/cart456');await deliver(yes,link);expect(mocks.post).toHaveBeenCalledTimes(2);
    expect(await q('SELECT id FROM salla_checkout_carts WHERE merchant_id=?',[merchant])).toHaveLength(2);
    expect(await q('SELECT id FROM orders WHERE merchantId=?',[merchant])).toEqual([]);
    for(const table of ['ai_sales_payment_facts','ai_sales_order_facts'])expect(await q(`SELECT * FROM ${table} WHERE merchant_id=?`,[merchant])).toEqual([]);
  });
  it.each(['expired','refused','projection-lost','catalog-changed','rejected-before-dispatch'])('allows a new reviewed selection after terminal %s',async mode=>{
    const {quote}=mode==='rejected-before-dispatch'?await rejectedBeforeDispatch():mode==='projection-lost'?await approved():await parked();
    if(mode==='expired')await q("UPDATE sales_quotations SET status='expired',offer_expires_at=UTC_TIMESTAMP() WHERE id=?",[quote.id]);
    if(mode==='refused'){const refusal=await incoming('لا ترسل');expect(await acceptSallaConversationOffer(refusal,quote.id)).toBe(SALLA_CART_DECLINED);}
    if(mode==='projection-lost')await q("UPDATE sales_quotations SET execution_state='unknown',external_result=NULL WHERE id=?",[quote.id]);
    if(mode==='catalog-changed')await q('UPDATE products SET price=2 WHERE id=?',[productId]);
    const request=await incoming('أريد شراء عدد 3 سماعة ساري');mocks.post.mockClear();mocks.get.mockClear();
    expect(await prepareSallaConversationOffer(request,[{productId,quantity:3}])).toContain('× 3');expect((await row()).id).not.toBe(quote.id);
    expect(decode((await q('SELECT external_reconciliation FROM sales_quotations WHERE id=?',[quote.id]))[0].external_reconciliation).value.operationState).toBe(mode==='rejected-before-dispatch'?'rejected':'ready');
    expect(mocks.post).not.toHaveBeenCalled();expect(mocks.get).not.toHaveBeenCalled();
  });
  it.each(['review','missing','preparing','dispatching','processing'])('does not supersede %s despite a new purchase request',async mode=>{
    const {quote}=await parked(mode==='processing');
    if(mode==='missing')await q('DELETE FROM salla_checkout_carts WHERE merchant_id=?',[merchant]);
    if(['preparing','dispatching'].includes(mode))await q('UPDATE salla_checkout_carts SET state=? WHERE merchant_id=?',[mode,merchant]);
    if(mode==='processing')await q("UPDATE sales_quotations SET execution_state='processing' WHERE id=?",[quote.id]);
    const before=await row(),request=await incoming('أريد شراء عدد 3 سماعة ساري');mocks.post.mockClear();mocks.get.mockClear();
    expect(await prepareSallaConversationOffer(request,[{productId,quantity:3}])).toBe(SALLA_CART_UNCERTAIN);expect(await row()).toEqual(before);
    expect(mocks.post).not.toHaveBeenCalled();expect(mocks.get).not.toHaveBeenCalled();
  });
  it.each(['source','consent','receipt','offer-text','attempt','financial','result','reconciliation','handoff','actor','request-hash','attempt-token','snapshot','checkpoint','result-digest','result-url','result-items','recipient','tenant'])('rejects supersession with changed %s proof',async mode=>{
    const {quote,consent}=await parked();
    if(mode==='source')await q("UPDATE messages SET content='أريد ثلاثة' WHERE id=?",[identity.incomingMessageId]);
    if(mode==='consent')await q("UPDATE messages SET content='لا أريد' WHERE id=?",[consent.incomingMessageId]);
    if(mode==='receipt')await q("UPDATE whatsapp_message_deliveries SET status='failed' WHERE merchant_id=?",[merchant]);
    if(mode==='offer-text')await q("UPDATE messages SET content='changed' WHERE conversationId=? AND direction='outgoing'",[identity.conversationId]);
    if(mode==='attempt')await q('UPDATE sales_quotations SET execution_attempt_id=? WHERE id=?',[randomUUID(),quote.id]);
    if(mode==='financial')await q("UPDATE sales_quotations SET external_order_key='unrelated' WHERE id=?",[quote.id]);
    if(mode==='result')await q('UPDATE sales_quotations SET external_result=JSON_OBJECT() WHERE id=?',[quote.id]);
    if(mode==='reconciliation')await q('UPDATE sales_quotations SET external_reconciliation=JSON_OBJECT() WHERE id=?',[quote.id]);
    if(mode==='handoff')await q('UPDATE conversations SET handoff_version=handoff_version+1 WHERE id=?',[identity.conversationId]);
    if(mode==='actor')await q('UPDATE salla_checkout_carts SET actor_user_id=actor_user_id+1000000 WHERE merchant_id=?',[merchant]);
    if(mode==='request-hash')await q('UPDATE salla_checkout_carts SET request_hash=? WHERE merchant_id=?',['0'.repeat(64),merchant]);
    if(mode==='attempt-token')await q("UPDATE salla_checkout_carts SET attempt_token='invalid' WHERE merchant_id=?",[merchant]);
    if(mode==='snapshot')await q("UPDATE salla_checkout_carts SET snapshot=JSON_REMOVE(snapshot,'$.digest') WHERE merchant_id=?",[merchant]);
    if(mode==='checkpoint')await q("UPDATE salla_checkout_carts SET snapshot=JSON_SET(snapshot,'$.checkpoint.value.cartId','cart999') WHERE merchant_id=?",[merchant]);
    if(mode==='result-digest')await q("UPDATE salla_checkout_carts SET result_json=JSON_REMOVE(result_json,'$.digest') WHERE merchant_id=?",[merchant]);
    if(['result-url','result-items'].includes(mode)){
      const operation=(await q('SELECT * FROM salla_checkout_carts WHERE merchant_id=?',[merchant]))[0],result=decode(operation.result_json),snapshot=decode(operation.snapshot);
      if(mode==='result-url')result.value.checkoutUrl='https://attacker.invalid/cart123';else result.value.items[0].quantity=3;
      result.digest=digest(result.value);snapshot.recovery.value.resultDigest=result.digest;snapshot.recovery.digest=digest(snapshot.recovery.value);
      await q('UPDATE salla_checkout_carts SET result_json=?,snapshot=? WHERE id=?',[JSON.stringify(result),JSON.stringify(snapshot),operation.id]);
    }
    let request=await incoming('غير الكمية إلى 3');
    if(mode==='recipient')request={...request,customerPhone:'966500009999'};
    if(mode==='tenant'){const other=await createDisposableMerchant('supersede-other');users.push(other.userId);request={...request,merchantId:other.merchantId};}
    const before=await row();mocks.post.mockClear();mocks.get.mockClear();
    expect(await prepareSallaConversationOffer(request,[{productId,quantity:3}]).catch(()=>SALLA_CART_UNCERTAIN)).toBe(SALLA_CART_UNCERTAIN);
    expect(await row()).toEqual(before);expect(mocks.post).not.toHaveBeenCalled();expect(mocks.get).not.toHaveBeenCalled();
  });
  it('rejects a pre-dispatch rejection containing a contradictory snapshot',async()=>{
    await rejectedBeforeDispatch();await q('UPDATE salla_checkout_carts SET snapshot=JSON_OBJECT() WHERE merchant_id=?',[merchant]);
    const before=await row(),request=await incoming('غير الكمية إلى 3');expect(await prepareSallaConversationOffer(request,[{productId,quantity:3}])).toBe(SALLA_CART_UNCERTAIN);expect(await row()).toEqual(before);
  });
  it('enforces the database boundary against a rejected operation with a completed result',async()=>{
    await rejectedBeforeDispatch();const before=(await q('SELECT * FROM salla_checkout_carts WHERE merchant_id=?',[merchant]))[0];
    await expect(q('UPDATE salla_checkout_carts SET result_json=JSON_OBJECT() WHERE merchant_id=?',[merchant])).rejects.toMatchObject({code:'ER_CHECK_CONSTRAINT_VIOLATED'});
    expect((await q('SELECT * FROM salla_checkout_carts WHERE merchant_id=?',[merchant]))[0]).toEqual(before);
  });
  it.each(['نعم','جهز السلة','أرسل رابط السلة','هل أقدر أطلب؟','كم السعر؟','غير موافق','لا ترسل'])('does not retire the old agreement from %s',async message=>{
    await parked();const before=await row(),request=await incoming(message);mocks.post.mockClear();mocks.get.mockClear();
    expect(await prepareSallaConversationOffer(request,[{productId,quantity:3}])).not.toContain('اختيارك للمراجعة');expect(await row()).toEqual(before);
    expect(mocks.post).not.toHaveBeenCalled();expect(mocks.get).not.toHaveBeenCalled();
  });
  it.each(['rollback','lost-commit'])('keeps supersession and replacement atomic through %s',async mode=>{
    const {quote}=await parked(),request=await incoming('غير الكمية إلى 3'),before=await row(),pool=(await getPool())!,get=pool.getConnection.bind(pool);let hit=false;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get(),execute=c.execute.bind(c),commit=c.commit.bind(c);let selected=false;
      vi.spyOn(c,'execute').mockImplementation((async(sql:string,args:any[])=>{const r=await execute(sql,args);
        if(sql.includes("SET status='expired',external_reconciliation=?")){selected=true;if(mode==='rollback'){hit=true;throw Error('supersession rollback');}}return r;
      })as any);vi.spyOn(c,'commit').mockImplementation(async()=>{await commit();if(selected&&mode==='lost-commit'&&!hit){hit=true;throw Error('lost supersession acknowledgement');}});return c;});
    mocks.post.mockClear();mocks.get.mockClear();await expect(prepareSallaConversationOffer(request,[{productId,quantity:3}])).rejects.toThrow();vi.restoreAllMocks();expect(hit).toBe(true);
    if(mode==='rollback')expect(await row()).toEqual(before);
    const text=await prepareSallaConversationOffer(request,[{productId,quantity:3}]),saved=await row();expect(saved.id).not.toBe(quote.id);expect(text).toContain('× 3');
    expect(await prepareSallaConversationOffer(request,[{productId,quantity:3}])).toBe(text);expect(await row()).toEqual(saved);
    expect(await q('SELECT id FROM sales_quotations WHERE merchant_id=?',[merchant])).toHaveLength(2);expect(mocks.post).not.toHaveBeenCalled();expect(mocks.get).not.toHaveBeenCalled();
  });
  it('converges three replacements on one offer and rejects an undelivered replacement consent',async()=>{
    const {quote,consent}=await parked(),request=await incoming('غير الكمية إلى 3');mocks.post.mockClear();mocks.get.mockClear();
    const texts=await Promise.all(Array.from({length:3},()=>prepareSallaConversationOffer(request,[{productId,quantity:3}])));expect(new Set(texts).size).toBe(1);
    const next=await row();expect(await q('SELECT id FROM sales_quotations WHERE merchant_id=?',[merchant])).toHaveLength(2);
    expect(await acceptSallaConversationOffer(consent,quote.id).catch(()=>SALLA_CART_UNCERTAIN)).not.toContain('/checkout/');
    const p=plan(consent,`[SC-${quote.id}] https://salla.sa/synthetic/checkout/cart123`);
    expect(await canDispatchSallaCheckoutReply({...p.effects[0],replyGuard:{conversationId:consent.conversationId,incomingMessageId:consent.incomingMessageId,version:0}})).toBe(false);
    const yes=await incoming('نعم');expect(await acceptSallaConversationOffer(yes,next.id)).toBe(SALLA_CART_CHANGED);
    expect(mocks.post).not.toHaveBeenCalled();expect(mocks.get).not.toHaveBeenCalled();
  });
  it.each(['new-message','human','source','new-stock'])('does not retire an old agreement after %s changes before replacement commit',async mode=>{
    const {quote}=await parked(),request=await incoming('غير الكمية إلى 3'),pool=(await getPool())!,get=pool.getConnection.bind(pool);let hit=false;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get(),commit=c.commit.bind(c);
      vi.spyOn(c,'commit').mockImplementation(async()=>{await commit();if(!hit){hit=true;
        if(mode==='new-message')await incoming('لا ترسل');if(mode==='human')await q('UPDATE conversations SET human_takeover=1 WHERE id=?',[identity.conversationId]);
        if(mode==='source')await q("UPDATE messages SET content='لا ترسل' WHERE id=?",[request.incomingMessageId]);if(mode==='new-stock')await q('UPDATE products SET stock=0 WHERE id=?',[productId]);
      }});return c;});
    mocks.post.mockClear();mocks.get.mockClear();await expect(prepareSallaConversationOffer(request,[{productId,quantity:3}])).rejects.toThrow();vi.restoreAllMocks();
    expect(hit).toBe(true);expect(await row()).toEqual(quote);expect(mocks.post).not.toHaveBeenCalled();expect(mocks.get).not.toHaveBeenCalled();
  });
  it('resumes a recovered cart only after a new explicit customer request and uses a new ordinary reply identity',async()=>{
    const {quote,consent}=await parked();await deliver(consent,SALLA_CART_UNCERTAIN);
    expect((await row()).execution_state).toBe('unknown');const request=await incoming('أعد إرسال رابط السلة');mocks.post.mockClear();mocks.get.mockClear();mocks.llm.mockClear();
    const text=await handleSallaCheckout({...request,message:'أعد إرسال رابط السلة'});expect(text).toContain('/checkout/cart123');expect(mocks.llm).not.toHaveBeenCalled();
    const saved=await row(),record=decode(saved.external_reconciliation).value;
    expect(saved).toMatchObject({id:quote.id,consent_message_id:consent.incomingMessageId,execution_state:'succeeded',order_id:null,external_order_key:null});
    expect(record).toMatchObject({version:'salla-cart-resume.v1',incomingMessageId:request.incomingMessageId,consentMessageId:consent.incomingMessageId});
    const p=await deliver(request,text!);expect(await dispatchReplyPlan(p)).toBe('sent');expect(mocks.send).toHaveBeenCalledTimes(3);expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.get).toHaveBeenCalledTimes(2);expect(await q('SELECT id FROM orders WHERE merchantId=?',[merchant])).toEqual([]);
    for(const table of ['ai_sales_payment_facts','ai_sales_order_facts'])expect(await q(`SELECT * FROM ${table} WHERE merchant_id=?`,[merchant])).toEqual([]);
    expect(await row()).toEqual(saved);
  });
  it('reuses an already succeeded cart for an explicit resend while preserving the original consent and cart',async()=>{
    const {consent,text,quote}=await approved();await deliver(consent,text);const request=await incoming('أرسل رابط السلة');mocks.post.mockClear();
    expect(await acceptSallaConversationOffer(request,quote.id)).toBe(text);const first=await row();
    expect(await acceptSallaConversationOffer(request,quote.id)).toBe(text);expect(await row()).toEqual(first);await deliver(request,text);
    const next=await incoming('resend the cart link');expect(await handleSallaCheckout({...next,message:'resend the cart link'})).toBe(text);await deliver(next,text);
    expect((await row()).consent_message_id).toBe(consent.incomingMessageId);expect(mocks.post).not.toHaveBeenCalled();expect(mocks.send).toHaveBeenCalledTimes(4);
  });
  it.each(['نعم','جهز السلة','نعم لكن الكمية 3'])('does not resume the original unknown attempt for %s',async message=>{
    const {quote}=await parked(),request=await incoming(message);mocks.post.mockClear();mocks.get.mockClear();
    expect(await acceptSallaConversationOffer(request,quote.id)).not.toContain('/checkout/');expect((await row()).execution_state).toBe('unknown');expect(mocks.post).not.toHaveBeenCalled();expect(mocks.get).not.toHaveBeenCalled();
  });
  it.each(['review','missing','dispatching','processing'])('never adopts or creates a %s operation while resuming',async mode=>{
    const {quote}=await parked(mode==='processing');
    if(mode==='missing')await q('DELETE FROM salla_checkout_carts WHERE merchant_id=?',[merchant]);
    if(mode==='dispatching')await q("UPDATE salla_checkout_carts SET state='dispatching' WHERE merchant_id=?",[merchant]);
    if(mode==='processing')await q("UPDATE sales_quotations SET execution_state='processing' WHERE id=?",[quote.id]);
    const request=await incoming('أرسل رابط السلة');mocks.post.mockClear();mocks.get.mockClear();
    expect(await acceptSallaConversationOffer(request,quote.id)).toBe(SALLA_CART_UNCERTAIN);expect(mocks.post).not.toHaveBeenCalled();expect(mocks.get).not.toHaveBeenCalled();expect((await row()).external_reconciliation).toBeNull();
  });
  it.each(['لا ترسل','غير الكمية إلى 3','كم السعر؟','نعم'])('requires a new agreement after an intervening %s',async message=>{
    const {quote}=await parked();await incoming(message);const request=await incoming('أرسل رابط السلة');mocks.post.mockClear();mocks.get.mockClear();
    expect(await acceptSallaConversationOffer(request,quote.id)).toBe(SALLA_CART_UNCERTAIN);expect(mocks.post).not.toHaveBeenCalled();expect(mocks.get).not.toHaveBeenCalled();
  });
  it.each(['source','consent','receipt','offer-text','expired','stock','owner','handoff','connection','attempt','financial','result'])('blocks changed original %s before resumption GET',async mode=>{
    const {quote,consent}=await parked();
    if(mode==='source')await q("UPDATE messages SET content='أريد ثلاثة' WHERE id=?",[identity.incomingMessageId]);
    if(mode==='consent')await q("UPDATE messages SET content='لا أريد' WHERE id=?",[consent.incomingMessageId]);
    if(mode==='receipt')await q("UPDATE whatsapp_message_deliveries SET status='failed' WHERE merchant_id=?",[merchant]);
    if(mode==='offer-text')await q("UPDATE messages SET content='changed' WHERE conversationId=? AND direction='outgoing'",[identity.conversationId]);
    if(mode==='expired')await q('UPDATE sales_quotations SET offer_expires_at=UTC_TIMESTAMP() WHERE id=?',[quote.id]);
    if(mode==='stock')await q('UPDATE products SET stock=0 WHERE id=?',[productId]);
    if(mode==='owner')await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[user]);
    if(mode==='handoff')await q('UPDATE conversations SET handoff_version=handoff_version+1 WHERE id=?',[identity.conversationId]);
    if(mode==='connection')await q("UPDATE salla_connections SET syncStatus='paused' WHERE id=?",[connectionId]);
    if(mode==='attempt')await q('UPDATE sales_quotations SET execution_attempt_id=? WHERE id=?',[randomUUID(),quote.id]);
    if(mode==='financial')await q("UPDATE sales_quotations SET external_order_key='unrelated-order' WHERE id=?",[quote.id]);
    if(mode==='result')await q("UPDATE sales_quotations SET external_result=JSON_OBJECT() WHERE id=?",[quote.id]);
    const request=await incoming('أرسل رابط السلة');mocks.post.mockClear();mocks.get.mockClear();
    await expect(acceptSallaConversationOffer(request,quote.id).catch(()=>SALLA_CART_UNCERTAIN)).resolves.toBe(SALLA_CART_UNCERTAIN);expect(mocks.post).not.toHaveBeenCalled();expect(mocks.get).not.toHaveBeenCalled();
  });
  it.each(['source','request','new-message','human','receipt','quote','cart','deleted-ledger','ledger-proof','ledger-result'])('blocks %s changing during a resume read',async mode=>{
    const {quote}=await parked(),request=await incoming('أرسل رابط السلة');mocks.post.mockClear();
    mocks.get.mockImplementationOnce(async()=>{
      if(mode==='source')await q("UPDATE messages SET content='غير الكمية' WHERE id=?",[identity.incomingMessageId]);
      if(mode==='request')await q("UPDATE messages SET content='لا ترسل' WHERE id=?",[request.incomingMessageId]);
      if(mode==='new-message')await incoming('أريد منتجا آخر');if(mode==='human')await q('UPDATE conversations SET human_takeover=1 WHERE id=?',[identity.conversationId]);
      if(mode==='receipt')await q("UPDATE whatsapp_message_deliveries SET status='failed' WHERE merchant_id=?",[merchant]);
      if(mode==='quote')await q("UPDATE sales_quotations SET status='rejected' WHERE id=?",[quote.id]);
      if(mode==='deleted-ledger')await q('DELETE FROM salla_checkout_carts WHERE merchant_id=?',[merchant]);
      if(mode==='ledger-proof')await q("UPDATE salla_checkout_carts SET snapshot=JSON_REMOVE(snapshot,'$.digest') WHERE merchant_id=?",[merchant]);
      if(mode==='ledger-result')await q("UPDATE salla_checkout_carts SET result_json=JSON_SET(result_json,'$.value.observedTotalMinor',999) WHERE merchant_id=?",[merchant]);
      const cart=rawCart();if(mode==='cart')cart.data.items[0].quantity=3;return{data:cart};
    });expect(await acceptSallaConversationOffer(request,quote.id)).toBe(SALLA_CART_UNCERTAIN);expect((await row()).external_reconciliation).toBeNull();expect(mocks.post).not.toHaveBeenCalled();
  });
  it.each(['refusal','human','expired','corrupt','request','total'])('rechecks %s immediately before sending a resumed link',async mode=>{
    const {quote}=await parked(),request=await incoming('أرسل رابط السلة'),text=await acceptSallaConversationOffer(request,quote.id);expect(text).toContain('/checkout/');mocks.post.mockClear();
    if(mode==='refusal')await incoming('لا ترسل');if(mode==='human')await q('UPDATE conversations SET human_takeover=1 WHERE id=?',[identity.conversationId]);
    if(mode==='expired')await q('UPDATE sales_quotations SET offer_expires_at=UTC_TIMESTAMP() WHERE id=?',[quote.id]);
    if(mode==='corrupt')await q("UPDATE sales_quotations SET external_reconciliation=JSON_REMOVE(external_reconciliation,'$.digest') WHERE id=?",[quote.id]);
    if(mode==='request')await q("UPDATE messages SET content='غير الكمية' WHERE id=?",[request.incomingMessageId]);
    if(mode==='total'){const cart=rawCart();cart.data.amounts.total.amount.value=99;mocks.get.mockResolvedValue({data:cart});}
    await dispatchReplyPlan(plan(request,text)).catch(()=>undefined);expect(mocks.send).toHaveBeenCalledTimes(1);expect(mocks.post).not.toHaveBeenCalled();
  });
  it('cannot use a link marker as authorization before the customer request is reconciled',async()=>{
    const {quote}=await parked(),request=await incoming('أرسل رابط السلة'),text=`[SC-${quote.id}] https://salla.sa/synthetic/checkout/cart123`,p=plan(request,text);
    expect(await canDispatchSallaCheckoutReply({...p.effects[0],replyGuard:{conversationId:request.conversationId,incomingMessageId:request.incomingMessageId,version:0}})).toBe(false);
    expect((await row()).external_reconciliation).toBeNull();
  });
  it('recovers a lost resume commit acknowledgement with the same message and no provider writes',async()=>{
    const {quote}=await parked(),request=await incoming('أرسل رابط السلة'),pool=(await getPool())!,get=pool.getConnection.bind(pool);let hit=false;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get(),execute=c.execute.bind(c),commit=c.commit.bind(c);let selected=false;
      vi.spyOn(c,'execute').mockImplementation((async(sql:string,args:any[])=>{if(sql.includes('external_result=?,external_reconciliation=?'))selected=true;return execute(sql,args);})as any);
      vi.spyOn(c,'commit').mockImplementation(async()=>{await commit();if(selected&&!hit){hit=true;throw Error('lost acknowledgement');}});return c;});
    mocks.post.mockClear();expect(await acceptSallaConversationOffer(request,quote.id)).toBe(SALLA_CART_UNCERTAIN);vi.restoreAllMocks();const saved=await row();
    const text=await acceptSallaConversationOffer(request,quote.id);expect(text).toContain('/checkout/');expect(await row()).toEqual(saved);await deliver(request,text);expect(mocks.post).not.toHaveBeenCalled();expect(mocks.send).toHaveBeenCalledTimes(2);
  });
  it('rolls back resume storage without losing the original claim or creating another cart',async()=>{
    const {quote}=await parked(),request=await incoming('أرسل رابط السلة'),before=await row(),pool=(await getPool())!,get=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get(),execute=c.execute.bind(c);vi.spyOn(c,'execute').mockImplementation((async(sql:string,args:any[])=>{
      const r=await execute(sql,args);if(sql.includes('external_result=?,external_reconciliation=?'))throw Error('resume write lost');return r;})as any);return c;});
    mocks.post.mockClear();expect(await acceptSallaConversationOffer(request,quote.id)).toBe(SALLA_CART_UNCERTAIN);vi.restoreAllMocks();expect(await row()).toEqual(before);
    expect(await acceptSallaConversationOffer(request,quote.id)).toContain('/checkout/');expect(mocks.post).not.toHaveBeenCalled();
  });
  it('converges concurrent resume attempts on one source and fences the original reply',async()=>{
    const {quote,consent}=await parked(),request=await incoming('أرسل رابط السلة');mocks.post.mockClear();
    const replies=await Promise.all(Array.from({length:3},()=>acceptSallaConversationOffer(request,quote.id)));expect(replies.some(t=>t.includes('/checkout/'))).toBe(true);
    const text=await acceptSallaConversationOffer(request,quote.id),saved=await row();expect(decode(saved.external_reconciliation).value.incomingMessageId).toBe(request.incomingMessageId);
    const original=plan(consent,text);expect(await canDispatchSallaCheckoutReply({...original.effects[0],replyGuard:{conversationId:consent.conversationId,incomingMessageId:consent.incomingMessageId,version:0}})).toBe(false);
    const p=plan(request,text),deliveries=await Promise.allSettled([dispatchReplyPlan(p),dispatchReplyPlan(p)]);
    expect(deliveries.some(r=>r.status==='fulfilled'&&r.value==='sent')).toBe(true);
    for(const r of deliveries)if(r.status==='rejected')expect(r.reason.message).toBe('Reply effect requires delivery review');
    expect(await dispatchReplyPlan(p)).toBe('sent');expect(mocks.send).toHaveBeenCalledTimes(2);expect(mocks.post).not.toHaveBeenCalled();
  });
  it('resumes a completed cart when only quote projection was lost',async()=>{
    const {quote}=await approved();await q("UPDATE sales_quotations SET execution_state='unknown',external_result=NULL WHERE id=?",[quote.id]);
    const request=await incoming('أرسل رابط السلة');mocks.post.mockClear();
    const text=await acceptSallaConversationOffer(request,quote.id);expect(text).toContain('/checkout/');await deliver(request,text);expect(mocks.post).not.toHaveBeenCalled();
  });
  it.each(['tenant','recipient','conversation'])('does not resume across another %s identity',async mode=>{
    const {quote}=await parked(),request=await incoming('أرسل رابط السلة'),other=await createDisposableMerchant('cart-resume-other');users.push(other.userId);
    const changed={...request,...(mode==='tenant'?{merchantId:other.merchantId}:mode==='recipient'?{customerPhone:'966500009999'}:{conversationId:request.conversationId+1000000})};
    mocks.post.mockClear();mocks.get.mockClear();await expect(acceptSallaConversationOffer(changed,quote.id)).rejects.toThrow();expect(mocks.post).not.toHaveBeenCalled();expect(mocks.get).not.toHaveBeenCalled();
  });
  it.each(['quote','recipient','snapshot','consent','request-id','consent-message'])('rejects rehashed resume %s evidence inconsistent with its source',async mode=>{
    const {quote,consent}=await parked(),request=await incoming('أرسل رابط السلة');expect(await acceptSallaConversationOffer(request,quote.id)).toContain('/checkout/');
    const raw=decode((await row()).external_reconciliation);
    if(mode==='quote')raw.value.quoteId++;if(mode==='recipient')raw.value.recipientDigest='0'.repeat(64);if(mode==='snapshot')raw.value.snapshotDigest='0'.repeat(64);
    if(mode==='consent')raw.value.consentMessageId++;if(mode==='request-id')raw.value.requestId=randomUUID();
    if(mode==='consent-message')await q("UPDATE messages SET content='موافق' WHERE id=?",[consent.incomingMessageId]);
    raw.digest=digest(raw.value);await q('UPDATE sales_quotations SET external_reconciliation=? WHERE id=?',[JSON.stringify(raw),quote.id]);
    mocks.post.mockClear();mocks.get.mockClear();expect(await acceptSallaConversationOffer(request,quote.id)).toBe(SALLA_CART_UNCERTAIN);expect(mocks.post).not.toHaveBeenCalled();expect(mocks.get).not.toHaveBeenCalled();
  });
  it('bounds repeated link requests and does not reuse a superseded resume authorization',async()=>{
    const {quote}=await parked(),request=await incoming('أرسل رابط السلة'),text=await acceptSallaConversationOffer(request,quote.id);
    const next=await incoming('أعد إرسال رابط السلة');expect(await acceptSallaConversationOffer(next,quote.id)).toBe(text);
    const old=plan(request,text);expect(await canDispatchSallaCheckoutReply({...old.effects[0],replyGuard:{conversationId:request.conversationId,incomingMessageId:request.incomingMessageId,version:0}})).toBe(false);
    for(let i=0;i<20;i++)await incoming('أرسل رابط السلة');const overflow=await incoming('أرسل رابط السلة');mocks.post.mockClear();mocks.get.mockClear();
    expect(await acceptSallaConversationOffer(overflow,quote.id)).toBe(SALLA_CART_UNCERTAIN);expect(mocks.post).not.toHaveBeenCalled();expect(mocks.get).not.toHaveBeenCalled();
  });
  it('does not cross a forgotten context boundary when resuming',async()=>{
    await parked();const request=await incoming('أرسل رابط السلة');mocks.post.mockClear();mocks.get.mockClear();
    expect(await handleSallaCheckout({...request,message:'أرسل رابط السلة',memoryHistoryCutoff:identity.incomingMessageId})).not.toContain('/checkout/');expect(mocks.post).not.toHaveBeenCalled();expect(mocks.get).not.toHaveBeenCalled();
  });
  it('takes selection through delivered review, customer consent and verified checkout link without recording a sale',async()=>{
    const offerText=await handleSallaCheckout({...identity,message:'أريد شراء عدد 2 سماعة ساري'});expect(offerText).toContain('سماعة ساري × 2');expect(mocks.post).not.toHaveBeenCalled();
    await deliver(identity,offerText!);const consent=await incoming('نعم'),text=await handleSallaCheckout({...consent,message:'نعم'});expect(text).toContain('/checkout/cart123');
    expect(mocks.llm).toHaveBeenCalledTimes(1);expect(JSON.stringify(mocks.llm.mock.calls[0])).not.toContain('synthetic-token');
    const p=await deliver(consent,text!);expect(mocks.get).toHaveBeenCalledTimes(2);expect(mocks.post).toHaveBeenCalledTimes(2);expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(await dispatchReplyPlan(p)).toBe('sent');expect(mocks.send).toHaveBeenCalledTimes(2);expect(mocks.post).toHaveBeenCalledTimes(2);
    expect(await row()).toMatchObject({status:'viewed',execution_state:'succeeded',consent_message_id:consent.incomingMessageId,order_id:null,external_order_key:null,projection_pending:0});
    for(const table of ['orders','salla_order_creations'])expect(await q(`SELECT id FROM ${table} WHERE ${table==='orders'?'merchantId':'merchant_id'}=?`,[merchant])).toHaveLength(0);
    expect((await q('SELECT deal_stage FROM conversations WHERE id=?',[identity.conversationId]))[0].deal_stage).not.toBe('paid');
  });
  it('replays the same offer and accepted cart without generating another cart',async()=>{
    const {text,quote}=await offer();expect(await prepareSallaConversationOffer(identity,[{productId,quantity:2}])).toBe(text);
    const consent=await incoming('نعم'),link=await acceptSallaConversationOffer(consent,quote.id);
    expect(await acceptSallaConversationOffer(consent,quote.id)).toBe(link);expect(mocks.post).toHaveBeenCalledTimes(2);expect(mocks.get).toHaveBeenCalledTimes(2);
  });
  it.each(['لا','لا أريد الشراء','لا ترسل','no thanks'])('does not create or share after refusal %s',async message=>{
    const {quote}=await offer(),consent=await incoming(message);expect(await acceptSallaConversationOffer(consent,quote.id)).toBe(SALLA_CART_DECLINED);expect(mocks.post).not.toHaveBeenCalled();
  });
  it.each(['كيف أطلب؟','هل يمكن الدفع؟','نعم لكن الكمية 3','نعم إذا كان الشحن مجاني','أرسل التفاصيل','لا، غير الكمية إلى 3'])('does not mistake %s for cart consent',async message=>{
    const {quote}=await offer();expect(await acceptSallaConversationOffer(await incoming(message),quote.id)).not.toContain('/checkout/');expect(mocks.post).not.toHaveBeenCalled();
  });
  it.each(['missing','boolean','changed-text','receipt','recipient','source-text','expired','snapshot','price','quantity','sku','origin','owner','handoff'])('blocks %s before any provider write',async mode=>{
    const {quote,text}=await offer(!['missing','boolean','changed-text'].includes(mode));
    if(mode==='boolean'){const p=plan(identity,text);await stageInteraction(p);await finishInteractionDelivery(p,true);}
    if(mode==='changed-text'){
      // A legacy or altered projected message without a valid exact receipt.
      await q("INSERT INTO messages(conversationId,direction,sender_type,messageType,content,aiResponse,isProcessed) VALUES (?,'outgoing','assistant','text',?,?,1)",[identity.conversationId,text.replace('× 2','× 1'),text,]);
    }
    if(mode==='receipt')await q("UPDATE whatsapp_message_deliveries SET status='failed' WHERE merchant_id=?",[merchant]);
    if(mode==='recipient')await q("UPDATE whatsapp_message_deliveries SET request_json=JSON_SET(request_json,'$.to','966599999999') WHERE merchant_id=?",[merchant]);
    if(mode==='source-text')await q("UPDATE messages SET content='أريد منتجًا آخر' WHERE id=?",[identity.incomingMessageId]);
    if(mode==='expired')await q('UPDATE sales_quotations SET offer_expires_at=UTC_TIMESTAMP() WHERE id=?',[quote.id]);
    if(mode==='snapshot')await q("UPDATE sales_quotations SET external_snapshot=JSON_SET(external_snapshot,'$.value.items[0].quantity',1) WHERE id=?",[quote.id]);
    if(mode==='price')await q('UPDATE products SET price=999 WHERE id=?',[productId]);if(mode==='quantity')await q('UPDATE products SET stock=0 WHERE id=?',[productId]);
    if(mode==='sku')await q("UPDATE products SET sku='OTHER' WHERE id=?",[productId]);
    if(mode==='origin')await q("UPDATE salla_connections SET storeUrl='https://salla.sa/other' WHERE id=?",[connectionId]);
    if(mode==='owner'){const other=await createDisposableMerchant('cart-owner');users.push(other.userId);await q('UPDATE merchants SET userId=? WHERE id=?',[other.userId,merchant]);}
    if(mode==='handoff')await q('UPDATE conversations SET handoff_version=handoff_version+1 WHERE id=?',[identity.conversationId]);
    const response=await acceptSallaConversationOffer(await incoming('نعم'),quote.id);expect(response).not.toContain('/checkout/');expect(mocks.post).not.toHaveBeenCalled();
  });
  it('never adopts another tenant, recipient, conversation or stale incoming message',async()=>{
    const {quote}=await offer(),consent=await incoming('نعم'),other=await createDisposableMerchant('cart-other');users.push(other.userId);
    for(const patch of [{merchantId:other.merchantId},{customerPhone:'966599999999'},{conversationId:identity.conversationId+100000}])await expect(acceptSallaConversationOffer({...consent,...patch},quote.id)).rejects.toThrow();
    await incoming('لا أريد');await expect(acceptSallaConversationOffer(consent,quote.id)).rejects.toThrow();expect(mocks.post).not.toHaveBeenCalled();
  });
  it.each(['source','new-message','human','product','connection'])('stops the remaining writes after %s changes during generate',async mode=>{
    const {quote}=await offer(),consent=await incoming('نعم');
    mocks.post.mockImplementationOnce(async()=>{
      if(mode==='source')await q("UPDATE messages SET content='لا' WHERE id=?",[consent.incomingMessageId]);
      if(mode==='new-message')await incoming('عدّل الكمية إلى 3');
      if(mode==='human')await q('UPDATE conversations SET human_takeover=1,handoff_version=handoff_version+1 WHERE id=?',[identity.conversationId]);
      if(mode==='product')await q('UPDATE products SET stock=0 WHERE id=?',[productId]);
      if(mode==='connection')await q("UPDATE salla_connections SET syncStatus='paused' WHERE id=?",[connectionId]);
      return{data:rawCart(true)};
    });
    expect(await acceptSallaConversationOffer(consent,quote.id)).toBe(SALLA_CART_UNCERTAIN);expect(mocks.post).toHaveBeenCalledTimes(1);expect(mocks.get).not.toHaveBeenCalled();
  });
  it.each(['price','quantity','product','deleted-cart','proof','expired','refusal','human','connection'])('suppresses %s before the WhatsApp link leaves the outbox',async mode=>{
    const {consent,text,quote}=await approved(),raw=rawCart();
    if(mode==='price')raw.data.amounts.total.amount.value=99;if(mode==='quantity')raw.data.items[0].quantity=1;if(mode==='product')raw.data.items[0].product_id='789';mocks.get.mockResolvedValue({data:raw});
    if(mode==='deleted-cart')await q('DELETE FROM salla_checkout_carts WHERE merchant_id=?',[merchant]);
    if(mode==='proof')await q("UPDATE sales_quotations SET external_result=JSON_REMOVE(external_result,'$.digest') WHERE id=?",[quote.id]);
    if(mode==='expired')await q('UPDATE sales_quotations SET offer_expires_at=UTC_TIMESTAMP() WHERE id=?',[quote.id]);
    if(mode==='refusal')await incoming('لا ترسل الرابط');if(mode==='human')await q('UPDATE conversations SET human_takeover=1,handoff_version=handoff_version+1 WHERE id=?',[identity.conversationId]);
    if(mode==='connection')await q("UPDATE salla_connections SET syncStatus='paused' WHERE id=?",[connectionId]);
    await dispatchReplyPlan(plan(consent,text)).catch(()=>undefined);expect(mocks.send).toHaveBeenCalledTimes(1);expect(mocks.post).toHaveBeenCalledTimes(2);
  });
  it('a deleted ready operation cannot be recreated by conversational replay or a read-only check',async()=>{
    const {consent,quote}=await approved(),snapshot=typeof quote.external_snapshot==='string'?JSON.parse(quote.external_snapshot):quote.external_snapshot;
    await q('DELETE FROM salla_checkout_carts WHERE merchant_id=?',[merchant]);
    expect(await acceptSallaConversationOffer(consent,quote.id)).toBe(SALLA_CART_UNCERTAIN);
    await expect(readSallaCheckoutCart({requestId:snapshot.value.requestId,items:[{productId,quantity:2}]},merchant,user)).rejects.toThrow();
    expect(mocks.post).toHaveBeenCalledTimes(2);expect(await q('SELECT id FROM salla_checkout_carts WHERE merchant_id=?',[merchant])).toHaveLength(0);
  });
  it('keeps provider ambiguity under the same durable claim with no POST retry',async()=>{
    const {quote}=await offer(),consent=await incoming('نعم');mocks.post.mockRejectedValueOnce(Error('timeout'));
    expect(await acceptSallaConversationOffer(consent,quote.id)).toBe(SALLA_CART_UNCERTAIN);expect(await acceptSallaConversationOffer(consent,quote.id)).toBe(SALLA_CART_UNCERTAIN);
    expect(mocks.post).toHaveBeenCalledTimes(1);expect((await row()).execution_state).toBe('unknown');
  });
  it('serializes concurrent consent attempts and never starts a second provider cart',async()=>{
    const {quote}=await offer(),consent=await incoming('نعم');let enter!:()=>void,resume!:()=>void;const entered=new Promise<void>(r=>enter=r),wait=new Promise<void>(r=>resume=r);
    mocks.post.mockImplementationOnce(async()=>{enter();await wait;return{data:rawCart(true)};});const first=acceptSallaConversationOffer(consent,quote.id);await entered;
    try{expect(await acceptSallaConversationOffer(consent,quote.id)).toBe(SALLA_CART_UNCERTAIN);}finally{resume();}
    expect(await first).toContain('/checkout/');expect(mocks.post).toHaveBeenCalledTimes(2);
  });
  it('expires the old selection after a customer edit and requires the new offer delivery',async()=>{
    const {quote}=await offer(),edit=await incoming('عدّل الكمية إلى 3');mocks.llm.mockResolvedValueOnce(JSON.stringify([{productId,quantity:3}]));
    const text=await handleSallaCheckout({...edit,message:'عدّل الكمية إلى 3'});expect(text).toContain('× 3');expect((await row()).id).not.toBe(quote.id);
    const consent=await incoming('نعم');expect(await acceptSallaConversationOffer(consent,(await row()).id)).toBe(SALLA_CART_CHANGED);expect(mocks.post).not.toHaveBeenCalled();
  });
  it.each(['[]','[{"productId":999999,"quantity":1}]','[{"productId":1,"quantity":1,"price":1}]','not JSON'])('does not write a provider cart for invalid AI selection %s',async raw=>{
    mocks.llm.mockResolvedValueOnce(raw);expect(await handleSallaCheckout({...identity,message:'أريد شراء عدد 2 سماعة ساري'})).not.toContain('/checkout/');expect(mocks.post).not.toHaveBeenCalled();
  });
  it('ignores process questions and refuses forged message text or expired source',async()=>{
    expect(await handleSallaCheckout({...identity,message:'كيف أطلب؟'})).toBeNull();expect(mocks.llm).not.toHaveBeenCalled();
    expect(await handleSallaCheckout({...identity,message:'أريد شراء منتج آخر'})).toBe(SALLA_CART_UNCERTAIN);expect(mocks.llm).not.toHaveBeenCalled();
    await q('UPDATE messages SET createdAt=TIMESTAMPADD(DAY,-2,UTC_TIMESTAMP()) WHERE id=?',[identity.incomingMessageId]);await expect(prepareSallaConversationOffer(identity,[{productId,quantity:2}])).rejects.toThrow();
  });
  it('does not allow a marker or altered link text to become transport authority',async()=>{
    const {consent,text}=await approved(),p=plan(consent,text),e=p.effects[0];
    const guard={conversationId:consent.conversationId,incomingMessageId:consent.incomingMessageId,version:0};
    expect(await canDispatchSallaCheckoutReply({...e,text:text.replace('/synthetic/','/attacker/'),replyGuard:guard})).toBe(false);
    expect(await canDispatchSallaCheckoutReply({...e,text:'[SC-999999]',replyGuard:{...guard,incomingMessageId:identity.incomingMessageId}})).toBe(false);
    expect(await canDispatchSallaCheckoutReply({...e,text,replyGuard:undefined})).toBe(false);expect(mocks.post).toHaveBeenCalledTimes(2);
  });
  it.each(['consent','selection','human','expired'])('does not return a link after %s changes during the final cart read',async mode=>{
    const {quote}=await offer(),consent=await incoming('نعم');mocks.get.mockImplementationOnce(async()=>{
      if(mode==='consent')await q("UPDATE messages SET content='لا أريد' WHERE id=?",[consent.incomingMessageId]);
      if(mode==='selection')await q("UPDATE messages SET content='أريد كمية 4' WHERE id=?",[identity.incomingMessageId]);
      if(mode==='human')await q('UPDATE conversations SET human_takeover=1,handoff_version=handoff_version+1 WHERE id=?',[identity.conversationId]);
      if(mode==='expired')await q('UPDATE sales_quotations SET offer_expires_at=UTC_TIMESTAMP() WHERE id=?',[quote.id]);
      return{data:rawCart()};
    });expect(await acceptSallaConversationOffer(consent,quote.id)).toBe(SALLA_CART_UNCERTAIN);expect(mocks.post).toHaveBeenCalledTimes(2);
    expect((await row()).external_result).toBeNull();
  });
  it.each(['claim','result'])('does not repeat provider writes after a lost %s commit acknowledgement',async phase=>{
    const {quote}=await offer(),consent=await incoming('نعم'),pool=(await getPool())!,get=pool.getConnection.bind(pool);let hit=false;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get(),execute=c.execute.bind(c),commit=c.commit.bind(c);let changed=false;
      vi.spyOn(c,'execute').mockImplementation((async(sql:string,args:any[])=>{if(sql.includes(phase==='claim'?"SET status='viewed',consent_message_id=":"SET execution_state='succeeded',external_result="))changed=true;return execute(sql,args);})as any);
      vi.spyOn(c,'commit').mockImplementation(async()=>{await commit();if(changed&&!hit){hit=true;throw Error('lost commit acknowledgement');}});return c;
    });
    expect(await acceptSallaConversationOffer(consent,quote.id)).toBe(SALLA_CART_UNCERTAIN);vi.restoreAllMocks();
    const replay=await acceptSallaConversationOffer(consent,quote.id);
    expect(replay).toBe(phase==='claim'?SALLA_CART_UNCERTAIN:(await row()).external_result.value?.text||JSON.parse((await row()).external_result).value.text);
    expect(mocks.post).toHaveBeenCalledTimes(phase==='claim'?0:2);
  });
  it('keeps a rolled-back quote result under review without sending or generating another cart',async()=>{
    const {quote}=await offer(),consent=await incoming('نعم'),pool=(await getPool())!,get=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get(),execute=c.execute.bind(c);vi.spyOn(c,'execute').mockImplementation((async(sql:string,args:any[])=>{
      const result=await execute(sql,args);if(sql.includes("SET execution_state='succeeded',external_result="))throw Error('local write failure');return result;
    })as any);return c;});
    expect(await acceptSallaConversationOffer(consent,quote.id)).toBe(SALLA_CART_UNCERTAIN);vi.restoreAllMocks();
    expect(await acceptSallaConversationOffer(consent,quote.id)).toBe(SALLA_CART_UNCERTAIN);expect(mocks.post).toHaveBeenCalledTimes(2);expect((await row()).external_result).toBeNull();expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('preserves the non-Salla route when disconnected and blocks a pending Salla offer when paused',async()=>{
    const {quote}=await offer();await q("UPDATE salla_connections SET syncStatus='paused' WHERE id=?",[connectionId]);const consent=await incoming('نعم');
    expect(await handleSallaCheckout({...consent,message:'نعم'})).toBe(SALLA_CART_UNCERTAIN);expect(mocks.post).not.toHaveBeenCalled();
    await q('DELETE FROM sales_quotations WHERE id=?',[quote.id]);const purchase=await incoming('أريد شراء سماعة');
    expect(await handleSallaCheckout({...purchase,message:'أريد شراء سماعة'})).toBeNull();expect(mocks.llm).not.toHaveBeenCalled();
  });
  it('requires a new offer after remembered context has been deleted',async()=>{
    await offer();const consent=await incoming('نعم');expect(await handleSallaCheckout({...consent,message:'نعم',memoryHistoryCutoff:identity.incomingMessageId})).not.toContain('/checkout/');expect(mocks.post).not.toHaveBeenCalled();
  });
});
