/**
 * ط¯ظˆط§ظ„ ظ‚ط§ط¹ط¯ط© ط§ظ„ط¨ظٹط§ظ†ط§طھ ظ„ظ†ط¸ط§ظ… ط§ظ„ط¯ظپط¹ Tap Payments
 */

import { eq, and, desc, gte, lte } from "drizzle-orm";
import { 
  orderPayments, 
  paymentLinks,
  type OrderPayment,
  type NewOrderPayment,
  type PaymentLink,
  type NewPaymentLink
} from "../drizzle/schema";
import { getDb as _getDb } from "./db";

/** Non-nullable wrapper — throws if DB not initialized */
async function getDb() {
  const db = await _getDb();
  if (!db) throw new Error('Database not initialized');
  return db;
}

// ============================================
// Order Payments Functions
// ============================================

/**
 * ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ظ…ط¹ط§ظ…ظ„ط© ط¯ظپط¹ ط¨ط§ظ„ظ…ط¹ط±ظپ
 */
export async function getOrderPaymentById(id: number): Promise<OrderPayment | null> {
  const db = await getDb();
  const [payment] = await db
    .select()
    .from(orderPayments)
    .where(eq(orderPayments.id, id));
  return payment || null;
}

/**
 * ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ظ…ط¹ط§ظ…ظ„ط© ط¯ظپط¹ ط¨ظ…ط¹ط±ظپ Tap Charge
 */
export async function getOrderPaymentByTapChargeId(tapChargeId: string): Promise<OrderPayment | null> {
  const db = await getDb();
  const [payment] = await db
    .select()
    .from(orderPayments)
    .where(eq(orderPayments.tapChargeId, tapChargeId));
  return payment || null;
}

/**
 * ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ظ…ط¹ط§ظ…ظ„ط§طھ ط§ظ„ط¯ظپط¹ ط§ظ„ط®ط§طµط© ط¨ط·ظ„ط¨
 */
export async function getOrderPaymentsByOrderId(orderId: number): Promise<OrderPayment[]> {
  const db = await getDb();
  return await db
    .select()
    .from(orderPayments)
    .where(eq(orderPayments.orderId, orderId))
    .orderBy(desc(orderPayments.createdAt));
}

/**
 * ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ظ…ط¹ط§ظ…ظ„ط§طھ ط§ظ„ط¯ظپط¹ ط§ظ„ط®ط§طµط© ط¨ط­ط¬ط²
 */
export async function getOrderPaymentsByBookingId(bookingId: number): Promise<OrderPayment[]> {
  const db = await getDb();
  return await db
    .select()
    .from(orderPayments)
    .where(eq(orderPayments.bookingId, bookingId))
    .orderBy(desc(orderPayments.createdAt));
}

/**
 * ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ط¬ظ…ظٹط¹ ظ…ط¹ط§ظ…ظ„ط§طھ ط§ظ„ط¯ظپط¹ ظ„طھط§ط¬ط±
 */
export async function getOrderPaymentsByMerchant(
  merchantId: number,
  filters?: {
    status?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }
): Promise<OrderPayment[]> {
  const db = await getDb();
  let query = db
    .select()
    .from(orderPayments)
    .where(eq(orderPayments.merchantId, merchantId));

  // طھط·ط¨ظٹظ‚ ط§ظ„ظپظ„ط§طھط±
  const conditions = [eq(orderPayments.merchantId, merchantId)];
  
  if (filters?.status) {
    conditions.push(eq(orderPayments.status, filters.status as any));
  }
  
  if (filters?.startDate) {
    conditions.push(gte(orderPayments.createdAt, filters.startDate.toISOString()));
  }
  
  if (filters?.endDate) {
    conditions.push(lte(orderPayments.createdAt, filters.endDate.toISOString()));
  }

  const results = await db
    .select()
    .from(orderPayments)
    .where(and(...conditions))
    .orderBy(desc(orderPayments.createdAt))
    .limit(filters?.limit || 100);

  return results;
}

/**
 * طھط­ط¯ظٹط« ظ…ط¹ط§ظ…ظ„ط© ط¯ظپط¹
 */
/**
 * ط¥ط­طµط§ط¦ظٹط§طھ ط§ظ„ط¯ظپط¹ ظ„طھط§ط¬ط±
 */
export async function getPaymentStats(
  merchantId: number,
  startDate?: Date,
  endDate?: Date
): Promise<{
  totalPayments: number;
  totalAmount: number;
  successfulPayments: number;
  successfulAmount: number;
  failedPayments: number;
  pendingPayments: number;
  refundedPayments: number;
  refundedAmount: number;
}> {
  const db = await getDb();
  
  const conditions = [eq(orderPayments.merchantId, merchantId)];
  
  if (startDate) {
    conditions.push(gte(orderPayments.createdAt, startDate.toISOString()));
  }
  
  if (endDate) {
    conditions.push(lte(orderPayments.createdAt, endDate.toISOString()));
  }

  const payments = await db
    .select()
    .from(orderPayments)
    .where(and(...conditions));

  const stats = {
    totalPayments: payments.length,
    totalAmount: 0,
    successfulPayments: 0,
    successfulAmount: 0,
    failedPayments: 0,
    pendingPayments: 0,
    refundedPayments: 0,
    refundedAmount: 0,
  };

  payments.forEach(payment => {
    stats.totalAmount += payment.amount;
    
    if (payment.status === 'captured' || payment.status === 'authorized') {
      stats.successfulPayments++;
      stats.successfulAmount += payment.amount;
    } else if (payment.status === 'failed') {
      stats.failedPayments++;
    } else if (payment.status === 'pending') {
      stats.pendingPayments++;
    } else if (payment.status === 'refunded') {
      stats.refundedPayments++;
      stats.refundedAmount += payment.amount;
    }
  });

  return stats;
}

// ============================================
// Payment Links Functions
// ============================================

/**
 * ط¥ظ†ط´ط§ط، ط±ط§ط¨ط· ط¯ظپط¹ ط¬ط¯ظٹط¯
 */
export async function createPaymentLink(data: NewPaymentLink): Promise<PaymentLink | null> {
  const db = await getDb();
  const [link] = await db.insert(paymentLinks).values(data).$returningId();
  if (!link) return null;
  return await getPaymentLinkById(link.id);
}

/**
 * ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ط±ط§ط¨ط· ط¯ظپط¹ ط¨ط§ظ„ظ…ط¹ط±ظپ
 */
export async function getPaymentLinkById(id: number): Promise<PaymentLink | null> {
  const db = await getDb();
  const [link] = await db
    .select()
    .from(paymentLinks)
    .where(eq(paymentLinks.id, id));
  return link || null;
}

/**
 * ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ط±ط§ط¨ط· ط¯ظپط¹ ط¨ظ…ط¹ط±ظپ ط§ظ„ط±ط§ط¨ط·
 */
export async function getPaymentLinkByLinkId(linkId: string): Promise<PaymentLink | null> {
  const db = await getDb();
  const [link] = await db
    .select()
    .from(paymentLinks)
    .where(eq(paymentLinks.linkId, linkId));
  return link || null;
}

/**
 * ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ط±ظˆط§ط¨ط· ط§ظ„ط¯ظپط¹ ظ„طھط§ط¬ط±
 */
export async function getPaymentLinksByMerchant(
  merchantId: number,
  filters?: {
    status?: string;
    isActive?: boolean;
    limit?: number;
  }
): Promise<PaymentLink[]> {
  const db = await getDb();
  
  const conditions = [eq(paymentLinks.merchantId, merchantId)];
  
  if (filters?.status) {
    conditions.push(eq(paymentLinks.status, filters.status as any));
  }
  
  if (filters?.isActive !== undefined) {
    conditions.push(eq(paymentLinks.isActive, filters.isActive ? 1 : 0));
  }

  return await db
    .select()
    .from(paymentLinks)
    .where(and(...conditions))
    .orderBy(desc(paymentLinks.createdAt))
    .limit(filters?.limit || 50);
}

/**
 * ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ط±ط§ط¨ط· ط¯ظپط¹ ظ„ط·ظ„ط¨
 */
export async function getPaymentLinkByOrderId(orderId: number): Promise<PaymentLink | null> {
  const db = await getDb();
  const [link] = await db
    .select()
    .from(paymentLinks)
    .where(eq(paymentLinks.orderId, orderId))
    .orderBy(desc(paymentLinks.createdAt));
  return link || null;
}

/**
 * ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ط±ط§ط¨ط· ط¯ظپط¹ ظ„ط­ط¬ط²
 */
export async function getPaymentLinkByBookingId(bookingId: number): Promise<PaymentLink | null> {
  const db = await getDb();
  const [link] = await db
    .select()
    .from(paymentLinks)
    .where(eq(paymentLinks.bookingId, bookingId))
    .orderBy(desc(paymentLinks.createdAt));
  return link || null;
}

/**
 * طھط­ط¯ظٹط« ط±ط§ط¨ط· ط¯ظپط¹
 */
export async function createOrderPaymentIdempotent(
  data: NewOrderPayment & { tapChargeId: string },
): Promise<OrderPayment> {
  const existing = await getOrderPaymentByTapChargeId(data.tapChargeId);
  if (existing) return existing;

  const db = await getDb();
  try {
    const [inserted] = await db.insert(orderPayments).values(data).$returningId();
    if (inserted) {
      const payment = await getOrderPaymentById(inserted.id);
      if (payment) return payment;
    }
  } catch (error: any) {
    if (error?.code !== 'ER_DUP_ENTRY') throw error;
  }

  const raced = await getOrderPaymentByTapChargeId(data.tapChargeId);
  if (!raced) throw new Error('Tap payment idempotency conflict could not be resolved');
  return raced;
}

/**
 * طھط¹ط·ظٹظ„ ط±ط§ط¨ط· ط¯ظپط¹
 */
export async function disablePaymentLink(id: number): Promise<void> {
  const db = await getDb();
  await db
    .update(paymentLinks)
    .set({
      isActive: 0,
      status: 'disabled',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(paymentLinks.id, id));
}
