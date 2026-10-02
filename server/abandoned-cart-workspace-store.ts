import type {PoolConnection} from 'mysql2/promise';
import {getPool} from './db/connection';
import {ALL_ROLES,hasPermission,type MerchantRole} from './_core/permissions';
import {cartWorkspaceInput,type CartSelection} from '../shared/abandoned-cart-workspace';
import {CART_WORKSPACE_COLUMNS,projectCartWorkspace} from './abandoned-cart-workspace-source';
export class CartWorkspaceError extends Error{constructor(readonly reason:'forbidden'|'unavailable'){super(`cart_workspace:${reason}`);}}
async function rows(tx:PoolConnection,sql:string,args:any[]){const [value]=await tx.execute(sql,args);if(!Array.isArray(value))throw new CartWorkspaceError('unavailable');return value as any[];}
export async function readCartWorkspace(actorId:number,merchantId:number,input:CartSelection){
 const selection=cartWorkspaceInput.parse(input);let tx:PoolConnection|undefined,committing=false,reusable=true;
 try{
  if(![actorId,merchantId].every(n=>Number.isInteger(n)&&n>0&&n<=2147483647))throw new CartWorkspaceError('forbidden');
  const pool=await getPool();if(!pool)throw new CartWorkspaceError('unavailable');tx=await pool.getConnection();await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await tx.beginTransaction();
  const merchants=await rows(tx,'SELECT userId,status FROM merchants WHERE id=? FOR SHARE',[merchantId]),users=await rows(tx,'SELECT account_status FROM users WHERE id=? FOR SHARE',[actorId]),members=await rows(tx,'SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE',[merchantId,actorId]);
  const role=members.length===1&&members[0].is_active===1?members[0].role:members.length===0&&merchants[0]?.userId===actorId?'owner':null;
  if(merchants.length!==1||merchants[0].status==='suspended'||users.length!==1||users[0].account_status!=='active'||!ALL_ROLES.includes(role))throw new CartWorkspaceError('forbidden');
  const source=await rows(tx,`SELECT ${CART_WORKSPACE_COLUMNS} FROM abandoned_carts WHERE merchantId=? ORDER BY createdAt DESC,id DESC`,[merchantId]);
  const result=projectCartWorkspace(actorId,merchantId,hasPermission(role as MerchantRole,'campaigns.manage'),selection,source);committing=true;await tx.commit();return result;
 }catch(error){if(committing)reusable=false;else if(tx)try{await tx.rollback();}catch{reusable=false;}if(error instanceof CartWorkspaceError)throw error;throw new CartWorkspaceError('unavailable');}
 finally{if(tx){if(reusable)tx.release();else tx.destroy();}}
}
