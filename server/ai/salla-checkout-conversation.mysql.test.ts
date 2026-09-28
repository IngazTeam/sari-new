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
