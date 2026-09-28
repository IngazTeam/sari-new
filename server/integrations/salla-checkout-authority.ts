import type { PoolConnection } from 'mysql2/promise';
import { hasPermission } from '../_core/permissions';

/** Persisted authority, held through the local decision but never over HTTP. */
export async function authorizeCheckoutReviewer(c:PoolConnection,merchantId:number,actorId:number){
  const [merchants]=await c.execute<any[]>('SELECT userId,status FROM merchants WHERE id=? FOR SHARE',[merchantId]);
  const [actors]=await c.execute<any[]>('SELECT account_status FROM users WHERE id=? FOR SHARE',[actorId]);
  const [members]=await c.execute<any[]>('SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE',[merchantId,actorId]);
  if(merchants.length!==1||merchants[0].status!=='active'||actors[0]?.account_status!=='active'||members.length>1
    ||(members.length?!members[0].is_active||!hasPermission(members[0].role,'orders.manage'):merchants[0].userId!==actorId))throw Error('Salla checkout evidence unavailable');
  return {owner:merchants[0].userId,members};
}
