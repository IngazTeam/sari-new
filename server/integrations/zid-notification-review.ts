import crypto from 'node:crypto';
import {zidNoticeReviewInput,zidNoticeReviewSchema,zidNoticeReviewReceipt} from '../../shared/zid-notification-review';
import {zidConnectionTransaction,zidConnectionWriter,ZidConnectionFault} from './zid-connection';
const columns='id,merchant_id,zid_order_id,zid_store_id,event_key,status,attempts,last_error,created_at,updated_at,delivered_at';
function stamp(v:any){if(v==null)return null;const d=v instanceof Date?v:new Date(String(v).replace(' ','T')+'Z');return Number.isFinite(d.getTime())?d.toISOString():null;}
function revision(row:any){return crypto.createHash('sha256').update(JSON.stringify({...row,created_at:stamp(row.created_at),updated_at:stamp(row.updated_at),delivered_at:stamp(row.delivered_at)})).digest('hex');}
export async function readZidNoticeReview(actorId:number,merchantId:number){
 return zidConnectionTransaction(actorId,merchantId,async tx=>{
  // Establish a consistent snapshot for both the count and displayed batch.
  await tx.execute('SELECT id FROM merchants WHERE id=?',[merchantId]);
  await zidConnectionWriter(tx,actorId,merchantId);
  const [counts]=await tx.execute<any[]>("SELECT COUNT(*) AS n FROM zid_order_notification_outbox WHERE merchant_id=? AND status='manual_review'",[merchantId]);
  const [rows]=await tx.execute<any[]>(`SELECT ${columns} FROM zid_order_notification_outbox WHERE merchant_id=? AND status='manual_review' ORDER BY id DESC LIMIT 25`,[merchantId]);
  return zidNoticeReviewSchema.parse({actorId,merchantId,checkedAt:new Date().toISOString(),total:Number(counts[0].n),rows:rows.map(row=>({id:row.id,revision:revision(row),orderId:row.zid_order_id,storeId:row.zid_store_id,attempts:row.attempts,createdAt:stamp(row.created_at)}))});
 },true);
}
export async function acknowledgeReviewedZidNotices(actorId:number,merchantId:number,raw:unknown){
 const {items}=zidNoticeReviewInput.parse(raw),sorted=[...items].sort((a,b)=>a.id-b.id);
 return zidConnectionTransaction(actorId,merchantId,async tx=>{
  await tx.execute('SELECT id FROM merchants WHERE id=? FOR UPDATE',[merchantId]);
  await zidConnectionWriter(tx,actorId,merchantId);
  const [rows]=await tx.execute<any[]>(`SELECT ${columns} FROM zid_order_notification_outbox WHERE merchant_id=? AND id IN (${sorted.map(()=>'?').join(',')}) ORDER BY id FOR UPDATE`,[merchantId,...sorted.map(x=>x.id)]);
  if(rows.length!==sorted.length||rows.some((r,i)=>r.id!==sorted[i].id||r.status!=='manual_review'||revision(r)!==sorted[i].revision))throw new ZidConnectionFault('changed');
  const [saved]=await tx.execute<any>(`UPDATE zid_order_notification_outbox SET status='suppressed',last_error='merchant_acknowledged',updated_at=UTC_TIMESTAMP(3) WHERE merchant_id=? AND status='manual_review' AND id IN (${sorted.map(()=>'?').join(',')})`,[merchantId,...sorted.map(x=>x.id)]);
  if(saved.affectedRows!==sorted.length)throw new ZidConnectionFault('changed');
  return zidNoticeReviewReceipt.parse({actorId,merchantId,acknowledged:sorted.length,ids:sorted.map(x=>x.id)});
 });
}
