import {AsyncLocalStorage} from 'node:async_hooks';
import {TRPCError} from '@trpc/server';
import {sql,type SQL} from 'drizzle-orm';
import {MySqlDialect} from 'drizzle-orm/mysql-core';
import type {PoolConnection} from 'mysql2/promise';
import {resolveMerchantAccess} from '../accounts/merchant-access';
import {hasPermission,type MerchantRole} from '../_core/permissions';

type Authority=Readonly<{actorId:number;merchantId:number}>;
type Executor={execute(query:SQL):Promise<unknown>};
const authority=new AsyncLocalStorage<Authority>();
export class CalendlyAuthorityError extends TRPCError{
 constructor(){super({code:'FORBIDDEN',message:'calendly_dashboard:forbidden'});}
}
export function calendlyDashboardScope(){return authority.getStore();}
export function withCalendlyDashboardAuthority<T>(scope:Authority,work:()=>Promise<T>){
 if(![scope.actorId,scope.merchantId].every(id=>Number.isSafeInteger(id)&&id>0))throw new CalendlyAuthorityError();
 return authority.run(Object.freeze({...scope}),work);
}
// Background webhook workers do not inherit a request actor.
export async function assertCalendlyDashboardAuthority(merchantId?:number){
 const scope=authority.getStore();if(!scope)return;
 if(merchantId!==undefined&&scope.merchantId!==merchantId)throw new CalendlyAuthorityError();
 const member=await resolveMerchantAccess(scope.actorId,scope.merchantId);
 if(!member||member.merchantId!==scope.merchantId||!hasPermission(member.role,'integrations.manage'))throw new CalendlyAuthorityError();
}
async function rows(tx:Executor,query:SQL){const value=await tx.execute(query);if(!Array.isArray(value)||!Array.isArray(value[0]))throw Error('Calendly authority storage unavailable');return value[0] as Array<Record<string,any>>;}
export async function assertCalendlyDashboardWrite(tx:Executor,merchantId:number){
 const scope=authority.getStore();if(!scope)return;if(scope.merchantId!==merchantId)throw new CalendlyAuthorityError();
 const merchant=(await rows(tx,sql`SELECT userId,status FROM merchants WHERE id=${merchantId} FOR UPDATE`))[0];
 if(!merchant||merchant.status==='suspended')throw new CalendlyAuthorityError();
 const users=await rows(tx,sql`SELECT id,account_status FROM users WHERE id IN (${scope.actorId},${merchant.userId}) ORDER BY id FOR SHARE`);
 if(![scope.actorId,merchant.userId].every(id=>users.some(user=>user.id===id&&user.account_status==='active')))throw new CalendlyAuthorityError();
 const members=await rows(tx,sql`SELECT role,is_active FROM merchant_members WHERE merchant_id=${merchantId} AND user_id=${scope.actorId} FOR SHARE`);
 const role=members.length===1&&members[0].is_active===1?members[0].role:members.length===0&&merchant.userId===scope.actorId?'owner':null;
 if(!role||!hasPermission(role as MerchantRole,'integrations.manage'))throw new CalendlyAuthorityError();
}
const dialect=new MySqlDialect();
export function calendlyMysqlExecutor(connection:PoolConnection):Executor{
 return {execute(query){const compiled=dialect.sqlToQuery(query);const values=compiled.params.map(value=>{if(value===null||typeof value==='number'||typeof value==='string')return value;throw Error('Invalid Calendly authority binding');});return connection.execute(compiled.sql,values);}};
}
