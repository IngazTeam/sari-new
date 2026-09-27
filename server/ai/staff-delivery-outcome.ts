/** Called only after the original request and tenant bindings have been validated. */
export function unresolvedStaffDelivery(delivery: any, suppressionCode: string) {
  if (!delivery) return { status: 'pending', diagnostic: 'transport_unconfirmed' } as const;
  if (!['queued', 'sent', 'delivered', 'read', 'failed'].includes(delivery.status)) throw Error('Invalid staff delivery status');
  const receipt = delivery.provider_message_id;
  if (receipt != null && (typeof receipt !== 'string' || !receipt.trim())) throw Error('Invalid staff receipt');
  if (['sent', 'delivered', 'read'].includes(delivery.status) && receipt && delivery.error_code == null)
    return { status: 'pending', diagnostic: 'settlement_available' } as const;
  // A failed status with a receipt or an ambiguous transport error is not proof of rejection.
  if (receipt || delivery.error_code === 'provider_unreachable' || /^http_(?:[235]\d\d|408)$/.test(delivery.error_code || '')
    || ['sent', 'delivered', 'read'].includes(delivery.status)) return { status: 'pending', diagnostic: 'outcome_unknown' } as const;
  if (delivery.status === 'failed') return delivery.error_code === suppressionCode
    ? { status: 'suppressed', diagnostic: 'dispatch_suppressed' } as const
    : { status: 'failed', diagnostic: 'provider_failed' } as const;
  return { status: 'pending', diagnostic: delivery.error_code == null ? 'transport_pending' : 'outcome_unknown' } as const;
}
