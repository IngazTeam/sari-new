import {beforeEach,afterEach,afterAll,describe,it,expect,vi} from 'vitest';
import {getPool,closeDb} from './db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from './tests/helpers/disposable-merchant';
import {prepareOccasionCampaignEnvelope,OccasionEnvelopeStateUnknownError} from './automation/occasion-campaigns';
import {reviewOccasionAction,applyOccasionAction} from './occasion-actions';
import {detectCurrentOccasions} from '../shared/occasion-calendar';
import {databaseTimeEpoch} from './db/time';

describe.skipIf(!process.env.DATABASE_URL)('atomic occasion envelopes on disposable MySQL tenants',()=>{
 let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner,id:number;
 const at=new Date('2027-01-01T09:00:00Z');
 const q=async(sql:string,args:any[]=[]) =>(await (await getPool())!.execute<any>(sql,args))[0];
 const input=()=>({merchantId:owner.merchantId,occasionCampaignId:id,occasion:detectCurrentOccasions(at)[0],now:at});
 const counts=async()=>Promise.all(['campaigns','discount_codes','campaign_delivery_outbox'].map(async table=>(await q(`SELECT COUNT(*) n FROM ${table} WHERE ${table==='campaign_delivery_outbox'?'merchant_id':'merchantId'}=?`,[owner.merchantId]))[0].n));
 beforeEach(async()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(at);owner=await createDisposableMerchant('occasion-envelope');other=await createDisposableMerchant('occasion-foreign');id=Number((await q("INSERT INTO occasion_campaigns (merchantId,occasionType,year,enabled,discountPercentage,status) VALUES (?,'new_year',2027,0,23,'pending')",[owner.merchantId])).insertId);const target={action:'toggle' as const,id,enabled:true},r=await reviewOccasionAction(owner.userId,owner.merchantId,target);await applyOccasionAction(owner.userId,owner.merchantId,{target,reviewRevision:r.reviewRevision,acknowledged:true});});
 afterEach(async()=>{vi.useRealTimers();vi.restoreAllMocks();await cleanupDisposableMerchants([owner.userId,other.userId]);});afterAll(closeDb);
 it('creates one discount and draft then reuses the same envelope without queueing',async()=>{
  const first=await prepareOccasionCampaignEnvelope(input());expect(first.created).toBe(true);expect(await counts()).toEqual([1,1,0]);
  expect(await prepareOccasionCampaignEnvelope(input())).toEqual({...first,created:false});expect(await counts()).toEqual([1,1,0]);
  expect((await q('SELECT enabled,status,recipientCount,sentAt,campaign_id FROM occasion_campaigns WHERE id=?',[id]))[0]).toMatchObject({enabled:1,status:'pending',recipientCount:0,sentAt:null,campaign_id:first.campaignId});
  const discount=(await q('SELECT value,minOrderAmount,maxUses,usedCount,expiresAt FROM discount_codes WHERE merchantId=?',[owner.merchantId]))[0];
  expect(discount).toMatchObject({value:23,minOrderAmount:0,maxUses:2000,usedCount:0});expect(databaseTimeEpoch(discount.expiresAt)).toBe(Date.parse('2027-01-01T20:59:59Z'));
 });
 it('converges concurrent preparation onto one discount and campaign',async()=>{
  const results=await Promise.all([prepareOccasionCampaignEnvelope(input()),prepareOccasionCampaignEnvelope(input())]);
  expect(new Set(results.map(r=>r.campaignId)).size).toBe(1);expect(results.filter(r=>r.created)).toHaveLength(1);expect(await counts()).toEqual([1,1,0]);
 });
 it.each(['revoked-grant','inactive-account','revoked-owner'])('does not prepare after %s',async kind=>{
  if(kind==='revoked-grant')await q('UPDATE occasion_authorizations SET active=NULL,revoked_at=UTC_TIMESTAMP(3) WHERE occasion_id=?',[id]);
  if(kind==='inactive-account')await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[owner.userId]);
  if(kind==='revoked-owner')await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",[owner.merchantId,owner.userId]);
  await expect(prepareOccasionCampaignEnvelope(input())).rejects.toThrow('occasion_authorization_denied');expect(await counts()).toEqual([0,0,0]);
 });
 it('rejects an edited prepared message even when its discount remains valid',async()=>{
  const result=await prepareOccasionCampaignEnvelope(input());await q("UPDATE campaigns SET message='Changed after approval' WHERE id=? AND merchantId=?",[result.campaignId,owner.merchantId]);
  await expect(prepareOccasionCampaignEnvelope(input())).rejects.toThrow('occasion_authorization_denied');expect(await counts()).toEqual([1,1,0]);
 });
 it('rolls back the whole envelope if binding its authorization fails',async()=>{
  const pool=(await getPool())!,tx=await pool.getConnection(),native=tx.execute.bind(tx);vi.spyOn(pool,'getConnection').mockResolvedValueOnce(tx);
  vi.spyOn(tx,'execute').mockImplementation((async(sql:any,args:any)=>{if(String(sql).startsWith('UPDATE occasion_authorizations SET prepared_campaign_id'))throw Error('Injected binding failure');return native(sql,args);}) as any);
  await expect(prepareOccasionCampaignEnvelope(input())).rejects.toThrow('Injected binding failure');vi.restoreAllMocks();expect(await counts()).toEqual([0,0,0]);
  expect((await q('SELECT active,prepared_campaign_id FROM occasion_authorizations WHERE occasion_id=?',[id]))[0]).toEqual({active:1,prepared_campaign_id:null});
  expect((await q('SELECT campaign_id,discountCode FROM occasion_campaigns WHERE id=?',[id]))[0]).toEqual({campaign_id:null,discountCode:null});
 });
 it('rejects another tenant and custom content without creating records',async()=>{
  await expect(prepareOccasionCampaignEnvelope({...input(),merchantId:other.merchantId})).rejects.toThrow();await q("UPDATE occasion_campaigns SET messageTemplate='Custom but unused' WHERE id=?",[id]);await expect(prepareOccasionCampaignEnvelope(input())).rejects.toThrow();expect(await counts()).toEqual([0,0,0]);
 });
 it('rolls back discount and campaign together when the final link fails',async()=>{
  const pool=(await getPool())!,tx=await pool.getConnection(),native=tx.execute.bind(tx);vi.spyOn(pool,'getConnection').mockResolvedValueOnce(tx);
  vi.spyOn(tx,'execute').mockImplementation((async(sql:any,args:any)=>{if(String(sql).startsWith('UPDATE occasion_campaigns'))throw Error('Injected link failure');return native(sql,args);}) as any);
  await expect(prepareOccasionCampaignEnvelope(input())).rejects.toThrow('Injected link failure');vi.restoreAllMocks();expect(await counts()).toEqual([0,0,0]);
  expect((await q('SELECT campaign_id,discountCode FROM occasion_campaigns WHERE id=?',[id]))[0]).toEqual({campaign_id:null,discountCode:null});
 });
 it('recovers an actual committed envelope after lost commit acknowledgement without creating a second one',async()=>{
  const pool=(await getPool())!,tx=await pool.getConnection(),commit=tx.commit.bind(tx);vi.spyOn(pool,'getConnection').mockResolvedValueOnce(tx);const destroyed=vi.spyOn(tx,'destroy');
  vi.spyOn(tx,'commit').mockImplementation(async()=>{await commit();throw Error('Commit acknowledgement lost');});
  await expect(prepareOccasionCampaignEnvelope(input())).rejects.toBeInstanceOf(OccasionEnvelopeStateUnknownError);expect(destroyed).toHaveBeenCalledOnce();vi.restoreAllMocks();
  expect(await counts()).toEqual([1,1,0]);expect((await prepareOccasionCampaignEnvelope(input())).created).toBe(false);expect(await counts()).toEqual([1,1,0]);
 });
 it.each(["maxUses=100","expiresAt='2027-01-02 20:59:59'","isActive=0","usedCount=2000"])(`rejects a prepared offer changed to %s`,async change=>{
  await prepareOccasionCampaignEnvelope(input());await q(`UPDATE discount_codes SET ${change} WHERE merchantId=?`,[owner.merchantId]);await expect(prepareOccasionCampaignEnvelope(input())).rejects.toThrow();expect(await counts()).toEqual([1,1,0]);
 });
 it('observes a pause committed while waiting for the parent lock',async()=>{
  const pool=(await getPool())!,blocker=await pool.getConnection(),waiting=await pool.getConnection(),native=waiting.execute.bind(waiting);let enter!:()=>void;const entered=new Promise<void>(r=>enter=r);
  await blocker.beginTransaction();await blocker.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE',[owner.merchantId]);vi.spyOn(pool,'getConnection').mockResolvedValueOnce(waiting);
  vi.spyOn(waiting,'execute').mockImplementation((async(sql:any,args:any)=>{if(String(sql).includes('FROM merchants'))enter();return native(sql,args);}) as any);
  const result=prepareOccasionCampaignEnvelope(input()).then(()=>false,()=>true);
  try{await entered;await blocker.execute('UPDATE occasion_campaigns SET enabled=0 WHERE id=?',[id]);await blocker.commit();expect(await result).toBe(true);expect(await counts()).toEqual([0,0,0]);}
  finally{await blocker.rollback();blocker.release();await result;}
 });
});
