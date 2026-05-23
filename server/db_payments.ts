/**
 * ط¯ظˆط§ظ„ ظ‚ط§ط¹ط¯ط© ط§ظ„ط¨ظٹط§ظ†ط§طھ ظ„ظ†ط¸ط§ظ… ط§ظ„ط¯ظپط¹ Tap Payments
 */

import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { 
  orderPayments, 
  paymentLinks, 
  paymentRefunds,
  type OrderPayment,
  type NewOrderPayment,
  type PaymentLink,
  type NewPaymentLink,
  type PaymentRefund,
  type NewPaymentRefund
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
 * ط¥ظ†ط´ط§ط، ظ…ط¹ط§ظ…ظ„ط© ط¯ظپط¹ ط¬ط¯ظٹط¯ط©
 */
export async function createOrderPayment(data: NewOrderPayment): Promise<OrderPayment | null> {
  const db = await getDb();
  const [payment] = await db.insert(orderPayments).values(data).$returningId();
  if (!payment) return null;
  return await getOrderPaymentById(payment.id);
}

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
export async function updateOrderPayment(
  id: number,
  data: Partial<NewOrderPayment>
): Promise<OrderPayment | null> {
  const db = await getDb();
  await db
    .update(orderPayments)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(orderPayments.id, id));
  return await getOrderPaymentById(id);
}

/**
 * طھط­ط¯ظٹط« ط­ط§ظ„ط© ظ…ط¹ط§ظ…ظ„ط© ط¯ظپط¹
 */
export async function updateOrderPaymentStatus(
  id: number,
  status: 'pending' | 'authorized' | 'captured' | 'failed' | 'cancelled' | 'refunded',
  additionalData?: {
    paymentMethod?: string;
    errorMessage?: string;
    errorCode?: string;
  }
): Promise<OrderPayment | null> {
  const db = await getDb();
  const updateData: any = {
    status,
    updatedAt: new Date().toISOString(),
  };

  // طھط­ط¯ظٹط« timestamps ط­ط³ط¨ ط§ظ„ط­ط§ظ„ط©
  const now = new Date().toISOString();
  if (status === 'authorized') {
    updateData.authorizedAt = now;
  } else if (status === 'captured') {
    updateData.capturedAt = now;
  } else if (status === 'failed') {
    updateData.failedAt = now;
  } else if (status === 'refunded') {
    updateData.refundedAt = now;
  }

  // ط¥ط¶ط§ظپط© ط§ظ„ط¨ظٹط§ظ†ط§طھ ط§ظ„ط¥ط¶ط§ظپظٹط©
  if (additionalData) {
    Object.assign(updateData, additionalData);
  }

  await db
    .update(orderPayments)
    .set(updateData)
    .where(eq(orderPayments.id, id));

  return await getOrderPaymentById(id);
}

/**
 * ط­ط°ظپ ظ…ط¹ط§ظ…ظ„ط© ط¯ظپط¹
 */
export async function deleteOrderPayment(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(orderPayments).where(eq(orderPayments.id, id));
}

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
export async function updatePaymentLink(
  id: number,
  data: Partial<NewPaymentLink>
): Promise<PaymentLink | null> {
  const db = await getDb();
  await db
    .update(paymentLinks)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(paymentLinks.id, id));
  return await getPaymentLinkById(id);
}

/**
 * ط²ظٹط§ط¯ط© ط¹ط¯ط§ط¯ ط§ط³طھط®ط¯ط§ظ… ط±ط§ط¨ط· ط§ظ„ط¯ظپط¹
 */
export async function incrementPaymentLinkUsage(
  id: number,
  amount: number,
  success: boolean
): Promise<void> {
  const db = await getDb();
  const link = await getPaymentLinkById(id);
  if (!link) return;

  const updateData: any = {
    usageCount: link.usageCount + 1,
    updatedAt: new Date().toISOString(),
  };

  if (success) {
    updateData.successfulPayments = link.successfulPayments + 1;
    updateData.totalCollected = link.totalCollected + amount;
  } else {
    updateData.failedPayments = link.failedPayments + 1;
  }

  // ط§ظ„طھط­ظ‚ظ‚ ظ…ظ† ط§ظ†طھظ‡ط§ط، طµظ„ط§ط­ظٹط© ط§ظ„ط±ط§ط¨ط·
  if (link.maxUsageCount && updateData.usageCount >= link.maxUsageCount) {
    updateData.status = 'completed';
    updateData.isActive = 0;
  }

  await db
    .update(paymentLinks)
    .set(updateData)
    .where(eq(paymentLinks.id, id));
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

/**
 * ط­ط°ظپ ط±ط§ط¨ط· ط¯ظپط¹
 */
export async function deletePaymentLink(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(paymentLinks).where(eq(paymentLinks.id, id));
}

// ============================================
// Payment Refunds Functions
// ============================================

/**
 * ط¥ظ†ط´ط§ط، ط¹ظ…ظ„ظٹط© ط§ط³طھط±ط¬ط§ط¹
 */
export async function createPaymentRefund(data: NewPaymentRefund): Promise<PaymentRefund | null> {
  const db = await getDb();
  const [refund] = await db.insert(paymentRefunds).values(data).$returningId();
  if (!refund) return null;
  return await getPaymentRefundById(refund.id);
}

/**
 * ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ط¹ظ…ظ„ظٹط© ط§ط³طھط±ط¬ط§ط¹ ط¨ط§ظ„ظ…ط¹ط±ظپ
 */
export async function getPaymentRefundById(id: number): Promise<PaymentRefund | null> {
  const db = await getDb();
  const [refund] = await db
    .select()
    .from(paymentRefunds)
    .where(eq(paymentRefunds.id, id));
  return refund || null;
}

/**
 * ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ط¹ظ…ظ„ظٹط§طھ ط§ظ„ط§ط³طھط±ط¬ط§ط¹ ظ„ظ…ط¹ط§ظ…ظ„ط© ط¯ظپط¹
 */
export async function getPaymentRefundsByPaymentId(paymentId: number): Promise<PaymentRefund[]> {
  const db = await getDb();
  return await db
    .select()
    .from(paymentRefunds)
    .where(eq(paymentRefunds.paymentId, paymentId))
    .orderBy(desc(paymentRefunds.createdAt));
}

/**
 * ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ط¹ظ…ظ„ظٹط§طھ ط§ظ„ط§ط³طھط±ط¬ط§ط¹ ظ„طھط§ط¬ط±
 */
export async function getPaymentRefundsByMerchant(
  merchantId: number,
  filters?: {
    status?: string;
    limit?: number;
  }
): Promise<PaymentRefund[]> {
  const db = await getDb();
  
  const conditions = [eq(paymentRefunds.merchantId, merchantId)];
  
  if (filters?.status) {
    conditions.push(eq(paymentRefunds.status, filters.status as any));
  }

  return await db
    .select()
    .from(paymentRefunds)
    .where(and(...conditions))
    .orderBy(desc(paymentRefunds.createdAt))
    .limit(filters?.limit || 50);
}

/**
 * طھط­ط¯ظٹط« ط¹ظ…ظ„ظٹط© ط§ط³طھط±ط¬ط§ط¹
 */
export async function updatePaymentRefund(
  id: number,
  data: Partial<NewPaymentRefund>
): Promise<PaymentRefund | null> {
  const db = await getDb();
  await db
    .update(paymentRefunds)
    .set({ ...data, updatedAt: new Date().toISOString() })
    .where(eq(paymentRefunds.id, id));
  return await getPaymentRefundById(id);
}

/**
 * طھط­ط¯ظٹط« ط­ط§ظ„ط© ط¹ظ…ظ„ظٹط© ط§ط³طھط±ط¬ط§ط¹
 */
export async function updatePaymentRefundStatus(
  id: number,
  status: 'pending' | 'completed' | 'failed',
  errorMessage?: string
): Promise<PaymentRefund | null> {
  const db = await getDb();
  const updateData: any = {
    status,
    updatedAt: new Date().toISOString(),
  };

  if (status === 'completed') {
    updateData.completedAt = new Date().toISOString();
  }

  if (errorMessage) {
    updateData.errorMessage = errorMessage;
  }

  await db
    .update(paymentRefunds)
    .set(updateData)
    .where(eq(paymentRefunds.id, id));

  return await getPaymentRefundById(id);
}

/**
 * ط­ط°ظپ ط¹ظ…ظ„ظٹط© ط§ط³طھط±ط¬ط§ط¹
 */
export async function deletePaymentRefund(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(paymentRefunds).where(eq(paymentRefunds.id, id));
}

// ============================================
// Helper Functions for Webhook Processing
// ============================================

/**
 * ط§ظ„ط­طµظˆظ„ ط¹ظ„ظ‰ ظ…ط¹ط§ظ…ظ„ط© ط¯ظپط¹ ط¨ظ…ط¹ط±ظپ Tap Charge (alias)
 */
export async function getPaymentByTapChargeId(tapChargeId: string): Promise<OrderPayment | null> {
  return await getOrderPaymentByTapChargeId(tapChargeId);
}

/**
 * طھط­ط¯ظٹط« ط­ط§ظ„ط© ظ…ط¹ط§ظ…ظ„ط© ط¯ظپط¹ (alias ظ„ظ„طھظˆط§ظپظ‚ ظ…ط¹ webhook)
 */
export async function updatePaymentStatus(
  id: number,
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded' | 'cancelled',
  additionalData?: {
    tapResponse?: string;
    errorMessage?: string;
    errorCode?: string;
  }
): Promise<OrderPayment | null> {
  // طھط­ظˆظٹظ„ ط§ظ„ط­ط§ظ„ط© ط¥ظ„ظ‰ ط§ظ„ط­ط§ظ„ط© ط§ظ„ظ…ظ†ط§ط³ط¨ط© ظپظٹ ط§ظ„ظ†ط¸ط§ظ…
  let dbStatus: 'pending' | 'authorized' | 'captured' | 'failed' | 'cancelled' | 'refunded';
  
  switch (status) {
    case 'completed':
      dbStatus = 'captured';
      break;
    case 'processing':
      dbStatus = 'authorized';
      break;
    case 'refunded':
      dbStatus = 'refunded';
      break;
    case 'cancelled':
      dbStatus = 'cancelled';
      break;
    case 'failed':
      dbStatus = 'failed';
      break;
    default:
      dbStatus = 'pending';
  }

  return await updateOrderPaymentStatus(id, dbStatus, additionalData);
}

/**
 * ط­ظپط¸ ط³ط¬ظ„ webhook
 */
export async function createWebhookLog(data: {
  merchantId: number;
  paymentId: number;
  provider: string;
  eventType: string;
  payload: string;
  processedAt: Date;
}): Promise<void> {
  // ظٹظ…ظƒظ† ط¥ط¶ط§ظپط© ط¬ط¯ظˆظ„ webhook_logs ظ„ط§ط­ظ‚ط§ظ‹
  // ط­ط§ظ„ظٹط§ظ‹ ظ†ط­ظپط¸ ظپظٹ logs
  console.log('[WebhookLog]', {
    merchantId: data.merchantId,
    paymentId: data.paymentId,
    provider: data.provider,
    eventType: data.eventType,
    processedAt: data.processedAt
  });
}
