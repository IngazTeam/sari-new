import { randomUUID } from 'node:crypto';
import { afterAll,afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
const http=vi.hoisted(()=>({post:vi.fn(),get:vi.fn()}));
vi.mock('axios',()=>({default:{create:()=>http}}));
import { getPool,closeDb } from '../db/connection';
import { assertDisposableDatabase,createDisposableMerchant,cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { encryptSecret } from '../security/secrets';
import { runSallaCheckoutCart } from './salla-checkout-carts';
import { recoverSallaCart,listSallaCartProblems } from './salla-cart-recovery';
import { policyArtifactDigest as digest } from '../ai/learning-policy-evaluation-bundle';
import { persistSallaCatalogRead } from './salla-catalog';
import { normalizeSallaProduct } from './salla-product-normalization';
import { createSyncLog,updateSyncLog } from '../db';

describe.skipIf(!process.env.DATABASE_URL)('Salla checkout cart actual MySQL boundary',()=>{
  const q=async(sql:string,args:any[]=[]):Promise<any>=>(await(await getPool())!.execute(sql,args))[0];
  let merchant:number,user:number,otherUser:number,users:number[],connectionId:number,productId:number,store:string,requestId:string;
  const input=()=>({requestId,items:[{productId,quantity:2}]});
  const run=()=>runSallaCheckoutCart(input(),merchant,user);
  const ledger=async()=>(await q('SELECT * FROM salla_checkout_carts WHERE merchant_id=? AND request_id=?',[merchant,requestId]))[0];
  const recover=()=>recoverSallaCart(merchant,user,{requestId});
  const problems=()=>listSallaCartProblems(merchant,user,{state:'review'});
  const park=async()=>{http.get.mockRejectedValueOnce(Error('lost read'));await expect(run()).rejects.toMatchObject({code:'cart_review'});http.post.mockClear();http.get.mockClear();};
  const decode=(v:any)=>typeof v==='string'?JSON.parse(v):v;
  const cart=(empty=false):any=>({status:200,success:true,data:{id:'abc123',store_id:store,checkout_url:'https://synthetic.example.test/checkout/abc123',currency:{code:'SAR'},
    amounts:{total:{amount:{value:empty?0:2.3,currency:'SAR'}}},items:empty?[]:[{id:'line-1',product_id:'123',sku:'SKU-123',quantity:2,variant_id:null,options:[]}]}});
  beforeEach(async()=>{
    assertDisposableDatabase();vi.stubEnv('FIELD_ENCRYPTION_KEY','synthetic-salla-checkout-cart-encryption-only');users=[];
    const m=await createDisposableMerchant('salla-cart'),o=await createDisposableMerchant('salla-cart-actor');users=[m.userId,o.userId];merchant=m.merchantId;user=m.userId;otherUser=o.userId;store=String(800000000+merchant);requestId=randomUUID();
    connectionId=Number((await q("INSERT INTO salla_connections(merchantId,salla_store_id,storeUrl,accessToken,syncStatus) VALUES (?,?,'https://synthetic.example.test',?,'active')",[merchant,store,encryptSecret('synthetic-token')])).insertId);
    const revision=await createSyncLog(merchant,'single_product','in_progress');
    productId=(await persistSallaCatalogRead({merchantId:merchant,connectionId,storeId:store,accessToken:'synthetic-token'},revision,'123',normalizeSallaProduct({id:123,sku:'SKU-123',name:'Synthetic',price:{amount:1,currency:'SAR'},quantity:5,unlimited_quantity:false,status:'sale',is_available:true,type:'product',options:[],skus:[]}))).localProductId!;
    await updateSyncLog(revision,'success',1);
    http.post.mockReset().mockImplementation(async(url:string)=>({data:url.endsWith('/generate')?cart(true):{status:200,success:true}}));
    http.get.mockReset().mockImplementation(async()=>({data:cart()}));
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants(users);vi.unstubAllEnvs();});afterAll(closeDb);
  it('persists the generation ID before the first item POST and keeps existing ready-cart behavior',async()=>{
    http.post.mockImplementation(async(url:string)=>{
      if(url.endsWith('/generate'))return{data:cart(true)};
      const row=await ledger();expect(decode(row.snapshot).checkpoint.value).toMatchObject({operationId:row.id,merchantId:merchant,requestId,cartId:'abc123'});
      return{data:{success:true,status:200}};
    });await run();expect((await ledger()).state).toBe('ready');
  });
  it('recovers only a fully matching existing cart by GET and leaves sales, payment, quotations and notices unchanged',async()=>{
    await park();expect((await problems()).items).toMatchObject([{requestId,diagnostic:'verifiable',cartId:'abc123'}]);
    const result=await recover();expect(result).toMatchObject({merchantId:merchant,requestId,cartId:'abc123',replayed:false,outcome:'contents_verified',paymentFact:'not_recorded',attribution:'not_recorded',customerMessage:'not_sent'});
    expect((await ledger()).state).toBe('ready');expect(decode((await ledger()).snapshot).recovery.value.reviewerUserId).toBe(user);
    expect(http.post).not.toHaveBeenCalled();expect(http.get).toHaveBeenCalledTimes(1);expect((await problems()).items).toEqual([]);
    const replay=await recover();expect(replay).toEqual({...result,replayed:true});expect(http.get).toHaveBeenCalledTimes(1);
    for(const table of ['sales_quotations','ai_sales_payment_facts','ai_sales_order_facts','whatsapp_message_deliveries'])expect(await q(`SELECT * FROM ${table} WHERE merchant_id=?`,[merchant])).toEqual([]);
    expect(await q('SELECT * FROM orders WHERE merchantId=?',[merchant])).toEqual([]);
  });
  it('serializes concurrent recoveries into one saved result',async()=>{
    await park();const results=await Promise.all(Array.from({length:4},recover));
    expect(results.filter(r=>!r.replayed)).toHaveLength(1);expect(new Set(results.map(r=>r.recovery.observedAt)).size).toBe(1);expect(http.post).not.toHaveBeenCalled();
  });
  it.each(['missing','legacy','preparing','dispatching','rejected','ready-without-recovery'])('never guesses or retries a %s attempt',async mode=>{
    if(mode==='missing'){http.post.mockRejectedValueOnce(Error('lost generate'));await expect(run()).rejects.toThrow();}
    else {await park();if(mode==='legacy')await q("UPDATE salla_checkout_carts SET snapshot=JSON_REMOVE(snapshot,'$.checkpoint') WHERE merchant_id=?",[merchant]);
      if(['preparing','dispatching','rejected'].includes(mode))await q('UPDATE salla_checkout_carts SET state=? WHERE merchant_id=?',[mode,merchant]);
      if(mode==='ready-without-recovery'){await recover();await q("UPDATE salla_checkout_carts SET snapshot=JSON_REMOVE(snapshot,'$.recovery') WHERE merchant_id=?",[merchant]);}}
    http.post.mockClear();http.get.mockClear();await expect(recover()).rejects.toThrow(/^Salla cart recovery unavailable$/);expect(http.post).not.toHaveBeenCalled();expect(http.get).not.toHaveBeenCalled();
  });
  it.each(['empty','quantity','product','extra','total','read'])('keeps a %s remote result under review without POST',async mode=>{
    await park();const raw=cart(mode==='empty');if(mode==='quantity')raw.data.items[0].quantity=3;if(mode==='product')raw.data.items[0].product_id='999';
    if(mode==='extra')raw.data.items.push({...raw.data.items[0],id:'other',product_id:'999',sku:'other'});if(mode==='total')raw.data.amounts.total.amount.value='1.001';
    if(mode==='read')http.get.mockRejectedValueOnce(Error('timeout'));else http.get.mockResolvedValueOnce({data:raw});
    await expect(recover()).rejects.toThrow();expect((await ledger()).state).toBe('review');expect(http.post).not.toHaveBeenCalled();
  });
  it.each(['actor','merchant','store','stock','token','checkpoint'])('rejects changed %s after GET before saving',async mode=>{
    await park();http.get.mockImplementationOnce(async()=>{
      if(mode==='actor')await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[user]);if(mode==='merchant')await q("UPDATE merchants SET status='suspended' WHERE id=?",[merchant]);
      if(mode==='store')await q('UPDATE salla_connections SET salla_store_id=? WHERE id=?',[store+'1',connectionId]);if(mode==='stock')await q('UPDATE products SET stock=0 WHERE id=?',[productId]);
      if(mode==='token')await q('UPDATE salla_connections SET accessToken=? WHERE id=?',[encryptSecret('other'),connectionId]);
      if(mode==='checkpoint')await q("UPDATE salla_checkout_carts SET snapshot=JSON_REMOVE(snapshot,'$.checkpoint') WHERE merchant_id=?",[merchant]);return{data:cart()};
    });await expect(recover()).rejects.toThrow();expect((await ledger()).state).toBe('review');expect(http.post).not.toHaveBeenCalled();
  });
  it.each(['outsider','viewer','revoked','inactive-user'])('blocks %s before recovery GET or listing',async mode=>{
    await park();let actor=otherUser;
    if(mode==='viewer'||mode==='revoked')await q('INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,?,?)',[merchant,actor,mode==='viewer'?'viewer':'manager',mode==='viewer'?1:0]);
    if(mode==='inactive-user'){actor=user;await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[user]);}
    await expect(recoverSallaCart(merchant,actor,{requestId})).rejects.toThrow();await expect(listSallaCartProblems(merchant,actor,{state:'review'})).rejects.toThrow();expect(http.get).not.toHaveBeenCalled();
  });
  it.each(['id','actor','digest','rehashed-id'])('rejects corrupted checkpoint %s',async mode=>{
    await park();const row=await ledger(),raw=decode(row.snapshot);if(mode==='id'||mode==='rehashed-id')raw.checkpoint.value.operationId++;
    if(mode==='actor')raw.checkpoint.value.actorUserId++;if(mode==='digest')raw.checkpoint.digest='0'.repeat(64);if(mode==='rehashed-id')raw.checkpoint.digest=digest(raw.checkpoint.value);
    await q('UPDATE salla_checkout_carts SET snapshot=? WHERE id=?',[JSON.stringify(raw),row.id]);
    expect((await problems()).items).toMatchObject([{diagnostic:'invalid_evidence',cartId:null}]);await expect(recover()).rejects.toThrow();expect(http.get).not.toHaveBeenCalled();
  });
  it('does not add items after a saved checkpoint loses its commit acknowledgement',async()=>{
    const pool=(await getPool())!,connect=pool.getConnection.bind(pool);let lost=false;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await connect(),execute=c.execute.bind(c),commit=c.commit.bind(c);let selected=false;
      vi.spyOn(c,'execute').mockImplementation((async(sql:any,args:any)=>{if(String(sql).startsWith('UPDATE salla_checkout_carts SET snapshot='))selected=true;return execute(sql,args);})as any);
      vi.spyOn(c,'commit').mockImplementation(async()=>{await commit();if(selected&&!lost){lost=true;throw Error('lost checkpoint acknowledgement');}});return c;});
    await expect(run()).rejects.toThrow();vi.restoreAllMocks();expect(http.post).toHaveBeenCalledTimes(1);expect(http.get).not.toHaveBeenCalled();expect((await problems()).items).toMatchObject([{cartId:'abc123',diagnostic:'verifiable'}]);
  });
  it('replays recovery after lost commit confirmation without another GET or POST',async()=>{
    await park();const pool=(await getPool())!,connect=pool.getConnection.bind(pool);let lost=false;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await connect(),commit=c.commit.bind(c);vi.spyOn(c,'commit').mockImplementationOnce(async()=>{await commit();if(!lost){lost=true;throw Error('lost recovery acknowledgement');}});return c;});
    await expect(recover()).rejects.toThrow();vi.restoreAllMocks();http.get.mockClear();expect((await recover()).replayed).toBe(true);expect(http.get).not.toHaveBeenCalled();expect(http.post).not.toHaveBeenCalled();
  });
  it('does not change the quote or cart when recovery storage rolls back',async()=>{
    await park();const before=await ledger(),pool=(await getPool())!,connect=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await connect(),execute=c.execute.bind(c);vi.spyOn(c,'execute').mockImplementation((async(sql:any,args:any)=>{const result=await execute(sql,args);if(String(sql).includes("SET state='ready'"))throw Error('lost write');return result;})as any);return c;});
    await expect(recover()).rejects.toThrow();vi.restoreAllMocks();expect(await ledger()).toEqual(before);expect(http.post).not.toHaveBeenCalled();
  });
  it.each(['actor','role'])('stops item writes if %s authority is revoked during generation',async mode=>{
    if(mode==='role')await q("INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",[merchant,user]);
    http.post.mockImplementationOnce(async()=>{if(mode==='actor')await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[user]);else await q("UPDATE merchant_members SET role='viewer' WHERE merchant_id=? AND user_id=?",[merchant,user]);return{data:cart(true)};});
    await expect(run()).rejects.toThrow();expect(http.post).toHaveBeenCalledTimes(1);expect(http.get).not.toHaveBeenCalled();expect(decode((await ledger()).snapshot).checkpoint.value.cartId).toBe('abc123');
  });
  it('keeps legacy ready rows readable without inventing a checkpoint',async()=>{
    await run();await q("UPDATE salla_checkout_carts SET snapshot=JSON_REMOVE(snapshot,'$.checkpoint') WHERE merchant_id=?",[merchant]);
    expect((await run()).replayed).toBe(true);expect(decode((await ledger()).snapshot).checkpoint).toBeUndefined();
  });
  it('rejects tampered recovery metadata on ready-cart replay',async()=>{
    await park();await recover();await q("UPDATE salla_checkout_carts SET snapshot=JSON_SET(snapshot,'$.recovery.value.reviewerUserId',?) WHERE merchant_id=?",[otherUser,merchant]);http.get.mockClear();
    await expect(run()).rejects.toMatchObject({code:'cart_unavailable'});await expect(recover()).rejects.toThrow();expect(http.get).not.toHaveBeenCalled();
  });
  it('paginates pending operations by exact state and hides other merchant operations',async()=>{
    await park();const row=await ledger();
    for(let n=0;n<21;n++)await q("INSERT INTO salla_checkout_carts(merchant_id,actor_user_id,request_id,request_hash,attempt_token,state,created_at,updated_at) VALUES (?,?,?,?,?,'review',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))",[merchant,user,randomUUID(),row.request_hash,randomUUID()]);
    const first=await problems(),second=await listSallaCartProblems(merchant,user,{state:'review',beforeId:first.nextCursor!});expect(first.items).toHaveLength(20);expect(second.items).toHaveLength(2);expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items,...second.items].map(i=>i.id)).size).toBe(22);expect((await listSallaCartProblems(merchant,user,{state:'preparing'})).items).toEqual([]);
    const [other]=await q('SELECT id FROM merchants WHERE userId=?',[otherUser]);expect((await listSallaCartProblems(other.id,otherUser,{state:'review'})).items).toEqual([]);expect(http.get).not.toHaveBeenCalled();
  });
  it('prepares only a guest cart and replays through a fresh read without an order, payment or follow-up',async()=>{
    const first=await run();expect(first).toMatchObject({orderCreated:false,observedTotalMinor:230,pricing:'review_at_checkout',replayed:false});
    expect((await ledger()).state).toBe('ready');expect(await run()).toEqual({...first,replayed:true});
    expect(http.post).toHaveBeenCalledTimes(2);expect(http.get).toHaveBeenCalledTimes(2);
    expect(await q('SELECT id FROM orders WHERE merchantId=?',[merchant])).toHaveLength(0);
    expect(await q('SELECT id FROM salla_order_creations WHERE merchant_id=?',[merchant])).toHaveLength(0);
    expect(await q('SELECT id FROM salla_creation_effects WHERE merchant_id=?',[merchant])).toHaveLength(0);
    expect(JSON.stringify(await ledger())).not.toContain('synthetic-token');expect(JSON.stringify(http.post.mock.calls)).not.toContain('Authorization');
  });
  it('admits only one simultaneous provider attempt',async()=>{
    let resume!:()=>void,enter!:()=>void;const wait=new Promise<void>(r=>resume=r),started=new Promise<void>(r=>enter=r);
    http.post.mockImplementationOnce(async()=>{enter();await wait;return{data:cart(true)};});
    const first=run();await started;try{await expect(run()).rejects.toMatchObject({code:'cart_pending'});}finally{resume();}await first;expect(http.post).toHaveBeenCalledTimes(2);
  });
  it.each(['actor','quantity','product'])('does not replay under changed %s identity',async mode=>{
    await run();const next=input();if(mode==='quantity')next.items[0].quantity=1;if(mode==='product')next.items[0].productId++;
    await expect(runSallaCheckoutCart(next,merchant,mode==='actor'?otherUser:user)).rejects.toMatchObject({code:'request_conflict'});expect(http.post).toHaveBeenCalledTimes(2);expect(http.get).toHaveBeenCalledTimes(1);
  });
  it('does not adopt another tenant product or leak their cart under the same key',async()=>{
    await run();const other=await createDisposableMerchant('cart-other');users.push(other.userId);
    await expect(runSallaCheckoutCart(input(),other.merchantId,other.userId)).rejects.toMatchObject({code:'cart_rejected'});expect(http.post).toHaveBeenCalledTimes(2);
  });
  it.each(['generate','add','read'])('parks an ambiguous %s and never repeats its writes',async mode=>{
    if(mode==='generate')http.post.mockRejectedValueOnce(Error('timeout'));
    if(mode==='add')http.post.mockResolvedValueOnce({data:cart(true)}).mockRejectedValueOnce(Error('timeout'));
    if(mode==='read')http.get.mockRejectedValueOnce(Error('timeout'));
    await expect(run()).rejects.toMatchObject({code:'cart_review'});await expect(run()).rejects.toMatchObject({code:'cart_review'});
    expect((await ledger()).state).toBe('review');expect(http.post).toHaveBeenCalledTimes(mode==='generate'?1:2);
  });
  it.each(['store','origin','token','connection','merchant','quantity','price','sku'])('stops further writes after %s changes during generation',async mode=>{
    http.post.mockImplementationOnce(async()=>{
      if(mode==='store')await q('UPDATE salla_connections SET salla_store_id=? WHERE id=?',[store+'1',connectionId]);
      if(mode==='origin')await q("UPDATE salla_connections SET storeUrl='https://other.test' WHERE id=?",[connectionId]);
      if(mode==='token')await q('UPDATE salla_connections SET accessToken=? WHERE id=?',[encryptSecret('other-token'),connectionId]);
      if(mode==='connection')await q("UPDATE salla_connections SET syncStatus='paused' WHERE id=?",[connectionId]);
      if(mode==='merchant')await q("UPDATE merchants SET status='suspended' WHERE id=?",[merchant]);
      if(mode==='quantity')await q('UPDATE products SET stock=0 WHERE id=?',[productId]);
      if(mode==='price')await q('UPDATE products SET price=200 WHERE id=?',[productId]);
      if(mode==='sku')await q("UPDATE products SET sku='OTHER' WHERE id=?",[productId]);
      return{data:cart(true)};
    });
    await expect(run()).rejects.toMatchObject({code:'cart_review'});expect(http.post).toHaveBeenCalledTimes(1);expect(http.get).not.toHaveBeenCalled();
  });
  it.each(['store','quantity','total','url','read-failed','connection','snapshot','proof'])('does not re-share changed %s on replay or create a replacement',async mode=>{
    await run();const response=cart();
    if(mode==='store')response.data.store_id='123';if(mode==='quantity')response.data.items[0].quantity=3;
    if(mode==='total')response.data.amounts.total.amount.value=3;if(mode==='url')response.data.checkout_url='https://other.test/checkout/abc123';
    if(mode==='connection')await q("UPDATE salla_connections SET syncStatus='paused' WHERE id=?",[connectionId]);
    if(mode==='snapshot')await q("UPDATE salla_checkout_carts SET snapshot=JSON_SET(snapshot,'$.value.context.storeId','123') WHERE merchant_id=?",[merchant]);
    if(mode==='proof')await q("UPDATE salla_checkout_carts SET result_json=JSON_REMOVE(result_json,'$.digest') WHERE merchant_id=?",[merchant]);
    if(mode==='read-failed')http.get.mockRejectedValueOnce(Error('timeout'));else http.get.mockResolvedValueOnce({data:response});
    await expect(run()).rejects.toMatchObject({code:'cart_unavailable'});expect(http.post).toHaveBeenCalledTimes(2);expect((await ledger()).state).toBe('ready');
  });
  it('rechecks authority after the final provider read before recording ready',async()=>{
    http.get.mockImplementationOnce(async()=>{await q("UPDATE merchants SET status='suspended' WHERE id=?",[merchant]);return{data:cart()};});
    await expect(run()).rejects.toMatchObject({code:'cart_review'});expect((await ledger()).result_json).toBeNull();expect(http.post).toHaveBeenCalledTimes(2);
  });
  it('refuses a replacement product using the same SKU and quantity before publishing the cart',async()=>{
    const response=cart();response.data.items[0].product_id='999';http.get.mockResolvedValueOnce({data:response});
    await expect(run()).rejects.toMatchObject({code:'cart_review'});expect((await ledger()).result_json).toBeNull();
    await expect(run()).rejects.toMatchObject({code:'cart_review'});expect(http.post).toHaveBeenCalledTimes(2);
  });
  it('supports a shared-host store and refuses replay after its store path changes',async()=>{
    await q("UPDATE salla_connections SET storeUrl='https://salla.sa/synthetic-store/' WHERE id=?",[connectionId]);
    const response=(empty=false)=>{const raw=cart(empty);raw.data.checkout_url='https://salla.sa/synthetic-store/checkout/abc123';return raw;};
    http.post.mockImplementation(async(url:string)=>({data:url.endsWith('/generate')?response(true):{status:200,success:true}}));http.get.mockResolvedValue({data:response()});
    expect((await run()).checkoutUrl).toBe('https://salla.sa/synthetic-store/checkout/abc123');expect((await run()).replayed).toBe(true);
    await q("UPDATE salla_connections SET storeUrl='https://salla.sa/other-store' WHERE id=?",[connectionId]);
    await expect(run()).rejects.toMatchObject({code:'cart_unavailable'});expect(http.post).toHaveBeenCalledTimes(2);expect(http.get).toHaveBeenCalledTimes(2);
  });
  it('rejects a cart link in another store path on the shared host before any item write',async()=>{
    await q("UPDATE salla_connections SET storeUrl='https://salla.sa/synthetic-store' WHERE id=?",[connectionId]);
    const raw=cart(true);raw.data.checkout_url='https://salla.sa/other-store/checkout/abc123';http.post.mockResolvedValueOnce({data:raw});
    await expect(run()).rejects.toMatchObject({code:'cart_review'});await expect(run()).rejects.toMatchObject({code:'cart_review'});
    expect(http.post).toHaveBeenCalledTimes(1);expect(http.get).not.toHaveBeenCalled();
  });
  it('recovers a lost completion acknowledgement by reading the same cart without another write',async()=>{
    const pool=(await getPool())!,get=pool.getConnection.bind(pool);let armed=false;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get(),execute=c.execute.bind(c),commit=c.commit.bind(c);let completing=false;
      vi.spyOn(c,'execute').mockImplementation((async(sql:string,args:any[])=>{if(sql.includes("SET state='ready'"))completing=true;return execute(sql,args);})as any);
      vi.spyOn(c,'commit').mockImplementation(async()=>{await commit();if(completing&&!armed){armed=true;throw Error('lost commit acknowledgement');}});return c;});
    expect((await run()).replayed).toBe(true);expect((await ledger()).state).toBe('ready');expect(http.post).toHaveBeenCalledTimes(2);expect(http.get).toHaveBeenCalledTimes(2);
  });
  it('keeps uncertain carts blocked after local completion rolls back',async()=>{
    const pool=(await getPool())!,get=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get(),execute=c.execute.bind(c);vi.spyOn(c,'execute').mockImplementation((async(sql:string,args:any[])=>{const r=await execute(sql,args);if(sql.includes("SET state='ready'"))throw Error('write failure');return r;})as any);return c;});
    await expect(run()).rejects.toMatchObject({code:'cart_review'});vi.restoreAllMocks();await expect(run()).rejects.toMatchObject({code:'cart_review'});expect(http.post).toHaveBeenCalledTimes(2);
  });
  it.each(['reservation','dispatch'])('does not start or resume HTTP after a lost %s acknowledgement',async phase=>{
    const pool=(await getPool())!,get=pool.getConnection.bind(pool);let armed=false;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get(),execute=c.execute.bind(c),commit=c.commit.bind(c);let selected=false;
      vi.spyOn(c,'execute').mockImplementation((async(sql:string,args:any[])=>{if(sql.includes(phase==='reservation'?'INSERT INTO salla_checkout_carts':"SET state='dispatching'"))selected=true;return execute(sql,args);})as any);
      vi.spyOn(c,'commit').mockImplementation(async()=>{await commit();if(selected&&!armed){armed=true;throw Error('lost acknowledgement');}});return c;});
    await expect(run()).rejects.toThrow();vi.restoreAllMocks();await expect(run()).rejects.toMatchObject({code:phase==='reservation'?'cart_pending':'cart_review'});expect(http.post).not.toHaveBeenCalled();
  });
  it.each(['table','unique'])('rejects missing %s before any provider request even after readiness was warmed',async mode=>{
    await run();requestId=randomUUID();http.post.mockClear();http.get.mockClear();
    if(mode==='table')await q('RENAME TABLE salla_checkout_carts TO salla_checkout_carts_missing_test');
    else await q('ALTER TABLE salla_checkout_carts DROP INDEX salla_cart_request');
    try{await expect(run()).rejects.toMatchObject({code:'DATABASE_SCHEMA_OUTDATED'});expect(http.post).not.toHaveBeenCalled();expect(http.get).not.toHaveBeenCalled();}
    finally{if(mode==='table')await q('RENAME TABLE salla_checkout_carts_missing_test TO salla_checkout_carts');else await q('ALTER TABLE salla_checkout_carts ADD UNIQUE KEY salla_cart_request (merchant_id,request_id)');}
  });
  it('adds and verifies every selected SKU, with stable request identity across item order',async()=>{
    const revision=await createSyncLog(merchant,'single_product','in_progress');
    const second=(await persistSallaCatalogRead({merchantId:merchant,connectionId,storeId:store,accessToken:'synthetic-token'},revision,'456',normalizeSallaProduct({id:456,sku:'SKU-456',name:'Second',price:{amount:2,currency:'SAR'},quantity:5,unlimited_quantity:false,status:'sale',is_available:true,type:'product',options:[],skus:[]}))).localProductId!;
    await updateSyncLog(revision,'success',1);const raw=cart();raw.data.items.push({id:'line-2',product_id:'456',sku:'SKU-456',quantity:1,variant_id:null,options:[]});raw.data.amounts.total.amount.value=4.6;
    http.get.mockResolvedValue({data:raw});const request={requestId,items:[{productId:second,quantity:1},{productId,quantity:2}]};
    const result=await runSallaCheckoutCart(request,merchant,user);expect(result.items).toHaveLength(2);expect(http.post).toHaveBeenCalledTimes(3);
    expect(http.post.mock.calls.slice(1).map(c=>c[1])).toEqual([{identifier_type:'sku',identifier:'SKU-123',quantity:2},{identifier_type:'sku',identifier:'SKU-456',quantity:1}]);
    expect((await runSallaCheckoutCart({...request,items:[...request.items].reverse()},merchant,user)).replayed).toBe(true);expect(http.post).toHaveBeenCalledTimes(3);
  });
});
