import { getPool } from '../../db/connection';
import { assertDisposableDatabase } from './disposable-merchant';
import type { ReviewKind } from '../../../shared/review-workspace';
export async function reviewQuery(sql: string, args: any[] = []) {
  assertDisposableDatabase(); return (await (await getPool())!.execute<any>(sql, args))[0];
}
export async function createReviewFixture(kind: ReviewKind, merchantId: number, name = 'Synthetic customer', rating = 5) {
  if (kind === 'order') {
    const productId = Number((await reviewQuery('INSERT INTO products (merchantId,name,price) VALUES (?,?,1000)', [merchantId, 'Synthetic product'])).insertId);
    const recordId = Number((await reviewQuery(`INSERT INTO orders (merchantId,customerPhone,customerName,orderNumber,items,totalAmount)
      VALUES (?,'+966500000000',?,'TEST-ORDER','[]',1000)`, [merchantId, name])).insertId);
    const id = Number((await reviewQuery(`INSERT INTO customer_reviews (merchantId,orderId,productId,customerPhone,customerName,rating,comment)
      VALUES (?,?,?,'+966500000000',?,?,'Synthetic comment')`, [merchantId, recordId, productId, name, rating])).insertId);
    return { id, recordId, productId, serviceId: null, staffId: null };
  }
  const serviceId = Number((await reviewQuery('INSERT INTO services (merchant_id,name,duration_minutes) VALUES (?,?,30)', [merchantId, 'Synthetic service'])).insertId);
  const staffId = Number((await reviewQuery('INSERT INTO staff_members (merchant_id,name) VALUES (?,?)', [merchantId, 'Synthetic staff'])).insertId);
  const recordId = Number((await reviewQuery(`INSERT INTO bookings (merchant_id,service_id,staff_id,customer_phone,customer_name,booking_date,start_time,end_time,duration_minutes,base_price,final_price)
    VALUES (?,?,?,'+966500000000',?,'2026-10-03','09:00','09:30',30,1000,1000)`, [merchantId, serviceId, staffId, name])).insertId);
  const id = Number((await reviewQuery(`INSERT INTO booking_reviews (merchant_id,booking_id,service_id,staff_id,customer_phone,customer_name,overall_rating,comment,service_quality,professionalism,value_for_money)
    VALUES (?,?,?,?,'+966500000000',?,?,'Synthetic comment',4,3,2)`, [merchantId, recordId, serviceId, staffId, name, rating])).insertId);
  return { id, recordId, productId: null, serviceId, staffId };
}
