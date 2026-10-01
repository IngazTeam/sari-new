import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as db from './db';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { filterCampaignAudience } from './automation/campaign-delivery-outbox';

describe.skipIf(!process.env.DATABASE_URL)('advanced campaign storage on disposable tenants',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,id:number;
  const q=async(sql:string,args:any[]=[]) => (await (await db.getPool())!.execute<any>(sql,args))[0];
  const log=(status:'success'|'failed'|'pending')=>db.createCampaignLog({campaignId:id,customerPhone:'99900000001',customerName:'Local fixture',status,sentAt:'2026-10-01 10:30:00'});
  beforeEach(async()=>{owner=await createDisposableMerchant('campaign-legacy');id=(await db.createCampaign({merchantId:owner.merchantId,name:'Local test',message:'Fixture',status:'draft'}))!.id;});
  afterEach(async()=>{await q('DELETE l FROM campaignLogs l JOIN campaigns c ON c.id=l.campaignId WHERE c.merchantId=?',[owner.merchantId]);await cleanupDisposableMerchants([owner.userId]);});afterAll(db.closeDb);
  it('creates and reads a log with the exact campaign and timestamp',async()=>{
    const saved=(await log('success'))!;expect(await db.getCampaignLogById(saved.id)).toMatchObject({id:saved.id,campaignId:id,status:'success',sentAt:'2026-10-01 10:30:00'});
  });
  it('reads only the requested campaign logs',async()=>{await log('success');expect(await db.getCampaignLogsByCampaignId(id)).toHaveLength(1);expect(await db.getCampaignLogsByCampaignId(2147483647)).toEqual([]);});
  it('computes exact report counts and rounded acceptance share',async()=>{
    await log('success');await log('failed');await log('pending');expect((await db.getCampaignLogsWithStats(id)).stats).toEqual({total:3,success:1,failed:1,pending:1,successRate:33});
  });
  it('updates an existing log and preserves its identity',async()=>{const saved=(await log('failed'))!;await db.updateCampaignLog(saved.id,{status:'success',errorMessage:null});expect(await db.getCampaignLogById(saved.id)).toMatchObject({id:saved.id,campaignId:id,status:'success',errorMessage:null});});
  const audience=[{id:1,customerPhone:'99900000001',purchaseCount:0,lastActivityAt:new Date()}, {id:2,customerPhone:'99900000002',purchaseCount:3,lastActivityAt:new Date(Date.now()-90*86400000)},{id:3,customerPhone:'99900000003',purchaseCount:7,lastActivityAt:new Date()}];
  it('filters actual targeting by recent activity',()=>expect(filterCampaignAudience(audience,JSON.stringify({lastActivityDays:30})).map(c=>c.id)).toEqual([1,3]));
  it('filters actual targeting by minimum purchases',()=>expect(filterCampaignAudience(audience,JSON.stringify({purchaseCountMin:1})).map(c=>c.id)).toEqual([2,3]));
  it('filters actual targeting by purchase range',()=>expect(filterCampaignAudience(audience,JSON.stringify({purchaseCountMin:1,purchaseCountMax:5})).map(c=>c.id)).toEqual([2]));
  it('reads purchase fields from its own non-empty customer fixture',async()=>{
    await q("INSERT INTO conversations (merchantId,customerPhone,customerName,purchaseCount,totalSpent) VALUES (?,'99900000001','Local fixture',3,1250)",[owner.merchantId]);
    expect(await db.getConversationsByMerchantId(owner.merchantId)).toEqual([expect.objectContaining({purchaseCount:3,totalSpent:1250})]);
  });
  it('creates a scheduled campaign with a stored UTC date',async()=>{
    const created=await db.createCampaign({merchantId:owner.merchantId,name:'Schedule fixture',message:'Fixture',status:'scheduled',scheduledAt:'2030-01-01 10:30:00'});expect(created).toMatchObject({status:'scheduled',scheduledAt:'2030-01-01 10:30:00'});
  });
  it('updates only its seeded campaign from scheduled to sending',async()=>{await db.updateCampaign(id,{status:'scheduled'});await db.updateCampaign(id,{status:'sending'});expect(await db.getCampaignById(id)).toMatchObject({status:'sending'});});
  it('preserves completed counters on its own campaign',async()=>{await db.updateCampaign(id,{status:'completed',sentCount:10,totalRecipients:10});expect(await db.getCampaignById(id)).toMatchObject({status:'completed',sentCount:10,totalRecipients:10});});
  it('returns a complete report for a known non-empty fixture',async()=>{await log('success');expect(await db.getCampaignsByMerchantId(owner.merchantId)).toHaveLength(1);expect(await db.getCampaignLogsWithStats(id)).toMatchObject({logs:[{campaignId:id}],stats:{total:1,success:1,failed:0,pending:0,successRate:100}});});
});
