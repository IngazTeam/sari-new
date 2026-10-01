import { afterAll,afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { getDb,getPool,closeDb } from './db/connection';
import { createDisposableMerchant,cleanupDisposableMerchants } from './tests/helpers/disposable-merchant';
import { readCampaignWorkspace,readCampaignStatistics,CampaignWorkspaceUnavailableError } from './campaign-workspace';
import { campaignStatuses } from '../shared/campaign-workspace';

describe.skipIf(!process.env.DATABASE_URL)('campaign workspace read-only tenant snapshot in MySQL',()=>{
  let owner:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof owner;
  const q=async(sql:string,args:any[]=[]) => (await (await getPool())!.execute<any>(sql,args))[0];
  const create=async(name='Fixture',status='draft',sent=0,total=0,merchantId=owner.merchantId)=>Number((await q(
    "INSERT INTO campaigns (merchantId,name,message,status,sentCount,totalRecipients,createdAt) VALUES (?,?,'Fixture',?,?,?,'2026-09-30 12:00:00')",[merchantId,name,status,sent,total])).insertId);
  const read=(selection={})=>readCampaignWorkspace(owner.userId,owner.merchantId,selection,new Date('2026-10-01T12:00:00Z'));
  beforeEach(async()=>{owner=await createDisposableMerchant('campaign-page');other=await createDisposableMerchant('campaign-other');});
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants([owner.userId,other.userId]);});afterAll(closeDb);
  it('returns complete counts beyond 500 and bounds each page to 25',async()=>{
    const rows=Array.from({length:621},(_,i)=>[owner.merchantId,`Fixture ${i}`,'Fixture','completed',1,2]);
    await q(`INSERT INTO campaigns (merchantId,name,message,status,sentCount,totalRecipients) VALUES ${rows.map(()=>'(?,?,?,?,?,?)').join(',')}`,rows.flat());
    const first=await read(),last=await read({page:25});
    expect(first.summary).toMatchObject({total:621,completed:621,accepted:621,recipients:1242,acceptanceRate:50});expect(first.rows).toHaveLength(25);
    expect(first.pagination).toEqual({page:1,pageSize:25,total:621,pages:25});expect(last.rows).toHaveLength(21);
    expect(await readCampaignStatistics(owner.merchantId)).toMatchObject({totalCampaigns:621,completedCampaigns:621,totalAcceptedByProvider:621,totalUnconfirmed:621,providerAcceptanceRate:50});
  });
  it('keeps global lifecycle totals separate from search and status results',async()=>{
    for(const status of campaignStatuses)await create(`Match ${status}`,status,status==='sending'?2:status==='completed'?3:status==='failed'?1:0,['sending','completed','failed'].includes(status)?5:0);
    await create('Hidden','draft');await create('Foreign','completed',99,99,other.merchantId);
    const result=await read({search:'match',status:'sending'});
    expect(result.summary).toMatchObject({total:6,draft:2,scheduled:1,sending:1,completed:1,failed:1,accepted:6,recipients:15,unconfirmed:9});expect(result.pagination.total).toBe(1);expect(result.rows[0].name).toBe('Match sending');
    expect(await readCampaignStatistics(owner.merchantId)).toEqual({totalCampaigns:6,completedCampaigns:1,activeCampaigns:2,draftCampaigns:2,totalAcceptedByProvider:3,totalUnconfirmed:2,providerAcceptanceRate:60});
  });
  it('uses stable IDs to break creation-time ties across pages',async()=>{
    const ids=[];for(let i=0;i<30;i++)ids.push(await create(`Fixture ${i}`));
    const first=await read(),second=await read({page:2});expect([...first.rows,...second.rows].map(r=>r.id)).toEqual(ids.reverse());
  });
  it('treats percent, underscore and SQL syntax as literal search content',async()=>{
    await create('عرض 20%_خاص');await create("' OR 1=1 --");await create('Ordinary');
    expect((await read({search:'%_'})).rows.map(r=>r.name)).toEqual(['عرض 20%_خاص']);expect((await read({search:"' OR 1=1 --"})).pagination.total).toBe(1);
  });
  it('projects all visible queue states and the full review count without crossing tenants',async()=>{
    const mine=await create('Mine','sending'),theirs=await create('Theirs','sending',0,0,other.merchantId);
    for(const [i,status] of ['pending','failed','sent','suppressed','manual_review'].entries())await q('INSERT INTO campaign_delivery_outbox (campaign_id,merchant_id,customer_phone,status) VALUES (?,?,?,?)',[mine,owner.merchantId,String(99900000000+i),status]);
    await q("INSERT INTO campaign_delivery_outbox (campaign_id,merchant_id,customer_phone,status) VALUES (?,?,'99900000009','manual_review'),(?,?,'99900000008','manual_review')",[mine,other.merchantId,theirs,other.merchantId]);
    const result=await read();expect(result.needsReview).toBe(1);expect(result.rows[0].queue).toEqual({total:5,accepted:1,awaiting:2,suppressed:1,needsReview:1});expect(result.rows).toHaveLength(1);
  });
  it('distinguishes no queue evidence, an empty filter, and a page beyond the end',async()=>{
    await create();expect((await read()).rows[0].queue).toBeNull();
    expect(await read({search:'absent'})).toMatchObject({summary:{total:1},rows:[],pagination:{total:0,pages:0}});
    expect(await read({page:2})).toMatchObject({summary:{total:1},rows:[],pagination:{total:1,pages:1,page:2}});
  });
  it('returns exact account, tenant, filters and UTC dates',async()=>{
    const id=await create();await q("UPDATE campaigns SET scheduledAt='2026-10-05 12:30:00' WHERE id=?",[id]);
    await q("UPDATE merchants SET timezone='Asia/Riyadh' WHERE id=?",[owner.merchantId]);
    expect(await read({search:' Fixture '})).toMatchObject({actorId:owner.userId,merchantId:owner.merchantId,selection:{search:'Fixture',status:'all',page:1},timezone:'Asia/Riyadh',checkedAt:'2026-10-01T12:00:00.000Z',rows:[{createdAt:'2026-09-30T12:00:00.000Z',scheduledAt:'2026-10-05T12:30:00.000Z'}]});
  });
  it('exposes invalid timezone as unavailable instead of guessing a local timezone',async()=>{
    await q("UPDATE merchants SET timezone='Invalid/Timezone' WHERE id=?",[owner.merchantId]);expect((await read()).timezone).toBeNull();
  });
  it('keeps the aggregate, filtered count and page in the same snapshot while rows change',async()=>{
    const originalId=await create('Before');const db=(await getDb())!,native=db.transaction.bind(db);let changed=false;
    vi.spyOn(db,'transaction').mockImplementation(((run:any,options:any)=>native(async tx=>{
      const execute=tx.execute.bind(tx);vi.spyOn(tx,'execute').mockImplementation((async(...args:any[])=>{
        const result=await execute(...args as [any]);
        if(!changed && Array.isArray(result[0]) && 'completedAccepted' in (result[0][0]||{})){
          changed=true;await q('DELETE FROM campaigns WHERE id=?',[originalId]);await create('After');
        }return result;
      }) as any);return run(tx);
    },options)) as any);
    const snapshot=await read();expect(changed).toBe(true);expect(snapshot.summary.total).toBe(1);expect(snapshot.pagination.total).toBe(1);expect(snapshot.rows.map(r=>r.name)).toEqual(['Before']);
    vi.restoreAllMocks();expect((await read()).rows.map(r=>r.name)).toEqual(['After']);
  });
  it('does not manufacture a percentage from corrupt counters',async()=>{
    await create('Broken','completed',5,2);await expect(read()).rejects.toBeInstanceOf(CampaignWorkspaceUnavailableError);await expect(readCampaignStatistics(owner.merchantId)).rejects.toBeInstanceOf(CampaignWorkspaceUnavailableError);
  });
  it('returns a real empty tenant with zero counts and no fabricated acceptance sample',async()=>{
    expect(await read()).toMatchObject({summary:{total:0,accepted:0,recipients:0,acceptanceRate:0},rows:[],pagination:{total:0,pages:0},needsReview:0});
  });
});
