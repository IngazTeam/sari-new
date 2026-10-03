import {beforeEach,afterEach,afterAll,describe,it,expect,vi} from 'vitest';
import {getPool,closeDb} from './db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from './tests/helpers/disposable-merchant';
import {withPromotionWriteTransaction,applyPromotionMutation,lockedPromotionSource} from './promotion-writes';
import {promotionMutationInput,type PromotionMutation} from '../shared/promotion-write';
// Exercise transaction primitives directly in isolated tests; no production compatibility writer.
const testWrite=(actorId:number,merchantId:number,raw:PromotionMutation)=>{const input=promotionMutationInput.parse(raw);return withPromotionWriteTransaction(actorId,merchantId,async tx=>applyPromotionMutation(tx,merchantId,input,await lockedPromotionSource(tx,merchantId)));};
describe.skipIf(!process.env.DATABASE_URL)('atomic scoped promotion writes on disposable MySQL tenants',()=>{
 let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner;
 const q=async(sql:string,args:any[]=[]) => (await (await getPool())!.execute<any>(sql,args))[0];
 const create=(patch:any={},actor=owner.userId,merchant=owner.merchantId)=>testWrite(actor,merchant,{action:'create',data:{title:'Local offer',type:'percentage',value:15,...patch}});
 const counts=async()=>({promotions:(await q('SELECT COUNT(*) n FROM promotions WHERE merchant_id=?',[owner.merchantId]))[0].n,discounts:(await q('SELECT COUNT(*) n FROM discount_codes WHERE merchantId=?',[owner.merchantId]))[0].n});
 beforeEach(async()=>{owner=await createDisposableMerchant('promotion-write');other=await createDisposableMerchant('promotion-other');});
 afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants([owner.userId,other.userId]);});afterAll(closeDb);
 it('creates a promotion and requested discount together with exact dates and nullable fields',async()=>{
  const row=await create({autoGenerateCode:true,autoCodeValue:15,startsAt:'2026-01-01',expiresAt:'2027-01-02',minOrderAmount:0});expect(row).toMatchObject({merchantId:owner.merchantId,isActive:1,minOrderAmount:0,startsAt:'2025-12-31 21:00:00',expiresAt:'2027-01-02 20:59:59'});
  expect(await counts()).toEqual({promotions:1,discounts:1});expect((await q('SELECT merchantId,value,is_auto_generated FROM discount_codes WHERE id=?',[row.autoDiscountCodeId]))[0]).toEqual({merchantId:owner.merchantId,value:15,is_auto_generated:1});
 });
 it('rolls back the generated discount if inserting its promotion fails',async()=>{
  const pool=(await getPool())!,tx=await pool.getConnection(),native=tx.execute.bind(tx);vi.spyOn(pool,'getConnection').mockResolvedValueOnce(tx);vi.spyOn(tx,'execute').mockImplementation((async(sql:any,args:any)=>{if(String(sql).startsWith('INSERT INTO promotions'))throw Error('Injected write failure');return native(sql,args);}) as any);
  await expect(create({autoGenerateCode:true,autoCodeValue:15})).rejects.toMatchObject({reason:'unavailable'});vi.restoreAllMocks();expect(await counts()).toEqual({promotions:0,discounts:0});
 });
 it('updates actual timestamp rows without shifting stored UTC and clears explicit null fields',async()=>{
  const before=await create({startsAt:'2027-01-01',expiresAt:'2027-01-02',minOrderAmount:100,description:'Old'});
  expect(await testWrite(owner.userId,owner.merchantId,{action:'update',data:{id:before.id,title:'New',description:null,minOrderAmount:0}})).toMatchObject({title:'New',description:null,minOrderAmount:0,startsAt:before.startsAt,expiresAt:before.expiresAt});
 });
 it.each([{startsAt:'2027-01-01',reason:'code_start'},{minQuantity:2,reason:'code_quantity'},{expiresAt:'2026-01-01',reason:'code_expired'}])('does not persist an automatic coupon that cannot enforce $reason',async({reason,...patch})=>{await expect(create({...patch,autoGenerateCode:true,autoCodeValue:15})).rejects.toMatchObject({reason});expect(await counts()).toEqual({promotions:0,discounts:0});expect((await create(patch)).id).toBeGreaterThan(0);});
 it('admits only one concurrent fifth active offer without orphan discounts',async()=>{
  for(let i=0;i<4;i++)await create();const results=await Promise.allSettled([create({autoGenerateCode:true,autoCodeValue:15}),create({autoGenerateCode:true,autoCodeValue:15})]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);expect(await counts()).toEqual({promotions:5,discounts:1});
 });
 it('counts future offers toward the limit and frees expired slots without modifying their flags',async()=>{
  for(let i=0;i<5;i++)await create({startsAt:'2027-01-01'});await expect(create()).rejects.toMatchObject({reason:'limit'});await q('UPDATE promotions SET starts_at=NULL,expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) WHERE merchant_id=?',[owner.merchantId]);await create();expect(await counts()).toEqual({promotions:6,discounts:0});expect((await q('SELECT SUM(is_active) n FROM promotions WHERE merchant_id=?',[owner.merchantId]))[0].n).toBe('6');
 });
 it.each(['own','foreign'])('deletes only the requested promotion and retains its %s linked discount',async kind=>{
  const row=await create(),merchant=kind==='own'?owner.merchantId:other.merchantId,discount=Number((await q("INSERT INTO discount_codes (merchantId,code,type,value,isActive) VALUES (?,'KEEP-PROMO','percentage',15,1)",[merchant])).insertId);
  await q('UPDATE promotions SET auto_discount_code_id=? WHERE id=?',[discount,row.id]);expect(await testWrite(owner.userId,owner.merchantId,{action:'delete',id:row.id})).toMatchObject({success:true,retainedDiscount:true});expect(await q('SELECT id FROM promotions WHERE id=?',[row.id])).toEqual([]);expect(await q('SELECT id FROM discount_codes WHERE id=?',[discount])).toHaveLength(1);
 });
 it('rejects foreign row updates, deletion and toggles',async()=>{
  const row=await create({},other.userId,other.merchantId);for(const input of [{action:'update',data:{id:row.id,title:'Changed'}},{action:'delete',id:row.id},{action:'toggle',id:row.id}] as const)await expect(testWrite(owner.userId,owner.merchantId,input)).rejects.toMatchObject({reason:'missing'});expect((await q('SELECT title FROM promotions WHERE id=?',[row.id]))[0].title).toBe('Local offer');
 });
 it('allows the selected manager while rejecting viewers, revoked members and inactive accounts',async()=>{
  await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",[other.merchantId,owner.userId]);expect((await create({},owner.userId,other.merchantId)).merchantId).toBe(other.merchantId);
  await q("UPDATE merchant_members SET role='viewer' WHERE merchant_id=? AND user_id=?",[other.merchantId,owner.userId]);await expect(create({},owner.userId,other.merchantId)).rejects.toMatchObject({reason:'forbidden'});
  await q("UPDATE merchant_members SET role='manager',is_active=0 WHERE merchant_id=? AND user_id=?",[other.merchantId,owner.userId]);await expect(create({},owner.userId,other.merchantId)).rejects.toMatchObject({reason:'forbidden'});
  await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[owner.userId]);await expect(create()).rejects.toMatchObject({reason:'forbidden'});
 });
 it('rejects foreign target IDs and does not turn a scoped discount into a global code',async()=>{
  const product=Number((await q("INSERT INTO products (merchantId,name,price) VALUES (?,'Foreign product',100)",[other.merchantId])).insertId);
  await expect(create({scope:'products',productIds:JSON.stringify([product])})).rejects.toMatchObject({reason:'invalid'});
  const own=Number((await q("INSERT INTO products (merchantId,name,price) VALUES (?,'Owned product',100)",[owner.merchantId])).insertId);expect((await create({scope:'products',productIds:JSON.stringify([own])})).scope).toBe('products');
  await expect(create({scope:'products',productIds:JSON.stringify([own]),autoGenerateCode:true,autoCodeValue:15})).rejects.toMatchObject({reason:'code_scope'});expect(await counts()).toEqual({promotions:1,discounts:0});
 });
 it('can pause a malformed legacy record without broadening or rewriting its targeting',async()=>{
  const row=await create();await q("UPDATE promotions SET scope='products',product_ids='bad' WHERE id=?",[row.id]);expect(await testWrite(owner.userId,owner.merchantId,{action:'toggle',id:row.id})).toMatchObject({isActive:0,productIds:'bad'});await expect(testWrite(owner.userId,owner.merchantId,{action:'toggle',id:row.id})).rejects.toMatchObject({reason:'invalid'});
 });
 it('preserves committed records after lost acknowledgement and destroys the uncertain connection',async()=>{
  const pool=(await getPool())!,tx=await pool.getConnection(),commit=tx.commit.bind(tx);vi.spyOn(pool,'getConnection').mockResolvedValueOnce(tx);const destroyed=vi.spyOn(tx,'destroy');vi.spyOn(tx,'commit').mockImplementation(async()=>{await commit();throw Error('Lost acknowledgement');});
  await expect(create({autoGenerateCode:true,autoCodeValue:15})).rejects.toMatchObject({reason:'unknown'});expect(destroyed).toHaveBeenCalledOnce();vi.restoreAllMocks();expect(await counts()).toEqual({promotions:1,discounts:1});
 });
});
