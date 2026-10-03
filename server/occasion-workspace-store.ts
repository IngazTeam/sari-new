import type {PoolConnection} from 'mysql2/promise';
import {getPool} from './db/connection';
import {ALL_ROLES,hasPermission,type MerchantRole} from './_core/permissions';
import {occasionWorkspaceInput,type OccasionSelection} from '../shared/occasion-workspace';
import {OCCASION_COLUMNS,projectOccasionWorkspace} from './occasion-workspace-source';
import {getUpcomingOccasions} from './automation/occasion-campaigns';
export class OccasionWorkspaceError extends Error{constructor(readonly reason:'forbidden'|'unavailable'){super(`occasion_workspace:${reason}`);}}
const rows=async(tx:PoolConnection,sql:string,args:any[]=[])=>{const [result]=await tx.execute(sql,args);if(!Array.isArray(result))throw new OccasionWorkspaceError('unavailable');return result as any[];};
export async function readOccasionWorkspace(actorId:number,merchantId:number,input:OccasionSelection){
 const selection=occasionWorkspaceInput.parse(input);let tx:PoolConnection|undefined,committing=false,reusable=true;
 try{
  if(![actorId,merchantId].every(n=>Number.isInteger(n)&&n>0&&n<=2147483647))throw new OccasionWorkspaceError('forbidden');
  const pool=await getPool();if(!pool)throw new OccasionWorkspaceError('unavailable');tx=await pool.getConnection();await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await tx.beginTransaction();
  const merchants=await rows(tx,'SELECT userId,status FROM merchants WHERE id=? FOR SHARE',[merchantId]),users=await rows(tx,'SELECT account_status FROM users WHERE id=? FOR SHARE',[actorId]),members=await rows(tx,'SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE',[merchantId,actorId]);
  const role=members.length===1&&members[0].is_active===1?members[0].role:members.length===0&&merchants[0]?.userId===actorId?'owner':null;
  if(merchants.length!==1||merchants[0].status==='suspended'||users.length!==1||users[0].account_status!=='active'||!ALL_ROLES.includes(role)||!hasPermission(role as MerchantRole,'analytics.read'))throw new OccasionWorkspaceError('forbidden');
  const canManage=merchants[0].status==='active'&&hasPermission(role as MerchantRole,'campaigns.manage');
  const source=await rows(tx,`SELECT ${OCCASION_COLUMNS.split(',').map(k=>'oc.'+k).join(',')},c.id AS linkedId,c.merchantId AS linkedMerchantId,c.name AS linkedName,c.status AS linkedStatus FROM occasion_campaigns oc LEFT JOIN campaigns c ON c.id=oc.campaign_id AND c.merchantId=oc.merchantId WHERE oc.merchantId=? ORDER BY oc.createdAt DESC,oc.id DESC`,[merchantId]);
  // Include mismatched delivery ownership only as grouped metadata, then reject it in the projector.
  const delivery=await rows(tx,'SELECT d.campaign_id AS campaignId,d.merchant_id AS merchantId,d.status,COUNT(*) AS count FROM campaign_delivery_outbox d JOIN campaigns c ON c.id=d.campaign_id JOIN occasion_campaigns oc ON oc.campaign_id=c.id AND oc.merchantId=c.merchantId WHERE oc.merchantId=? GROUP BY d.campaign_id,d.merchant_id,d.status',[merchantId]);
  const now=new Date(),result=projectOccasionWorkspace(actorId,merchantId,canManage,selection,source,delivery,getUpcomingOccasions(now),now);committing=true;await tx.commit();return result;
 }catch(error){if(committing)reusable=false;else if(tx)try{await tx.rollback();}catch{reusable=false;}if(error instanceof OccasionWorkspaceError)throw error;throw new OccasionWorkspaceError('unavailable');}
 finally{if(tx){if(reusable)tx.release();else tx.destroy();}}
}
