export const TAP_CHARGE_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
export const PAYMENT_PROVIDER_REFERENCE_PATTERN = /^[A-Za-z0-9_-]{8,255}$/;
export const PAYMENT_LINK_ID_PATTERN = /^link_[a-f0-9]{32}$/;

export type PublicSubscriptionPaymentStatus = 'processing' | 'completed' | 'failed';

/**
 * Keep browser-visible payment state deliberately coarse. An unknown charge and
 * a known pending charge are indistinguishable, so the callback cannot be used
 * to enumerate provider references or infer merchant/payment details.
 */
export function toPublicSubscriptionPaymentStatus(
  storedStatus: string | null | undefined,
): PublicSubscriptionPaymentStatus {
  if (storedStatus === 'completed') return 'completed';
  if (storedStatus === 'failed' || storedStatus === 'refunded') return 'failed';
  return 'processing';
}

export type PublicOrderPaymentStatus = 'processing' | 'captured' | 'failed';

/** AUTHORIZED is only a temporary hold; public success requires CAPTURED. */
export function toPublicOrderPaymentStatus(
  storedStatus: string | null | undefined,
): PublicOrderPaymentStatus {
  if (storedStatus === 'captured') return 'captured';
  if (storedStatus === 'failed' || storedStatus === 'cancelled' || storedStatus === 'refunded') {
    return 'failed';
  }
  return 'processing';
}
