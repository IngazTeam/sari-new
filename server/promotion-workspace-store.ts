import type {PoolConnection} from 'mysql2/promise';
import {getPool} from './db/connection';
import {ALL_ROLES,hasPermission,type MerchantRole} from './_core/permissions';
import {promotionWorkspaceInput,type PromotionSelection} from '../shared/promotion-workspace';
import {PROMOTION_SELECT,projectPromotionWorkspace} from './promotion-workspace-source';
export class PromotionWorkspaceError extends Error{constructor(readonly reason:'forbidden'|'unavailable'){super(`promotion_workspace:${reason}`);}}
const rows=async(tx:PoolConnection,sql:string,args:any[]=[])=>{const [result]=await tx.execute(sql,args);if(!Array.isArray(result))throw new PromotionWorkspaceError('unavailable');return result as any[];};
export async function readPromotionWorkspace(actorId:number,merchantId:number,input:PromotionSelection){
 const selection=promotionWorkspaceInput.parse(input);let tx:PoolConnection|undefined,committing=false,reusable=true;
 try{
  if(![actorId,merchantId].every(n=>Number.isInteger(n)&&n>0&&n<=2147483647))throw new PromotionWorkspaceError('forbidden');
  const pool=await getPool();if(!pool)throw new PromotionWorkspaceError('unavailable');tx=await pool.getConnection();await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await tx.beginTransaction();
  const merchants=await rows(tx,'SELECT userId,status FROM merchants WHERE id=? FOR SHARE',[merchantId]),users=await rows(tx,'SELECT account_status FROM users WHERE id=? FOR SHARE',[actorId]),members=await rows(tx,'SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE',[merchantId,actorId]);
  const role=members.length===1&&members[0].is_active===1?members[0].role:members.length===0&&merchants[0]?.userId===actorId?'owner':null;
  if(merchants.length!==1||merchants[0].status==='suspended'||users.length!==1||users[0].account_status!=='active'||!ALL_ROLES.includes(role)||!hasPermission(role as MerchantRole,'analytics.read'))throw new PromotionWorkspaceError('forbidden');
  const canManage=merchants[0].status==='active'&&hasPermission(role as MerchantRole,'campaigns.manage');
  const source=await rows(tx,`SELECT ${PROMOTION_SELECT},d.id AS linkedId,d.merchantId AS linkedMerchantId,d.code AS linkedCode,d.type AS linkedType,d.value AS linkedValue,d.isActive AS linkedActive FROM promotions p LEFT JOIN discount_codes d ON d.id=p.auto_discount_code_id AND d.merchantId=p.merchant_id WHERE p.merchant_id=? ORDER BY p.created_at DESC,p.id DESC`,[merchantId]);
  const result=projectPromotionWorkspace(actorId,merchantId,canManage,selection,source);committing=true;await tx.commit();return result;
 }catch(error){if(committing)reusable=false;else if(tx)try{await tx.rollback();}catch{reusable=false;}if(error instanceof PromotionWorkspaceError)throw error;throw new PromotionWorkspaceError('unavailable');}
 finally{if(tx){if(reusable)tx.release();else tx.destroy();}}
}
