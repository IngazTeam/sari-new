import {randomUUID} from 'node:crypto';
import {afterAll,afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const provider=vi.hoisted(()=>vi.fn());
vi.mock('../channels/whatsapp/providers',()=>({getWhatsAppProvider:()=>({send:provider})}));
import {getPool,closeDb} from '../db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from '../tests/helpers/disposable-merchant';
import {trySendDashboardStaff,reconcileDashboardStaff,runDashboardStaffRecoveryBatch} from './staff-dashboard-reply';
import {readStaffTextCompatibility} from './staff-dashboard-compatibility';
import {canDispatchDashboardStaff} from './staff-dashboard-reply';
import {staffDashboardKey} from './staff-dashboard-reply-contract';
import {policyArtifactDigest as hash} from './learning-policy-evaluation-bundle';

describe.skipIf(!process.env.DATABASE_URL)('durable text compatibility lifecycle',()=>{
  let f:Awaited<ReturnType<typeof createDisposableMerchant>>,conv:number,requestId:string;
  const q=async(sql:string,args:any[]=[])=>((await (await getPool())!.execute<any>(sql,args))[0]);
  const input=()=>({conversationId:conv,requestId,message:'عرض تجريبي واضح'});
  const legacy=vi.fn(),send=()=>trySendDashboardStaff(f.merchantId,f.userId,input(),legacy);
  const attempts=()=>q('SELECT * FROM ai_sales_staff_replies WHERE merchant_id=?',[f.merchantId]);
  const facts=()=>q('SELECT * FROM ai_sales_staff_acceptances WHERE merchant_id=?',[f.merchantId]);
  beforeEach(async()=>{f=await createDisposableMerchant('text-compat');requestId=randomUUID();
    conv=Number((await q("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500006611')",[f.merchantId])).insertId);
    legacy.mockReset().mockResolvedValue({success:true,persisted:true});provider.mockReset();
  });
  afterEach(async()=>{vi.restoreAllMocks();await cleanupDisposableMerchants([f.userId]);});afterAll(closeDb);
  async function failSql(fragment:string){const pool=(await getPool())!,connect=pool.getConnection.bind(pool);vi.spyOn(pool,'getConnection').mockImplementation(async()=>{
    const c=await connect(),execute=c.execute.bind(c);vi.spyOn(c,'execute').mockImplementation(((sql:any,args:any)=>{if(String(sql).includes(fragment))throw Error('synthetic SQL failure');return execute(sql,args);}) as any);return c;
  });}
  it.each(['legacy','group-prefix','group-jid'])('executes one %s callback across concurrent calls and a new pool',async kind=>{
    if(kind!=='legacy'){await q('UPDATE conversations SET customerPhone=? WHERE id=?',[kind==='group-prefix'?'group_120363123':'120363123@g.us',conv]);
      await q("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,status,is_primary) VALUES (?,'synthetic','fixture','active',1)",[f.merchantId]);}
    await Promise.all(Array.from({length:8},send));await closeDb();expect(await send()).toEqual({success:true,status:'accepted',persisted:true});
    expect(legacy).toHaveBeenCalledOnce();expect(provider).not.toHaveBeenCalled();const rows=await attempts();expect(rows).toHaveLength(1);
    expect(readStaffTextCompatibility(rows[0]).result).toMatchObject({success:true});expect(await facts()).toEqual([]);
  });
  it('stores pending before transport and does not let concurrent callers dispatch',async()=>{
    let release!:()=>void,start!:()=>void;const begun=new Promise<void>(r=>start=r),held=new Promise<void>(r=>release=r);
    legacy.mockImplementation(async target=>{expect(target.customerPhone).toBe('966500006611');expect((await attempts())[0].status).toBe('reserved');start();await held;return {success:true,persisted:false};});
    const first=send();await begun;try{expect(await send()).toEqual({success:false,status:'pending',persisted:false});}finally{release();}
    expect(await first).toEqual({success:true,status:'accepted',persisted:false});expect(legacy).toHaveBeenCalledOnce();
  });
  it.each(['throws','unsuccessful','invalid-result','invalid-success'])('never repeats %s legacy effects after reconnect or account registration',async kind=>{
    if(kind==='throws')legacy.mockRejectedValue(Error('unknown transport'));else legacy.mockResolvedValue(kind==='unsuccessful'?{success:false,persisted:false}:kind==='invalid-success'?{success:'true',persisted:true}:{success:true,persisted:'untrusted'});
    expect(await send()).toMatchObject({success:false,status:'pending'});await closeDb();
    await q("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,status,is_primary) VALUES (?,'new','fixture','active',1)",[f.merchantId]);
    expect(await send()).toMatchObject({success:false,status:'pending'});expect(legacy).toHaveBeenCalledOnce();expect(provider).not.toHaveBeenCalled();expect(await facts()).toEqual([]);
  });
  it.each(['message','conversationId'])('rejects reused identity with different %s',async field=>{
    await send();await expect(trySendDashboardStaff(f.merchantId,f.userId,{...input(),[field]:field==='message'?'نص مختلف':conv+1},legacy)).rejects.toThrow();expect(legacy).toHaveBeenCalledOnce();
  });
  it.each(['reserved','accepted'])('retains %s history after destination change or deletion',async status=>{
    if(status==='reserved')legacy.mockRejectedValue(Error('unknown'));await send();
    await q("UPDATE conversations SET customerPhone='group_999' WHERE id=?",[conv]);await send();await q('DELETE FROM conversations WHERE id=?',[conv]);
    expect((await send()).success).toBe(status==='accepted');expect(legacy).toHaveBeenCalledOnce();
  });
  it.each(['basis','status','phone','reply','result'])('rejects corrupted %s without redispatching',async field=>{
    await send();const [r]=await attempts();
    if(field==='basis')await q("UPDATE ai_sales_staff_replies SET basis_digest=REPEAT('b',64) WHERE id=?",[r.id]);
    if(field==='status')await q("UPDATE ai_sales_staff_replies SET status='reserved' WHERE id=?",[r.id]);
    if(field==='phone')await q("UPDATE ai_sales_staff_replies SET customer_phone='group_999' WHERE id=?",[r.id]);
    if(field==='reply')await q("UPDATE ai_sales_staff_replies SET reply_text='changed' WHERE id=?",[r.id]);
    if(field==='result')await q("UPDATE ai_sales_staff_replies SET basis=JSON_SET(basis,'$.result.persisted',false) WHERE id=?",[r.id]);
    await expect(send()).rejects.toThrow();expect(legacy).toHaveBeenCalledOnce();
  });
  it('rolls back a failed reservation basis before invoking the callback',async()=>{
    await failSql('SET basis=');await expect(send()).rejects.toThrow();vi.restoreAllMocks();expect(await attempts()).toEqual([]);expect(legacy).not.toHaveBeenCalled();
    expect(await send()).toMatchObject({success:true});expect(legacy).toHaveBeenCalledOnce();
  });
  it.each(['reservation','result'])('survives lost %s commit acknowledgement without another transport',async phase=>{
    const inject=async()=>{const pool=(await getPool())!,connect=pool.getConnection.bind(pool);let lost=false;vi.spyOn(pool,'getConnection').mockImplementation(async()=>{
      const c=await connect(),commit=c.commit.bind(c);vi.spyOn(c,'commit').mockImplementation(async()=>{await commit();if(!lost){lost=true;throw Error('lost commit acknowledgement');}});return c;
    });};
    if(phase==='reservation')await inject();else legacy.mockImplementation(async()=>{await inject();return {success:true,persisted:false};});
    await send().catch(()=>{});vi.restoreAllMocks();await closeDb();expect((await send()).success).toBe(phase==='result');expect(legacy).toHaveBeenCalledTimes(phase==='result'?1:0);
  });
  it('does not repeat a successful send after result persistence fails',async()=>{
    legacy.mockImplementation(async()=>{await failSql("SET status='accepted'");return {success:true,persisted:true};});
    expect(await send()).toMatchObject({success:false});vi.restoreAllMocks();expect(await send()).toMatchObject({status:'pending'});expect(legacy).toHaveBeenCalledOnce();
  });
  it('does not let another authorized employee inspect or replay a request',async()=>{
    const other=await createDisposableMerchant('compat-other');try{await send();await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'manager',1)",[f.merchantId,other.userId]);
      await expect(trySendDashboardStaff(f.merchantId,other.userId,input(),legacy)).rejects.toThrow();expect(legacy).toHaveBeenCalledOnce();
    }finally{await cleanupDisposableMerchants([other.userId]);}
  });
  it('isolates equal request IDs in different merchants',async()=>{
    const other=await createDisposableMerchant('compat-tenant');try{
      const c=Number((await q("INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500006611')",[other.merchantId])).insertId);
      await send();expect(await trySendDashboardStaff(other.merchantId,other.userId,{...input(),conversationId:c},legacy)).toMatchObject({success:true});
      expect(legacy).toHaveBeenCalledTimes(2);const [a]=await attempts(),[b]=await q('SELECT * FROM ai_sales_staff_replies WHERE merchant_id=?',[other.merchantId]);
      expect(readStaffTextCompatibility(a).customerKey).not.toBe(readStaffTextCompatibility(b).customerKey);
    }finally{await cleanupDisposableMerchants([other.userId]);}
  });
  it.each(['revoked','suspended','disabled'])('denies %s authority even for stored success',async kind=>{
    await send();if(kind==='revoked')await q("INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'viewer',1)",[f.merchantId,f.userId]);
    if(kind==='suspended')await q("UPDATE merchants SET status='suspended' WHERE id=?",[f.merchantId]);
    if(kind==='disabled')await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[f.userId]);
    await expect(send()).rejects.toThrow();expect(legacy).toHaveBeenCalledOnce();
  });
  it('refuses legacy fallback for inactive registered individual accounts',async()=>{
    await q("INSERT INTO whatsapp_instances (merchant_id,instance_id,token,status,is_primary) VALUES (?,'inactive','fixture','inactive',0)",[f.merchantId]);
    await expect(send()).rejects.toThrow();expect(legacy).not.toHaveBeenCalled();expect(await attempts()).toEqual([]);
  });
  it('never turns compatibility into verified acceptance or recovery work',async()=>{
    await send();const [r]=await attempts();await q("UPDATE ai_sales_staff_replies SET created_at='2020-01-01' WHERE id=?",[r.id]);
    expect(await runDashboardStaffRecoveryBatch()).toBe(0);await expect(reconcileDashboardStaff(f.merchantId,r.id)).rejects.toThrow();
    expect(await canDispatchDashboardStaff({merchantId:f.merchantId,instanceRecordId:1,kind:'text',to:r.customer_phone,text:r.reply_text,
      idempotencyKey:staffDashboardKey(f.merchantId,r.id),staffReplyGuard:{id:r.id,basisDigest:hash(r.basis)}},{provider:'green_api',instanceId:'fixture',token:'fixture'})).toBe(false);
    expect(await facts()).toEqual([]);expect(provider).not.toHaveBeenCalled();expect(legacy).toHaveBeenCalledOnce();
  });
});
