import crypto from 'node:crypto';

export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}
