import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPool, closeDb } from './db/connection';
import { createDisposableMerchant, cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { deleteTenantCampaign } from './campaign-delete';

describe.skipIf(!process.env.DATABASE_URL)('atomic scoped campaign deletion in local MySQL',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner;
  const q=async(sql:string,args:any[]=[]) => (await (await getPool())!.execute<any>(sql,args))[0];
  const campaign=async(status='draft',merchant=owner.merchantId)=>Number((await q("INSERT INTO campaigns (merchantId,name,message,status) VALUES (?,'Delete fixture','Local test only',?)",[merchant,status])).insertId);
  const log=async(id:number)=>q("INSERT INTO campaignLogs (campaignId,customerPhone,status) VALUES (?,'99900000001','success')",[id]);
  const rows=(id:number)=>q('SELECT * FROM campaigns WHERE id=?',[id]);
  const logs=(id:number)=>q('SELECT * FROM campaignLogs WHERE campaignId=?',[id]);
  const delivery=async(id:number,status:string,patch:{merchant?:number;quota?:number}={})=>{
    await q(`INSERT INTO campaign_delivery_outbox (campaign_id,merchant_id,customer_phone,status,processing_token,claimed_at,quota_reserved,quota_subscription_id)
      VALUES (?,?,'99900000001',?, ?, ?, ?, ?)`,[id,patch.merchant??owner.merchantId,status,status==='processing'?'test-claim':null,status==='processing'?new Date():null,patch.quota??0,patch.quota?1:null]);
  };
  beforeEach(async()=>{owner=await createDisposableMerchant('campaign-delete');other=await createDisposableMerchant('campaign-other');});
  afterEach(async()=>{vi.restoreAllMocks();
    // campaignLogs predates a campaign FK on some test schemas; delete only owned fixtures.
    await q('DELETE l FROM campaignLogs l JOIN campaigns c ON c.id=l.campaignId WHERE c.merchantId IN (?,?)',[owner.merchantId,other.merchantId]);
    await cleanupDisposableMerchants([owner.userId,other.userId]);
  });afterAll(closeDb);
  it.each(['draft','scheduled','completed','failed'])('deletes a settled %s campaign and its logs atomically',async status=>{
    const id=await campaign(status);await log(id);await delivery(id,'sent');expect(await deleteTenantCampaign(id,owner.merchantId)).toBe(true);
    expect(await rows(id)).toEqual([]);expect(await logs(id)).toEqual([]);expect(await q('SELECT id FROM campaign_delivery_outbox WHERE campaign_id=?',[id])).toEqual([]);
  });
  it('rejects another tenant and a missing campaign without deleting owned logs',async()=>{
    const id=await campaign('draft',other.merchantId);await log(id);expect(await deleteTenantCampaign(id,owner.merchantId)).toBe(false);expect(await rows(id)).toHaveLength(1);expect(await logs(id)).toHaveLength(1);expect(await deleteTenantCampaign(2147483647,owner.merchantId)).toBe(false);
  });
  it('preserves a sending campaign and its logs',async()=>{const id=await campaign('sending');await log(id);expect(await deleteTenantCampaign(id,owner.merchantId)).toBe(false);expect(await logs(id)).toHaveLength(1);});
  it.each(['pending','processing','manual_review'])('preserves %s work even when the parent status says failed',async status=>{
    const id=await campaign('failed');await log(id);await delivery(id,status);expect(await deleteTenantCampaign(id,owner.merchantId)).toBe(false);expect(await rows(id)).toHaveLength(1);expect(await logs(id)).toHaveLength(1);
  });
  it('preserves quota reservations and mismatched child ownership',async()=>{
    const a=await campaign('failed'),b=await campaign('failed');await delivery(a,'failed',{quota:1});await delivery(b,'sent',{merchant:other.merchantId});
    expect(await deleteTenantCampaign(a,owner.merchantId)).toBe(false);expect(await deleteTenantCampaign(b,owner.merchantId)).toBe(false);
  });
  it('rolls back deleted logs if the campaign deletion fails',async()=>{
    const id=await campaign();await log(id);const pool=(await getPool())!,connection=await pool.getConnection(),native=connection.execute.bind(connection);
    vi.spyOn(pool,'getConnection').mockResolvedValueOnce(connection);
    vi.spyOn(connection,'execute').mockImplementation((async(...args:any[])=>{if(String(args[0]).startsWith('DELETE FROM campaigns'))throw Error('Injected final delete failure');return native(...args as [any,any]);}) as any);
    await expect(deleteTenantCampaign(id,owner.merchantId)).rejects.toThrow('Injected final delete failure');vi.restoreAllMocks();
    expect(await rows(id)).toHaveLength(1);expect(await logs(id)).toHaveLength(1);
  });
  it('waits for an in-flight dispatcher claim then rejects deletion of the now sending campaign',async()=>{
    const id=await campaign('scheduled');await log(id);const connection=await (await getPool())!.getConnection();let removing:Promise<boolean>|undefined;
    try{await connection.beginTransaction();await connection.execute('SELECT id FROM campaigns WHERE id=? FOR UPDATE',[id]);
      let done=false;removing=deleteTenantCampaign(id,owner.merchantId).then(value=>{done=true;return value;});
      await new Promise(resolve=>setTimeout(resolve,60));expect(done).toBe(false);
      await connection.execute("UPDATE campaigns SET status='sending' WHERE id=?",[id]);await connection.commit();expect(await removing).toBe(false);expect(await logs(id)).toHaveLength(1);
    }finally{await connection.rollback();connection.release();await removing;}
  });
  it('allows only one of two simultaneous deletes to succeed',async()=>{
    const id=await campaign();await log(id);expect((await Promise.all([deleteTenantCampaign(id,owner.merchantId),deleteTenantCampaign(id,owner.merchantId)])).sort()).toEqual([false,true]);expect(await logs(id)).toEqual([]);
  });
});
