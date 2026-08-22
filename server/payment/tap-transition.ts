export type StoredTapPaymentStatus = 'pending' | 'authorized' | 'captured' | 'failed' | 'cancelled' | 'refunded';
export type TapTransitionStatus = 'processing' | 'completed' | 'failed' | 'cancelled' | 'refunded';

export type TapWebhookTransition =
  | { kind: 'transition'; status: TapTransitionStatus }
  | { kind: 'noop' }
  | { kind: 'invalid' };

export function planTapWebhookTransition(
  current: StoredTapPaymentStatus,
  tapStatus: string,
): TapWebhookTransition {
  if (tapStatus === 'INITIATED') return { kind: 'noop' };
  if (tapStatus === 'AUTHORIZED') {
    if (current === 'pending') return { kind: 'transition', status: 'processing' };
    return current === 'authorized' || current === 'captured' || current === 'refunded'
      ? { kind: 'noop' }
      : { kind: 'invalid' };
  }
  if (tapStatus === 'CAPTURED') {
    if (current === 'pending' || current === 'authorized') return { kind: 'transition', status: 'completed' };
    return current === 'captured' || current === 'refunded' ? { kind: 'noop' } : { kind: 'invalid' };
  }
  if (tapStatus === 'REFUNDED') {
    if (current === 'captured') return { kind: 'transition', status: 'refunded' };
    return current === 'refunded' ? { kind: 'noop' } : { kind: 'invalid' };
  }
  if (['FAILED', 'DECLINED', 'TIMEDOUT', 'RESTRICTED', 'UNKNOWN'].includes(tapStatus)) {
    if (current === 'pending' || current === 'authorized') return { kind: 'transition', status: 'failed' };
    return current === 'failed' ? { kind: 'noop' } : { kind: 'invalid' };
  }
  if (['CANCELLED', 'ABANDONED', 'VOID'].includes(tapStatus)) {
    if (current === 'pending' || current === 'authorized') return { kind: 'transition', status: 'cancelled' };
    return current === 'cancelled' ? { kind: 'noop' } : { kind: 'invalid' };
  }
  return { kind: 'invalid' };
}
