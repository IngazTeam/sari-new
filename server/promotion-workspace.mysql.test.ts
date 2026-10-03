import {beforeEach,afterEach,afterAll,describe,it,expect} from 'vitest';
import {getPool,closeDb} from './db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from './tests/helpers/disposable-merchant';
import {readPromotionWorkspace} from './promotion-workspace-store';
import {promotionWorkspaceInput} from '../shared/promotion-workspace';
describe.skipIf(!process.env.DATABASE_URL)('complete promotion source on disposable MySQL tenants',()=>{
 let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner;
 const q=async(sql:string,args:any[]=[]) => (await (await getPool())!.execute<any>(sql,args))[0];
 const read=(input:object={},actor=owner.userId,merchant=owner.merchantId)=>readPromotionWorkspace(actor,merchant,promotionWorkspaceInput.parse(input));
 const create=async(merchant=owner.merchantId)=>Number((await q("INSERT INTO promotions (merchant_id,title,description,type,value,scope,min_order_amount,is_active,view_count,click_count) VALUES (?,'Local offer','Preserve full description','percentage',15,'all',0,1,999,5)",[merchant])).insertId);
 beforeEach(async()=>{owner=await createDisposableMerchant('promotion-workspace');other=await createDisposableMerchant('promotion-other');});
 afterEach(()=>cleanupDisposableMerchants([owner.userId,other.userId]));afterAll(closeDb);
 it('reads all 31 records and their counters across both pages, excluding foreign records',async()=>{
  for(let i=0;i<31;i++)await create();await create(other.merchantId);const first=await read(),second=await read({page:2});expect(first).toMatchObject({total:31,storedViewCount:30969,storedClickCount:155});expect(first.rows).toHaveLength(25);expect(second.rows).toHaveLength(6);expect(new Set([...first.rows,...second.rows].map(r=>r.id)).size).toBe(31);expect(first.rows[0].minOrderAmount).toBe(0);
 });
 it('allows a selected member to read and hides management from a viewer',async()=>{
  await create(other.merchantId);await expect(read({},owner.userId,other.merchantId)).rejects.toMatchObject({reason:'forbidden'});
  await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",[other.merchantId,owner.userId]);expect(await read({},owner.userId,other.merchantId)).toMatchObject({total:1,canManage:false});
  await q("UPDATE merchant_members SET role='manager' WHERE merchant_id=? AND user_id=?",[other.merchantId,owner.userId]);expect((await read({},owner.userId,other.merchantId)).canManage).toBe(true);
  await q('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?',[other.merchantId,owner.userId]);await expect(read({},owner.userId,other.merchantId)).rejects.toMatchObject({reason:'forbidden'});
 });
 it('does not disclose a foreign discount linked by legacy data or delete either record',async()=>{
  const id=await create(),discount=Number((await q("INSERT INTO discount_codes (merchantId,code,type,value,isActive) VALUES (?,'PRIVATE-PROMO','percentage',15,1)",[other.merchantId])).insertId);
  await q('UPDATE promotions SET auto_discount_code_id=? WHERE id=?',[discount,id]);const data=await read();expect(data.rows[0]).toMatchObject({autoDiscountCodeId:discount,linkedDiscount:null,state:'invalid'});expect(JSON.stringify(data)).not.toContain('PRIVATE-PROMO');expect(await q('SELECT id FROM discount_codes WHERE id=?',[discount])).toHaveLength(1);
 });
 it('reports expired and scheduled records without modifying activation or counters',async()=>{
  const expired=await create(),scheduled=await create();await q('UPDATE promotions SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) WHERE id=?',[expired]);await q('UPDATE promotions SET starts_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY) WHERE id=?',[scheduled]);
  expect(await read()).toMatchObject({savedActiveCount:2,counts:{expired:1,scheduled:1}});expect(await q('SELECT is_active FROM promotions WHERE merchant_id=?',[owner.merchantId])).toEqual([{is_active:1},{is_active:1}]);
 });
 it('honors owner membership revocation and inactive accounts',async()=>{
  await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",[owner.merchantId,owner.userId]);await expect(read()).rejects.toMatchObject({reason:'forbidden'});await q('DELETE FROM merchant_members WHERE merchant_id=? AND user_id=?',[owner.merchantId,owner.userId]);await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[owner.userId]);await expect(read()).rejects.toMatchObject({reason:'forbidden'});
 });
});
