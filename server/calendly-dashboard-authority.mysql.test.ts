import {afterAll,afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({list:vi.fn()}));
vi.mock('./integrations/calendly-api',async original=>({...await original<typeof import('./integrations/calendly-api')>(),listCalendlyCollection:m.list}));
import {getPool,closeDb,getDb} from './db/connection';
import {createDisposableMerchant,cleanupDisposableMerchants} from './tests/helpers/disposable-merchant';
import {withCalendlyDashboardAuthority,assertCalendlyDashboardWrite} from './integrations/calendly-dashboard-authority';
import {getIntegrationByType,replaceCalendlyIntegration,updateIntegrationSettings,updateIntegrationLastSync,deleteIntegrationByType} from './db';
import {syncCalendlyAppointments} from './integrations/calendly-webhook-receipts';
import {sql} from 'drizzle-orm';
describe.skipIf(!process.env.DATABASE_URL)('Calendly transactional dashboard authority MySQL',()=>{
 let own:Awaited<ReturnType<typeof createDisposableMerchant>>,other:typeof own,id:number,foreignId:number;
 const q=async(query:string,args:any[]=[]) => (await(await getPool())!.execute<any>(query,args))[0];
 const scope=()=>({actorId:own.userId,merchantId:own.merchantId});
 const revoke=()=>q("INSERT INTO merchant_members(merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",[own.merchantId,own.userId]);
 const replacement=()=>({merchantId:own.merchantId,storeName:'Replacement',storeUrl:'https://api.calendly.com/users/NEW_123456',accessToken:'new-synthetic-token-123456',webhookEndpointId:'N'.repeat(43),webhookSigningSecret:'new-synthetic-signing-123456',webhookSubscriptionUri:'https://api.calendly.com/webhook_subscriptions/NEW_123456',settings:'{}'});
 beforeEach(async()=>{vi.resetAllMocks();await getDb();own=await createDisposableMerchant('cal-authority');other=await createDisposableMerchant('cal-foreign');const seed=async(merchantId:number)=>(await q("INSERT INTO platform_integrations(merchant_id,platform_type,is_active,store_name,store_url,access_token,webhook_endpoint_id,settings) VALUES (?,'calendly',1,'Retained','https://api.calendly.com/users/LOCAL_123456','synthetic-local-token-123456',?,'{}')",[merchantId,'E'+String(merchantId).padStart(42,'0')])).insertId;id=Number(await seed(own.merchantId));foreignId=Number(await seed(other.merchantId));});
 afterEach(async()=>cleanupDisposableMerchants([own.userId,other.userId]));afterAll(closeDb);
 it.each(['replace','remove','settings','lastSync'])('rejects revoked %s persistence before changing data',async kind=>{await revoke();await expect(withCalendlyDashboardAuthority(scope(),()=>kind==='replace'?replaceCalendlyIntegration(replacement()):kind==='remove'?deleteIntegrationByType(own.merchantId,'calendly'):kind==='settings'?updateIntegrationSettings(id,{syncToWhatsApp:true}):updateIntegrationLastSync(id))).rejects.toMatchObject({code:'FORBIDDEN'});const [row]=await q('SELECT store_name,settings,last_sync_at FROM platform_integrations WHERE id=?',[id]);expect(row).toMatchObject({store_name:'Retained',settings:'{}',last_sync_at:null});});
 it('rejects foreign IDs and inactive actor accounts',async()=>{await expect(withCalendlyDashboardAuthority(scope(),()=>updateIntegrationSettings(foreignId,{syncToWhatsApp:true}))).rejects.toMatchObject({code:'FORBIDDEN'});await expect(withCalendlyDashboardAuthority(scope(),()=>deleteIntegrationByType(other.merchantId,'calendly'))).rejects.toMatchObject({code:'FORBIDDEN'});await q("UPDATE users SET account_status='deletion_pending' WHERE id=?",[own.userId]);await expect(withCalendlyDashboardAuthority(scope(),()=>updateIntegrationLastSync(id))).rejects.toMatchObject({code:'FORBIDDEN'});});
 it('locks authority until an admitted local transaction finishes',async()=>{
  let entered!:()=>void,release!:()=>void;const started=new Promise<void>(r=>entered=r),held=new Promise<void>(r=>release=r);
  const write=withCalendlyDashboardAuthority(scope(),async()=>(await getDb())!.transaction(async tx=>{await assertCalendlyDashboardWrite(tx,own.merchantId);entered();await held;await tx.execute(sql`UPDATE platform_integrations SET store_name='Committed' WHERE id=${id}`);}));
  await started;let revoked=false;const revocation=q("UPDATE merchants SET status='suspended' WHERE id=?",[own.merchantId]).then(()=>revoked=true);
  try{await new Promise(r=>setTimeout(r,40));expect(revoked).toBe(false);}finally{release();await write;await revocation;}
  expect((await q('SELECT store_name FROM platform_integrations WHERE id=?',[id]))[0].store_name).toBe('Committed');await expect(withCalendlyDashboardAuthority(scope(),()=>updateIntegrationSettings(id,{syncToWhatsApp:true}))).rejects.toMatchObject({code:'FORBIDDEN'});
 });
 it.each(['authorized','revoked','changed'])('rejects the retired sync helper for %s callers before provider or writes',async state=>{const integration=(await getIntegrationByType(own.merchantId,'calendly'))!;if(state==='revoked')await revoke();if(state==='changed')await q('UPDATE platform_integrations SET webhook_endpoint_id=? WHERE id=?',['R'.repeat(43),id]);await expect(withCalendlyDashboardAuthority(scope(),()=>syncCalendlyAppointments(integration))).rejects.toThrow('reviewed_operation_required');expect(m.list).not.toHaveBeenCalled();expect(await q('SELECT id FROM calendly_appointments WHERE merchant_id=?',[own.merchantId])).toHaveLength(0);});
});
