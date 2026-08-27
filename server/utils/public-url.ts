const DEFAULT_PUBLIC_APP_URL = 'https://sary.live';

type PublicUrlEnvironment = NodeJS.ProcessEnv | Partial<Record<
  'PUBLIC_APP_URL' | 'APP_URL' | 'VITE_APP_URL' | 'FRONTEND_URL' | 'VITE_FRONTEND_FORGE_API_URL',
  string | undefined
>>;

/**
 * Returns the canonical public origin used in links sent to customers and payment providers.
 * Environment values are intentionally validated here so `undefined/pay/...`, legacy domains,
 * and accidental paths/query strings can never leak into persisted public URLs.
 */
export function getPublicAppUrl(env: PublicUrlEnvironment = process.env): string {
  const candidate = [
    env.PUBLIC_APP_URL,
    env.APP_URL,
    env.VITE_APP_URL,
    env.FRONTEND_URL,
    env.VITE_FRONTEND_FORGE_API_URL,
  ].find(value => typeof value === 'string' && value.trim().length > 0);

  if (!candidate) return DEFAULT_PUBLIC_APP_URL;

  try {
    const parsed = new URL(candidate.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return DEFAULT_PUBLIC_APP_URL;

    parsed.pathname = '';
    parsed.search = '';
    parsed.hash = '';
    return parsed.origin;
  } catch {
    return DEFAULT_PUBLIC_APP_URL;
  }
}

export function buildPublicUrl(path: string, env: PublicUrlEnvironment = process.env): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return new URL(normalizedPath, `${getPublicAppUrl(env)}/`).toString();
}

export const publicPaymentUrls = {
  callback: (env?: PublicUrlEnvironment) => buildPublicUrl('/payment/callback', env),
  return: (env?: PublicUrlEnvironment) => buildPublicUrl('/payment/return', env),
  webhook: (env?: PublicUrlEnvironment) => buildPublicUrl('/api/webhooks/tap', env),
  link: (linkId: string, env?: PublicUrlEnvironment) =>
    buildPublicUrl(`/pay/${encodeURIComponent(linkId)}`, env),
  linkStatus: (linkId: string, env?: PublicUrlEnvironment) =>
    buildPublicUrl(`/pay/${encodeURIComponent(linkId)}/status`, env),
};
