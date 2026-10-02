import {sql,type SQL} from 'drizzle-orm';
import type {PoolConnection} from 'mysql2/promise';
import {zidConnectionDefinition} from './zid-workspace';
import {zidConnectionTransaction,zidConnectionWriter,ZidConnectionFault} from './zid-connection';
import {zidConnectionRevision} from '../../shared/zid-connection';
export type ZidSyncResource='all'|'products'|'orders'|'customers';
export type ZidWriteExecutor={execute(query:SQL):Promise<unknown>};
export type ZidWriteGuard=(tx:ZidWriteExecutor)=>Promise<void>;
/** All SQL templates come from the reviewed definition/authority helpers; values remain bound parameters. */
function rawExecutor(tx:ZidWriteExecutor):Pick<PoolConnection,'execute'>{return {execute:async(query:string,args:Array<string|number|null>=[])=>{const parts=query.split('?');if(parts.length!==args.length+1)throw new ZidConnectionFault('unavailable');const bound=sql.empty();parts.forEach((part,index)=>{bound.append(sql.raw(part));if(index<args.length)bound.append(sql`${args[index]}`);});return await tx.execute(bound);}} as Pick<PoolConnection,'execute'>;}

export async function createZidSyncReview(actorId:number,merchantId:number,resource:ZidSyncResource,expectedRevision?:string){
 if(expectedRevision!==undefined)zidConnectionRevision.parse(expectedRevision);
 const admitted=await zidConnectionTransaction(actorId,merchantId,async tx=>{
  const current=await zidConnectionDefinition(tx,merchantId,true);await zidConnectionWriter(tx,actorId,merchantId);
  if(expectedRevision!==undefined&&current.revision!==expectedRevision)throw new ZidConnectionFault('changed');
  if(current.source!=='canonical'||!current.row)throw new ZidConnectionFault('missing');
  if(current.row.active!==1)throw new ZidConnectionFault('inactive');
  if(Number(current.row.settingsValid)!==1||Number(current.row.credentialsStored)!==1||!/^[1-9][0-9]{0,19}$/.test(current.row.storeId??''))throw new ZidConnectionFault('invalid');
  const enabled=(['products','orders','customers'] as const).filter(key=>(resource==='all'||resource===key)&&Number(current.row['sync'+key[0].toUpperCase()+key.slice(1)])===1);
  if(!enabled.length)throw new ZidConnectionFault('inactive');return {...current,enabled};
 });
 let revision=admitted.revision;
 const check=async(tx:Pick<PoolConnection,'execute'>)=>{
  const current=await zidConnectionDefinition(tx,merchantId,true);await zidConnectionWriter(tx,actorId,merchantId);
  if(current.revision!==revision)throw new ZidConnectionFault('changed');return current;
 };
 const refresh=async(tx:PoolConnection)=>{
  // Called only after the token manager's guarded rotation, within the same locks.
  const current=await zidConnectionDefinition(tx,merchantId,true);await zidConnectionWriter(tx,actorId,merchantId);
  if(current.source!=='canonical'||!current.row||['id','storeId','active','settingsValid','autoSync','syncProducts','syncOrders','syncCustomers','notifyMerchantOrders','endpoint','webhookVersion'].some(key=>current.row[key]!==admitted.row[key]))throw new ZidConnectionFault('changed');
  revision=current.revision;
 };
 const checkpoint=()=>zidConnectionTransaction(actorId,merchantId,async tx=>{await check(tx);});
 const persist:ZidWriteGuard=async tx=>{await check(rawExecutor(tx));};
 const startLog=(kind:'products'|'orders'|'customers')=>zidConnectionTransaction(actorId,merchantId,async tx=>{await check(tx);const [result]=await tx.execute<any>("INSERT INTO zid_sync_logs(merchant_id,sync_type,status,started_at) VALUES (?,?,'in_progress',UTC_TIMESTAMP())",[merchantId,kind]);return Number(result.insertId);});
 const finishLog=(id:number,kind:'products'|'orders'|'customers',count:number)=>zidConnectionTransaction(actorId,merchantId,async tx=>{await check(tx);if(!Number.isSafeInteger(count)||count<0)throw new ZidConnectionFault('invalid');const [result]=await tx.execute<any>("UPDATE zid_sync_logs SET status='completed',total_items=?,processed_items=?,success_count=?,failed_count=0,completed_at=UTC_TIMESTAMP() WHERE id=? AND merchant_id=? AND sync_type=? AND status='in_progress'",[count,count,count,id,merchantId,kind]);if(result.affectedRows!==1)throw new ZidConnectionFault('changed');});
 const failLog=(id:number)=>zidConnectionTransaction(actorId,merchantId,async tx=>{await tx.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE',[merchantId]);await tx.execute("UPDATE zid_sync_logs SET status='failed',error_message='ZID_DASHBOARD_SYNC_INTERRUPTED',completed_at=UTC_TIMESTAMP() WHERE id=? AND merchant_id=? AND status='in_progress'",[id,merchantId]);});
 const finish=()=>zidConnectionTransaction(actorId,merchantId,async tx=>{await check(tx);await tx.execute('UPDATE platform_integrations SET last_sync_at=UTC_TIMESTAMP() WHERE id=? AND merchant_id=?',[admitted.row.id,merchantId]);});
 return {merchantId,actorId,storeId:String(admitted.row.storeId),enabled:admitted.enabled,initialRevision:admitted.revision,checkpoint,persist,beforeCredentials:async(tx:PoolConnection)=>{await check(tx);},afterRefresh:refresh,startLog,finishLog,failLog,finish};
}
