const TAP_CHARGES_URL = 'https://api.tap.company/v2/charges';
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 256 * 1024;

export type TapClientFailure = 'invalid_credentials' | 'network' | 'timeout' | 'response_too_large' | 'invalid_json';

export class TapClientError extends Error {
  constructor(public readonly failure: TapClientFailure) {
    super(`Tap request failed: ${failure}`);
    this.name = 'TapClientError';
  }
}

async function readBoundedResponse(response: Response, maxBytes: number): Promise<string> {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new TapClientError('response_too_large');
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new TapClientError('response_too_large');
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

export async function postTapCharge(
  secretKey: string,
  payload: unknown,
  options: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    maxResponseBytes?: number;
  } = {},
): Promise<{ ok: boolean; status: number; body: unknown }> {
  if (!secretKey.trim()) throw new TapClientError('invalid_credentials');
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(TAP_CHARGES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await readBoundedResponse(response, maxResponseBytes);
    let body: unknown = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new TapClientError('invalid_json');
      }
    }
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    if (error instanceof TapClientError) throw error;
    if (controller.signal.aborted) throw new TapClientError('timeout');
    throw new TapClientError('network');
  } finally {
    clearTimeout(timeout);
  }
}
