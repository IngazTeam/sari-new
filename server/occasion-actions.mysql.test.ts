import {beforeEach,afterEach,afterAll,describe,it,expect,vi} from 'vitest';
import {getPool,closeDb} from './db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from './tests/helpers/disposable-merchant';
import {occasionCampaignsRouter} from './routers-occasion-campaigns';
import {reviewOccasionAction,applyOccasionAction} from './occasion-actions';
import {getUpcomingOccasions} from './automation/occasion-campaigns';
import {occasionWorkspaceInput} from '../shared/occasion-workspace';
import {readOccasionWorkspace} from './occasion-workspace-store';
describe.skipIf(!process.env.DATABASE_URL)('reviewed occasions on disposable MySQL tenants',()=>{
 let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner;
 const q=async(sql:string,args:any[]=[]) =>(await (await getPool())!.execute<any>(sql,args))[0];
 const caller=()=>occasionCampaignsRouter.createCaller({user:{id:owner.userId,role:'user'},req:{headers:{'x-merchant-id':String(other.merchantId)}},res:{}} as any);
 const choice=()=>{const o=getUpcomingOccasions()[0];return {action:'create' as const,occasionType:o.type,year:o.year};};
 const draft=async()=>{const target=choice(),review=await caller().reviewAction(target);return caller().applyAction({target,reviewRevision:review.reviewRevision,acknowledged:true});};
 const enable=async(id:number)=>{const target={action:'toggle' as const,id,enabled:true},review=await caller().reviewAction(target);return {target,reviewRevision:review.reviewRevision,acknowledged:true as const};};
 const read=(id:number)=>q('SELECT * FROM occasion_campaigns WHERE id=? AND merchantId=?',[id,other.merchantId]);
 beforeEach(async()=>{owner=await createDisposableMerchant('occasion-actions');other=await createDisposableMerchant('occasion-selected');await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",[other.merchantId,owner.userId]);});
 afterEach(async()=>{await cleanupDisposableMerchants([owner.userId,other.userId]);});afterAll(closeDb);
 it('creates disabled, enables and disables only the selected tenant with no campaign/discount/outbox effects',async()=>{
  const result=await draft();expect(result).toMatchObject({merchantId:other.merchantId,actorId:owner.userId,enabled:false,sentImmediately:false});expect((await read(result.id))[0]).toMatchObject({enabled:0,status:'pending',campaign_id:null,recipientCount:0});
  const workspace=await readOccasionWorkspace(owner.userId,other.merchantId,occasionWorkspaceInput.parse({}));expect(workspace.rows[0].id).toBe(result.id);
  const request=await enable(result.id);expect((await caller().applyAction(request)).enabled).toBe(true);expect((await read(result.id))[0].enabled).toBe(1);
  const target={action:'toggle' as const,id:result.id,enabled:false},review=await caller().reviewAction(target);await caller().applyAction({target,reviewRevision:review.reviewRevision,acknowledged:true});expect((await read(result.id))[0].enabled).toBe(0);
  for(const [table,key] of [['campaigns','merchantId'],['discount_codes','merchantId'],['campaign_delivery_outbox','merchant_id']])expect((await q(`SELECT COUNT(*) total FROM ${table} WHERE ${key}=?`,[other.merchantId]))[0].total).toBe(0);
 });
 it('creates at most one definition for simultaneous reviewed requests',async()=>{const target=choice(),r=await caller().reviewAction(target),value={target,reviewRevision:r.reviewRevision,acknowledged:true as const};const results=await Promise.allSettled([caller().applyAction(value),caller().applyAction(value)]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((await q('SELECT COUNT(*) total FROM occasion_campaigns WHERE merchantId=?',[other.merchantId]))[0].total).toBe(1);});
 it('does not apply a replay twice, and requires a new review after a real change',async()=>{const {id}=await draft(),value=await enable(id);await caller().applyAction(value);await expect(caller().applyAction(value)).rejects.toMatchObject({code:'CONFLICT'});expect((await read(id))[0].enabled).toBe(1);});
 it('rejects stale discount, lifecycle and forged tenant target',async()=>{const {id}=await draft(),value=await enable(id);await q('UPDATE occasion_campaigns SET discountPercentage=26 WHERE id=?',[id]);await expect(caller().applyAction(value)).rejects.toMatchObject({code:'CONFLICT'});expect((await read(id))[0].enabled).toBe(0);await expect(reviewOccasionAction(other.userId,owner.merchantId,value.target)).rejects.toMatchObject({reason:'forbidden'});await expect(reviewOccasionAction(owner.userId,owner.merchantId,value.target)).rejects.toMatchObject({reason:'missing'});await q("UPDATE occasion_campaigns SET status='completed' WHERE id=?",[id]);expect((await caller().reviewAction(value.target)).eligible).toBe(false);});
 it('rechecks role/account after review and honors explicitly revoked owner membership',async()=>{const {id}=await draft(),value=await enable(id);await q("UPDATE merchant_members SET role='viewer' WHERE merchant_id=? AND user_id=?",[other.merchantId,owner.userId]);await expect(applyOccasionAction(owner.userId,other.merchantId,value)).rejects.toMatchObject({reason:'forbidden'});await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[owner.userId]);await expect(applyOccasionAction(owner.userId,other.merchantId,value)).rejects.toMatchObject({reason:'forbidden'});expect((await read(id))[0].enabled).toBe(0);await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",[other.merchantId,other.userId]);await expect(reviewOccasionAction(other.userId,other.merchantId,value.target)).rejects.toMatchObject({reason:'forbidden'});});
 it('reviews an existing prepared envelope and rejects changes to its actual discount or audience',async()=>{
  const {id}=await draft(),raw=(await read(id))[0];
  const campaign=await q("INSERT INTO campaigns (merchantId,name,message,targetAudience,status) VALUES (?,'Prepared','Exact saved message','{}','draft')",[other.merchantId]);
  await q("INSERT INTO discount_codes (merchantId,code,type,value,minOrderAmount,maxUses,usedCount,isActive,expiresAt) VALUES (?,'OCCASION_LOCAL','percentage',?,0,2000,0,1,'2037-01-01 00:00:00')",[other.merchantId,raw.discountPercentage]);
  await q("UPDATE occasion_campaigns SET campaign_id=?,discountCode='OCCASION_LOCAL' WHERE id=?",[campaign.insertId,id]);
  const target={action:'toggle' as const,id,enabled:true},r=await caller().reviewAction(target);
  expect(r).toMatchObject({eligible:true,terms:{messagePreview:'Exact saved message',messageSource:'linked_campaign'}});
  await q("UPDATE discount_codes SET maxUses=10 WHERE merchantId=? AND code='OCCASION_LOCAL'",[other.merchantId]);
  await expect(caller().applyAction({target,reviewRevision:r.reviewRevision,acknowledged:true})).rejects.toMatchObject({code:'CONFLICT'});
  expect((await caller().reviewAction(target))).toMatchObject({eligible:false,reason:'invalid'});
  await q("UPDATE discount_codes SET maxUses=2000,usedCount=2000 WHERE merchantId=? AND code='OCCASION_LOCAL'",[other.merchantId]);
  expect((await caller().reviewAction(target)).eligible).toBe(false);
  await q("UPDATE discount_codes SET usedCount=0 WHERE merchantId=? AND code='OCCASION_LOCAL'",[other.merchantId]);
  await q('UPDATE campaigns SET targetAudience=? WHERE id=?',[JSON.stringify({customerIds:[1]}),campaign.insertId]);
  expect((await caller().reviewAction(target)).eligible).toBe(false);expect((await read(id))[0].enabled).toBe(0);
 });
 it('observes membership revocation committed while waiting for the parent lock',async()=>{
  const {id}=await draft(),value=await enable(id),pool=(await getPool())!,blocker=await pool.getConnection(),waiting=await pool.getConnection(),execute=waiting.execute.bind(waiting);let entered!:()=>void;const started=new Promise<void>(r=>{entered=r;});await blocker.beginTransaction();await blocker.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE',[other.merchantId]);const acquired=vi.spyOn(pool,'getConnection').mockResolvedValueOnce(waiting);(waiting as any).execute=async(sql:any,args:any)=>{if(String(sql).includes('FROM merchants'))entered();return execute(sql,args);};const result=applyOccasionAction(owner.userId,other.merchantId,value).then(()=> 'unexpected',e=>e.reason);
  try{await started;await blocker.execute('UPDATE merchant_members SET is_active=0 WHERE merchant_id=? AND user_id=?',[other.merchantId,owner.userId]);await blocker.commit();expect(await result).toBe('forbidden');expect((await read(id))[0].enabled).toBe(0);}finally{acquired.mockRestore();(waiting as any).execute=execute;await blocker.rollback();blocker.release();await result;}
 });
 it('observes job admission committed while waiting for the definition lock',async()=>{
  const {id}=await draft(),value=await enable(id),pool=(await getPool())!,blocker=await pool.getConnection(),waiting=await pool.getConnection(),execute=waiting.execute.bind(waiting);let entered!:()=>void;const started=new Promise<void>(r=>{entered=r;});await blocker.beginTransaction();await blocker.execute('SELECT id FROM occasion_campaigns WHERE id=? FOR UPDATE',[id]);const acquired=vi.spyOn(pool,'getConnection').mockResolvedValueOnce(waiting);(waiting as any).execute=async(sql:any,args:any)=>{if(String(sql).includes('FROM occasion_campaigns')&&String(sql).includes('FOR UPDATE'))entered();return execute(sql,args);};const result=applyOccasionAction(owner.userId,other.merchantId,value).then(()=> 'unexpected',e=>e.reason);
  try{await started;await blocker.execute("UPDATE occasion_campaigns SET status='sending' WHERE id=?",[id]);await blocker.commit();expect(await result).toBe('stale');expect((await read(id))[0]).toMatchObject({enabled:0,status:'sending'});}finally{acquired.mockRestore();(waiting as any).execute=execute;await blocker.rollback();blocker.release();await result;}
 });
});
