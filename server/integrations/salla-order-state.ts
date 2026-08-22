export type LocalOrderStatus = 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

const STATUS_BY_SALLA_SLUG: Readonly<Record<string, LocalOrderStatus>> = {
  payment_pending: 'pending',
  under_review: 'pending',
  pending: 'pending',
  paid: 'paid',
  in_progress: 'processing',
  completed: 'processing',
  ready: 'processing',
  shipped: 'shipped',
  delivering: 'shipped',
  delivered: 'delivered',
  cancelled: 'cancelled',
  canceled: 'cancelled',
};

const STATUS_RANK: Readonly<Record<Exclude<LocalOrderStatus, 'cancelled'>, number>> = {
  pending: 0,
  paid: 1,
  processing: 2,
  shipped: 3,
  delivered: 4,
};

export function mapSallaOrderStatusSlug(slug: unknown): LocalOrderStatus | null {
  if (typeof slug !== 'string') return null;
  const normalized = slug.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(normalized)) return null;
  return STATUS_BY_SALLA_SLUG[normalized] || null;
}

/** Prevent late or duplicated events from moving fulfillment backwards. */
export function decideSallaOrderTransition(
  current: LocalOrderStatus,
  next: LocalOrderStatus,
): 'apply' | 'noop' | 'reject' {
  if (current === next) return 'noop';
  if (current === 'delivered' || current === 'cancelled') return 'reject';
  if (next === 'cancelled') {
    return ['pending', 'paid', 'processing'].includes(current) ? 'apply' : 'reject';
  }
  return STATUS_RANK[next] > STATUS_RANK[current] ? 'apply' : 'reject';
}
