/**
 * دوال قاعدة البيانات لنظام الدفع Tap Payments
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
import { getDb } from "./db";

// ============================================
// Order Payments Functions
// ============================================

/**
 * إنشاء معاملة دفع جديدة
 */
export async function createOrderPayment(data: NewOrderPayment): Promise<OrderPayment | null> {
  const db = await getDb();
  const [payment] = await db.insert(orderPayments).values(data).$returningId();
  if (!payment) return null;
  return await getOrderPaymentById(payment.id);
}

/**
 * الحصول على معاملة دفع بالمعرف
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
 * الحصول على معاملة دفع بمعرف Tap Charge
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
 * الحصول على معاملات الدفع الخاصة بطلب
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
 * الحصول على معاملات الدفع الخاصة بحجز
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
 * الحصول على جميع معاملات الدفع لتاجر
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

  // تطبيق الفلاتر
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
 * تحديث معاملة دفع
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
 * تحديث حالة معاملة دفع
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

  // تحديث timestamps حسب الحالة
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

  // إضافة البيانات الإضافية
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
 * حذف معاملة دفع
 */
export async function deleteOrderPayment(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(orderPayments).where(eq(orderPayments.id, id));
}

/**
 * إحصائيات الدفع لتاجر
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
 * إنشاء رابط دفع جديد
 */
export async function createPaymentLink(data: NewPaymentLink): Promise<PaymentLink | null> {
  const db = await getDb();
  const [link] = await db.insert(paymentLinks).values(data).$returningId();
  if (!link) return null;
  return await getPaymentLinkById(link.id);
}

/**
 * الحصول على رابط دفع بالمعرف
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
 * الحصول على رابط دفع بمعرف الرابط
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
 * الحصول على روابط الدفع لتاجر
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
 * الحصول على رابط دفع لطلب
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
 * الحصول على رابط دفع لحجز
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
 * تحديث رابط دفع
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
 * زيادة عداد استخدام رابط الدفع
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

  // التحقق من انتهاء صلاحية الرابط
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
 * تعطيل رابط دفع
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
 * حذف رابط دفع
 */
export async function deletePaymentLink(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(paymentLinks).where(eq(paymentLinks.id, id));
}

// ============================================
// Payment Refunds Functions
// ============================================

/**
 * إنشاء عملية استرجاع
 */
export async function createPaymentRefund(data: NewPaymentRefund): Promise<PaymentRefund | null> {
  const db = await getDb();
  const [refund] = await db.insert(paymentRefunds).values(data).$returningId();
  if (!refund) return null;
  return await getPaymentRefundById(refund.id);
}

/**
 * الحصول على عملية استرجاع بالمعرف
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
 * الحصول على عمليات الاسترجاع لمعاملة دفع
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
 * الحصول على عمليات الاسترجاع لتاجر
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
 * تحديث عملية استرجاع
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
 * تحديث حالة عملية استرجاع
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
 * حذف عملية استرجاع
 */
export async function deletePaymentRefund(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(paymentRefunds).where(eq(paymentRefunds.id, id));
}

// ============================================
// Helper Functions for Webhook Processing
// ============================================

/**
 * الحصول على معاملة دفع بمعرف Tap Charge (alias)
 */
export async function getPaymentByTapChargeId(tapChargeId: string): Promise<OrderPayment | null> {
  return await getOrderPaymentByTapChargeId(tapChargeId);
}

/**
 * تحديث حالة معاملة دفع (alias للتوافق مع webhook)
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
  // تحويل الحالة إلى الحالة المناسبة في النظام
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
 * حفظ سجل webhook
 */
export async function createWebhookLog(data: {
  merchantId: number;
  paymentId: number;
  provider: string;
  eventType: string;
  payload: string;
  processedAt: Date;
}): Promise<void> {
  // يمكن إضافة جدول webhook_logs لاحقاً
  // حالياً نحفظ في logs
  console.log('[WebhookLog]', {
    merchantId: data.merchantId,
    paymentId: data.paymentId,
    provider: data.provider,
    eventType: data.eventType,
    processedAt: data.processedAt
  });
}
