import { createHash } from 'node:crypto';

/** Stable across workers/retries, scoped to the stored incoming message and effect. */
export function whatsAppEffectKey(merchantId: number, instanceId: string, incomingMessageId: number, effect: string): string {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0 || !instanceId
      || !Number.isSafeInteger(incomingMessageId) || incomingMessageId <= 0 || !effect || effect.length > 8192) {
    throw new Error('Invalid WhatsApp effect identity');
  }
  return `reply:v1:${createHash('sha256').update(JSON.stringify([merchantId, instanceId, incomingMessageId, effect])).digest('hex')}`;
}

/** For effects produced before a message row exists, such as group redirects. */
export function whatsAppEventEffectKey(merchantId: number, instanceId: string, externalId: string | undefined, effect: string): string {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0 || !instanceId || !externalId
    || externalId.length > 256 || !effect || effect.length > 8192) throw new Error('Invalid WhatsApp event identity');
  return `event:v1:${createHash('sha256').update(JSON.stringify([merchantId, instanceId, externalId, effect])).digest('hex')}`;
}
