import crypto from 'node:crypto';
import { getWhatsAppInstanceByInstanceId } from '../db';
import { deriveGreenWebhookToken } from '../channels/whatsapp/green-webhook-token';

export function hashGreenWebhookToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateGreenWebhookToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export async function verifyGreenWebhookAuthorization(input: {
  instanceId: string;
  authorization?: string;
}): Promise<'valid' | 'invalid' | 'not_configured' | 'instance_not_found'> {
  const instance = await getWhatsAppInstanceByInstanceId(input.instanceId);
  if (!instance || (instance.provider && instance.provider !== 'green_api')) return 'instance_not_found';
  let expectedHash = instance.webhookTokenHash;
  if (!expectedHash) {
    try {
      expectedHash = hashGreenWebhookToken(deriveGreenWebhookToken(String(instance.instanceId), String(instance.token)));
    } catch {
      return 'not_configured';
    }
  }
  const match = input.authorization?.match(/^Bearer\s+([A-Za-z0-9_-]{32,128})$/);
  if (!match) return 'invalid';
  const receivedHash = hashGreenWebhookToken(match[1]);
  const expected = Buffer.from(expectedHash, 'hex');
  const received = Buffer.from(receivedHash, 'hex');
  return expected.length === received.length && crypto.timingSafeEqual(expected, received) ? 'valid' : 'invalid';
}
