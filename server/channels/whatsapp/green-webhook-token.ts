import crypto from 'node:crypto';

export function deriveGreenWebhookToken(instanceId: string, apiToken: string): string {
  const rootKey = process.env.GREEN_WEBHOOK_TOKEN_KEY || process.env.FIELD_ENCRYPTION_KEY || '';
  if (rootKey.length < 32) throw new Error('GREEN_WEBHOOK_TOKEN_KEY or FIELD_ENCRYPTION_KEY must contain at least 32 characters');
  return crypto.createHmac('sha256', rootKey).update(`green-webhook:v1:${instanceId}:${apiToken}`).digest('base64url');
}
