import {TRPCError} from '@trpc/server';
import {getPool} from '../db';
import {assertCalendlyDashboardAuthority} from './calendly-dashboard-authority';
export async function withCalendlyConnectionLock<T>(merchantId:number,work:()=>Promise<T>):Promise<T>{
 const pool=await getPool();if(!pool)throw new TRPCError({code:'INTERNAL_SERVER_ERROR',message:'calendly_dashboard:unavailable'});
 const tx=await pool.getConnection(),name=`sari:calendly:connection:${merchantId}`;let acquired=false,reusable=false;
 try{const [rows]=await tx.query<any[]>('SELECT GET_LOCK(?, 20) AS acquired',[name]);const value=rows[0]?.acquired;reusable=value===0||value===1;acquired=value===1;if(!acquired)throw new TRPCError({code:'CONFLICT',message:'calendly_operation:busy'});await assertCalendlyDashboardAuthority(merchantId);return await work();}
 finally{if(acquired){try{const [rows]=await tx.query<any[]>('SELECT RELEASE_LOCK(?) AS released',[name]);reusable=rows[0]?.released===1;}catch{reusable=false;}}if(reusable)tx.release();else tx.destroy();}
}
