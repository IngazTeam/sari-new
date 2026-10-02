import crypto from 'node:crypto';
import { getPool } from '../db/connection';
import { decryptSecret } from '../security/secrets';
import { enqueueByaanLifecycleEvent } from './byaan-outbox';
import { catalogVisibleSql } from './catalog-scope';
import { bookingReadId } from '../../shared/booking-read';
import { hasPermission, type MerchantRole } from '../_core/permissions';
import { byaanConnectionWorkspaceSchema, byaanDomainInput, type ByaanConnectionWorkspace } from '../../shared/byaan-connection-workspace';

export class ByaanConnectionFault extends Error {
  constructor(readonly reason:'unavailable'|'stale'|'conflict'|'missing'|'invalid_domain'|'forbidden') { super(`byaan_connection:${reason}`); }
}
type Executor = {execute:(query:string,params?:any[])=>Promise<any>};
async function rows(tx:Executor, query:string, params:any[]=[]):Promise<any[]> {
  const result = await tx.execute(query,params);
  if (!Array.isArray(result[0])) throw new ByaanConnectionFault('unavailable');
  return result[0];
}
function integer(value:unknown) {
  if (!(typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value))) throw new ByaanConnectionFault('unavailable');
  const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw new ByaanConnectionFault('unavailable');return n;
}
function stamp(value:unknown) {
  if(value==null)return null;
  const date=value instanceof Date?value:new Date(String(value).replace(' ','T')+(String(value).includes('T')?'':'Z'));
  if(!Number.isFinite(date.getTime()))throw new ByaanConnectionFault('unavailable');return date.toISOString();
}
export async function definition(tx:Executor,merchantId:number,lock=false) {
  const merchants=await rows(tx,'SELECT id,integration_source AS source FROM merchants WHERE id=?'+(lock?' FOR UPDATE':''),[merchantId]);
  if(merchants.length!==1)throw new ByaanConnectionFault('unavailable');
  const connections=await rows(tx,`SELECT id,tenant_domain AS domain,api_base_url AS baseUrl,is_active AS active,sync_status AS status,
    verified_at AS verifiedAt,verification_expires_at AS expiresAt,created_at AS createdAt,last_sync_at AS lastSyncAt,
    (sync_errors IS NOT NULL AND sync_errors <> '') AS hasErrors,
    SHA2(CONCAT_WS('|',COALESCE(webhook_secret,''),COALESCE(verification_token_hash,''),COALESCE(api_key_hash,''),COALESCE(permissions,'')),256) AS securityVersion
    FROM byaan_connections WHERE merchant_id=?`+(lock?' FOR UPDATE':''),[merchantId]);
  if(connections.length>1)throw new ByaanConnectionFault('unavailable');
  const row=connections[0]??null,source=merchants[0].source??'none';
  const revision=crypto.createHash('sha256').update(JSON.stringify({merchantId,source,row:row?{id:row.id,domain:row.domain,baseUrl:row.baseUrl,active:row.active,status:row.status,verifiedAt:stamp(row.verifiedAt),expiresAt:stamp(row.expiresAt),createdAt:stamp(row.createdAt),securityVersion:row.securityVersion}:null})).digest('hex');
  return {row,source,revision};
}
async function blockers(tx:Executor,merchantId:number):Promise<ByaanConnectionWorkspace['blockingPlatforms']> {
  // Canonical Zid presence is authoritative even when disabled. Pending/error links still occupy their platform slot.
  const result=await rows(tx,`SELECT
    EXISTS(SELECT 1 FROM salla_connections WHERE merchantId=?) AS salla,
    (EXISTS(SELECT 1 FROM platform_integrations WHERE merchant_id=? AND platform_type='zid' AND is_active<>0)
      OR (NOT EXISTS(SELECT 1 FROM platform_integrations WHERE merchant_id=? AND platform_type='zid')
        AND EXISTS(SELECT 1 FROM zid_settings WHERE merchant_id=? AND is_active<>0))) AS zid,
    EXISTS(SELECT 1 FROM woocommerce_settings WHERE merchant_id=? AND is_active<>0) AS woocommerce,
    EXISTS(SELECT 1 FROM platform_integrations WHERE merchant_id=? AND platform_type='shopify' AND is_active<>0) AS shopify`,Array(6).fill(merchantId));
  if(result.length!==1)throw new ByaanConnectionFault('unavailable');
  return (['salla','zid','woocommerce','shopify'] as const).filter(key=>integer(result[0][key])!==0);
}
function state(row:any):ByaanConnectionWorkspace['state'] {
  if(!row)return 'unlinked';
  if(![0,1].includes(row.active))return 'unknown';
  if(!row.verifiedAt)return 'pending_verification';
  if(!row.active)return 'disabled';
  return row.status==='active'?'configured':['syncing','paused','error'].includes(row.status)?row.status:'unknown';
}
export async function writeAuthority(tx:Executor,merchantId:number,actorId?:number) {
  if(actorId===undefined)return; // Trusted REST lifecycle calls authenticate their platform key separately.
  bookingReadId.parse(actorId);
  const merchant=(await rows(tx,'SELECT userId,status FROM merchants WHERE id=?',[merchantId]))[0];
  const users=await rows(tx,'SELECT account_status FROM users WHERE id=? FOR SHARE',[actorId]);
  const members=await rows(tx,'SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE',[merchantId,actorId]);
  const role=members.length===1&&members[0].is_active===1?members[0].role:members.length===0&&merchant?.userId===actorId?'owner':null;
  if(!merchant||merchant.status==='suspended'||users.length!==1||users[0].account_status!=='active'||!role||!hasPermission(role as MerchantRole,'integrations.manage'))throw new ByaanConnectionFault('forbidden');
}
async function transaction<T>(merchantId:number,readOnly:boolean,operation:(tx:Executor)=>Promise<T>):Promise<T> {
  bookingReadId.parse(merchantId);
  const pool=await getPool();if(!pool)throw new ByaanConnectionFault('unavailable');
  const tx=await pool.getConnection();
  let committing=false,reusable=true;
  try {
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await tx.query(readOnly?'START TRANSACTION READ ONLY':'START TRANSACTION');
    const result=await operation(tx);committing=true;await tx.commit();return result;
  } catch(error) {if(committing)reusable=false;else try{await tx.rollback();}catch{reusable=false;}if(error instanceof ByaanConnectionFault)throw error;throw new ByaanConnectionFault('unavailable');}
  finally{if(reusable)tx.release();else tx.destroy();}
}
/** Full stored counts and connection definition share one read-only snapshot. No secret is read or decrypted here. */
export async function readByaanConnectionWorkspace(actorId:number,merchantId:number) {
  bookingReadId.parse(actorId);
  return transaction(merchantId,true,async tx=>{
    const {row,source,revision}=await definition(tx,merchantId);
    const totals=await rows(tx,`SELECT
      (SELECT COUNT(*) FROM products WHERE merchantId=? AND ${catalogVisibleSql()}) AS catalog,
      (SELECT COUNT(*) FROM byaan_trainees WHERE merchant_id=? AND status='active') AS activeTrainees,
      (SELECT COUNT(*) FROM byaan_faqs WHERE merchant_id=? AND is_active=1) AS activeFaqs,
      (SELECT COUNT(*) FROM byaan_site_content WHERE merchant_id=?) AS sitePages`,Array(4).fill(merchantId));
    if(totals.length!==1)throw new ByaanConnectionFault('unavailable');
    const domain=byaanDomainInput.safeParse(row?.domain);
    return byaanConnectionWorkspaceSchema.parse({actorId,merchantId,checkedAt:new Date().toISOString(),source,present:!!row,state:state(row),revision,
      tenantDomain:domain.success?domain.data:null,verifiedAt:stamp(row?.verifiedAt),lastSyncAt:stamp(row?.lastSyncAt),hasSyncErrors:!!row?.hasErrors,
      managedContent:source==='byaan',blockingPlatforms:await blockers(tx,merchantId),counts:Object.fromEntries(Object.entries(totals[0]).map(([k,v])=>[k,integer(v)]))});
  });
}
/** Dashboard registration never replaces a saved identity, changes a verification challenge or sends a provider request. */
export async function registerByaanDomain(merchantId:number,input:string,actorId?:number) {
  const parsed=byaanDomainInput.safeParse(input);if(!parsed.success)throw new ByaanConnectionFault('invalid_domain');const domain=parsed.data;
  return transaction(merchantId,false,async tx=>{
    const {row}=await definition(tx,merchantId,true);
    await writeAuthority(tx,merchantId,actorId);
    if(row && row.domain!==domain)throw new ByaanConnectionFault('conflict');
    if((await blockers(tx,merchantId)).length)throw new ByaanConnectionFault('conflict');
    if(!row)await tx.execute(`INSERT INTO byaan_connections(merchant_id,tenant_domain,api_base_url,sync_status,is_active) VALUES (?,?,?,'pending_verification',0)`,[merchantId,domain,`https://${domain}/api/sari`]);
    const connected=!!row?.active&&!!row?.verifiedAt;
    return {success:connected,pendingVerification:!connected,tenantDomain:domain};
  });
}
/** Merchant and definition are locked before checking the reviewed revision or queuing deactivation. Synced business records are retained. */
export async function retireByaanConnection(merchantId:number,expectedRevision?:string,actorId?:number) {
  return transaction(merchantId,false,async tx=>{
    const {row,revision}=await definition(tx,merchantId,true);
    await writeAuthority(tx,merchantId,actorId);
    if(expectedRevision!==undefined && expectedRevision!==revision)throw new ByaanConnectionFault('stale');
    if(!row)throw new ByaanConnectionFault('missing');
    let notification:'queued'|'not_required'='not_required';
    if(row.active&&row.verifiedAt) {
      const secrets=await rows(tx,'SELECT webhook_secret FROM byaan_connections WHERE id=? AND merchant_id=?',[row.id,merchantId]);
      const secret=decryptSecret(secrets[0]?.webhook_secret);
      if(!secret||secret.length<32)throw new ByaanConnectionFault('unavailable');
      await enqueueByaanLifecycleEvent({merchantId,tenantDomain:row.domain,event:'subscription.deactivated',signingSecret:secret,executor:tx});
      notification='queued';
    }
    await tx.execute('DELETE FROM byaan_connections WHERE id=? AND merchant_id=?',[row.id,merchantId]);
    await tx.execute("UPDATE merchants SET integration_source='none' WHERE id=? AND integration_source='byaan'",[merchantId]);
    return {disconnected:true as const,notification};
  });
}
