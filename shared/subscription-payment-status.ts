export const TAP_CHARGE_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
export const PAYMENT_PROVIDER_REFERENCE_PATTERN = /^[A-Za-z0-9_-]{8,255}$/;

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
