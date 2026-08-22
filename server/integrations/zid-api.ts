const ZID_API_ORIGIN = 'https://api.zid.sa';
const ZID_API_PREFIX = '/v1/';
const ZID_API_BASE = `${ZID_API_ORIGIN}${ZID_API_PREFIX}`;
const ZID_REQUEST_TIMEOUT_MS = 15_000;
const MAX_ZID_RESPONSE_BYTES = 5 * 1024 * 1024;

export type ZidApiCredentials = {
  authorizationToken: string;
  managerToken: string;
};

export type ZidProductRequestContext = {
  storeId: string;
};

export class ZidApiError extends Error {
  constructor(public readonly code: 'credentials' | 'endpoint' | 'network' | 'status' | 'response') {
    super(code);
  }
}

function normalizedHeaderCredential(value: string): string {
  const normalized = value.trim().replace(/^Bearer\s+/i, '');
  if (!normalized || normalized.length > 16_384 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new ZidApiError('credentials');
  }
  return normalized;
}

export function normalizeZidStoreId(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).trim();
  return /^[1-9]\d{0,19}$/.test(normalized) ? normalized : null;
}

function trustedZidUrl(endpoint: string): string {
  if (!endpoint.startsWith('/') || /[\u0000-\u001f\u007f\\]/.test(endpoint)) {
    throw new ZidApiError('endpoint');
  }
  let url: URL;
  try {
    url = new URL(endpoint, ZID_API_BASE);
  } catch {
    throw new ZidApiError('endpoint');
  }
  if (url.origin !== ZID_API_ORIGIN || !url.pathname.startsWith(ZID_API_PREFIX)) {
    throw new ZidApiError('endpoint');
  }
  return url.toString();
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ZID_RESPONSE_BYTES) {
    throw new ZidApiError('response');
  }
  if (!response.body) throw new ZidApiError('response');

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_ZID_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new ZidApiError('response');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new ZidApiError('response');
  }
}

export async function requestZidApi(
  endpoint: string,
  credentials: ZidApiCredentials,
  options: {
    productContext?: ZidProductRequestContext;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<unknown> {
  const authorizationToken = normalizedHeaderCredential(credentials.authorizationToken);
  const managerToken = normalizedHeaderCredential(credentials.managerToken);
  const storeId = options.productContext
    ? normalizeZidStoreId(options.productContext.storeId)
    : null;
  if (options.productContext && !storeId) throw new ZidApiError('credentials');

  let response: Response;
  try {
    response = await (options.fetchImpl || fetch)(trustedZidUrl(endpoint), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${authorizationToken}`,
        'X-Manager-Token': managerToken,
        ...(storeId ? {
          // The current Zid products API documents these three headers.
          'Access-Token': managerToken,
          'Store-Id': storeId,
          'Role': 'Manager',
        } : {}),
        'Accept': 'application/json',
        'Accept-Language': 'ar',
      },
      redirect: 'error',
      signal: AbortSignal.timeout(ZID_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof ZidApiError) throw error;
    throw new ZidApiError('network');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new ZidApiError('status');
  }
  return readBoundedJson(response);
}
