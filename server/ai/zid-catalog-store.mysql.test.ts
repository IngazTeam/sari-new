import { afterAll,afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { getPool,closeDb } from '../db/connection';
import { createDisposableMerchant,cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { upsertProductFromZid,upsertNormalizedProductsFromZid,deactivateProductFromZid,updateProductInventoryFromZid,
  getProductsByMerchantId,getActiveProductsByMerchantId,getProductCountByMerchantId,getZidProducts,saveZidProduct,linkZidProductToSariProduct } from '../db';
import { getProductsByMerchantId as getExtractedCatalog } from '../db/products';
import { normalizeZidProduct,zidProductProjectionId } from '../integrations/zid-product-normalization';
import { zidCatalogVisibleSql } from '../integrations/zid-catalog-scope';
import { processZidWebhook } from '../webhooks/zid-webhook';
import { prepareZidCheckout } from './zid-checkout-agreements';
import { listApiProducts } from '../api/api-read-model';
const provider=vi.hoisted(()=>({settings:vi.fn()}));
vi.mock('../db_zid',()=>({default:{getZidSettings:provider.settings}}));
vi.mock('../integrations/zid/zidClient',()=>({ZidClient:class {
  getPaymentMethods=async()=>({payment_methods:[{id:1,name:'رابط',fees:0,enabled:true,code:'payment_link.zidpay'}]});
  getShippingMethods=async()=>({shipping_methods:[{id:2,name:'توصيل',fees:0,enabled:true}]});
}}));
describe.skipIf(!process.env.DATABASE_URL)('Zid catalogue store identity and sales reads SQL',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,users:number[],settingsId:number;
  const query=async(sql:string,args:any[]=[]) => (await (await getPool())!.execute<any>(sql,args))[0];
  const at=(n=0)=>new Date(Date.UTC(2026,8,26,10,0,n));
  const product=(store='11',id='P1',extra:any={})=>({store_id:store,id,sku:'SKU1',name:'منتج موثق',price:10,quantity:10,...extra});
  const sources=()=>query('SELECT * FROM zid_products WHERE merchant_id=? ORDER BY id',[owner.merchantId]);
  const targets=()=>query('SELECT * FROM products WHERE merchantId=? ORDER BY id',[owner.merchantId]);
  const write=(store='11',id='P1',n=0,extra:any={})=>upsertProductFromZid(owner.merchantId,product(store,id,extra),at(n));
  const full=(store:string,ids:string[],n:number)=>upsertNormalizedProductsFromZid(owner.merchantId,ids.map(id=>normalizeZidProduct(product(store,id),at(n))),{storeId:store,startedAt:at(n)});
  const policy=(store='11')=>({storeId:store,valid:true,autoSync:true,syncProducts:true,syncOrders:true,syncCustomers:true,notifyMerchantOrders:false});
  beforeEach(async()=>{owner=await createDisposableMerchant('zid-catalog');users=[owner.userId];
    const r=await query("INSERT INTO zid_settings (merchant_id,store_id,access_token,manager_token,is_active) VALUES (?,'11','fixture','fixture',1)",[owner.merchantId]);settingsId=r.insertId;
    provider.settings.mockReset().mockResolvedValue({id:settingsId,merchantId:owner.merchantId,storeId:'11',accessToken:'fixture',managerToken:'fixture',isActive:1});
    vi.stubGlobal('fetch',vi.fn(()=>{throw Error('No external traffic');}));});
  afterEach(async()=>{vi.restoreAllMocks();vi.unstubAllGlobals();await cleanupDisposableMerchants(users);});afterAll(closeDb);
  async function quote(){
    const c=await query("INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,'966500000073','active')",[owner.merchantId]);
    const m=await query("INSERT INTO messages (conversationId,direction,content) VALUES (?,'incoming','أريد المنتج')",[c.insertId]);
    return prepareZidCheckout({merchantId:owner.merchantId,conversationId:c.insertId,incomingMessageId:m.insertId,customerPhone:'966500000073'},
      {products:[{name:'منتج موثق',sku:'SKU1',zidProductId:'P1',quantity:2}],customerName:'Synthetic',address:{line1:'Synthetic Street',city:'Riyadh',countryCode:'SA'}});
  }
  it('writes the source and minor-unit projection together and uses the synchronized price in an actual quote',async()=>{
    await write('11','P1',0,{price:20,sale_price:10});const [s]=await sources(),[p]=await targets();
    expect(s).toMatchObject({zid_store_id:'11',price:'20.00',sale_price:'10.00',sari_product_id:p.id});expect(p).toMatchObject({price:1000,compare_at_price:2000,price_unit:'minor'});
    expect(await quote()).toContain('[ZQ-');const [q]=await query('SELECT external_snapshot FROM sales_quotations WHERE merchant_id=?',[owner.merchantId]);
    expect((typeof q.external_snapshot==='string'?JSON.parse(q.external_snapshot):q.external_snapshot).subtotalMinor).toBe(2000);
  });
  it('keeps identical external IDs and SKUs in two stores independent and changes visibility on reconnect',async()=>{
    await write();await write('22','P1',1,{price:70,name:'متجر ثان'});expect(await sources()).toHaveLength(2);expect(await targets()).toHaveLength(2);
    expect((await getProductsByMerchantId(owner.merchantId)).map(p=>p.price)).toEqual([1000]);
    await query("UPDATE zid_settings SET store_id='22' WHERE id=?",[settingsId]);
    expect((await getProductsByMerchantId(owner.merchantId)).map(p=>p.price)).toEqual([7000]);expect((await getZidProducts(owner.merchantId)).map(p=>p.zidStoreId)).toEqual(['22']);
  });
  it.each(['none','disabled','malformed','wrong-store','missing-store','empty-token'])('hides legacy fallback when canonical authority is %s',async mode=>{
    await write();await query("INSERT INTO platform_integrations (merchant_id,platform_type,is_active,access_token,settings) VALUES (?,'zid',?,?,?)",
      [owner.merchantId,mode==='disabled'?0:1,mode==='empty-token'?'':'fixture',mode==='malformed'?'{':JSON.stringify({managerToken:'fixture',...(mode==='missing-store'?{}:{storeId:mode==='wrong-store'?'22':'11'})})]);
    if(mode==='none'){await query('DELETE FROM platform_integrations WHERE merchant_id=?',[owner.merchantId]);await query('DELETE FROM zid_settings WHERE merchant_id=?',[owner.merchantId]);}
    expect(await getProductsByMerchantId(owner.merchantId)).toHaveLength(0);
    expect(await getZidProducts(owner.merchantId)).toHaveLength(0);
  });
  it('preserves historical unknown rows but excludes them from sales, API and quoted checkout',async()=>{
    const p=await query("INSERT INTO products (merchantId,sallaProductId,name,price,stock,price_unit) VALUES (?,'zid:P1','قديم',1000,10,'minor')",[owner.merchantId]);
    await query("INSERT INTO zid_products (merchant_id,zid_product_id,zid_sku,name_ar,price,quantity,sari_product_id) VALUES (?,'P1','SKU1','قديم',10,10,?)",[owner.merchantId,p.insertId]);
    expect(await getProductsByMerchantId(owner.merchantId)).toHaveLength(0);expect(await getZidProducts(owner.merchantId)).toHaveLength(0);await expect(quote()).rejects.toThrow();
    await write();expect(await targets()).toHaveLength(2);expect(await sources()).toHaveLength(2);expect((await getProductsByMerchantId(owner.merchantId)).length).toBe(1);
    expect((await listApiProducts(owner.merchantId,{limit:10,offset:0} as any)).total).toBe(1);
  });
  it('uses one scope for pagination counts, extracted catalogue, active reads and raw retrieval',async()=>{
    await write();await write('22');await query("INSERT INTO products (merchantId,name,price,stock,price_unit) VALUES (?,'محلي',1000,1,'minor')",[owner.merchantId]);
    expect(await getProductCountByMerchantId(owner.merchantId)).toBe(2);expect(await getActiveProductsByMerchantId(owner.merchantId)).toHaveLength(2);expect(await getExtractedCatalog(owner.merchantId)).toHaveLength(2);
    expect(await query(`SELECT id FROM products p WHERE p.merchantId=? AND ${zidCatalogVisibleSql('p')}`,[owner.merchantId])).toHaveLength(2);
  });
  it('never uses another stores product in the saved agreement',async()=>{await write('22');await expect(quote()).rejects.toThrow();});
  it.each(['inventory','delete'])('isolates %s events by store including delayed events after switching',async mode=>{
    await write();await write('22');if(mode==='delete')await deactivateProductFromZid(owner.merchantId,'P1',at(1),'22');
    else await updateProductInventoryFromZid(owner.merchantId,{store_id:'22',product_id:'P1',quantity:0},at(1));
    const s=await sources(),p=await targets();expect(s[0].quantity).toBe(10);expect(p[0].stock).toBe(10);expect(s[1].quantity).toBe(0);expect(p[1].stock).toBe(0);
  });
  it('scopes empty snapshots, advances tombstones and refuses an older create or inventory resurrection',async()=>{
    await write();await write('22');expect(await full('11',[],2)).toMatchObject({disabledProducts:1});await write('11','P1',1);await updateProductInventoryFromZid(owner.merchantId,{store_id:'11',id:'P1',quantity:20},at(3));
    expect((await sources())[0].is_active).toBe(0);expect((await sources())[1].is_active).toBe(1);expect((await targets())[0].isActive).toBe(0);
  });
  it('does not disable a webhook newer than the start of a complete sync',async()=>{await write('11','P1',5);await full('11',[],4);expect((await sources())[0].is_active).toBe(1);});
  it.each(['delete','inventory'])('retains %s before create as an unavailable timestamped source',async mode=>{
    if(mode==='delete')await deactivateProductFromZid(owner.merchantId,'P1',at(3),'11');else await updateProductInventoryFromZid(owner.merchantId,{store_id:'11',id:'P1',quantity:0},at(3));
    await write('11','P1',2);await write('11','P1',3);expect(await targets()).toHaveLength(0);expect((await sources())[0].is_active).toBe(0);
    await write('11','P1',4);expect(await targets()).toHaveLength(1);
  });
  it('keeps newer full product values when an old create arrives',async()=>{await write('11','P1',3,{price:30});await write('11','P1',2,{price:1});expect((await targets())[0].price).toBe(3000);expect((await sources())[0].price).toBe('30.00');});
  it('serializes repeated product deliveries to one source and one projection',async()=>{await Promise.all([write(),write(),write(),write()]);expect(await sources()).toHaveLength(1);expect(await targets()).toHaveLength(1);});
  it.each(['alias','foreign-link','foreign-target','case'])('rejects a %s collision without changing either catalogue',async mode=>{
    if(mode==='alias'){await query("INSERT INTO products (merchantId,sallaProductId,name,price) VALUES (?,?,'Custom',1)",[owner.merchantId,zidProductProjectionId('11','P1')]);}
    else{await write();if(mode==='case'){}else{
      const other=await createDisposableMerchant('foreign-catalog');users.push(other.userId);await upsertProductFromZid(other.merchantId,product('11','P2'));const [p]=await query('SELECT id FROM products WHERE merchantId=?',[other.merchantId]);
      if(mode==='foreign-link')await query('UPDATE zid_products SET sari_product_id=? WHERE merchant_id=?',[p.id,owner.merchantId]);
      else await query('UPDATE products SET merchantId=? WHERE merchantId=?',[other.merchantId,owner.merchantId]);
    }}
    const before=await sources(),old=await targets();await expect(write('11',mode==='case'?'p1':'P1',1)).rejects.toThrow();expect(await sources()).toEqual(before);expect(await targets()).toEqual(old);
  });
  it('rolls back earlier products when a later product in the batch conflicts',async()=>{
    await query("INSERT INTO products (merchantId,sallaProductId,name,price) VALUES (?,?,'Custom',1)",[owner.merchantId,zidProductProjectionId('11','P2')]);
    await expect(full('11',['P1','P2'],1)).rejects.toThrow();expect(await sources()).toHaveLength(0);expect(await targets()).toHaveLength(1);
  });
  it.each(['store','clock','duplicate'])('rejects inconsistent %s scope before writes',async mode=>{
    const batch=[normalizeZidProduct(product(mode==='store'?'22':'11'),at(mode==='clock'?2:1))];if(mode==='duplicate')batch.push(batch[0]);
    await expect(upsertNormalizedProductsFromZid(owner.merchantId,batch,{storeId:'11',startedAt:at(1)})).rejects.toThrow();expect(await sources()).toHaveLength(0);
  });
  it.each(['product.create','product.update','product.publish','product.delete','inventory.update'])('binds authenticated %s with no payload store, and rejects contradictory scope',async event=>{
    await write();const data={...product(),store_id:undefined,product_id:'P1',quantity:3};await processZidWebhook({event,data,created_at:at(1).toISOString()},owner.merchantId,policy());
    expect((await sources())[0].zid_store_id).toBe('11');const before=await sources();await expect(processZidWebhook({event,data:{...data,store_id:'22'}},owner.merchantId,policy())).rejects.toThrow();expect(await sources()).toEqual(before);
  });
  it('requires store provenance for the legacy save adapter and refuses arbitrary source linking',async()=>{
    await expect(saveZidProduct(owner.merchantId,{zidProductId:'P1',price:10})).rejects.toThrow();await write();const [s]=await sources();
    await expect(linkZidProductToSariProduct(s.id,s.sari_product_id+100)).rejects.toThrow();await expect(linkZidProductToSariProduct(s.id,s.sari_product_id)).resolves.toBeUndefined();
  });
  it('preserves legacy image formats, both names and default publication in a canonical save',async()=>{
    const saved=await saveZidProduct(owner.merchantId,{zidStoreId:'11',zidProductId:'P1',zidSku:'SKU1',nameAr:'منتج موثق',nameEn:'Verified product',price:'20.00',salePrice:'10.00',quantity:10,
      images:JSON.stringify(['https://example.test/a.png',{url:'https://example.test/b.png'}])});
    expect(saved).toMatchObject({nameAr:'منتج موثق',nameEn:'Verified product',isPublished:1,isActive:1,price:'20.00',salePrice:'10.00'});
    const [p]=await targets();expect(p).toMatchObject({price:1000,isActive:1,imageUrl:'https://example.test/a.png'});
    expect(JSON.parse(p.images)).toEqual(['https://example.test/a.png','https://example.test/b.png']);expect(saved?.sariProductId).toBe(p.id);
  });
  it('keeps untouched product and projection fields when applying a partial legacy update',async()=>{
    await write('11','P1',0,{name:{ar:'منتج موثق',en:'Original'},cost:3,barcode:'B1',html_url:'https://example.test/product',images:[{url:'https://example.test/a.png'}],is_published:false});
    const saved=await saveZidProduct(owner.merchantId,{zidStoreId:'11',zidProductId:'P1',quantity:7,nameAr:undefined});
    expect(saved).toMatchObject({quantity:7,nameAr:'منتج موثق',nameEn:'Original',zidSku:'SKU1',isPublished:0,isActive:0,price:'10.00'});
    expect((await targets())[0]).toMatchObject({cost_price:300,barcode:'B1',productUrl:'https://example.test/product',stock:7,isActive:0,imageUrl:'https://example.test/a.png'});
  });
  it('rolls back malformed legacy images without changing either product record',async()=>{
    await write();const before=await sources(),old=await targets();
    await expect(saveZidProduct(owner.merchantId,{zidStoreId:'11',zidProductId:'P1',price:50,images:'{"url":"https://example.test/a.png"}'})).rejects.toThrow('ZID_CATALOG_IMAGES');
    expect(await sources()).toEqual(before);expect(await targets()).toEqual(old);
  });
  it('serializes disjoint legacy partial updates without losing either field',async()=>{
    await write();await Promise.all([saveZidProduct(owner.merchantId,{zidStoreId:'11',zidProductId:'P1',quantity:7}),
      saveZidProduct(owner.merchantId,{zidStoreId:'11',zidProductId:'P1',price:25})]);
    expect((await sources())[0]).toMatchObject({quantity:7,price:'25.00'});expect((await targets())[0]).toMatchObject({stock:7,price:2500});
  });
  it('preserves infinite stock without inventing units and requires variant clarification',async()=>{
    await write('11','P1',0,{is_infinite:true,quantity:0});expect(await quote()).toContain('[ZQ-');
    await write('11','P1',1,{has_options:true});await expect(quote()).rejects.toThrow();
  });
  it('uses the valid canonical store over an active legacy store without deleting either history',async()=>{
    await write();await write('22','P1',1,{price:50});await query("INSERT INTO platform_integrations (merchant_id,platform_type,is_active,access_token,settings) VALUES (?,'zid',1,'fixture',?)",[owner.merchantId,JSON.stringify({storeId:'22',managerToken:'fixture'})]);
    expect((await getProductsByMerchantId(owner.merchantId)).map(p=>p.price)).toEqual([5000]);expect((await getZidProducts(owner.merchantId)).map(p=>p.zidStoreId)).toEqual(['22']);
    await write('11','P1',3,{price:90});expect((await getProductsByMerchantId(owner.merchantId)).map(p=>p.price)).toEqual([5000]);expect(await targets()).toHaveLength(2);
  });
  it('does not admit a canonical store with a missing manager credential',async()=>{
    await write();await query("INSERT INTO platform_integrations (merchant_id,platform_type,is_active,access_token,settings) VALUES (?,'zid',1,'fixture',?)",[owner.merchantId,JSON.stringify({storeId:'11'})]);
    expect(await getProductsByMerchantId(owner.merchantId)).toHaveLength(0);expect(await getZidProducts(owner.merchantId)).toHaveLength(0);
  });
  it('keeps source and projection at the newest event under concurrent create, inventory and deletion',async()=>{
    await write();await Promise.all([write('11','P1',1),updateProductInventoryFromZid(owner.merchantId,{store_id:'11',id:'P1',quantity:5},at(2)),deactivateProductFromZid(owner.merchantId,'P1',at(3),'11')]);
    expect((await sources())[0]).toMatchObject({is_active:0,quantity:0});expect((await targets())[0]).toMatchObject({isActive:0,stock:0});
  });
  it('retains non-Zid catalogue visibility when the Zid connection is corrupt',async()=>{
    await query("INSERT INTO platform_integrations (merchant_id,platform_type,is_active,access_token,settings) VALUES (?,'zid',1,'fixture','{')",[owner.merchantId]);
    await query("INSERT INTO products (merchantId,sallaProductId,name,price,stock,price_unit) VALUES (?,'salla-item','Native',1000,1,'minor')",[owner.merchantId]);
    expect(await getProductsByMerchantId(owner.merchantId)).toHaveLength(1);
  });
});
