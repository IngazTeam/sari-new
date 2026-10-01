import { parseMerchantDate } from './merchant-date';

export function conversationMediaUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value || value.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
  try {
    // Existing local uploads are allowed, but arbitrary API/action URLs and protocol-relative URLs are not.
    if (value.startsWith('/uploads/')) {
      const local = new URL(value, 'https://local.invalid');
      if (local.pathname.startsWith('/uploads/') && !/%2e|%2f|%5c/i.test(value)) return value;
      return null;
    }
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    if (!host.includes('.') || host === 'localhost' || /\.(localhost|local|internal|invalid)$/.test(host) || /^[\d.]+$/.test(host) || host.includes(':')) return null;
    return url.href;
  } catch { return null; }
}

export function conversationTimestamp(value: string | Date | null | undefined, language: string, timezone: string) {
  if (!value) return null;
  const date = parseMerchantDate(value);
  if (!Number.isFinite(date.getTime())) return null;
  let zone = timezone, fallback = false;
  try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(date); }
  catch { zone = 'UTC'; fallback = true; }
  return { iso: date.toISOString(), fallback, label: new Intl.DateTimeFormat(language.startsWith('ar') ? 'ar-SA-u-ca-gregory' : 'en-GB', {
    timeZone: zone, year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  }).format(date) };
}
