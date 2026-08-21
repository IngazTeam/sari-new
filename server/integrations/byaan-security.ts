import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';

const SIGNATURE_TOLERANCE_SECONDS = 300;
const DELIVERY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DOMAIN_PATTERN = /^(?=.{4,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export type ByaanSignedHeaders = {
  timestamp: string;
  deliveryId: string;
  signature: string;
};

export type ByaanSignatureVerification =
  | { ok: true; deliveryId: string; payloadHash: string }
  | { ok: false; code: 'missing_headers' | 'stale_request' | 'invalid_delivery_id' | 'invalid_signature' };

export function normalizeByaanTenantDomain(input: string): string {
  const candidate = String(input || '').trim().toLowerCase().replace(/\.$/, '');
  if (!candidate || candidate.includes('/') || candidate.includes('@') || candidate.includes(':')) {
    throw new Error('Invalid Byaan tenant domain');
  }

  let hostname: string;
  try {
    hostname = new URL(`https://${candidate}`).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    throw new Error('Invalid Byaan tenant domain');
  }

  if (!DOMAIN_PATTERN.test(hostname) || hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('Invalid Byaan tenant domain');
  }
  return hostname;
}

export function normalizeByaanApiBaseUrl(tenantDomain: string, input?: string): string {
  const normalizedDomain = normalizeByaanTenantDomain(tenantDomain);
  const parsed = new URL(input || `https://${normalizedDomain}/api/sari`);
  parsed.hash = '';
  parsed.search = '';

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) {
    throw new Error('Byaan API base URL must use HTTPS without credentials or a custom port');
  }
  if (parsed.hostname.toLowerCase().replace(/\.$/, '') !== normalizedDomain) {
    throw new Error('Byaan API base URL must use the verified tenant domain');
  }
  const pathname = parsed.pathname.replace(/\/+$/, '') || '/api/sari';
  if (pathname !== '/api/sari') {
    throw new Error('Byaan API base URL must end with /api/sari');
  }
  return `https://${normalizedDomain}/api/sari`;
}

export function isPrivateOrSpecialAddress(address: string): boolean {
  const normalized = address.trim().toLowerCase().split('%')[0];
  const family = net.isIP(normalized);
  if (family === 4) {
    const octets = normalized.split('.').map(Number);
    if (octets.length !== 4 || octets.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    const [a, b] = octets;
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && octets[2] === 100) ||
      (a === 203 && b === 0 && octets[2] === 113) ||
      a >= 224
    );
  }
  if (family === 6) {
    const mappedDottedIpv4 = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
    if (mappedDottedIpv4 && isPrivateOrSpecialAddress(mappedDottedIpv4)) return true;
    return (
      normalized === '::' || normalized === '::1' ||
      normalized.startsWith('fc') || normalized.startsWith('fd') ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith('ff') ||
      normalized.startsWith('2001:db8:') ||
      normalized.startsWith('::ffff:127.') ||
      normalized.startsWith('::ffff:10.') ||
      normalized.startsWith('::ffff:192.168.')
    );
  }
  return true;
}

/**
 * Resolve the destination once, reject every private/special answer, then pin the
 * HTTPS connection to a validated address. This closes redirects and DNS rebinding
 * between validation and the socket lookup.
 */
export async function createPinnedByaanHttpsAgent(url: string): Promise<https.Agent> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('Byaan endpoints must use HTTPS');
  const hostname = normalizeByaanTenantDomain(parsed.hostname);
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => isPrivateOrSpecialAddress(item.address))) {
    throw new Error('Byaan endpoint resolved to a private or special-use address');
  }
  const pinned = addresses[0];
  return new https.Agent({
    keepAlive: false,
    lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
  });
}

export function hashByaanPayload(rawBody: Buffer): string {
  return crypto.createHash('sha256').update(rawBody).digest('hex');
}

export function buildByaanCanonicalRequest(input: {
  timestamp: string;
  deliveryId: string;
  method: string;
  path: string;
  tenantDomain: string;
  rawBody: Buffer;
}): string {
  const pathOnly = input.path.split('?')[0] || '/';
  return [
    input.timestamp,
    input.deliveryId.toLowerCase(),
    input.method.toUpperCase(),
    pathOnly,
    normalizeByaanTenantDomain(input.tenantDomain),
    hashByaanPayload(input.rawBody),
  ].join('.');
}

export function signByaanRequest(canonicalRequest: string, secret: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(canonicalRequest).digest('hex')}`;
}

export function verifyByaanSignedRequest(input: {
  headers: Partial<ByaanSignedHeaders>;
  method: string;
  path: string;
  tenantDomain: string;
  rawBody: Buffer;
  secret: string;
  nowSeconds?: number;
}): ByaanSignatureVerification {
  const { timestamp, deliveryId, signature } = input.headers;
  if (!timestamp || !deliveryId || !signature || !input.secret) return { ok: false, code: 'missing_headers' };
  if (!DELIVERY_ID_PATTERN.test(deliveryId)) return { ok: false, code: 'invalid_delivery_id' };

  const parsedTimestamp = Number(timestamp);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isInteger(parsedTimestamp) || Math.abs(now - parsedTimestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, code: 'stale_request' };
  }

  const canonical = buildByaanCanonicalRequest({
    timestamp,
    deliveryId,
    method: input.method,
    path: input.path,
    tenantDomain: input.tenantDomain,
    rawBody: input.rawBody,
  });
  const expected = signByaanRequest(canonical, input.secret);
  const receivedBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (receivedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)) {
    return { ok: false, code: 'invalid_signature' };
  }

  return { ok: true, deliveryId: deliveryId.toLowerCase(), payloadHash: hashByaanPayload(input.rawBody) };
}
