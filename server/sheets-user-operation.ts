import type {PoolConnection} from 'mysql2/promise';
import {TRPCError} from '@trpc/server';
import {sheetsOAuthStore,SheetsOAuthError} from './sheets-oauth';
import {reserveApiRateLimit} from './api/distributed-rate-limit';
export type SheetsUserScope={merchantId:number;userId:number;sessionId:string};
/** Retain live tenant, membership and session locks through a user-initiated operation. */
export async function runSheetsUserOperation<T>(scope:SheetsUserScope,work:(tx:PoolConnection)=>Promise<T>){
 try{return await sheetsOAuthStore.transaction(async tx=>{
  await sheetsOAuthStore.authority(tx,scope);
  const [owners]=await tx.execute<any[]>("SELECT u.account_status FROM users u JOIN merchants m ON m.userId=u.id WHERE m.id=? FOR SHARE",[scope.merchantId]);
  if(!Array.isArray(owners)||owners.length!==1||owners[0].account_status!=='active')throw new SheetsOAuthError('forbidden');
  if(!(await reserveApiRateLimit({namespace:'sheets:user-operation',identity:String(scope.merchantId),maxRequests:10,windowMs:3600000})).allowed)throw new SheetsOAuthError('rate_limit');
  return work(tx);
 });}catch(error){
  if(error instanceof SheetsOAuthError)throw new TRPCError({code:error.reason==='forbidden'?'FORBIDDEN':error.reason==='rate_limit'?'TOO_MANY_REQUESTS':'PRECONDITION_FAILED',message:'sheets_operation:'+error.reason});
  if(error instanceof TRPCError&&['FORBIDDEN','BAD_REQUEST','PRECONDITION_FAILED'].includes(error.code))throw error;
  throw new TRPCError({code:'PRECONDITION_FAILED',message:'sheets_operation:unconfirmed'});
 }
}
