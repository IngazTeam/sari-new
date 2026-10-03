import crypto from 'node:crypto';
import type { Order } from '../../drizzle/schema';

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

export function createOrderStatusNotificationEventKey(input: {
  merchantId: number;
  orderId: number;
  status: MerchantOrderStatus;
}): string {
  return crypto
    .createHash('sha256')
    .update(`order-status:v1\0${input.merchantId}\0${input.orderId}\0${input.status}`, 'utf8')
    .digest('hex');
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
