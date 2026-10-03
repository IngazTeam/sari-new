import {beforeEach,afterEach,afterAll,describe,it,expect,vi} from 'vitest';
import {getPool,closeDb} from './db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from './tests/helpers/disposable-merchant';
import {occasionCampaignsRouter} from './routers-occasion-campaigns';
import {readOccasionWorkspace} from './occasion-workspace-store';
import {occasionWorkspaceInput} from '../shared/occasion-workspace';
describe.skipIf(!process.env.DATABASE_URL)('occasion workspace on local MySQL',()=>{
 let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner;
 const q=async(sql:string,args:any[]=[]) =>(await (await getPool())!.execute<any>(sql,args))[0];
 const caller=()=>occasionCampaignsRouter.createCaller({user:{id:owner.userId,role:'user'},req:{headers:{'x-merchant-id':String(other.merchantId)}},res:{}} as any);
 const insert=async(merchantId:number,year:number,name='Saved template')=>Number((await q("INSERT INTO occasion_campaigns (merchantId,occasionType,year,enabled,discountPercentage,status,messageTemplate) VALUES (?,'new_year',?,0,15,'pending',?)",[merchantId,year,name])).insertId);
 const campaign=async(merchantId:number,name:string)=>Number((await q("INSERT INTO campaigns (merchantId,name,message,status) VALUES (?,?,'Local example','completed')",[merchantId,name])).insertId);
 beforeEach(async()=>{owner=await createDisposableMerchant('occasion-source');other=await createDisposableMerchant('occasion-member');await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",[other.merchantId,owner.userId]);});
 afterEach(async()=>{await cleanupDisposableMerchants([owner.userId,other.userId]);});afterAll(closeDb);
 it('reads all definitions and pages with unchanged flags and no side effects',async()=>{
  await insert(owner.merchantId,2027,'PRIVATE-OTHER');for(let i=0;i<31;i++)await insert(other.merchantId,2027-i,'Sample '+i);
  const first=await caller().workspace({}),second=await caller().workspace({page:2}),find=await caller().workspace({query:'Sample 30'});
  expect(first).toMatchObject({merchantId:other.merchantId,actorId:owner.userId,canManage:true,total:31,pages:2,counts:{disabled:31},delivery:{total:0}});expect(first.rows).toHaveLength(25);expect(second.rows).toHaveLength(6);expect(find.rows).toHaveLength(1);expect(first.upcoming.length).toBeGreaterThan(0);expect(JSON.stringify(first)).not.toContain('PRIVATE-OTHER');
  expect((await q('SELECT SUM(enabled) total FROM occasion_campaigns WHERE merchantId=?',[other.merchantId]))[0].total).toBe('0');expect((await q('SELECT COUNT(*) total FROM discount_codes WHERE merchantId=?',[other.merchantId]))[0].total).toBe(0);
 });
 it('separates stored acceptance counters from complete outbox outcomes and hides foreign campaign links',async()=>{
  const own=await insert(other.merchantId,2026),c=await campaign(other.merchantId,'Owned envelope');await q("UPDATE occasion_campaigns SET campaign_id=?,status='completed',recipientCount=999 WHERE id=?",[c,own]);
  for(const [i,status] of Array.from(['pending','processing','sent','failed','suppressed','manual_review'].entries()))await q("INSERT INTO campaign_delivery_outbox (campaign_id,merchant_id,customer_phone,status,processing_token,claimed_at) VALUES (?,?,?,?,?,IF(?='processing',UTC_TIMESTAMP(3),NULL))",[c,other.merchantId,'96650000000'+i,status,status==='processing'?'synthetic-lease':null,status]);
  const foreign=await insert(other.merchantId,2025),privateCampaign=await campaign(owner.merchantId,'PRIVATE CAMPAIGN');await q('UPDATE occasion_campaigns SET campaign_id=? WHERE id=?',[privateCampaign,foreign]);
  const data=await caller().workspace({});expect(data.storedRecipients).toBe(999);expect(data.delivery).toEqual({total:6,pending:1,processing:1,accepted:1,retryable:1,suppressed:1,manualReview:1,unknown:0});expect(data.rows.find(r=>r.id===foreign)).toMatchObject({linkedCampaign:null,delivery:null,state:'invalid'});expect(JSON.stringify(data)).not.toContain('PRIVATE CAMPAIGN');
 });
 it('fails closed when a delivery claims a different tenant under the owned envelope',async()=>{
  const id=await insert(other.merchantId,2027),c=await campaign(other.merchantId,'Own');await q('UPDATE occasion_campaigns SET campaign_id=? WHERE id=?',[c,id]);await q("INSERT INTO campaign_delivery_outbox (campaign_id,merchant_id,customer_phone,status) VALUES (?,?,?,'sent')",[c,owner.merchantId,'966500000001']);await expect(caller().workspace({})).rejects.toMatchObject({code:'INTERNAL_SERVER_ERROR'});
 });
 it('rechecks membership, account and role at storage boundary',async()=>{
  await q("UPDATE merchant_members SET role='viewer' WHERE merchant_id=? AND user_id=?",[other.merchantId,owner.userId]);expect((await caller().workspace({})).canManage).toBe(false);await q('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?',[other.merchantId,owner.userId]);await expect(readOccasionWorkspace(owner.userId,other.merchantId,occasionWorkspaceInput.parse({}))).rejects.toMatchObject({reason:'forbidden'});
  await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[owner.userId]);await expect(readOccasionWorkspace(owner.userId,owner.merchantId,occasionWorkspaceInput.parse({}))).rejects.toMatchObject({reason:'forbidden'});
 });
 it('observes revoked membership after waiting for the parent lock',async()=>{
  const pool=(await getPool())!,blocker=await pool.getConnection(),waiting=await pool.getConnection(),execute=waiting.execute.bind(waiting);let entered!:()=>void;const started=new Promise<void>(r=>{entered=r;});await blocker.beginTransaction();await blocker.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE',[other.merchantId]);const acquired=vi.spyOn(pool,'getConnection').mockResolvedValueOnce(waiting);(waiting as any).execute=async(sql:any,args:any)=>{if(String(sql).includes('FROM merchants'))entered();return execute(sql,args);};const result=readOccasionWorkspace(owner.userId,other.merchantId,occasionWorkspaceInput.parse({})).then(()=> 'unexpected',e=>e.reason);
  try{await started;await blocker.execute('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?',[other.merchantId,owner.userId]);await blocker.commit();expect(await result).toBe('forbidden');}finally{acquired.mockRestore();(waiting as any).execute=execute;await blocker.rollback();blocker.release();await result;}
 });
});
