import type {PoolConnection} from 'mysql2/promise';
import {getPool} from './db/connection';
import {ALL_ROLES,hasPermission,type MerchantRole} from './_core/permissions';
import {cartRecoveryReviewInput,cartRecoveryRecordInput,cartWorkspaceInput,type CartSelection} from '../shared/abandoned-cart-workspace';
import {CART_WORKSPACE_COLUMNS,projectCartWorkspace} from './abandoned-cart-workspace-source';
export class CartWorkspaceError extends Error{constructor(readonly reason:'forbidden'|'unavailable'|'missing'|'stale'|'invalid'){super(`cart_workspace:${reason}`);}}
async function rows(tx:PoolConnection,sql:string,args:any[]){const [value]=await tx.execute(sql,args);if(!Array.isArray(value))throw new CartWorkspaceError('unavailable');return value as any[];}
export async function withCartAuthority<T>(actorId:number,merchantId:number,write:boolean,operation:(tx:PoolConnection,canManage:boolean)=>Promise<T>){
 let tx:PoolConnection|undefined,committing=false,reusable=true;
 try{
  if(![actorId,merchantId].every(n=>Number.isInteger(n)&&n>0&&n<=2147483647))throw new CartWorkspaceError('forbidden');
  const pool=await getPool();if(!pool)throw new CartWorkspaceError('unavailable');tx=await pool.getConnection();await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');await tx.beginTransaction();
  const merchants=await rows(tx,'SELECT userId,status FROM merchants WHERE id=? '+(write?'FOR UPDATE':'FOR SHARE'),[merchantId]),users=await rows(tx,'SELECT account_status FROM users WHERE id=? FOR SHARE',[actorId]),members=await rows(tx,'SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE',[merchantId,actorId]);
  const role=members.length===1&&members[0].is_active===1?members[0].role:members.length===0&&merchants[0]?.userId===actorId?'owner':null;
  const canManage=hasPermission(role as MerchantRole,'campaigns.manage');
  if(merchants.length!==1||merchants[0].status==='suspended'||users.length!==1||users[0].account_status!=='active'||!ALL_ROLES.includes(role)||write&&!canManage)throw new CartWorkspaceError('forbidden');
  const result=await operation(tx,canManage);committing=true;await tx.commit();return result;
 }catch(error){if(committing)reusable=false;else if(tx)try{await tx.rollback();}catch{reusable=false;}if(error instanceof CartWorkspaceError)throw error;throw new CartWorkspaceError('unavailable');}
 finally{if(tx){if(reusable)tx.release();else tx.destroy();}}
}
export function readCartWorkspace(actorId:number,merchantId:number,input:CartSelection){const selection=cartWorkspaceInput.parse(input);return withCartAuthority(actorId,merchantId,false,async(tx,canManage)=>{const source=await rows(tx,`SELECT ${CART_WORKSPACE_COLUMNS} FROM abandoned_carts WHERE merchantId=? ORDER BY createdAt DESC,id DESC`,[merchantId]);return projectCartWorkspace(actorId,merchantId,canManage,selection,source);});}
async function recoveryRow(tx:PoolConnection,actorId:number,merchantId:number,cartId:number,write:boolean){const source=await rows(tx,`SELECT ${CART_WORKSPACE_COLUMNS} FROM abandoned_carts WHERE merchantId=? AND id=? `+(write?'FOR UPDATE':'FOR SHARE'),[merchantId,cartId]);if(source.length!==1)throw new CartWorkspaceError('missing');return projectCartWorkspace(actorId,merchantId,true,cartWorkspaceInput.parse({}),source).rows[0];}
export function reviewCartRecovery(actorId:number,merchantId:number,input:unknown){const value=cartRecoveryReviewInput.parse(input);return withCartAuthority(actorId,merchantId,true,async tx=>{const row=await recoveryRow(tx,actorId,merchantId,value.cartId,false);return {actorId,merchantId,row,eligible:row.state==='waiting'||row.state==='reminded',effect:'record_only' as const,salesVerified:false as const};});}
export function recordCartRecovery(actorId:number,merchantId:number,input:unknown){const value=cartRecoveryRecordInput.parse(input);return withCartAuthority(actorId,merchantId,true,async tx=>{const row=await recoveryRow(tx,actorId,merchantId,value.cartId,true);if(row.revision!==value.expectedRevision)throw new CartWorkspaceError('stale');if(row.state!=='waiting'&&row.state!=='reminded')throw new CartWorkspaceError('invalid');const [saved]=await tx.execute<any>('UPDATE abandoned_carts SET recovered=1,recoveredAt=UTC_TIMESTAMP(),updatedAt=UTC_TIMESTAMP() WHERE merchantId=? AND id=? AND recovered=0',[merchantId,value.cartId]);if(saved.affectedRows!==1)throw new CartWorkspaceError('stale');return {success:true as const,cartId:value.cartId,effect:'record_only' as const,salesVerified:false as const};});}
