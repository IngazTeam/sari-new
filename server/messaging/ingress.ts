import { enqueueInbound } from './inbound-jobs';

/** Only returns success after the incoming event is durably stored. */
export async function acceptWhatsAppEvent(payload: any, source: 'webhook' | 'polling' | 'meta', expectedMerchantId?: number) {
  if (payload?.typeWebhook === 'incomingMessageReceived') {
    const receipt = await enqueueInbound({ payload, source, expectedMerchantId });
    return { success: true, message: receipt.duplicate ? 'Message already queued' : 'Message queued' };
  }
  // Manual messages update durable human-takeover state immediately, even while
  // a customer reply is being generated. Status notifications never invoke AI.
  if (payload?.typeWebhook === 'outgoingMessageStatus') {
    const { updateWhatsAppDeliveryStatus } = await import('../channels/whatsapp/service');
    const status = ['sent', 'delivered', 'read'].includes(payload.status) ? payload.status
      : ['failed', 'noAccount', 'notInGroup', 'suspended', 'yellowCard'].includes(payload.status) ? 'failed' : null;
    if (!status || !payload.idMessage) return { success: true, message: 'Unsupported delivery status' };
    await updateWhatsAppDeliveryStatus({ provider: source === 'meta' ? 'meta_cloud' : 'green_api',
      providerAccount: String(payload.instanceData?.idInstance || ''),
      providerMessageId: String(payload.idMessage), status });
    return { success: true, message: 'Status recorded' };
  }
  const { handleGreenAPIWebhook } = await import('../webhooks/greenapi');
  return handleGreenAPIWebhook(payload);
}
