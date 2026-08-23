import { and, eq } from 'drizzle-orm';
import { orders, type Order } from '../../drizzle/schema';
import { getDb } from '../db';

export type MerchantOrderStatus = Order['status'];

const STATUS_RANK: Record<Exclude<MerchantOrderStatus, 'cancelled'>, number> = {
  pending: 0,
  paid: 1,
  processing: 2,
  shipped: 3,
  delivered: 4,
};

export class InvalidMerchantOrderTransitionError extends Error {
  constructor(from: MerchantOrderStatus, to: MerchantOrderStatus) {
    super(`Invalid merchant order transition: ${from} -> ${to}`);
    this.name = 'InvalidMerchantOrderTransitionError';
  }
}

export class MerchantOrderWriteConflictError extends Error {
  constructor() {
    super('Merchant order changed before the requested update was committed');
    this.name = 'MerchantOrderWriteConflictError';
  }
}

export function assertMerchantOrderTransition(
  from: MerchantOrderStatus,
  to: MerchantOrderStatus,
): void {
  if (from === to) return;
  if (from === 'cancelled' || from === 'delivered') {
    throw new InvalidMerchantOrderTransitionError(from, to);
  }
  if (to === 'cancelled') return;
  if (STATUS_RANK[to] <= STATUS_RANK[from]) {
    throw new InvalidMerchantOrderTransitionError(from, to);
  }
}

export async function getMerchantOrder(
  merchantId: number,
  orderId: number,
): Promise<Order | undefined> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const rows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.merchantId, merchantId)))
    .limit(1);
  return rows[0];
}

export async function transitionMerchantOrderStatus(input: {
  merchantId: number;
  orderId: number;
  expectedStatus: MerchantOrderStatus;
  status: MerchantOrderStatus;
  trackingNumber?: string;
  cancellationReason?: string;
}): Promise<boolean> {
  assertMerchantOrderTransition(input.expectedStatus, input.status);
  if (input.expectedStatus === input.status) return false;

  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const updateData: Partial<typeof orders.$inferInsert> = {
    status: input.status,
    updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
  };
  if (input.trackingNumber !== undefined) updateData.trackingNumber = input.trackingNumber;
  if (input.status === 'cancelled') {
    updateData.notes = input.cancellationReason || 'تم إلغاء الطلب';
  }

  const result = await db
    .update(orders)
    .set(updateData)
    .where(and(
      eq(orders.id, input.orderId),
      eq(orders.merchantId, input.merchantId),
      eq(orders.status, input.expectedStatus),
    ));

  const affectedRows = Number((result[0] as { affectedRows?: number }).affectedRows || 0);
  if (affectedRows !== 1) throw new MerchantOrderWriteConflictError();
  return true;
}
