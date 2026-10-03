import {randomUUID} from 'node:crypto';
import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({send:vi.fn(),quiet:vi.fn()}));
vi.mock('./channels/whatsapp/providers',()=>({getWhatsAppProvider:()=>({send:mocks.send})}));
vi.mock('./automation/campaign-guard',async original=>({...await original<typeof import('./automation/campaign-guard')>(),isQuietHours:mocks.quiet}));
import {getPool,closeDb} from './db/connection';
import {createDisposableMerchant,createDisposableTrialSubscription,cleanupDisposableMerchants} from './tests/helpers/disposable-merchant';
import {reviewOccasionAction,applyOccasionAction} from './occasion-actions';
import {prepareOccasionCampaignEnvelope} from './automation/occasion-campaigns';
import {detectCurrentOccasions} from '../shared/occasion-calendar';
import {campaignDefinitionKey} from './campaign-definition';
import {enqueueCampaignDeliveries,completeCampaignWithoutRecipients,CampaignDispatchConflictError,CampaignAdmissionStateUnknownError,runCampaignDeliveryBatch} from './automation/campaign-delivery-outbox';
import {reserveCampaignQuota} from './campaign-quota';
import {withCampaignOptOutNotice} from './automation/campaign-guard';
import {sendMerchantWhatsApp} from './channels/whatsapp/service';

describe.skipIf(!process.env.DATABASE_URL)('reviewed occasion admission and transport on disposable MySQL tenants',()=>{
 let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,id:number,campaignId:number,instanceId:number;
 const at=new Date('2027-01-01T09:00:00Z'),token='a'.repeat(64);
 const q=async(sql:string,args:any[]=[]) => (await (await getPool())!.execute<any>(sql,args))[0];
 const campaign=async()=> (await q('SELECT * FROM campaigns WHERE id=?',[campaignId]))[0];
 const queued=()=>q('SELECT * FROM campaign_delivery_outbox WHERE campaign_id=?',[campaignId]);
 const enqueue=async()=>enqueueCampaignDeliveries({campaignId,merchantId:owner.merchantId,expectedDefinition:campaignDefinitionKey(await campaign()),recipients:[{phone:'966500000001'}]});
 const mutate=async(kind:string)=>{
  if(kind==='missing')await q('DELETE FROM occasion_authorizations WHERE occasion_id=?',[id]);
  if(kind==='revoked')await q('UPDATE occasion_authorizations SET active=NULL,revoked_at=UTC_TIMESTAMP(3) WHERE occasion_id=?',[id]);
  if(kind==='actor-inactive')await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[owner.userId]);
  if(kind==='role-revoked')await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",[owner.merchantId,owner.userId]);
  if(kind==='paused')await q('UPDATE occasion_campaigns SET enabled=0 WHERE id=?',[id]);
  if(kind==='message')await q("UPDATE campaigns SET message='Changed after approval' WHERE id=?",[campaignId]);
  if(kind==='discount')await q('UPDATE discount_codes SET maxUses=4000 WHERE merchantId=?',[owner.merchantId]);
  if(kind==='expired')vi.setSystemTime(new Date('2027-01-02T09:00:00Z'));
 };
 const input=async()=>{
  const row=(await queued())[0],definition=await campaign();
  return {merchantId:owner.merchantId,instanceRecordId:instanceId,to:row.customer_phone,kind:'text' as const,text:withCampaignOptOutNotice(definition.message),idempotencyKey:`campaign:${campaignId}:${row.id}`,retryFailed:true,campaignGuard:{campaignId,deliveryId:row.id,token}};
 };
 const claim=async()=>{
  await enqueue();const row=(await queued())[0];
  await q("UPDATE campaign_delivery_outbox SET status='processing',processing_token=?,claimed_at=UTC_TIMESTAMP(3) WHERE id=?",[token,row.id]);
  expect(await reserveCampaignQuota({id:row.id,campaign_id:campaignId,merchant_id:owner.merchantId,processing_token:token})).toEqual({accepted:true});
 };
 beforeEach(async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(at);vi.clearAllMocks();mocks.quiet.mockReturnValue(false);
  mocks.send.mockResolvedValue({accepted:true,status:'sent',outcome:'accepted',providerMessageId:'local-occasion-receipt'});
  owner=await createDisposableMerchant('occasion-dispatch');await createDisposableTrialSubscription(owner.merchantId);
  instanceId=Number((await q("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,provider,status,is_primary) VALUES (?,?,'test-token','mock','active',1)",[owner.merchantId,`fixture-${randomUUID()}`])).insertId);
  await q("INSERT INTO campaign_consent_state (merchant_id,customer_phone,status,consent_version,source,evidence_digest,last_decided_at) VALUES (?,'966500000001','granted','fixture','whatsapp_text',REPEAT('a',64),UTC_TIMESTAMP(3))",[owner.merchantId]);
  id=Number((await q("INSERT INTO occasion_campaigns (merchantId,occasionType,year,enabled,discountPercentage,status) VALUES (?,'new_year',2027,0,23,'pending')",[owner.merchantId])).insertId);
  const target={action:'toggle' as const,id,enabled:true},review=await reviewOccasionAction(owner.userId,owner.merchantId,target);
  await applyOccasionAction(owner.userId,owner.merchantId,{target,reviewRevision:review.reviewRevision,acknowledged:true});
  campaignId=(await prepareOccasionCampaignEnvelope({merchantId:owner.merchantId,occasionCampaignId:id,occasion:detectCurrentOccasions(at)[0],now:at})).campaignId;
 });
 afterEach(async()=>{vi.useRealTimers();vi.restoreAllMocks();await cleanupDisposableMerchants([owner.userId]);});afterAll(closeDb);
 it('admits and sends a prepared reviewed occasion exactly once',async()=>{
  await claim();const value=await input();expect(await sendMerchantWhatsApp(value)).toMatchObject({accepted:true,duplicate:false});
  expect(await sendMerchantWhatsApp(value)).toMatchObject({accepted:true,duplicate:true});expect(mocks.send).toHaveBeenCalledOnce();
 });
 for(const kind of ['missing','revoked','actor-inactive','role-revoked','paused','message','discount','expired']){
  it(`rejects ${kind} before queue insertion and empty completion`,async()=>{
   await mutate(kind);await expect(enqueue()).rejects.toBeInstanceOf(CampaignDispatchConflictError);
   expect(await completeCampaignWithoutRecipients(campaignId,owner.merchantId,campaignDefinitionKey(await campaign()))).toBe(false);
   expect(await queued()).toEqual([]);expect((await campaign()).status).toBe('draft');expect(mocks.send).not.toHaveBeenCalled();
  });
  it(`rejects ${kind} after admission and before provider I/O`,async()=>{
   await claim();await mutate(kind);expect(await sendMerchantWhatsApp(await input())).toMatchObject({accepted:false});expect(mocks.send).not.toHaveBeenCalled();
  });
 }
 it('waits for a concurrent grant revocation, then denies admission',async()=>{
  const tx=await (await getPool())!.getConnection();await tx.beginTransaction();await tx.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE',[owner.merchantId]);await tx.execute('SELECT id FROM occasion_authorizations WHERE occasion_id=? FOR UPDATE',[id]);
  let settled=false;const pending=enqueue().then(value=>({value}),error=>({error})).finally(()=>{settled=true;});
  try{await new Promise(r=>setTimeout(r,60));expect(settled).toBe(false);await tx.execute('UPDATE occasion_authorizations SET active=NULL,revoked_at=UTC_TIMESTAMP(3) WHERE occasion_id=?',[id]);await tx.commit();expect(await pending).toMatchObject({error:expect.any(CampaignDispatchConflictError)});expect(await queued()).toEqual([]);}
  finally{await tx.rollback();tx.release();await pending;}
 });
 it('retains a committed admission after acknowledgement loss and refuses duplicate recipients',async()=>{
  const pool=(await getPool())!,tx=await pool.getConnection(),commit=tx.commit.bind(tx);vi.spyOn(pool,'getConnection').mockResolvedValueOnce(tx);const destroyed=vi.spyOn(tx,'destroy');
  vi.spyOn(tx,'commit').mockImplementation(async()=>{await commit();throw Error('Commit acknowledgement lost');});
  await expect(enqueue()).rejects.toBeInstanceOf(CampaignAdmissionStateUnknownError);expect(destroyed).toHaveBeenCalledOnce();vi.restoreAllMocks();
  expect(await queued()).toHaveLength(1);await expect(enqueue()).rejects.toBeInstanceOf(CampaignDispatchConflictError);expect(await queued()).toHaveLength(1);
 });
 it('holds grant authority until the provider result is persisted and retains acceptance after revocation',async()=>{
  await claim();const value=await input();let finish!:()=>void,started!:()=>void;
  const gate=new Promise<void>(r=>finish=r),entered=new Promise<void>(r=>started=r);
  mocks.send.mockImplementation(async()=>{started();await gate;return {accepted:true,status:'sent',outcome:'accepted',providerMessageId:'local-occasion-receipt'};});
  const sending=sendMerchantWhatsApp(value);await entered;let revoked=false;const revoking=mutate('revoked').then(()=>{revoked=true;});
  try{await new Promise(r=>setTimeout(r,60));expect(revoked).toBe(false);}finally{finish();await sending;await revoking;}
  await q("UPDATE campaign_delivery_outbox SET status='pending',processing_token=NULL,claimed_at=NULL,available_at=UTC_TIMESTAMP(3) WHERE campaign_id=?",[campaignId]);
  await runCampaignDeliveryBatch(1);expect((await queued())[0].status).toBe('sent');expect(mocks.send).toHaveBeenCalledOnce();
 });
 it('never retries an uncertain provider outcome after the author loses permission',async()=>{
  await claim();const value=await input();mocks.send.mockRejectedValueOnce(Error('Response lost'));
  expect(await sendMerchantWhatsApp(value)).toMatchObject({accepted:false,status:'queued'});await mutate('role-revoked');
  expect(await sendMerchantWhatsApp(value)).toMatchObject({accepted:false,duplicate:true,status:'queued'});expect(mocks.send).toHaveBeenCalledOnce();
 });
 it('rolls back admission when the occasion expires during recipient insertion',async()=>{
  const pool=(await getPool())!,tx=await pool.getConnection(),native=tx.execute.bind(tx);vi.spyOn(pool,'getConnection').mockResolvedValueOnce(tx);
  vi.spyOn(tx,'execute').mockImplementation((async(sql:any,args:any)=>{const result=await native(sql,args);if(String(sql).includes('INSERT INTO campaign_delivery_outbox'))vi.setSystemTime(new Date('2027-01-02T09:00:00Z'));return result;}) as any);
  await expect(enqueue()).rejects.toBeInstanceOf(CampaignDispatchConflictError);vi.restoreAllMocks();expect(await queued()).toEqual([]);expect((await campaign()).status).toBe('draft');
 });
 it('rechecks the occasion window immediately before the provider call',async()=>{
  await claim();const value=await input(),pool=(await getPool())!,tx=await pool.getConnection(),native=tx.execute.bind(tx);vi.spyOn(pool,'getConnection').mockResolvedValueOnce(tx);
  vi.spyOn(tx,'execute').mockImplementation((async(sql:any,args:any)=>{const result=await native(sql,args);if(String(sql).includes('claimed_at BETWEEN'))vi.setSystemTime(new Date('2027-01-02T09:00:00Z'));return result;}) as any);
  expect(await sendMerchantWhatsApp(value)).toMatchObject({accepted:false});expect(mocks.send).not.toHaveBeenCalled();
 });
 it('recovers a committed provider receipt after transport commit acknowledgement loss',async()=>{
  await claim();const value=await input(),pool=(await getPool())!,tx=await pool.getConnection(),commit=tx.commit.bind(tx);vi.spyOn(pool,'getConnection').mockResolvedValueOnce(tx);const destroyed=vi.spyOn(tx,'destroy');
  vi.spyOn(tx,'commit').mockImplementation(async()=>{await commit();throw Error('Commit acknowledgement lost');});
  await expect(sendMerchantWhatsApp(value)).rejects.toMatchObject({code:'delivery_outcome_unknown'});expect(destroyed).toHaveBeenCalledOnce();vi.restoreAllMocks();
  expect(await sendMerchantWhatsApp(value)).toMatchObject({accepted:true,duplicate:true});expect(mocks.send).toHaveBeenCalledOnce();
 });
});
