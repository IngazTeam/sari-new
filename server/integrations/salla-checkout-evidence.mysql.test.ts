import { randomUUID } from 'node:crypto';
import { afterAll,afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
const http=vi.hoisted(()=>({post:vi.fn(),get:vi.fn()}));
vi.mock('axios',()=>({default:{create:()=>http}}));
import { getPool,closeDb } from '../db/connection';
import { assertDisposableDatabase,createDisposableMerchant,cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { encryptSecret } from '../security/secrets';
import { runSallaCheckoutCart } from './salla-checkout-carts';
import { inspectSallaCheckoutEvidence,listSallaCheckoutCarts } from './salla-checkout-evidence';
import { persistSallaCatalogRead } from './salla-catalog';
import { normalizeSallaProduct } from './salla-product-normalization';
import { createSyncLog,updateSyncLog } from '../db';
import { policyArtifactDigest as digest } from '../ai/learning-policy-evaluation-bundle';

describe.skipIf(!process.env.DATABASE_URL)('Salla checkout reconciliation evidence actual MySQL',()=>{
  const q=async(sql:string,args:any[]=[]):Promise<any>=>(await(await getPool())!.execute(sql,args))[0];
  let merchant:number,user:number,otherUser:number,otherMerchant:number,users:number[],connectionId:number,productId:number,store:string,requestId:string;
  const cartId='9007199254740993';
  const input=()=>({requestId,orderId:'123',transactionId:'456'});
  const run=()=>inspectSallaCheckoutEvidence(merchant,user,input());
  const ledger=async()=>(await q('SELECT * FROM salla_checkout_carts WHERE merchant_id=? AND request_id=?',[merchant,requestId]))[0];
  const decode=(v:any)=>typeof v==='string'?JSON.parse(v):v;
  const cart=(empty=false):any=>({status:200,success:true,data:{id:cartId,store_id:store,checkout_url:'https://synthetic.example.test/checkout/'+cartId,currency:{code:'SAR'},
    amounts:{total:{amount:{value:empty?0:2.3,currency:'SAR'}}},items:empty?[]:[{id:'line-1',product_id:'123',sku:'SKU-123',quantity:2,variant_id:null,options:[]}]}});
  const order=():any=>({success:true,status:200,data:{id:123,checkout_id:cartId,draft:false,currency:'SAR',status:{slug:'paid'},amounts:{total:{amount:'3.30',currency:'SAR'}},customer:{mobile:'private-customer'}}});
  const transaction=():any=>({success:true,status:200,data:{id:456,references:{order_id:123,cart_id:cartId},status:{slug:'paid'},total:{amount:3.3,currency:'SAR'},card:{number:'private-card'}}});
  const respond=(url:string)=>({data:url.includes('/transactions/')?transaction():url.includes('/orders/')?order():cart()});
  beforeEach(async()=>{
    assertDisposableDatabase();vi.stubEnv('FIELD_ENCRYPTION_KEY','synthetic-salla-checkout-evidence-encryption');users=[];
    const m=await createDisposableMerchant('cart-evidence'),o=await createDisposableMerchant('evidence-actor');users=[m.userId,o.userId];merchant=m.merchantId;user=m.userId;otherUser=o.userId;otherMerchant=o.merchantId;store=String(800000000+merchant);requestId=randomUUID();
    connectionId=Number((await q("INSERT INTO salla_connections(merchantId,salla_store_id,storeUrl,accessToken,syncStatus) VALUES (?,?,'https://synthetic.example.test',?,'active')",[merchant,store,encryptSecret('synthetic-token')])).insertId);
    const revision=await createSyncLog(merchant,'single_product','in_progress');
    productId=(await persistSallaCatalogRead({merchantId:merchant,connectionId,storeId:store,accessToken:'synthetic-token'},revision,'123',normalizeSallaProduct({id:123,sku:'SKU-123',name:'Synthetic',price:{amount:1,currency:'SAR'},quantity:5,unlimited_quantity:false,status:'sale',is_available:true,type:'product',options:[],skus:[]}))).localProductId!;
    await updateSyncLog(revision,'success',1);
    http.post.mockReset().mockImplementation(async(url:string)=>({data:url.endsWith('/generate')?cart(true):{status:200,success:true}}));
    http.get.mockReset().mockImplementation(async(url:string)=>respond(url));
    await runSallaCheckoutCart({requestId,items:[{productId,quantity:2}]},merchant,user);http.post.mockClear();http.get.mockClear();
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants(users);vi.unstubAllEnvs();});afterAll(closeDb);
  it('compares exact canonical references and amounts without writing payment, attribution, orders or notifications',async()=>{
    const before=await ledger(),result=await run();
    expect(result).toMatchObject({requestId,cart:{cartId,preparedTotalMinor:230},order:{orderId:'123',totalMinor:330,status:'paid'},transaction:{transactionId:'456',totalMinor:330,status:'paid'},comparison:{checkoutReference:'equal',transactionOrderReference:'equal',transactionCartReference:'equal'},providerLinkContract:'not_verified',attribution:'not_recorded',paymentFact:'not_recorded'});
    expect(await ledger()).toEqual(before);expect(http.get).toHaveBeenCalledTimes(2);expect(http.post).not.toHaveBeenCalled();
    const serialized=JSON.stringify(result);for(const secret of ['private','synthetic-token','customer','card','storeUrl'])expect(serialized).not.toContain(secret);
    for(const table of ['ai_sales_payment_facts','ai_sales_order_facts','salla_order_projections','sales_quotations','whatsapp_message_deliveries'])expect(await q(`SELECT * FROM ${table} WHERE merchant_id=?`,[merchant])).toHaveLength(0);
    expect(await q('SELECT * FROM orders WHERE merchantId=?',[merchant])).toHaveLength(0);
  });
  it('omits the transaction request if no transaction identity is available',async()=>{
    const result=await inspectSallaCheckoutEvidence(merchant,user,{requestId,orderId:'123'});
    expect(result.transaction).toBeNull();expect(result.comparison.transactionOrderReference).toBe('not_checked');expect(http.get).toHaveBeenCalledTimes(1);
  });
  it('reports differing references without linking another transaction/order to the cart',async()=>{
    http.get.mockImplementation(async(url:string)=>{const raw=respond(url);if(url.includes('/orders/'))raw.data.data.checkout_id='other';else{raw.data.data.references.order_id=999;raw.data.data.references.cart_id='888';}return raw;});
    expect((await run()).comparison).toEqual({checkoutReference:'different',transactionOrderReference:'different',transactionCartReference:'different'});
  });
  it.each(['owner','manager','sales_supervisor'])('rechecks persisted %s membership',async role=>{
    await q('INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,?,1)',[merchant,otherUser,role]);
    expect((await inspectSallaCheckoutEvidence(merchant,otherUser,input())).paymentFact).toBe('not_recorded');
  });
  it.each(['other-tenant','other-user','viewer','inactive-member','inactive-user','inactive-merchant','bad-input','missing'])('blocks %s before network access',async mode=>{
    let actor=user,tenant=merchant,request=input();
    if(mode==='other-tenant')tenant=otherMerchant;if(mode==='other-user')actor=otherUser;
    if(mode==='viewer'||mode==='inactive-member'){actor=otherUser;await q('INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,?,?)',[merchant,actor,mode==='viewer'?'viewer':'manager',mode==='viewer'?1:0]);}
    if(mode==='inactive-user')await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[user]);
    if(mode==='inactive-merchant')await q("UPDATE merchants SET status='suspended' WHERE id=?",[merchant]);
    if(mode==='bad-input')request={...request,merchantId:otherMerchant} as any;if(mode==='missing')request.requestId=randomUUID();
    await expect(inspectSallaCheckoutEvidence(tenant,actor,request)).rejects.toThrow(/^Salla checkout evidence unavailable$/);expect(http.get).not.toHaveBeenCalled();
  });
  it.each(['store','origin','snapshot','result','request','state','invalid-rehashed'])('rejects corrupted saved %s before provider reads',async mode=>{
    if(mode==='store')await q('UPDATE salla_connections SET salla_store_id=? WHERE id=?',[store+'1',connectionId]);
    if(mode==='origin')await q("UPDATE salla_connections SET storeUrl='https://other.test' WHERE id=?",[connectionId]);
    if(mode==='snapshot')await q("UPDATE salla_checkout_carts SET snapshot=JSON_REMOVE(snapshot,'$.digest') WHERE merchant_id=?",[merchant]);
    if(mode==='result')await q("UPDATE salla_checkout_carts SET result_json=JSON_REMOVE(result_json,'$.digest') WHERE merchant_id=?",[merchant]);
    if(mode==='request')await q("UPDATE salla_checkout_carts SET request_hash=REPEAT('0',64) WHERE merchant_id=?",[merchant]);
    if(mode==='state')await q("UPDATE salla_checkout_carts SET state='review',result_json=NULL WHERE merchant_id=?",[merchant]);
    if(mode==='invalid-rehashed'){const row=await ledger(),raw=decode(row.result_json);raw.value.items[0].quantity=99;raw.digest=digest(raw.value);await q('UPDATE salla_checkout_carts SET result_json=? WHERE id=?',[JSON.stringify(raw),row.id]);}
    await expect(run()).rejects.toThrow(/^Salla checkout evidence unavailable$/);expect(http.get).not.toHaveBeenCalled();
  });
  it('preserves historical evidence when catalog price/stock change after checkout',async()=>{
    await q('UPDATE products SET stock=0,price=999,isActive=0 WHERE id=?',[productId]);expect((await run()).cart.preparedTotalMinor).toBe(230);
  });
  it.each(['token','store','origin','connection','actor','owner','cart-delete','cart-mutation','permission'])('rechecks %s after order HTTP and before transaction HTTP',async mode=>{
    if(mode==='permission')await q("INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",[merchant,user]);
    http.get.mockImplementationOnce(async(url:string)=>{
      if(mode==='token')await q('UPDATE salla_connections SET accessToken=? WHERE id=?',[encryptSecret('replacement'),connectionId]);
      if(mode==='store')await q('UPDATE salla_connections SET salla_store_id=? WHERE id=?',[store+'1',connectionId]);
      if(mode==='origin')await q("UPDATE salla_connections SET storeUrl='https://other.test' WHERE id=?",[connectionId]);
      if(mode==='connection')await q("UPDATE salla_connections SET syncStatus='paused' WHERE id=?",[connectionId]);
      if(mode==='actor')await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[user]);
      if(mode==='owner')await q('UPDATE merchants SET userId=? WHERE id=?',[otherUser,merchant]);
      if(mode==='cart-delete')await q('DELETE FROM salla_checkout_carts WHERE merchant_id=?',[merchant]);
      if(mode==='cart-mutation')await q('UPDATE salla_checkout_carts SET actor_user_id=? WHERE merchant_id=?',[otherUser,merchant]);
      if(mode==='permission')await q("UPDATE merchant_members SET role='viewer' WHERE merchant_id=? AND user_id=?",[merchant,user]);
      return respond(url);
    });await expect(run()).rejects.toThrow(/^Salla checkout evidence unavailable$/);expect(http.get).toHaveBeenCalledTimes(1);expect(http.post).not.toHaveBeenCalled();
  });
  it('withholds final evidence when authority is revoked during transaction HTTP',async()=>{
    http.get.mockImplementation(async(url:string)=>{if(url.includes('/transactions/'))await q("UPDATE salla_connections SET syncStatus='paused' WHERE id=?",[connectionId]);return respond(url);});
    await expect(run()).rejects.toThrow(/^Salla checkout evidence unavailable$/);expect(http.get).toHaveBeenCalledTimes(2);
  });
  it.each(['order','transaction'])('does not hide a failed %s read behind a partial success',async mode=>{
    http.get.mockImplementation(async(url:string)=>{if(url.includes(mode==='order'?'/orders/':'/transactions/'))throw Error('private OAuth transport failure');return respond(url);});
    await expect(run()).rejects.toThrow(/^Salla checkout evidence unavailable$/);expect(await ledger()).toMatchObject({state:'ready'});expect(http.post).not.toHaveBeenCalled();
  });
  it('can repeat concurrent read-only inspections without modifying the operation',async()=>{
    const before=await ledger();const results=await Promise.all(Array.from({length:3},run));expect(results).toHaveLength(3);expect(await ledger()).toEqual(before);expect(http.post).not.toHaveBeenCalled();
  });
  it('discovers owned ready carts without provider calls or private content',async()=>{
    const before=await ledger(),result=await listSallaCheckoutCarts(merchant,user,{});
    expect(result).toEqual({merchantId:merchant,items:[{id:before.id,requestId,createdAt:expect.any(String),cart:{cartId,preparedTotalMinor:230,currency:'SAR'}}],nextCursor:null});
    expect(await ledger()).toEqual(before);expect(http.get).not.toHaveBeenCalled();expect(http.post).not.toHaveBeenCalled();
    for(const key of ['token','snapshot','customer','actor_user_id','checkoutUrl','sku'])expect(JSON.stringify(result)).not.toContain(key);
    expect((await listSallaCheckoutCarts(otherMerchant,otherUser,{})).items).toHaveLength(0);
  });
  it.each(['other-user','viewer','revoked','inactive-user','inactive-merchant'])('refuses %s listing in persisted authorization',async mode=>{
    let actor=otherUser;
    if(mode==='viewer'||mode==='revoked')await q('INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,?,?)',[merchant,actor,mode==='viewer'?'viewer':'manager',mode==='viewer'?1:0]);
    if(mode==='inactive-user'){actor=user;await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[user]);}
    if(mode==='inactive-merchant'){actor=user;await q("UPDATE merchants SET status='suspended' WHERE id=?",[merchant]);}
    await expect(listSallaCheckoutCarts(merchant,actor,{})).rejects.toThrow(/^Salla checkout evidence unavailable$/);expect(http.get).not.toHaveBeenCalled();
  });
  it.each(['corruption','store','connection','token'])('shows the operation but withholds %s evidence',async mode=>{
    if(mode==='corruption')await q("UPDATE salla_checkout_carts SET result_json=JSON_REMOVE(result_json,'$.digest') WHERE merchant_id=?",[merchant]);
    if(mode==='store')await q('UPDATE salla_connections SET salla_store_id=? WHERE id=?',[store+'1',connectionId]);
    if(mode==='connection')await q("UPDATE salla_connections SET syncStatus='paused' WHERE id=?",[connectionId]);
    if(mode==='token')await q("UPDATE salla_connections SET accessToken='' WHERE id=?",[connectionId]);
    expect((await listSallaCheckoutCarts(merchant,user,{})).items).toMatchObject([{requestId,cart:null}]);expect(http.get).not.toHaveBeenCalled();
  });
  it('paginates twenty descending ready operations without overlap or adoption of unknown attempts',async()=>{
    const row=await ledger();
    for(let i=0;i<24;i++)await q(`INSERT INTO salla_checkout_carts(merchant_id,actor_user_id,request_id,request_hash,attempt_token,state,snapshot,result_json,created_at,updated_at)
      SELECT merchant_id,actor_user_id,?,request_hash,?,'ready',snapshot,result_json,created_at,updated_at FROM salla_checkout_carts WHERE id=?`,[randomUUID(),randomUUID(),row.id]);
    await q("INSERT INTO salla_checkout_carts(merchant_id,actor_user_id,request_id,request_hash,attempt_token,state,created_at,updated_at) VALUES (?,?,?,?,?,'review',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))",[merchant,user,randomUUID(),row.request_hash,randomUUID()]);
    const first=await listSallaCheckoutCarts(merchant,user,{}),second=await listSallaCheckoutCarts(merchant,user,{beforeId:first.nextCursor!});
    expect(first.items).toHaveLength(20);expect(first.nextCursor).toBe(first.items.at(-1)?.id);expect(second.items).toHaveLength(5);expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items,...second.items].map(i=>i.id)).size).toBe(25);expect(second.items.at(-1)?.requestId).toBe(requestId);expect(http.get).not.toHaveBeenCalled();
  });
});
