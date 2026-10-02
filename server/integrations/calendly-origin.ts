export function calendlyWebhookOrigin(): string {
  const configured = process.env.CALENDLY_WEBHOOK_BASE_URL
    || process.env.FRONTEND_URL
    || process.env.VITE_APP_URL
    || (process.env.NODE_ENV === 'production' ? 'https://sary.live' : '');
  if (!configured) throw new Error('CALENDLY_WEBHOOK_BASE_URL_REQUIRED');
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('CALENDLY_WEBHOOK_BASE_URL_INVALID');
  }
  const localDevelopment = process.env.NODE_ENV !== 'production'
    && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if ((!localDevelopment && url.protocol !== 'https:') || !['http:','https:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) {
    throw new Error('CALENDLY_WEBHOOK_BASE_URL_INVALID');
  }
  return url.origin;
}
