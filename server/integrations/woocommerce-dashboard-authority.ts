import {AsyncLocalStorage} from 'node:async_hooks';
import {TRPCError} from '@trpc/server';
import {sql,type SQL} from 'drizzle-orm';
import {resolveMerchantAccess} from '../accounts/merchant-access';
import {hasPermission,type MerchantRole,type Permission} from '../_core/permissions';
type Authority=Readonly<{actorId:number;merchantId:number;permission:Permission}>;
type WriteExecutor={execute(query:SQL):Promise<unknown>};
const authority=new AsyncLocalStorage<Authority>();
const denied=()=>new TRPCError({code:'FORBIDDEN',message:'لم تعد لديك صلاحية تنفيذ هذه العملية في المتجر المحدد'});
export function withWooDashboardAuthority<T>(scope:Authority,work:()=>Promise<T>){
 if(![scope.actorId,scope.merchantId].every(id=>Number.isSafeInteger(id)&&id>0))throw denied();
 return authority.run(Object.freeze({...scope}),work);
}
/** Trusted workers have no dashboard actor; request authority never leaks to unrelated work. */
export async function assertWooDashboardAuthority(merchantId?:number){
 const scope=authority.getStore();if(!scope)return;
 if(merchantId!==undefined&&scope.merchantId!==merchantId)throw denied();
 const member=await resolveMerchantAccess(scope.actorId,scope.merchantId);
 if(!member||member.merchantId!==scope.merchantId||!hasPermission(member.role,scope.permission))throw denied();
}
async function rows(tx:WriteExecutor,query:SQL){const result=await tx.execute(query);if(!Array.isArray(result)||!Array.isArray(result[0]))throw Error('Woo authority storage unavailable');return result[0] as Array<Record<string,any>>;}
/** Lock permission evidence in the same transaction as dashboard persistence. */
export async function assertWooDashboardWrite(tx:WriteExecutor,merchantId:number){
 const scope=authority.getStore();if(!scope)return;if(scope.merchantId!==merchantId)throw denied();
 const merchant=(await rows(tx,sql`SELECT userId,status FROM merchants WHERE id=${merchantId} FOR UPDATE`))[0];
 if(!merchant||merchant.status==='suspended')throw denied();
 const users=await rows(tx,sql`SELECT id,account_status FROM users WHERE id IN (${scope.actorId},${merchant.userId}) ORDER BY id FOR SHARE`);
 if(![scope.actorId,merchant.userId].every(id=>users.some(user=>user.id===id&&user.account_status==='active')))throw denied();
 const members=await rows(tx,sql`SELECT role,is_active FROM merchant_members WHERE merchant_id=${merchantId} AND user_id=${scope.actorId} FOR SHARE`);
 const role=members.length===1&&members[0].is_active===1?members[0].role:members.length===0&&merchant.userId===scope.actorId?'owner':null;
 if(!role||!hasPermission(role as MerchantRole,scope.permission))throw denied();
}
