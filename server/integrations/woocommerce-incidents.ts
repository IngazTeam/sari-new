import {createHash} from 'node:crypto';
import type {PoolConnection} from 'mysql2/promise';
import {bookingReadId} from '../../shared/booking-read';
import {wooIncidentsInput,wooIncidentsWorkspace,wooIncidentSelection,wooReceiptStates,wooReceiptTopics} from '../../shared/woocommerce-incidents';
import {wooSnapshot,wooRows,wooCount,wooStamp,WooWorkspaceFault} from './woocommerce-workspace';
import {WooOperationFault} from './woocommerce-operation';
import type {z} from 'zod';

const stateSql="CASE WHEN status IN ('pending','processing','completed','failed','manual_review','suppressed') THEN status ELSE 'unknown' END";
const selection='SELECT id,merchant_id AS merchantId,delivery_id AS deliveryId,webhook_id AS webhookId,topic,resource_id AS resourceId,status,attempt_count AS attempts,processing_token AS token,available_at AS availableAt,claimed_at AS claimedAt,processed_at AS processedAt,last_error AS error,created_at AS createdAt,updated_at AS updatedAt FROM woocommerce_webhook_receipts';
function row(raw:any){
 const value={...raw};for(const key of ['availableAt','claimedAt','processedAt','createdAt','updatedAt'])value[key]=wooStamp(value[key]);
 const revision=createHash('sha256').update(JSON.stringify(value)).digest('hex');
 const topic=wooReceiptTopics.includes(raw.topic)?raw.topic:'unknown',state=wooReceiptStates.includes(raw.status)?raw.status:'unknown';
 const resourceId=bookingReadId.safeParse(raw.resourceId).success?raw.resourceId:null;
 let attempts:number|null;try{attempts=wooCount(raw.attempts);}catch{attempts=null;}
 const invalidData=topic==='unknown'||state==='unknown'||resourceId===null||attempts===null||!value.createdAt||!value.updatedAt||!value.availableAt||raw.processedAt!=null&&!value.processedAt||raw.claimedAt!=null&&!value.claimedAt;
 return {id:wooCount(raw.id),merchantId:wooCount(raw.merchantId),revision,topic,resourceId,state,attempts,createdAt:value.createdAt,processedAt:value.processedAt,hasError:raw.error!=null&&raw.error!=='',invalidData,reviewable:state==='manual_review'&&!invalidData};
}
export async function readWooIncidentsWorkspace(actorId:number,merchantId:number,raw:unknown){const input=wooIncidentsInput.parse(raw);return wooSnapshot(actorId,merchantId,async tx=>{
 if((await wooRows(tx,'SELECT id FROM merchants WHERE id=?',[merchantId])).length!==1)throw new WooWorkspaceFault();
 const total=await wooRows(tx,'SELECT COUNT(*) AS count FROM woocommerce_webhook_receipts WHERE merchant_id=?',[merchantId]);if(total.length!==1)throw new WooWorkspaceFault();
 const args:Array<string|number|null>=[merchantId];let where='merchant_id=?';
 if(input.resource!=='all'){where+=' AND topic LIKE ?';args.push(input.resource+'.%');}
 if(input.search){where+=" AND (CAST(id AS CHAR) LIKE ? ESCAPE '!' OR CAST(resource_id AS CHAR) LIKE ? ESCAPE '!')";const literal='%'+input.search.replace(/[!%_]/g,v=>'!'+v)+'%';args.push(literal,literal);}
 const counted=await wooRows(tx,`SELECT ${stateSql} AS state,COUNT(*) AS count FROM woocommerce_webhook_receipts WHERE ${where} GROUP BY state`,args);
 if(counted.some(g=>!wooReceiptStates.includes(g.state))||new Set(counted.map(g=>g.state)).size!==counted.length)throw new WooWorkspaceFault();
 const groups=wooReceiptStates.map(key=>({key,count:wooCount(counted.find(g=>g.state===key)?.count??0)})),matched=groups.reduce((n,g)=>n+g.count,0),selected=input.state==='all'?matched:groups.find(g=>g.key===input.state)!.count;
 if(input.state!=='all'){where+=` AND (${stateSql})=?`;args.push(input.state);}
 const page=await wooRows(tx,selection+` WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,[...args,25,(input.page-1)*25]);
 return wooIncidentsWorkspace.parse({actorId,merchantId,checkedAt:new Date().toISOString(),selection:input,summary:{stored:wooCount(total[0].count),matched,groups},pagination:{page:input.page,pageSize:25,total:selected,pages:Math.ceil(selected/25)},rows:page.map(row)});
 });}
/** Exact reviewed IDs only. Arrivals during provider work remain untouched. */
export async function reviewWooIncidents(tx:PoolConnection,merchantId:number,incidents:z.infer<typeof wooIncidentSelection>[]){
 const rows=await wooRows(tx,selection+` WHERE merchant_id=? AND id IN (${incidents.map(()=>'?').join(',')}) ORDER BY id FOR UPDATE`,[merchantId,...incidents.map(r=>r.id)]);
 if(rows.length!==incidents.length)throw new WooOperationFault('changed');
 for(const current of rows.map(row)){if(!current.reviewable||!incidents.some(i=>i.id===current.id&&i.revision===current.revision))throw new WooOperationFault('changed');}
}
export async function completeWooIncidentReview(tx:PoolConnection,merchantId:number,incidents:z.infer<typeof wooIncidentSelection>[]){
 await reviewWooIncidents(tx,merchantId,incidents);
 const [result]=await tx.execute<any>(`UPDATE woocommerce_webhook_receipts SET status='suppressed',processed_at=UTC_TIMESTAMP(3),processing_token=NULL,last_error='reviewed_reconciliation_completed' WHERE merchant_id=? AND status='manual_review' AND id IN (${incidents.map(()=>'?').join(',')})`,[merchantId,...incidents.map(r=>r.id)]);
 if(result.affectedRows!==incidents.length)throw new WooOperationFault('changed');return incidents.length;
}
