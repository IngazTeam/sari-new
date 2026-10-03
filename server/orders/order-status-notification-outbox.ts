import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../db';
import { sendMerchantWhatsApp } from '../channels/whatsapp/service';
import { ensureOrderNoticeDispatchSchema, claimReviewedOrderNotice, recoverReviewedOrderNoticeLeases, reconcileOrderNoticeClaim } from '../order-notification-dispatch';
let workerTimer:NodeJS.Timeout|null=null,workerRunning=false;
const ensureOutboxSchema=ensureOrderNoticeDispatchSchema;
export async function getOrderStatusNotificationHealth(merchantId: number): Promise<{
  pending: number;
  processing: number;
  failed: number;
  sent: number;
  suppressed: number;
  manualReview: number;
  oldestOpenAt: string | null;
}> {
  if (!Number.isInteger(merchantId) || merchantId <= 0) throw new Error('Invalid merchant');
  await ensureOutboxSchema();
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
       SUM(CASE WHEN delivery_status = 'pending' THEN 1 ELSE 0 END) AS pending,
       SUM(CASE WHEN delivery_status = 'processing' THEN 1 ELSE 0 END) AS processing,
       SUM(CASE WHEN delivery_status = 'failed' THEN 1 ELSE 0 END) AS failed,
       SUM(CASE WHEN delivery_status = 'sent' THEN 1 ELSE 0 END) AS sent,
       SUM(CASE WHEN delivery_status = 'suppressed' THEN 1 ELSE 0 END) AS suppressed,
       SUM(CASE WHEN delivery_status = 'manual_review' THEN 1 ELSE 0 END) AS manual_review,
       MIN(CASE WHEN delivery_status IN ('pending','processing','failed','manual_review') THEN created_at END) AS oldest_open_at
     FROM order_notifications
     WHERE merchant_id = ? AND event_key IS NOT NULL
       AND (created_at >= DATE_SUB(NOW(3), INTERVAL 7 DAY)
            OR delivery_status IN ('pending','processing','failed','manual_review'))`,
    [merchantId],
  );
  const health = rows[0] || {};
  return {
    pending: Number(health.pending || 0),
    processing: Number(health.processing || 0),
    failed: Number(health.failed || 0),
    sent: Number(health.sent || 0),
    suppressed: Number(health.suppressed || 0),
    manualReview: Number(health.manual_review || 0),
    oldestOpenAt: health.oldest_open_at ? String(health.oldest_open_at) : null,
  };
}

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
