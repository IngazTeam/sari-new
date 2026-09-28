import { createHash,randomUUID } from 'node:crypto';
import { afterAll,afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
const external=vi.hoisted(()=>({post:vi.fn(),get:vi.fn(),notify:vi.fn()}));
vi.mock('axios',()=>({default:{create:()=>({post:external.post,get:external.get})}}));
vi.mock('../_core/emailNotifications',()=>({notifyNewOrder:external.notify}));
import { getPool,closeDb } from '../db/connection';
import { assertDisposableDatabase,createDisposableMerchant,cleanupDisposableMerchants } from '../tests/helpers/disposable-merchant';
import { encryptSecret } from '../security/secrets';
import { runSallaOrderCreation,dispatchSallaCreation, type SallaCreationAttempt } from './salla-order-creation';
import { persistSallaOrderProjection } from './salla-order-projection';
import { createOrderFromChat } from '../automation/order-from-chat';
import { persistSallaCatalogRead,selectSallaOrderProduct } from './salla-catalog';
import { normalizeSallaProduct } from './salla-product-normalization';
import { createSyncLog,updateSyncLog } from '../db';
import { withInboundExecution } from '../messaging/inbound-context';

describe.skipIf(!process.env.DATABASE_URL)('Salla durable creation through actual order orchestration and MySQL',()=>{
  const q=async(sql:string,args:any[]=[]):Promise<any>=>(await(await getPool())!.execute(sql,args))[0];
  const shipTo={country:1,city:2,address_line:'Synthetic',street_number:'12',block:'Fixture',short_address:'ABCD1234',building_number:'1234',additional_number:'5678',postal_code:'12345',geo_coordinates:{lat:24,lng:46}};
  let merchant:number,user:number,otherUser:number,users:number[],connectionId:number,productId:number,revision:number,store:string,requestId:string;
  const intent=()=>({customerPhone:'966500000000',customerName:'Synthetic',message:'Synthetic order',shipTo});
  const input=()=>({merchantId:merchant,actorUserId:user,requestId,intent:intent()});
  const parsed=()=>({shipTo,products:[{name:'Synthetic',productId,quantity:1}],catalogEvidence:{merchantId:merchant,connectionId,storeId:store,
    messageHash:createHash('sha256').update(intent().message).digest('hex'),products:[{name:'Synthetic',productId,quantity:1,price:100,revision,sku:'SKU-123'}]}});
  const work=(a:SallaCreationAttempt)=>createOrderFromChat(merchant,intent().customerPhone,intent().customerName,parsed(),intent().message,a);
  const run=()=>runSallaOrderCreation(input(),work);
  const ledger=async()=>(await q('SELECT * FROM salla_order_creations WHERE merchant_id=? AND request_id=?',[merchant,requestId]))[0];
  const lineResponse=()=>({status:200,success:true,data:[{id:777,sku:'SKU-123',quantity:1,currency:'SAR',options:[]}]});
  const readback=()=>({status:200,success:true,data:{id:98765,reference_id:456,currency:'SAR',draft:false,payment_method:'cod',
    status:{slug:'under_review'},customer:{mobile:500000000,mobile_code:'+966'},amounts:{total:{amount:1,currency:'SAR'}},urls:{checkout:'https://synthetic.example.test/pay'}}});
  beforeEach(async()=>{
    assertDisposableDatabase();vi.stubEnv('FIELD_ENCRYPTION_KEY','synthetic-salla-creation-encryption-only');users=[];
    const m=await createDisposableMerchant('salla-create'),o=await createDisposableMerchant('salla-actor');users=[m.userId,o.userId];merchant=m.merchantId;user=m.userId;otherUser=o.userId;store=String(800000000+merchant);requestId=randomUUID();
    connectionId=Number((await q("INSERT INTO salla_connections(merchantId,salla_store_id,storeUrl,accessToken,syncStatus) VALUES (?,?,'https://synthetic.example.test',?,'active')",[merchant,store,encryptSecret('synthetic-token')])).insertId);
    revision=await createSyncLog(merchant,'single_product','in_progress');
    productId=(await persistSallaCatalogRead({merchantId:merchant,connectionId,storeId:store,accessToken:'synthetic-token'},revision,'123',normalizeSallaProduct({id:123,sku:'SKU-123',name:'Synthetic',price:{amount:1,currency:'SAR'},quantity:5,unlimited_quantity:false,status:'sale',is_available:true,type:'product',options:[],skus:[]}))).localProductId!;
    await updateSyncLog(revision,'success',1);
    external.post.mockReset().mockResolvedValue({data:{success:true,data:{id:98765,reference_id:456,currency:'SAR',amounts:{total:{amount:1,currency:'SAR'}},urls:{checkout:'https://synthetic.example.test/pay'}}}});external.notify.mockReset().mockResolvedValue(undefined);
    external.get.mockReset().mockImplementation(async(url:string)=>({data:url.endsWith('/orders/items')?lineResponse():readback()}));
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants(users);vi.unstubAllEnvs();});afterAll(closeDb);
  it('commits the operation, order and store identity together and replays without another provider call or email',async()=>{
    const first=await run();expect(first.replayed).toBe(false);expect((await ledger()).state).toBe('completed');
    expect(await run()).toEqual({...first,replayed:true});expect(external.post).toHaveBeenCalledTimes(1);expect(external.notify).not.toHaveBeenCalled();
    expect(await q('SELECT id FROM salla_creation_effects WHERE merchant_id=? AND state=\'pending\'',[merchant])).toHaveLength(3);
    expect(await q('SELECT id FROM orders WHERE merchantId=?',[merchant])).toHaveLength(1);
    const row=await ledger();expect(row.request_hash).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(row)).not.toContain(intent().customerPhone);expect(JSON.stringify(row)).not.toContain('synthetic-token');
  });
  it('only one concurrent caller may enter preparation or POST',async()=>{
    let release!:()=>void,entered!:()=>void;const ready=new Promise<void>(r=>entered=r),hold=new Promise<void>(r=>release=r);
    const prepare=vi.fn(async(a:SallaCreationAttempt)=>{entered();await hold;return work(a);});
    const first=runSallaOrderCreation(input(),prepare);await ready;
    try{await expect(runSallaOrderCreation(input(),prepare)).rejects.toMatchObject({code:'operation_pending'});expect(prepare).toHaveBeenCalledTimes(1);}finally{release();}
    await first;expect(external.post).toHaveBeenCalledTimes(1);
  });
  it.each(['phone','name','message','address','actor'])('rejects a repeated request ID with changed %s',async mode=>{
    await run();const next=input();if(mode==='phone')next.intent.customerPhone='966511111111';if(mode==='name')next.intent.customerName='Changed';if(mode==='message')next.intent.message='Different';if(mode==='address')next.intent.shipTo={...shipTo,address_line:'Changed'};if(mode==='actor')next.actorUserId=otherUser;
    const prepare=vi.fn();await expect(runSallaOrderCreation(next,prepare)).rejects.toMatchObject({code:'request_conflict'});expect(prepare).not.toHaveBeenCalled();expect(external.post).toHaveBeenCalledTimes(1);
  });
  it('normalizes UUID case and object key order without changing operation identity',async()=>{
    const first=await run(),next=input();next.requestId=requestId.toUpperCase();next.intent.shipTo={...shipTo,geo_coordinates:{lng:46,lat:24}};
    expect(await runSallaOrderCreation(next,work)).toEqual({...first,replayed:true});expect(external.post).toHaveBeenCalledTimes(1);
  });
  it('does not leak or replay another tenant operation under the same request ID',async()=>{
    const first=await run(),m=await createDisposableMerchant('salla-scope');users.push(m.userId);
    const prepare=vi.fn().mockResolvedValue(null);await expect(runSallaOrderCreation({...input(),merchantId:m.merchantId,actorUserId:m.userId},prepare)).rejects.toMatchObject({code:'operation_rejected'});
    expect(prepare).toHaveBeenCalledTimes(1);expect((await ledger()).local_order_id).toBe(first.orderId);
  });
  it.each(['timeout','malformed'])('parks %s after POST and never resends on replay',async mode=>{
    if(mode==='timeout')external.post.mockRejectedValueOnce(Error('socket timeout'));else external.post.mockResolvedValueOnce({data:{success:true,data:{id:98765}}});
    await expect(run()).rejects.toMatchObject({code:'operation_review'});expect((await ledger()).state).toBe('review');await expect(run()).rejects.toMatchObject({code:'operation_review'});
    expect(external.post).toHaveBeenCalledTimes(1);expect(await q('SELECT id FROM orders WHERE merchantId=?',[merchant])).toHaveLength(0);
  });
  it('records a preflight rejection with no provider effect and will not silently reuse its key',async()=>{
    await q("UPDATE salla_connections SET syncStatus='paused' WHERE id=?",[connectionId]);await expect(run()).rejects.toMatchObject({code:'operation_rejected'});expect((await ledger()).state).toBe('rejected');
    await q("UPDATE salla_connections SET syncStatus='active' WHERE id=?",[connectionId]);await expect(run()).rejects.toMatchObject({code:'operation_rejected'});expect(external.post).not.toHaveBeenCalled();
  });
  it('rejects a suspended merchant before reservation, without implying a saved order exists',async()=>{
    await q("UPDATE merchants SET status='suspended' WHERE id=?",[merchant]);const prepare=vi.fn();
    await expect(runSallaOrderCreation(input(),prepare)).rejects.toMatchObject({code:'result_unavailable'});
    expect(await ledger()).toBeUndefined();expect(prepare).not.toHaveBeenCalled();expect(external.post).not.toHaveBeenCalled();
  });
  it.each(['preparing','dispatching'])('does not steal a stale %s operation after process restart',async state=>{
    await expect(runSallaOrderCreation(input(),async a=>{if(state==='dispatching'){const authority={merchantId:merchant,connectionId,storeId:store,accessToken:'synthetic-token'};await dispatchSallaCreation(a,authority,[await selectSallaOrderProduct(authority,productId,1)],intent());}throw Error('crash');})).rejects.toThrow();
    await q("UPDATE salla_order_creations SET state=?,created_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY),updated_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY) WHERE merchant_id=?",[state,merchant]);
    await expect(run()).rejects.toMatchObject({code:'operation_pending'});expect(external.post).not.toHaveBeenCalled();
  });
  it.each(['reservation','dispatch','completion'])('handles lost %s commit acknowledgement without duplicate POST',async phase=>{
    const pool=(await getPool())!,get=pool.getConnection.bind(pool);let number=0;
    vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get();number++;if(number===({reservation:1,dispatch:2,completion:3}[phase])){const commit=c.commit.bind(c);vi.spyOn(c,'commit').mockImplementationOnce(async()=>{await commit();throw Error('lost acknowledgement');});}return c;});
    if(phase==='completion'){const r=await run();expect(r.replayed).toBe(true);expect((await ledger()).state).toBe('completed');}
    else await expect(run()).rejects.toThrow();
    vi.restoreAllMocks();if(phase==='completion')await run();else await expect(run()).rejects.toThrow();expect(external.post).toHaveBeenCalledTimes(phase==='completion'?1:0);
  });
  it('rolls back order and operation completion together when the final write fails',async()=>{
    const pool=(await getPool())!,get=pool.getConnection.bind(pool);vi.spyOn(pool,'getConnection').mockImplementation(async()=>{const c=await get(),execute=c.execute.bind(c);vi.spyOn(c,'execute').mockImplementation((async(sql:string,args:any[])=>{const r=await execute(sql,args);if(sql.includes("SET state='completed'"))throw Error('write failed');return r;})as any);return c;});
    await expect(run()).rejects.toMatchObject({code:'operation_review'});vi.restoreAllMocks();expect((await ledger()).state).toBe('review');expect(await q('SELECT id FROM orders WHERE merchantId=?',[merchant])).toHaveLength(0);await expect(run()).rejects.toThrow();expect(external.post).toHaveBeenCalledTimes(1);
  });
  it.each(['store','token','paused'])('rechecks %s after the provider accepted, without holding locks over HTTP',async mode=>{
    const response=await external.post();external.post.mockClear().mockImplementationOnce(async()=>{if(mode==='store')await q('UPDATE salla_connections SET salla_store_id=? WHERE id=?',[store+'1',connectionId]);if(mode==='token')await q('UPDATE salla_connections SET accessToken=? WHERE id=?',[encryptSecret('new-synthetic-token'),connectionId]);if(mode==='paused')await q("UPDATE salla_connections SET syncStatus='paused' WHERE id=?",[connectionId]);return response;});
    await expect(run()).rejects.toMatchObject({code:'operation_review'});await expect(run()).rejects.toThrow();expect(external.post).toHaveBeenCalledTimes(1);expect(await q('SELECT id FROM orders WHERE merchantId=?',[merchant])).toHaveLength(0);
  });
  it.each(['order_deleted','store_changed','alias_changed','result_changed'])('does not leak an unverifiable saved result: %s',async mode=>{
    const r=await run();if(mode==='order_deleted')await q('DELETE FROM orders WHERE id=?',[r.orderId]);if(mode==='store_changed')await q('UPDATE salla_connections SET salla_store_id=? WHERE id=?',[store+'1',connectionId]);if(mode==='alias_changed')await q("UPDATE orders SET sallaOrderId='other' WHERE id=?",[r.orderId]);if(mode==='result_changed')await q("UPDATE salla_order_creations SET result_json=JSON_SET(result_json,'$.orderId',123) WHERE merchant_id=?",[merchant]);
    await expect(run()).rejects.toMatchObject({code:'result_unavailable'});expect((await ledger()).state).toBe('completed');expect(external.post).toHaveBeenCalledTimes(1);
  });
  it('rejects a forged attempt token before POST',async()=>{
    await expect(runSallaOrderCreation(input(),a=>work({...a,token:randomUUID()}))).rejects.toMatchObject({code:'operation_rejected'});expect(external.post).not.toHaveBeenCalled();
  });
  it.each(['table','unique'])('fails closed on missing %s before preparation or provider access',async mode=>{
    // First warm readiness, then prove a process cannot keep using a stale success.
    await run();requestId=randomUUID();const prepare=vi.fn();
    try{
      if(mode==='table')await q('RENAME TABLE salla_order_creations TO salla_order_creations_fixture_hidden');else await q('ALTER TABLE salla_order_creations DROP INDEX salla_creation_request');
      await expect(runSallaOrderCreation(input(),prepare)).rejects.toMatchObject({code:'DATABASE_SCHEMA_OUTDATED'});expect(prepare).not.toHaveBeenCalled();expect(external.post).toHaveBeenCalledTimes(1);
    }finally{
      if(mode==='table')await q('RENAME TABLE salla_order_creations_fixture_hidden TO salla_order_creations');else await q('ALTER TABLE salla_order_creations ADD UNIQUE KEY salla_creation_request(merchant_id,request_id)');
    }
  });
  it('cannot project an operation before dispatch or with another tenant authority',async()=>{
    const draft={externalOrderId:'98765',orderNumber:'456',customerPhone:'966500000000',customerName:'Synthetic',address:'Fixture',items:'[]',totalAmount:100,paymentUrl:null,isGift:0 as const,discountCode:null};
    await expect(runSallaOrderCreation(input(),async a=>{await expect(persistSallaOrderProjection({merchantId:merchant,connectionId,storeId:store,accessToken:'synthetic-token'},draft,a)).rejects.toThrow();await expect(dispatchSallaCreation(a,{merchantId:merchant+1,connectionId,storeId:store,accessToken:'synthetic-token'},[],intent())).rejects.toThrow();return null;})).rejects.toMatchObject({code:'operation_rejected'});
    expect(await q('SELECT id FROM orders WHERE merchantId=?',[merchant])).toHaveLength(0);
  });
  it.each(['phone','name','message','country','city','address_line','street_number','block','short_address','building_number','additional_number','postal_code','lat','lng'])('binds the actual dispatch %s to the originally reserved request hash',async field=>{
    const original=input(),next=structuredClone(original.intent);
    if(field==='phone')next.customerPhone='966511111111';
    else if(field==='name')next.customerName='Other recipient';
    else if(field==='message')next.message+=' coupon OTHER';
    else if(field==='lat'||field==='lng')next.shipTo.geo_coordinates[field]++;
    else {const address=next.shipTo as any;address[field]=typeof address[field]==='number'?address[field]+1:
      field==='short_address'?'WXYZ5678':['building_number','additional_number'].includes(field)?'4321':field==='postal_code'?'54321':'Changed';}
    const cart={...parsed(),shipTo:next.shipTo};
    cart.catalogEvidence.messageHash=createHash('sha256').update(next.message).digest('hex');
    await expect(runSallaOrderCreation(original,a=>createOrderFromChat(merchant,next.customerPhone,next.customerName,cart,next.message,a))).rejects.toMatchObject({code:'operation_rejected'});
    expect((await ledger()).state).toBe('rejected');expect(external.post).not.toHaveBeenCalled();
    expect(await q('SELECT id FROM orders WHERE merchantId=?',[merchant])).toHaveLength(0);
    expect(await q('SELECT id FROM salla_creation_effects WHERE merchant_id=?',[merchant])).toHaveLength(0);
    await expect(run()).rejects.toMatchObject({code:'operation_rejected'});
  });
  it('normalizes the actual intent exactly as reservation does',async()=>{
    const raw=input();raw.intent.customerName=' Synthetic ';raw.intent.customerPhone=' 966500000000 ';raw.intent.message=' Synthetic order ';
    raw.intent.shipTo={...shipTo,address_line:' Synthetic ',geo_coordinates:{lng:46,lat:24}};
    await runSallaOrderCreation(raw,a=>createOrderFromChat(merchant,raw.intent.customerPhone,raw.intent.customerName,{...parsed(),shipTo:raw.intent.shipTo},raw.intent.message,a));
    expect(external.post.mock.calls[0][1]).toMatchObject({customer:{name:'Synthetic',mobile:'966500000000'},ship_to:shipTo});
  });
  it('stops a merchant suspended after reservation and before the provider effect',async()=>{
    await expect(runSallaOrderCreation(input(),async a=>{await q("UPDATE merchants SET status='suspended' WHERE id=?",[merchant]);return work(a);})).rejects.toMatchObject({code:'operation_rejected'});
    expect((await ledger()).state).toBe('rejected');expect(external.post).not.toHaveBeenCalled();
  });
  it.each(['missing','message','merchant','store','connection','quantity','price','revision','duplicate','name'])('rejects changed extraction evidence %s before POST',async mode=>{
    const cart=parsed();
    if(mode==='missing')delete (cart as any).catalogEvidence;
    else if(mode==='message')cart.catalogEvidence.messageHash='a'.repeat(64);
    else if(mode==='merchant')cart.catalogEvidence.merchantId++;
    else if(mode==='store')cart.catalogEvidence.storeId+='1';
    else if(mode==='connection')cart.catalogEvidence.connectionId++;
    else if(mode==='quantity')cart.products[0].quantity++;
    else if(mode==='duplicate')cart.catalogEvidence.products.push({...cart.catalogEvidence.products[0]});
    else if(mode==='name')cart.catalogEvidence.products[0].name='Changed';
    else cart.catalogEvidence.products[0][mode]++;
    await expect(runSallaOrderCreation(input(),a=>createOrderFromChat(merchant,intent().customerPhone,intent().customerName,cart,intent().message,a))).rejects.toMatchObject({code:'operation_rejected'});
    expect(external.post).not.toHaveBeenCalled();expect((await ledger()).state).toBe('rejected');
  });
  it.each(['price','revision','connection'])('does not silently adopt a catalogue %s changed after extraction',async mode=>{
    await expect(runSallaOrderCreation(input(),async a=>{
      const cart=parsed();
      if(mode==='price')await q('UPDATE products SET price=price+1 WHERE id=?',[productId]);
      else await q(`UPDATE salla_product_projections SET ${mode==='revision'?'read_revision=read_revision+1':'connection_id=connection_id+1'} WHERE merchant_id=?`,[merchant]);
      return createOrderFromChat(merchant,intent().customerPhone,intent().customerName,cart,intent().message,a);
    })).rejects.toMatchObject({code:'operation_rejected'});
    expect(external.post).not.toHaveBeenCalled();
  });
  it('clones the attempt, address, products and evidence before asynchronous creation checks',async()=>{
    await runSallaOrderCreation(input(),a=>{
      const callerAttempt={...a},cart=structuredClone(parsed());
      const pending=createOrderFromChat(merchant,intent().customerPhone,intent().customerName,cart,intent().message,callerAttempt);
      callerAttempt.token=randomUUID();cart.shipTo.address_line='Replacement';cart.products[0].quantity=3;cart.catalogEvidence.products[0].price=999;
      return pending;
    });
    expect(external.post).toHaveBeenCalledTimes(1);expect(external.post.mock.calls[0][1]).toMatchObject({ship_to:shipTo,products:[{quantity:1}]});
    expect((await q('SELECT address,items FROM orders WHERE merchantId=?',[merchant]))[0]).toMatchObject({address:'Synthetic'});
    expect(JSON.parse((await q('SELECT items FROM orders WHERE merchantId=?',[merchant]))[0].items)[0]).toMatchObject({price:100,quantity:1});
  });
  it('clones dispatch arguments before awaiting schema and row locks',async()=>{
    const authority={merchantId:merchant,connectionId,storeId:store,accessToken:'synthetic-token'},selected=await selectSallaOrderProduct(authority,productId,1);
    await expect(runSallaOrderCreation(input(),async a=>{
      const rawIntent=structuredClone(intent()),rawAuthority={...authority},rawAttempt={...a},selection=[{...selected}];
      const pending=dispatchSallaCreation(rawAttempt,rawAuthority,selection,rawIntent);
      rawIntent.shipTo.address_line='Changed';rawAuthority.storeId+='1';rawAuthority.accessToken='Changed';rawAttempt.token=randomUUID();selection[0].price++;
      await pending;expect((await ledger()).state).toBe('dispatching');return null;
    })).rejects.toMatchObject({code:'operation_review'});
    expect((await ledger()).store_id).toBe(store);expect(external.post).not.toHaveBeenCalled();
  });
  it('rechecks inbound ownership after dispatch and parks the reservation without posting if it was lost',async()=>{
    const ctx={id:1,merchantId:merchant,instanceId:1,token:'synthetic',eventKey:'synthetic',partitionKey:'synthetic',sendOrdinal:0,
      assertOwned:vi.fn(async()=>{if((await ledger())?.state==='dispatching')throw Error('Lease lost during dispatch');})};
    await expect(withInboundExecution(ctx,run)).rejects.toMatchObject({code:'operation_review'});
    expect(ctx.assertOwned).toHaveBeenCalledTimes(3);expect(external.post).not.toHaveBeenCalled();
    expect((await ledger()).state).toBe('review');await expect(run()).rejects.toMatchObject({code:'operation_review'});
    expect(external.post).not.toHaveBeenCalled();
  });
  it.each(['timeout','malformed','customer','id','reference','total','url','currency','draft','payment','state'])('parks read-back %s without local orders or follow-ups and never reissues POST',async mode=>{
    const raw:any=readback();
    if(mode==='timeout')external.get.mockRejectedValueOnce(Error('lost read response'));
    else {
      if(mode==='malformed')delete raw.data;
      if(mode==='customer')raw.data.customer.mobile=511111111;
      if(mode==='id')raw.data.id++;
      if(mode==='reference')raw.data.reference_id++;
      if(mode==='total')raw.data.amounts.total.amount++;
      if(mode==='url')raw.data.urls.checkout+='-changed';
      if(mode==='currency')raw.data.currency='USD';
      if(mode==='draft')raw.data.draft=true;
      if(mode==='payment')raw.data.payment_method='mada';
      if(mode==='state')raw.data.status.slug='paid';
      external.get.mockResolvedValueOnce({data:raw});
    }
    const ctx={id:1,merchantId:merchant,instanceId:1,token:'synthetic',eventKey:'synthetic',partitionKey:'synthetic',sendOrdinal:0,assertOwned:vi.fn().mockResolvedValue(undefined),uncertainEffect:false};
    await expect(withInboundExecution(ctx,run)).rejects.toMatchObject({code:'operation_review'});
    expect(ctx.uncertainEffect).toBe(true);expect((await ledger()).state).toBe('review');
    expect(await q('SELECT id FROM orders WHERE merchantId=?',[merchant])).toHaveLength(0);
    expect(await q('SELECT local_order_id FROM salla_order_projections WHERE merchant_id=?',[merchant])).toHaveLength(0);
    expect(await q('SELECT id FROM salla_creation_effects WHERE merchant_id=?',[merchant])).toHaveLength(0);
    await expect(run()).rejects.toMatchObject({code:'operation_review'});
    expect(external.post).toHaveBeenCalledTimes(1);expect(external.get).toHaveBeenCalledTimes(1);expect(external.notify).not.toHaveBeenCalled();
  });
  it('waits for authenticated read-back before local persistence and blocks concurrent duplicate creation',async()=>{
    let release!:()=>void,entered!:()=>void;const ready=new Promise<void>(r=>entered=r),hold=new Promise<void>(r=>release=r);
    external.get.mockImplementationOnce(async()=>{entered();await hold;return{data:readback()};});
    const first=run();await ready;
    try{
      expect((await ledger()).state).toBe('dispatching');
      expect(await q('SELECT id FROM orders WHERE merchantId=?',[merchant])).toHaveLength(0);
      expect(await q('SELECT id FROM salla_creation_effects WHERE merchant_id=?',[merchant])).toHaveLength(0);
      await expect(run()).rejects.toMatchObject({code:'operation_pending'});
    }finally{release();}
    await first;expect(external.post).toHaveBeenCalledTimes(1);expect(external.get).toHaveBeenCalledTimes(2);
  });
  it('uses the read-back total and fulfillment state after abbreviated POST without asserting payment',async()=>{
    external.post.mockResolvedValueOnce({data:{status:201,success:true,data:{id:98765,reference_id:456}}});
    const raw=readback();raw.data.status.slug='in_progress';raw.data.amounts.total.amount=2.5;
    external.get.mockResolvedValueOnce({data:raw});
    const result=await run();expect(await run()).toEqual({...result,replayed:true});
    expect((await q('SELECT totalAmount,status,payment_status,currency FROM orders WHERE id=?',[result.orderId]))[0]).toEqual({totalAmount:250,status:'processing',payment_status:'unpaid',currency:'SAR'});
    expect(await q('SELECT id FROM salla_creation_effects WHERE merchant_id=?',[merchant])).toHaveLength(3);
    expect(external.post).toHaveBeenCalledTimes(1);expect(external.get).toHaveBeenCalledTimes(2);
  });
  it.each(['store','token','paused','connection','merchant'])('rechecks %s changed while read-back is in flight before local commit',async mode=>{
    external.get.mockImplementationOnce(async()=>{
      if(mode==='store')await q('UPDATE salla_connections SET salla_store_id=? WHERE id=?',[store+'1',connectionId]);
      if(mode==='token')await q('UPDATE salla_connections SET accessToken=? WHERE id=?',[encryptSecret('changed-token'),connectionId]);
      if(mode==='paused')await q("UPDATE salla_connections SET syncStatus='paused' WHERE id=?",[connectionId]);
      if(mode==='connection')await q('UPDATE salla_connections SET id=id+1000000 WHERE id=?',[connectionId]);
      if(mode==='merchant')await q("UPDATE merchants SET status='suspended' WHERE id=?",[merchant]);
      return{data:readback()};
    });
    await expect(run()).rejects.toMatchObject({code:'operation_review'});expect((await ledger()).state).toBe('review');
    expect(await q('SELECT id FROM orders WHERE merchantId=?',[merchant])).toHaveLength(0);
    expect(await q('SELECT id FROM salla_creation_effects WHERE merchant_id=?',[merchant])).toHaveLength(0);
    await expect(run()).rejects.toThrow();expect(external.post).toHaveBeenCalledTimes(1);expect(external.get).toHaveBeenCalledTimes(2);
  });
  it.each(['return','throw'])('keeps private cleanup identity when preparation mutates its attempt then %s',async mode=>{
    await expect(runSallaOrderCreation(input(),async attempt=>{
      attempt.id++;attempt.merchantId++;attempt.token=randomUUID();
      if(mode==='throw')throw Error('preparation failed');return null;
    })).rejects.toMatchObject({code:'operation_rejected'});
    expect((await ledger()).state).toBe('rejected');expect((await ledger()).error_code).toBe('preparation_failed');
    await expect(run()).rejects.toMatchObject({code:'operation_rejected'});expect(external.post).not.toHaveBeenCalled();expect(external.get).not.toHaveBeenCalled();
  });
  it('refuses saved-result replay through a replacement connection even when store and token still match',async()=>{
    await run();await q('UPDATE salla_connections SET id=id+1000000 WHERE id=?',[connectionId]);
    await expect(run()).rejects.toMatchObject({code:'result_unavailable'});
    expect((await ledger()).state).toBe('completed');expect(external.post).toHaveBeenCalledTimes(1);expect(external.get).toHaveBeenCalledTimes(2);
  });
  it('persists the verified SKU and provider line ID separately from product ID and replays without new reads',async()=>{
    const result=await run(),row=(await q('SELECT items FROM orders WHERE id=?',[result.orderId]))[0];
    expect(JSON.parse(row.items)).toEqual([{sallaProductId:'123',productId,name:'Synthetic',quantity:1,price:100,sku:'SKU-123',sallaOrderItemId:'777'}]);
    expect(await run()).toEqual({...result,replayed:true});expect(external.get).toHaveBeenCalledTimes(2);expect(external.post).toHaveBeenCalledTimes(1);
  });
  it.each([null,'',' SKU-123','SKU-123 ','<b>SKU-123</b>','SKU\n123','Changed'])('rejects missing, unsafe or changed SKU %j before provider creation',async sku=>{
    await q('UPDATE products SET sku=? WHERE id=?',[sku,productId]);
    await expect(run()).rejects.toMatchObject({code:'operation_rejected'});expect((await ledger()).state).toBe('rejected');
    expect(external.post).not.toHaveBeenCalled();expect(external.get).not.toHaveBeenCalled();
    expect(await q('SELECT id FROM salla_creation_effects WHERE merchant_id=?',[merchant])).toHaveLength(0);
  });
  it.each(['SKU-123','sku-123'])('rejects another bound product with ambiguous SKU %s even when names differ',async sku=>{
    const next=await createSyncLog(merchant,'single_product','in_progress');
    await persistSallaCatalogRead({merchantId:merchant,connectionId,storeId:store,accessToken:'synthetic-token'},next,'456',normalizeSallaProduct({id:456,sku,name:'Another product',price:{amount:1,currency:'SAR'},quantity:5,unlimited_quantity:false,status:'sale',is_available:true,type:'product',options:[],skus:[]}));
    await updateSyncLog(next,'success',1);
    await expect(run()).rejects.toMatchObject({code:'operation_rejected'});expect(external.post).not.toHaveBeenCalled();
  });
  it('does not use a native product sharing the SKU to replace or invalidate the scoped Salla selection',async()=>{
    await q("INSERT INTO products(merchantId,name,sku,price,price_unit,stock) VALUES (?,'Native','SKU-123',100,'minor',10)",[merchant]);
    await run();expect(external.post).toHaveBeenCalledTimes(1);
  });
  it.each(['timeout','empty','extra','sku','case','quantity','options','currency','pagination'])('parks a %s order-line response with no local order or effects',async mode=>{
    external.get.mockResolvedValueOnce({data:readback()});
    if(mode==='timeout')external.get.mockRejectedValueOnce(Error('read failed'));
    else{
      const raw:any=lineResponse();
      if(mode==='empty')raw.data=[];
      if(mode==='extra')raw.data.push({...raw.data[0],id:888,sku:'Other'});
      if(mode==='sku')raw.data[0].sku='Other';
      if(mode==='case')raw.data[0].sku='sku-123';
      if(mode==='quantity')raw.data[0].quantity++;
      if(mode==='options')raw.data[0].options=[{id:42}];
      if(mode==='currency')raw.data[0].currency='USD';
      if(mode==='pagination')raw.pagination={currentPage:1,totalPages:2};
      external.get.mockResolvedValueOnce({data:raw});
    }
    await expect(run()).rejects.toMatchObject({code:'operation_review'});expect((await ledger()).state).toBe('review');
    expect(await q('SELECT id FROM orders WHERE merchantId=?',[merchant])).toHaveLength(0);
    expect(await q('SELECT id FROM salla_creation_effects WHERE merchant_id=?',[merchant])).toHaveLength(0);
    await expect(run()).rejects.toMatchObject({code:'operation_review'});expect(external.post).toHaveBeenCalledTimes(1);expect(external.get).toHaveBeenCalledTimes(2);
  });
  it.each(['token','connection','merchant'])('rechecks %s changed during the final order-items read',async mode=>{
    external.get.mockResolvedValueOnce({data:readback()}).mockImplementationOnce(async()=>{
      if(mode==='token')await q('UPDATE salla_connections SET accessToken=? WHERE id=?',[encryptSecret('changed-token'),connectionId]);
      if(mode==='connection')await q('UPDATE salla_connections SET id=id+1000000 WHERE id=?',[connectionId]);
      if(mode==='merchant')await q("UPDATE merchants SET status='suspended' WHERE id=?",[merchant]);
      return{data:lineResponse()};
    });
    await expect(run()).rejects.toMatchObject({code:'operation_review'});
    expect(await q('SELECT id FROM orders WHERE merchantId=?',[merchant])).toHaveLength(0);
    expect(await q('SELECT id FROM salla_creation_effects WHERE merchant_id=?',[merchant])).toHaveLength(0);
    expect(external.post).toHaveBeenCalledTimes(1);
  });
});
