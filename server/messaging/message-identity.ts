import { createHash } from 'node:crypto';

/** Shared by durable ingress and history import. Keep this v1 hash stable. */
export function inboundEventKey(merchantId: number, provider: string, account: string, messageId: string) {
  return createHash('sha256').update(JSON.stringify([merchantId, provider, account, messageId])).digest('hex');
}
export const inboundMessageId = (eventKey: string) => `inbound:v1:${eventKey}`;
export function historyMessageId(merchantId: number, account: string, messageId: string, direction: 'incoming' | 'outgoing') {
  const key = inboundEventKey(merchantId, 'green_api', account, messageId);
  return direction === 'incoming' ? inboundMessageId(key) : `history:v1:${key}`;
}
