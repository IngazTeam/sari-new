import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../db';
import { sendMerchantWhatsApp } from '../channels/whatsapp/service';
import { ensureOrderNoticeDispatchSchema, claimReviewedOrderNotice, recoverReviewedOrderNoticeLeases, reconcileOrderNoticeClaim } from '../order-notification-dispatch';
let workerTimer:NodeJS.Timeout|null=null,workerRunning=false;
const ensureOutboxSchema=ensureOrderNoticeDispatchSchema;
export async function runOrderStatusNotificationBatch(limit=10):Promise<number>{
 if(workerRunning)return 0;workerRunning=true;
 try{
  await ensureOutboxSchema();await recoverReviewedOrderNoticeLeases();const pool=await getPool();if(!pool)throw Error('Database unavailable');
  const safeLimit=Number.isSafeInteger(limit)?Math.max(1,Math.min(limit,25)):10;
  const [candidates]=await pool.execute<RowDataPacket[]>(`SELECT id,merchant_id FROM order_notifications WHERE delivery_status IN ('pending','failed') AND available_at<=UTC_TIMESTAMP(3) ORDER BY available_at,id LIMIT ${safeLimit}`);
  let claimed=0;
  for(const row of candidates){
   const input=await claimReviewedOrderNotice(row.merchant_id,row.id);if(!input)continue;claimed++;
   try{await sendMerchantWhatsApp(input);}catch{/* Only the durable, matching receipt can decide whether a retry is safe. */}
   await reconcileOrderNoticeClaim(input);
  }
  return claimed;
 }finally{workerRunning=false;}
}

export function startOrderStatusNotificationWorker(intervalMs = 30_000): void {
  if (workerTimer) return;
  const tick = () => runOrderStatusNotificationBatch().catch(() => {
    console.error('[Order Status Notification] batch unavailable');
  });
  void tick();
  workerTimer = setInterval(tick, Math.max(intervalMs, 10_000));
  workerTimer.unref?.();
}
