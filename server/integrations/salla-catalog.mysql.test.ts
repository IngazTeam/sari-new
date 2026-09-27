import { randomUUID,createHash } from 'node:crypto';
import { afterAll,afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
const http=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
const model=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('axios',()=>({default:{create:()=>http}}));
vi.mock('../_core/llm',()=>({invokeLLM:model.invoke}));
import { getPool,closeDb } from '../db/connection';
import { assertDisposableDatabase,createDisposableMerchant,cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { encryptSecret } from '../security/secrets';
import { SallaIntegration } from './salla';
import { sallaCatalogAuthority,persistSallaCatalogRead,selectSallaOrderProduct,readSallaOrderExtractionCatalog } from './salla-catalog';
import { parseOrderMessage,createOrderFromChat } from '../automation/order-from-chat';
import { normalizeSallaProduct } from './salla-product-normalization';
import { runSallaOrderCreation,dispatchSallaCreation } from './salla-order-creation';
import { runSallaWebhookReceiptBatch } from './salla-webhook-receipts';
import { createSyncLog,getProductsByMerchantId,getActiveProductsByMerchantId,getProductCountByMerchantId } from '../db';
import { getProductsByMerchantId as extracted } from '../db/products';
import { listApiProducts } from '../api/api-read-model';
import { catalogVisibleSql } from './catalog-scope';

describe.skipIf(!process.env.DATABASE_URL)('Salla catalogue actual MySQL and HTTP boundary',()=>{
  const q=async(sql:string,args:any[]=[]):Promise<any>=>(await(await getPool())!.execute(sql,args))[0];
  const product=(id='123',patch:any={})=>({id,name:'Synthetic',price:{amount:19.99,currency:'SAR'},regular_price:{amount:25,currency:'SAR'},quantity:5,unlimited_quantity:false,status:'sale',is_available:true,type:'product',options:[],skus:[],...patch});
  const response=(id='123',patch:any={})=>({data:{status:200,success:true,data:product(id,patch)}});
  const missing=()=>({response:{status:404,data:{status:404,success:false}}});
  let merchant:number,user:number,users:number[],store:string,connectionId:number,salla:SallaIntegration;
  const authority=()=>sallaCatalogAuthority(merchant,'synthetic-token');
  const rows=()=>q('SELECT * FROM products WHERE merchantId=? ORDER BY id',[merchant]);
  const bindings=()=>q('SELECT * FROM salla_product_projections WHERE merchant_id=? ORDER BY id',[merchant]);
  const revision=()=>createSyncLog(merchant,'single_product','in_progress');
  const log=async()=>(await q('SELECT * FROM sync_logs WHERE merchantId=? ORDER BY id DESC LIMIT 1',[merchant]))[0];
  async function receipt(event='product.updated',status='processing') {
    const token=randomUUID(),key=createHash('sha256').update(token).digest('hex');
    const r=await q(`INSERT INTO salla_webhook_receipts(merchant_id,salla_store_id,event_key,event_type,resource_id,status,processing_token,claimed_at) VALUES (?,?,?,?,'123',?,?,NOW(3))`,[merchant,store,key,event,status,token]);
    return {id:Number(r.insertId),storeId:store,productId:'123',token};
  }
  beforeEach(async()=>{
    assertDisposableDatabase();vi.stubEnv('FIELD_ENCRYPTION_KEY','synthetic-catalog-encryption-only');
    const m=await createDisposableMerchant('salla-catalog');merchant=m.merchantId;user=m.userId;users=[user];store=String(700000000+merchant);
    connectionId=Number((await q("INSERT INTO salla_connections(merchantId,salla_store_id,storeUrl,accessToken,syncStatus) VALUES (?,?,'https://synthetic.example.test',?,'active')",[merchant,store,encryptSecret('synthetic-token')])).insertId);
    salla=new SallaIntegration(merchant,'synthetic-token');vi.spyOn(salla as any,'sleep').mockResolvedValue(undefined);
    http.get.mockReset().mockResolvedValue(response());http.post.mockReset();
    model.invoke.mockReset().mockResolvedValue({choices:[{finish_reason:'stop',message:{content:JSON.stringify({products:[{name:'Synthetic',quantity:2}],unresolved:[]})}}]});
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants(users);vi.unstubAllEnvs();});afterAll(closeDb);

  it('projects verified minor money and exposes one consistent catalogue across all read paths',async()=>{
    await salla.syncSingleProduct('123');const [p]=await rows(),[b]=await bindings();
    expect(p).toMatchObject({sallaProductId:`salla:${store}:123`,price:1999,price_unit:'minor',compare_at_price:2500,stock:5,isActive:1});
    expect(b).toMatchObject({local_product_id:p.id,connection_id:connectionId,archived:0});expect(b.read_revision).toBeGreaterThan(0);expect((await log()).status).toBe('success');
    expect((await getProductsByMerchantId(merchant)).map(p=>p.id)).toEqual([p.id]);expect(await getActiveProductsByMerchantId(merchant)).toHaveLength(1);expect(await extracted(merchant)).toHaveLength(1);expect(await getProductCountByMerchantId(merchant)).toBe(1);expect((await listApiProducts(merchant,{limit:10,offset:0} as any)).total).toBe(1);
    expect(await q(`SELECT p.id FROM products p WHERE p.merchantId=? AND ${catalogVisibleSql('p')}`,[merchant])).toHaveLength(1);
  });
  it('preserves legacy rows without guessing provenance and keeps other sources visible',async()=>{
    for(const alias of ['123','api:1','byaan:1','website:1',null])await q("INSERT INTO products(merchantId,sallaProductId,name,price,price_unit,stock) VALUES (?,?,'Legacy',700,'minor',10)",[merchant,alias]);
    await salla.syncSingleProduct('123');expect(await rows()).toHaveLength(6);expect(await getProductsByMerchantId(merchant)).toHaveLength(5);
    const old=(await rows())[0];expect(old.price).toBe(700);await expect(selectSallaOrderProduct(await authority(),old.id,1)).rejects.toThrow();
  });
  it('separates identical product IDs after reconnect and hides the previous store',async()=>{
    await salla.syncSingleProduct('123');const old=(await rows())[0];store+='1';await q('UPDATE salla_connections SET salla_store_id=? WHERE id=?',[store,connectionId]);
    http.get.mockResolvedValue(response('123',{price:{amount:39.99,currency:'SAR'}}));await salla.syncSingleProduct('123');
    expect(await rows()).toHaveLength(2);expect((await rows())[0].price).toBe(1999);const visible=await getProductsByMerchantId(merchant);expect(visible).toHaveLength(1);expect(visible[0].price).toBe(3999);expect(visible[0].id).not.toBe(old.id);await expect(selectSallaOrderProduct(await authority(),old.id,1)).rejects.toThrow();
  });
  it.each(['store','token','paused'])('rejects a %s change during HTTP without changing the new connection or saving stale data',async mode=>{
    http.get.mockImplementationOnce(async()=>{
      if(mode==='store')await q('UPDATE salla_connections SET salla_store_id=? WHERE id=?',[store+'1',connectionId]);
      if(mode==='token')await q('UPDATE salla_connections SET accessToken=? WHERE id=?',[encryptSecret('rotated'),connectionId]);
      if(mode==='paused')await q("UPDATE salla_connections SET syncStatus='paused' WHERE id=?",[connectionId]);return response();
    });
    await expect(salla.syncSingleProduct('123')).rejects.toThrow('Salla catalog synchronization unavailable');expect(await rows()).toHaveLength(0);expect((await log()).status).toBe('failed');
    expect((await q('SELECT syncStatus FROM salla_connections WHERE id=?',[connectionId]))[0].syncStatus).toBe(mode==='paused'?'paused':'active');
  });
  it.each(['wrong-token','inactive'])('blocks %s before HTTP',async mode=>{
    if(mode==='inactive')await q("UPDATE salla_connections SET syncStatus='paused' WHERE id=?",[connectionId]);
    await expect(new SallaIntegration(merchant,mode==='wrong-token'?'other':'synthetic-token').syncSingleProduct('123')).rejects.toThrow();expect(http.get).not.toHaveBeenCalled();
  });
  it('never overwrites a later completed read with an older delayed response',async()=>{
    let entered!:()=>void,release!:(v:any)=>void;const ready=new Promise<void>(r=>entered=r),hold=new Promise<any>(r=>release=r);
    http.get.mockImplementationOnce(()=>{entered();return hold;});const older=salla.syncSingleProduct('123');await ready;
    try{http.get.mockResolvedValue(response('123',{price:{amount:88,currency:'SAR'}}));await salla.syncSingleProduct('123');}finally{release(response());}
    await older;expect((await rows())[0].price).toBe(8800);expect(await bindings()).toHaveLength(1);
  });
  it('keeps a tombstone for 404 before create, preventing an older response from resurrecting it',async()=>{
    const a=await authority(),old=await revision(),newer=await revision();await persistSallaCatalogRead(a,newer,'123',null);
    expect(await persistSallaCatalogRead(a,old,'123',normalizeSallaProduct(product()))).toMatchObject({applied:false,localProductId:null});expect(await rows()).toHaveLength(0);
    await salla.syncSingleProduct('123');expect(await rows()).toHaveLength(1);expect((await bindings())[0].archived).toBe(0);
  });
  it('reconciles a stale delete webhook against the current provider instead of deleting a live product',async()=>{
    await salla.syncSingleProduct('123');const r=await receipt('product.deleted');http.get.mockResolvedValue(response('123',{quantity:9}));
    await salla.syncSingleProduct('123',r);expect((await rows())[0].stock).toBe(9);expect((await q('SELECT effect_applied FROM salla_webhook_receipts WHERE id=?',[r.id]))[0].effect_applied).toBe(1);
  });
  it('archives a verified missing product with the receipt atomically and preserves its local identity',async()=>{
    await salla.syncSingleProduct('123');const id=(await rows())[0].id,r=await receipt('product.deleted');http.get.mockRejectedValue(missing());await salla.syncSingleProduct('123',r);
    expect((await rows())[0]).toMatchObject({id,status:'archived',isActive:0,stock:0});expect((await bindings())[0].archived).toBe(1);expect(await getProductsByMerchantId(merchant)).toHaveLength(0);
  });
  it.each(['forbidden','timeout','bad-404','wrong-id'])('does not archive or leak HTTP data on %s',async mode=>{
    await salla.syncSingleProduct('123');const before=await rows();
    if(mode==='wrong-id')http.get.mockResolvedValue(response('999'));else http.get.mockRejectedValue(mode==='timeout'?Error('secret bearer payload'):{response:{status:mode==='forbidden'?403:404,data:{status:404,success:true}},config:{headers:{Authorization:'secret bearer payload'}}});
    await expect(salla.syncSingleProduct('123')).rejects.toThrow('Salla catalog synchronization unavailable');expect(await rows()).toEqual(before);expect(JSON.stringify(await log())).not.toContain('secret bearer payload');expect((await log()).status).toBe('failed');
  });
  it.each(['token','expired','store','product','already-applied'])('rolls back product changes for a lost or mismatched receipt %s',async mode=>{
    const r=await receipt();if(mode==='token')r.token=randomUUID();if(mode==='expired')await q('UPDATE salla_webhook_receipts SET claimed_at=DATE_SUB(NOW(3),INTERVAL 11 MINUTE) WHERE id=?',[r.id]);if(mode==='store')r.storeId+='1';if(mode==='product')r.productId='999';if(mode==='already-applied')await q('UPDATE salla_webhook_receipts SET effect_applied=1 WHERE id=?',[r.id]);
    await expect(salla.syncSingleProduct('123',r)).rejects.toThrow();expect(await rows()).toHaveLength(0);expect(await bindings()).toHaveLength(0);
  });
  it('rolls back the product and binding when writing the effect flag fails',async()=>{
    const r=await receipt(),pool=(await getPool())!,get=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get(),exec=c.execute.bind(c);vi.spyOn(c,'execute').mockImplementation((async(sql:string,args:any[])=>{const v=await exec(sql,args);if(sql.includes('SET effect_applied=1'))throw Error('write failed');return v;})as any);return c;});
    await expect(salla.syncSingleProduct('123',r)).rejects.toThrow();vi.restoreAllMocks();expect(await rows()).toHaveLength(0);expect(await bindings()).toHaveLength(0);expect((await q('SELECT effect_applied FROM salla_webhook_receipts WHERE id=?',[r.id]))[0].effect_applied).toBe(0);
  });
  it('recovers a committed receipt after a lost acknowledgement without applying HTTP twice',async()=>{
    const r=await receipt(),pool=(await getPool())!,get=pool.getConnection.bind(pool);
    vi.spyOn(pool,'getConnection').mockImplementationOnce(async()=>{const c=await get(),commit=c.commit.bind(c);vi.spyOn(c,'commit').mockImplementationOnce(async()=>{await commit();throw Error('lost acknowledgement');});return c;});
    await expect(salla.syncSingleProduct('123',r)).rejects.toThrow();vi.restoreAllMocks();expect(await rows()).toHaveLength(1);
    await q("UPDATE salla_webhook_receipts SET status='failed',available_at=NOW(3),processing_token=NULL WHERE id=?",[r.id]);
    await runSallaWebhookReceiptBatch(10);expect(http.get).toHaveBeenCalledTimes(1);expect((await q('SELECT status FROM salla_webhook_receipts WHERE id=?',[r.id]))[0].status).toBe('completed');
  });
  it('processes an actual pending product receipt through claim, GET, projection and completion',async()=>{
    const r=await receipt('product.updated','pending');await runSallaWebhookReceiptBatch(10);expect(await rows()).toHaveLength(1);
    expect((await q('SELECT status,effect_applied FROM salla_webhook_receipts WHERE id=?',[r.id]))[0]).toEqual({status:'completed',effect_applied:1});
  });
  it('paginates full sync using currentPage/totalPages rather than a missing hasMorePages',async()=>{
    http.get.mockImplementation(async(_url,config)=>({data:{status:200,success:true,data:[product(String(config.params.page))],pagination:{currentPage:config.params.page,totalPages:2}}}));
    expect(await salla.fullSync()).toEqual({success:true,synced:2});expect(await rows()).toHaveLength(2);expect(http.get).toHaveBeenCalledTimes(2);
  });
  it.each(['duplicate','malformed','rate-limit'])('records bounded full sync failure on %s and preserves connection authority',async mode=>{
    if(mode==='rate-limit')http.get.mockRejectedValue({response:{status:429}});else http.get.mockImplementation(async(_url,config)=>({data:{status:200,success:true,data:[mode==='malformed'?{id:1}:product()],pagination:{currentPage:config.params.page,totalPages:2}}}));
    await expect(salla.fullSync()).rejects.toThrow();expect((await log()).status).toBe('failed');expect(http.get.mock.calls.length).toBeLessThanOrEqual(2);expect((await q('SELECT syncStatus FROM salla_connections WHERE id=?',[connectionId]))[0].syncStatus).toBe('active');
  });
  it('stock refresh only calls verified current-store external IDs and leaves native/Byaan/Zid/API data intact',async()=>{
    await salla.syncSingleProduct('123');for(const alias of ['999','api:1','byaan:1','website:1','zid:1',null])await q("INSERT INTO products(merchantId,sallaProductId,name,price,stock) VALUES (?,?,'Other source',10,7)",[merchant,alias]);
    const before=(await rows()).slice(1);http.get.mockClear().mockResolvedValue(response('123',{quantity:4}));expect(await salla.syncStock()).toEqual({success:true,updated:1});
    expect(http.get.mock.calls.map(c=>c[0])).toEqual(['https://api.salla.dev/admin/v2/products/123']);expect((await rows()).slice(1)).toEqual(before);expect((await rows())[0].stock).toBe(4);
  });
  it('does not report success for a failed stock refresh',async()=>{await salla.syncSingleProduct('123');http.get.mockRejectedValue(Error('timeout'));await expect(salla.syncStock()).rejects.toThrow();expect((await log()).status).toBe('failed');});
  it.each(['table','unique'])('rechecks missing catalogue %s after readiness was previously warm, before HTTP',async mode=>{
    await salla.syncSingleProduct('123');http.get.mockClear();
    try {
      if(mode==='table')await q('RENAME TABLE salla_product_projections TO salla_product_projections_fixture_hidden');
      else await q('ALTER TABLE salla_product_projections DROP INDEX salla_product_local');
      await expect(salla.syncSingleProduct('123')).rejects.toMatchObject({code:'DATABASE_SCHEMA_OUTDATED'});expect(http.get).not.toHaveBeenCalled();
    } finally {
      if(mode==='table')await q('RENAME TABLE salla_product_projections_fixture_hidden TO salla_product_projections');
      else await q('ALTER TABLE salla_product_projections ADD UNIQUE KEY salla_product_local(local_product_id)');
    }
  });
  it('does not reuse a completed or another tenant read revision',async()=>{
    await salla.syncSingleProduct('123');const old=await log(),a=await authority(),before=await rows();
    await expect(persistSallaCatalogRead(a,old.id,'123',normalizeSallaProduct(product('123',{quantity:1})))).rejects.toThrow('Catalog read revision unavailable');
    const other=await createDisposableMerchant('foreign-revision');users.push(other.userId);const revision=await createSyncLog(other.merchantId,'single_product','in_progress');
    await expect(persistSallaCatalogRead(a,revision,'123',null)).rejects.toThrow('Catalog read revision unavailable');expect(await rows()).toEqual(before);
  });
  it('rejects a forged namespaced alias rather than adopting someone else\'s row',async()=>{
    await q("INSERT INTO products(merchantId,sallaProductId,name,price,price_unit,stock) VALUES (?,?,'Forged',1,'minor',5)",[merchant,`salla:${store}:123`]);const [p]=await rows();
    expect(await getProductsByMerchantId(merchant)).toHaveLength(0);await expect(salla.syncSingleProduct('123')).rejects.toThrow();expect((await rows())[0].price).toBe(1);expect(await bindings()).toHaveLength(0);await expect(selectSallaOrderProduct(await authority(),p.id,1)).rejects.toThrow();
  });
  it('rejects a foreign tenant local product pointer without touching either catalogue',async()=>{
    const other=await createDisposableMerchant('foreign-catalog');users.push(other.userId);const p=await q("INSERT INTO products(merchantId,name,price) VALUES (?,'Foreign',1)",[other.merchantId]);await salla.syncSingleProduct('123');await q('UPDATE salla_product_projections SET local_product_id=? WHERE merchant_id=?',[p.insertId,merchant]);const before=await rows();
    await expect(salla.syncSingleProduct('123')).rejects.toThrow();expect(await rows()).toEqual(before);expect((await q('SELECT price FROM products WHERE id=?',[p.insertId]))[0].price).toBe(1);await expect(selectSallaOrderProduct(await authority(),p.insertId,1)).rejects.toThrow();
  });
  it('can resynchronize a manually deleted local copy without reusing its historical ID',async()=>{
    await salla.syncSingleProduct('123');const [old]=await rows(),[binding]=await bindings(),a=await authority(),stale=await revision();
    await q('DELETE FROM products WHERE id=?',[old.id]);await salla.syncSingleProduct('123');const [fresh]=await rows();
    expect(fresh.id).not.toBe(old.id);expect(fresh.price).toBe(1999);expect(await bindings()).toHaveLength(1);expect((await bindings())[0]).toMatchObject({id:binding.id,local_product_id:fresh.id});
    expect(await persistSallaCatalogRead(a,stale,'123',null)).toMatchObject({applied:false});expect((await rows())[0].isActive).toBe(1);
  });
  it('keeps a tombstone when both the local and provider copy are gone',async()=>{
    await salla.syncSingleProduct('123');await q('DELETE FROM products WHERE merchantId=?',[merchant]);http.get.mockRejectedValue(missing());
    await salla.syncSingleProduct('123');expect(await rows()).toHaveLength(0);expect((await bindings())[0]).toMatchObject({local_product_id:null,archived:1});
  });
  it.each(['unverified','currency','stock','variant','inactive'])('rejects unsafe checkout %s before dispatch',async mode=>{
    await salla.syncSingleProduct('123');const id=(await rows())[0].id;
    const change={unverified:"price_unit='unverified'",currency:"currency='USD'",stock:'stock=0',variant:'has_variants=1',inactive:'isActive=0'}[mode];await q('UPDATE products SET '+change+' WHERE id=?',[id]);await expect(selectSallaOrderProduct(await authority(),id,1)).rejects.toThrow();expect(http.post).not.toHaveBeenCalled();
  });
  it.each(['revision','price','stock','duplicate'])('rechecks %s inside the durable dispatch transaction',async mode=>{
    await salla.syncSingleProduct('123');const id=(await rows())[0].id,a=await authority(),p=await selectSallaOrderProduct(a,id,1);
    if(mode==='revision')await salla.syncSingleProduct('123');if(mode==='price')await q('UPDATE products SET price=1 WHERE id=?',[id]);if(mode==='stock')await q('UPDATE products SET stock=0 WHERE id=?',[id]);
    const shipTo={country:1,city:2,address_line:'Synthetic',street_number:'12',block:'Fixture',short_address:'ABCD1234',building_number:'1234',additional_number:'5678',postal_code:'12345',geo_coordinates:{lat:24,lng:46}};
    await expect(runSallaOrderCreation({merchantId:merchant,actorUserId:user,requestId:randomUUID(),intent:{customerPhone:'966500000000',customerName:'Synthetic',message:'Synthetic',shipTo}},async attempt=>{await dispatchSallaCreation(attempt,a,mode==='duplicate'?[p,p]:[p]);return null;})).rejects.toMatchObject({code:'operation_rejected'});
    expect((await q('SELECT state FROM salla_order_creations WHERE merchant_id=?',[merchant]))[0].state).toBe('rejected');expect(http.post).not.toHaveBeenCalled();
  });

  it('extracts only the current verified Salla store, excluding native, legacy and forged products',async()=>{
    await salla.syncSingleProduct('123');const id=(await rows())[0].id;
    for(const alias of ['123','api:1','byaan:1','website:1','zid:1',null,`salla:${store}:999`])
      await q("INSERT INTO products(merchantId,sallaProductId,name,price,price_unit,stock) VALUES (?,?,'Foreign source',100,'minor',5)",[merchant,alias]);
    expect((await readSallaOrderExtractionCatalog(await authority())).map(p=>p.productId)).toEqual([id]);
    expect(await parseOrderMessage('Synthetic عدد 2',merchant)).toMatchObject({products:[{productId:id,name:'Synthetic',quantity:2}]});
    expect(model.invoke.mock.calls[0][0].messages[0].content).not.toContain('Foreign source');expect(http.post).not.toHaveBeenCalled();
  });
  it.each(['store','connection','token','paused','merchant','price','stock','variant','archived','revision','name','duplicate-name'])('stops extraction when %s changes during model latency',async mode=>{
    await salla.syncSingleProduct('123');const p=(await rows())[0];
    model.invoke.mockImplementationOnce(async()=>{
      if(mode==='store')await q('UPDATE salla_connections SET salla_store_id=? WHERE id=?',[store+'1',connectionId]);
      if(mode==='connection')await q('UPDATE salla_product_projections SET connection_id=connection_id+1 WHERE merchant_id=?',[merchant]);
      if(mode==='token')await q('UPDATE salla_connections SET accessToken=? WHERE id=?',[encryptSecret('changed'),connectionId]);
      if(mode==='paused')await q("UPDATE salla_connections SET syncStatus='paused' WHERE id=?",[connectionId]);
      if(mode==='merchant')await q("UPDATE merchants SET status='suspended' WHERE id=?",[merchant]);
      if(mode==='price')await q('UPDATE products SET price=price+1 WHERE id=?',[p.id]);
      if(mode==='stock')await q('UPDATE products SET stock=1 WHERE id=?',[p.id]);
      if(mode==='variant')await q('UPDATE products SET has_variants=1 WHERE id=?',[p.id]);
      if(mode==='archived')await q('UPDATE salla_product_projections SET archived=1 WHERE merchant_id=?',[merchant]);
      if(mode==='revision')await q('UPDATE salla_product_projections SET read_revision=read_revision+1 WHERE merchant_id=?',[merchant]);
      if(mode==='name')await q("UPDATE products SET name='Changed' WHERE id=?",[p.id]);
      if(mode==='duplicate-name'){http.get.mockResolvedValue(response('456'));await salla.syncSingleProduct('456');}
      return {choices:[{finish_reason:'stop',message:{content:JSON.stringify({products:[{name:'Synthetic',quantity:2}],unresolved:[]})}}]};
    });
    expect(await parseOrderMessage('Synthetic عدد 2',merchant)).toBeNull();expect(http.post).not.toHaveBeenCalled();
  });
  it('does not expose another merchant product through a forged projection pointer',async()=>{
    await salla.syncSingleProduct('123');const other=await createDisposableMerchant('extract-other');users.push(other.userId);
    const p=await q("INSERT INTO products(merchantId,sallaProductId,name,price,price_unit,stock) VALUES (?,?,'Do not expose',100,'minor',5)",[other.merchantId,`salla:${store}:123`]);
    await q('UPDATE salla_product_projections SET local_product_id=? WHERE merchant_id=?',[p.insertId,merchant]);
    expect(await parseOrderMessage('fixture',merchant)).toBeNull();expect(model.invoke).not.toHaveBeenCalled();
  });
  it('refuses duplicate names instead of selecting the first verified product',async()=>{
    await salla.syncSingleProduct('123');http.get.mockResolvedValue(response('456'));await salla.syncSingleProduct('456');
    expect(await parseOrderMessage('Synthetic عدد 2',merchant)).toBeNull();expect(http.post).not.toHaveBeenCalled();
  });
  it('refuses a catalogue larger than the prompt limit without silently truncating or spending AI budget',async()=>{
    const values=Array.from({length:501},(_,i)=>[merchant,`salla:${store}:${i+1}`,`Synthetic ${i+1}`]);
    await q(`INSERT INTO products(merchantId,sallaProductId,name,price,price_unit,stock,currency,isActive,status,has_variants,track_inventory) VALUES ${values.map(()=>"(?,?,?,100,'minor',5,'SAR',1,'active',0,1)").join(',')}`,values.flat());
    const products=await rows(),revisionId=await revision();
    await q(`INSERT INTO salla_product_projections(merchant_id,store_id,external_product_id,local_product_id,connection_id,read_revision,archived,observed_at) VALUES ${products.map(()=>'(?,?,?,?,?,?,0,NOW(3))').join(',')}`,
      products.flatMap((p:any)=>[merchant,store,p.sallaProductId.split(':').at(-1),p.id,connectionId,revisionId]));
    expect(await parseOrderMessage('Synthetic 1',merchant)).toBeNull();expect(model.invoke).not.toHaveBeenCalled();
  });
  it('runs extraction, verified selection, one POST and atomic order creation end to end',async()=>{
    await salla.syncSingleProduct('123');
    const shipTo={country:1,city:2,address_line:'Synthetic',street_number:'12',block:'Fixture',short_address:'ABCD1234',building_number:'1234',additional_number:'5678',postal_code:'12345',geo_coordinates:{lat:24,lng:46}};
    const input={merchantId:merchant,actorUserId:user,requestId:randomUUID(),intent:{customerPhone:'966500000000',customerName:'Synthetic',message:'Synthetic عدد 2',shipTo}};
    http.post.mockResolvedValue({data:{success:true,data:{id:98765,reference_id:456,currency:'SAR',amounts:{total:{amount:39.98,currency:'SAR'}}}}});
    const work=async(attempt:any)=>{const parsed=await parseOrderMessage(input.intent.message,merchant);return parsed?createOrderFromChat(merchant,input.intent.customerPhone,input.intent.customerName,{...parsed,shipTo},undefined,attempt):null;};
    const first=await runSallaOrderCreation(input,work);expect(first.replayed).toBe(false);
    expect(await runSallaOrderCreation(input,work)).toMatchObject({...first,replayed:true});expect(model.invoke).toHaveBeenCalledTimes(1);expect(http.post).toHaveBeenCalledTimes(1);
    expect(await q('SELECT id FROM orders WHERE merchantId=?',[merchant])).toHaveLength(1);
    expect(await q('SELECT id FROM salla_creation_effects WHERE merchant_id=?',[merchant])).toHaveLength(3);
  });
  it('parks rejected extraction before dispatch without creating a partial order or any side effects',async()=>{
    await salla.syncSingleProduct('123');model.invoke.mockResolvedValue({choices:[{finish_reason:'stop',message:{content:JSON.stringify({products:[{name:'Synthetic',quantity:2,productId:999}],unresolved:[]})}}]});
    const shipTo={country:1,city:2,address_line:'Synthetic',street_number:'12',block:'Fixture',short_address:'ABCD1234',building_number:'1234',additional_number:'5678',postal_code:'12345',geo_coordinates:{lat:24,lng:46}};
    await expect(runSallaOrderCreation({merchantId:merchant,actorUserId:user,requestId:randomUUID(),intent:{customerPhone:'966500000000',customerName:'Synthetic',message:'fixture',shipTo}},async()=>{await parseOrderMessage('fixture',merchant);return null;})).rejects.toMatchObject({code:'operation_rejected'});
    expect(await q('SELECT id FROM orders WHERE merchantId=?',[merchant])).toHaveLength(0);expect(await q('SELECT id FROM salla_creation_effects WHERE merchant_id=?',[merchant])).toHaveLength(0);expect(http.post).not.toHaveBeenCalled();
  });
});
