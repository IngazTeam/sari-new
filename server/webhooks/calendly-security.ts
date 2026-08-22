import crypto from 'node:crypto';

export const CALENDLY_WEBHOOK_MAX_BYTES = 128 * 1024;
export const CALENDLY_WEBHOOK_TOLERANCE_SECONDS = 300;
export const CALENDLY_ENDPOINT_PATTERN = /^[A-Za-z0-9_-]{32,48}$/;

export type CalendlyWebhookEventType = 'invitee.created' | 'invitee.canceled';

export type ParsedCalendlyWebhook = {
  event: CalendlyWebhookEventType;
  eventUri: string;
  inviteeUri: string;
};

export type CalendlySignatureResult =
  | { valid: true; timestamp: number }
  | { valid: false; reason: 'missing' | 'malformed' | 'stale' | 'mismatch' };

function safeHexEqual(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  const leftBytes = Buffer.from(left, 'hex');
  const rightBytes = Buffer.from(right, 'hex');
  return leftBytes.length === rightBytes.length && crypto.timingSafeEqual(leftBytes, rightBytes);
}

export function verifyCalendlySignature(input: {
  rawBody: Buffer;
  signatureHeader: string | undefined;
  signingSecret: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): CalendlySignatureResult {
  if (!input.signatureHeader) return { valid: false, reason: 'missing' };
  if (!input.signingSecret || input.signingSecret.length < 32 || input.signingSecret.length > 512) {
    return { valid: false, reason: 'mismatch' };
  }
  if (!Buffer.isBuffer(input.rawBody) || input.rawBody.length === 0 || input.rawBody.length > CALENDLY_WEBHOOK_MAX_BYTES) {
    return { valid: false, reason: 'malformed' };
  }

  const timestampParts: string[] = [];
  const signatureParts: string[] = [];
  for (const part of input.signatureHeader.split(',')) {
    const trimmed = part.trim();
    if (trimmed.startsWith('t=')) timestampParts.push(trimmed.slice(2));
    else if (trimmed.startsWith('v1=')) signatureParts.push(trimmed.slice(3));
    else return { valid: false, reason: 'malformed' };
  }
  if (timestampParts.length !== 1 || signatureParts.length !== 1) {
    return { valid: false, reason: 'malformed' };
  }
  if (!/^\d{10}$/.test(timestampParts[0]) || !/^[a-f0-9]{64}$/i.test(signatureParts[0])) {
    return { valid: false, reason: 'malformed' };
  }
  const timestamp = Number(timestampParts[0]);
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = input.toleranceSeconds ?? CALENDLY_WEBHOOK_TOLERANCE_SECONDS;
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > tolerance) {
    return { valid: false, reason: 'stale' };
  }

  const expected = crypto
    .createHmac('sha256', input.signingSecret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`, 'utf8'), input.rawBody]))
    .digest('hex');
  return safeHexEqual(signatureParts[0], expected)
    ? { valid: true, timestamp }
    : { valid: false, reason: 'mismatch' };
}

function parseCalendlyResourceUri(value: unknown, kind: 'event' | 'invitee'): URL | null {
  if (typeof value !== 'string' || value.length < 40 || value.length > 500) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.protocol !== 'https:'
    || url.hostname !== 'api.calendly.com'
    || url.port
    || url.username
    || url.password
    || url.search
    || url.hash
  ) return null;
  const eventPattern = /^\/scheduled_events\/([A-Za-z0-9_-]{8,128})$/;
  const inviteePattern = /^\/scheduled_events\/([A-Za-z0-9_-]{8,128})\/invitees\/([A-Za-z0-9_-]{8,128})$/;
  if (kind === 'event' && !eventPattern.test(url.pathname)) return null;
  if (kind === 'invitee' && !inviteePattern.test(url.pathname)) return null;
  return url;
}

export function parseCalendlyWebhook(rawBody: Buffer): ParsedCalendlyWebhook | null {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0 || rawBody.length > CALENDLY_WEBHOOK_MAX_BYTES) return null;
  let body: unknown;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (record.event !== 'invitee.created' && record.event !== 'invitee.canceled') return null;
  if (!record.payload || typeof record.payload !== 'object' || Array.isArray(record.payload)) return null;
  const payload = record.payload as Record<string, unknown>;
  const eventUrl = parseCalendlyResourceUri(payload.event, 'event');
  const inviteeUrl = parseCalendlyResourceUri(payload.invitee, 'invitee');
  if (!eventUrl || !inviteeUrl) return null;
  const eventId = eventUrl.pathname.split('/')[2];
  const inviteeEventId = inviteeUrl.pathname.split('/')[2];
  if (eventId !== inviteeEventId) return null;
  return {
    event: record.event,
    eventUri: eventUrl.toString(),
    inviteeUri: inviteeUrl.toString(),
  };
}

export function calendlyEventKey(payload: ParsedCalendlyWebhook): string {
  return crypto
    .createHash('sha256')
    .update(`${payload.event}\0${payload.inviteeUri}`, 'utf8')
    .digest('hex');
}
