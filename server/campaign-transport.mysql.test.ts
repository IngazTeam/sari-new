import { randomUUID } from 'node:crypto';
import { afterAll,afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({send:vi.fn(),quiet:vi.fn()}));
vi.mock('./channels/whatsapp/providers',()=>({getWhatsAppProvider:()=>({send:mocks.send})}));
vi.mock('./automation/campaign-guard',async original=>({...await original<typeof import('./automation/campaign-guard')>(),isQuietHours:mocks.quiet}));
import { getPool,closeDb } from './db/connection';
import { createDisposableMerchant,createDisposableTrialSubscription,cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { reserveCampaignQuota,releaseCampaignQuota,type CampaignQuotaLease } from './campaign-quota';
import { sendMerchantWhatsApp } from './channels/whatsapp/service';
import { runCampaignDeliveryBatch } from './automation/campaign-delivery-outbox';
import { withCampaignOptOutNotice } from './automation/campaign-guard';
import type { SendMerchantWhatsAppInput } from './channels/whatsapp/types';

describe.skipIf(!process.env.DATABASE_URL)('campaign transport fencing with real local MySQL and a stubbed provider',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner,sub:number,lease:CampaignQuotaLease,input:SendMerchantWhatsAppInput;
  const q=async(sql:string,args:any[]=[]) => (await (await getPool())!.execute<any>(sql,args))[0];
  const receipt=async()=> (await q('SELECT * FROM whatsapp_message_deliveries WHERE merchant_id=? AND idempotency_key=?',[owner.merchantId,input.idempotencyKey]))[0];
  beforeEach(async()=>{
    vi.clearAllMocks();mocks.quiet.mockReturnValue(false);mocks.send.mockResolvedValue({accepted:true,status:'sent',outcome:'accepted',providerMessageId:'fixture-receipt'});
    owner=await createDisposableMerchant('campaign-fence');other=await createDisposableMerchant('foreign-fence');sub=await createDisposableTrialSubscription(owner.merchantId);
    const campaignId=Number((await q("INSERT INTO campaigns (merchantId,name,message,status) VALUES (?,'Transport fixture','Fixture','sending')",[owner.merchantId])).insertId);
    const instanceId=Number((await q("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,provider,status,is_primary) VALUES (?,?,'test-token','mock','active',1)",[owner.merchantId,`fixture-${randomUUID()}`])).insertId);
    const deliveryId=Number((await q("INSERT INTO campaign_delivery_outbox (campaign_id,merchant_id,customer_phone,status,processing_token,claimed_at) VALUES (?,?,'966500000001','processing',?,UTC_TIMESTAMP(3))",[campaignId,owner.merchantId,'a'.repeat(64)])).insertId);
    lease={id:deliveryId,campaign_id:campaignId,merchant_id:owner.merchantId,processing_token:'a'.repeat(64)};
    await q("INSERT INTO campaign_consent_state (merchant_id,customer_phone,status,consent_version,source,evidence_digest,last_decided_at) VALUES (?,'966500000001','granted','fixture','whatsapp_text',REPEAT('a',64),UTC_TIMESTAMP(3))",[owner.merchantId]);
    expect(await reserveCampaignQuota(lease)).toEqual({accepted:true});
    input={merchantId:owner.merchantId,instanceRecordId:instanceId,to:'966500000001',kind:'text',text:withCampaignOptOutNotice('Fixture'),idempotencyKey:`campaign:${campaignId}:${deliveryId}`,retryFailed:true,campaignGuard:{campaignId,deliveryId,token:lease.processing_token}};
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants([owner.userId,other.userId]);});afterAll(closeDb);
  it('sends once and preserves the reserved period and durable authority',async()=>{
    expect(await sendMerchantWhatsApp(input)).toMatchObject({accepted:true,duplicate:false,status:'sent'});
    expect(await sendMerchantWhatsApp(input)).toMatchObject({accepted:true,duplicate:true});expect(mocks.send).toHaveBeenCalledOnce();
    const saved=await receipt();expect(saved.status).toBe('sent');const payload=typeof saved.request_json==='string'?JSON.parse(saved.request_json):saved.request_json;expect(payload.campaignGuard).toEqual(input.campaignGuard);
  });
  it.each(['expired','future','revoked','token','foreign-tenant','foreign-campaign','destination','content','image','no-quota','legacy-quota','new-period','new-subscription','expired-subscription','inactive-merchant','inactive-campaign','withdrawn','withdrawn-alias','quiet'])('blocks %s before provider I/O',async mode=>{
    if(mode==='expired')await q('UPDATE campaign_delivery_outbox SET claimed_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 6 MINUTE) WHERE id=?',[lease.id]);
    if(mode==='future')await q('UPDATE campaign_delivery_outbox SET claimed_at=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 6 MINUTE) WHERE id=?',[lease.id]);
    if(mode==='revoked')await q("UPDATE campaign_delivery_outbox SET status='manual_review',processing_token=NULL,claimed_at=NULL WHERE id=?",[lease.id]);
    if(mode==='token')input.campaignGuard!.token='b'.repeat(64);
    if(mode==='foreign-tenant')input.merchantId=other.merchantId;
    if(mode==='foreign-campaign'){input.campaignGuard!.campaignId++;input.idempotencyKey=`campaign:${input.campaignGuard!.campaignId}:${lease.id}`;}
    if(mode==='destination')input.to='966500000002';if(mode==='content')input.text='Altered';
    if(mode==='image'){input.kind='image';input.mediaUrl='https://example.test/altered.png';input.fileName='campaign.jpg';}
    if(mode==='no-quota')await releaseCampaignQuota(lease);
    if(mode==='legacy-quota')await q('UPDATE campaign_delivery_outbox SET quota_period_start=NULL WHERE id=?',[lease.id]);
    if(mode==='new-period')await q('UPDATE merchant_subscriptions SET last_reset_at=DATE_ADD(last_reset_at,INTERVAL 1 SECOND) WHERE id=?',[sub]);
    if(mode==='new-subscription')await createDisposableTrialSubscription(owner.merchantId);
    if(mode==='expired-subscription')await q('UPDATE merchant_subscriptions SET end_date=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND) WHERE id=?',[sub]);
    if(mode==='inactive-merchant')await q("UPDATE merchants SET status='suspended' WHERE id=?",[owner.merchantId]);
    if(mode==='inactive-campaign')await q("UPDATE campaigns SET status='completed' WHERE id=?",[lease.campaign_id]);
    if(mode==='withdrawn')await q("UPDATE campaign_consent_state SET status='withdrawn' WHERE merchant_id=?",[owner.merchantId]);
    if(mode==='withdrawn-alias')await q("INSERT INTO campaign_consent_state (merchant_id,customer_phone,status,consent_version,source,evidence_digest,last_decided_at) VALUES (?,'+966500000001','withdrawn','fixture','whatsapp_text',REPEAT('b',64),UTC_TIMESTAMP(3))",[owner.merchantId]);
    if(mode==='quiet')mocks.quiet.mockReturnValue(true);
    expect((await sendMerchantWhatsApp(input)).accepted).toBe(false);expect(mocks.send).not.toHaveBeenCalled();
  });
  it('retries an explicit rejection with a newly charged lease and the same payload',async()=>{
    mocks.send.mockResolvedValueOnce({accepted:false,status:'failed',outcome:'rejected',errorCode:'http_400'});
    expect(await sendMerchantWhatsApp(input)).toMatchObject({accepted:false,status:'failed'});await releaseCampaignQuota(lease);
    lease.processing_token='b'.repeat(64);input.campaignGuard!.token=lease.processing_token;
    await q('UPDATE campaign_delivery_outbox SET processing_token=?,claimed_at=UTC_TIMESTAMP(3) WHERE id=?',[lease.processing_token,lease.id]);await reserveCampaignQuota(lease);
    expect(await sendMerchantWhatsApp(input)).toMatchObject({accepted:true});expect(mocks.send).toHaveBeenCalledTimes(2);
    const saved=await receipt(),request=typeof saved.request_json==='string'?JSON.parse(saved.request_json):saved.request_json;expect(request.campaignGuard.token).toBe(lease.processing_token);
  });
  it('does not resend an unknown provider outcome',async()=>{
    mocks.send.mockRejectedValueOnce(Error('Lost response'));expect(await sendMerchantWhatsApp(input)).toMatchObject({accepted:false,status:'queued'});
    expect(await sendMerchantWhatsApp(input)).toMatchObject({accepted:false,duplicate:true,status:'queued'});expect(mocks.send).toHaveBeenCalledOnce();
  });
  it('does not strip campaign authority or alter the payload of a failed retry',async()=>{
    mocks.send.mockResolvedValueOnce({accepted:false,status:'failed',outcome:'rejected',errorCode:'http_400'});await sendMerchantWhatsApp(input);
    expect(await sendMerchantWhatsApp({...input,campaignGuard:undefined})).toMatchObject({accepted:false});
    expect(await sendMerchantWhatsApp({...input,text:'Altered'})).toMatchObject({accepted:false,duplicate:true});expect(mocks.send).toHaveBeenCalledOnce();
  });
  it('admits only one concurrent provider call',async()=>{
    const results=await Promise.all(Array.from({length:8},()=>sendMerchantWhatsApp(input)));
    expect(mocks.send).toHaveBeenCalledOnce();expect(results.filter(r=>!r.duplicate)).toHaveLength(1);
  });
  it('keeps the durable queued receipt and reserved quota if persistence fails after acceptance',async()=>{
    const pool=(await getPool())!,connection=await pool.getConnection(),native=connection.execute.bind(connection);vi.spyOn(pool,'getConnection').mockResolvedValueOnce(connection);
    vi.spyOn(connection,'execute').mockImplementation((async(...args:any[])=>{if(String(args[0]).includes('SET provider_message_id ='))throw Error('Injected receipt write failure');return native(...args as [any,any]);}) as any);
    await expect(sendMerchantWhatsApp(input)).rejects.toMatchObject({code:'delivery_outcome_unknown'});vi.restoreAllMocks();
    expect((await receipt()).status).toBe('queued');expect((await q('SELECT quota_reserved FROM campaign_delivery_outbox WHERE id=?',[lease.id]))[0].quota_reserved).toBe(1);
    expect(await sendMerchantWhatsApp(input)).toMatchObject({accepted:false,duplicate:true});expect(mocks.send).toHaveBeenCalledOnce();
  });
  it('holds the lease until the provider receipt is persisted',async()=>{
    let finish!:()=>void,started!:()=>void;const gate=new Promise<void>(r=>finish=r),entered=new Promise<void>(r=>started=r);
    mocks.send.mockImplementation(async()=>{started();await gate;return {accepted:true,status:'sent',providerMessageId:'fixture-receipt'};});
    const sending=sendMerchantWhatsApp(input);await entered;let revoked=false;
    const revoking=q("UPDATE campaign_delivery_outbox SET status='manual_review',processing_token=NULL,claimed_at=NULL WHERE id=?",[lease.id]).then(()=>{revoked=true;});
    try{await new Promise(r=>setTimeout(r,50));expect(revoked).toBe(false);expect((await receipt()).status).toBe('queued');}
    finally{finish();await sending;await revoking;}
    expect((await receipt()).status).toBe('sent');expect(mocks.send).toHaveBeenCalledOnce();
  });
  it('recovery rereads the accepted receipt after waiting for a dispatch already in flight',async()=>{
    await q('UPDATE campaign_delivery_outbox SET claimed_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 299 SECOND) WHERE id=?',[lease.id]);
    let finish!:()=>void,started!:()=>void;const gate=new Promise<void>(r=>finish=r),entered=new Promise<void>(r=>started=r);
    mocks.send.mockImplementation(async()=>{started();await gate;return {accepted:true,status:'sent',providerMessageId:'fixture-receipt'};});
    const sending=sendMerchantWhatsApp(input);await entered;await new Promise(r=>setTimeout(r,1100));
    const recovering=runCampaignDeliveryBatch(1);
    try{await new Promise(r=>setTimeout(r,50));}finally{finish();await sending;await recovering;}
    expect((await q('SELECT status,last_error FROM campaign_delivery_outbox WHERE id=?',[lease.id]))[0]).toMatchObject({status:'sent',last_error:null});
    expect((await q('SELECT status,errorMessage FROM campaignLogs WHERE campaign_outbox_id=?',[lease.id]))[0]).toMatchObject({status:'success',errorMessage:null});
    expect(mocks.send).toHaveBeenCalledOnce();
  });
});
