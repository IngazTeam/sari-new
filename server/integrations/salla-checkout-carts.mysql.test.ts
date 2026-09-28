import { randomUUID } from 'node:crypto';
import { afterAll,afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
const http=vi.hoisted(()=>({post:vi.fn(),get:vi.fn()}));
vi.mock('axios',()=>({default:{create:()=>http}}));
import { getPool,closeDb } from '../db/connection';
import { assertDisposableDatabase,createDisposableMerchant,cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { encryptSecret } from '../security/secrets';
import { runSallaCheckoutCart } from './salla-checkout-carts';
import { persistSallaCatalogRead } from './salla-catalog';
import { normalizeSallaProduct } from './salla-product-normalization';
import { createSyncLog,updateSyncLog } from '../db';

describe.skipIf(!process.env.DATABASE_URL)('Salla checkout cart actual MySQL boundary',()=>{
  const q=async(sql:string,args:any[]=[]):Promise<any>=>(await(await getPool())!.execute(sql,args))[0];
  let merchant:number,user:number,otherUser:number,users:number[],connectionId:number,productId:number,store:string,requestId:string;
  const input=()=>({requestId,items:[{productId,quantity:2}]});
  const run=()=>runSallaCheckoutCart(input(),merchant,user);
  const ledger=async()=>(await q('SELECT * FROM salla_checkout_carts WHERE merchant_id=? AND request_id=?',[merchant,requestId]))[0];
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
