import crypto from 'node:crypto';

export function constantTimeWebhookValueEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
export function verifyMetaWebhookSignature(rawBody: Buffer, signature: string | undefined, appSecret: string): boolean {
  if (!signature || !appSecret || !signature.startsWith('sha256=')) return false;
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  return constantTimeWebhookValueEqual(signature, expected);
}
