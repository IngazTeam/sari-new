const CALENDLY_API_ORIGIN = 'https://api.calendly.com';
const CALENDLY_TIMEOUT_MS = 12_000;
const CALENDLY_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export class CalendlyApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = 'CalendlyApiError';
  }
}

function normalizeCalendlyApiUrl(endpointOrUri: string): URL {
  let url: URL;
  try {
    url = endpointOrUri.startsWith('/')
      ? new URL(endpointOrUri, CALENDLY_API_ORIGIN)
      : new URL(endpointOrUri);
  } catch {
    throw new CalendlyApiError(0, 'invalid_provider_uri');
  }
  if (
    url.origin !== CALENDLY_API_ORIGIN
    || url.username
    || url.password
    || url.hash
    || url.pathname.includes('..')
  ) throw new CalendlyApiError(0, 'invalid_provider_uri');
  return url;
}

export async function calendlyApiRequest<T>(
  endpointOrUri: string,
  accessToken: string,
  options: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown } = {},
): Promise<T> {
  if (!accessToken || accessToken.length < 20 || accessToken.length > 4096 || /[\u0000-\u001f\u007f]/.test(accessToken)) {
    throw new CalendlyApiError(401, 'invalid_access_token');
  }
  const url = normalizeCalendlyApiUrl(endpointOrUri);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CALENDLY_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
      redirect: 'error',
    });
    if (response.status === 204) return undefined as T;
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > CALENDLY_MAX_RESPONSE_BYTES) {
      throw new CalendlyApiError(502, 'provider_response_too_large');
    }
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > CALENDLY_MAX_RESPONSE_BYTES) {
      throw new CalendlyApiError(502, 'provider_response_too_large');
    }
    if (!response.ok) throw new CalendlyApiError(response.status, `provider_http_${response.status}`);
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new CalendlyApiError(502, 'invalid_provider_response');
    }
  } catch (error) {
    if (error instanceof CalendlyApiError) throw error;
    if ((error as Error)?.name === 'AbortError') throw new CalendlyApiError(504, 'provider_timeout');
    throw new CalendlyApiError(502, 'provider_unavailable');
  } finally {
    clearTimeout(timeout);
  }
}

export type CalendlyUser = {
  uri: string;
  name: string;
  current_organization: string;
};

export type CalendlyScheduledEvent = {
  uri: string;
  name: string;
  start_time: string;
  end_time: string;
  status: 'active' | 'canceled';
  updated_at?: string;
  location?: { location?: string } | null;
};

export type CalendlyInvitee = {
  uri: string;
  name: string;
  email?: string | null;
  status: 'active' | 'canceled';
  updated_at?: string;
  text_reminder_number?: string | null;
  cancellation?: { canceled_at?: string | null } | null;
};

export async function getCalendlyCurrentUser(accessToken: string): Promise<CalendlyUser> {
  const result = await calendlyApiRequest<{ resource?: CalendlyUser }>('/users/me', accessToken);
  const user = result?.resource;
  if (!user || typeof user.uri !== 'string' || typeof user.current_organization !== 'string') {
    throw new CalendlyApiError(502, 'invalid_current_user');
  }
  return user;
}

export async function createCalendlyWebhookSubscription(input: {
  accessToken: string;
  callbackUrl: string;
  signingKey: string;
  organizationUri: string;
  userUri: string;
}): Promise<string> {
  const result = await calendlyApiRequest<{ resource?: { uri?: string } }>('/webhook_subscriptions', input.accessToken, {
    method: 'POST',
    body: {
      url: input.callbackUrl,
      events: ['invitee.created', 'invitee.canceled'],
      organization: input.organizationUri,
      user: input.userUri,
      scope: 'user',
      signing_key: input.signingKey,
    },
  });
  const uri = result?.resource?.uri;
  if (typeof uri !== 'string' || !uri.startsWith(`${CALENDLY_API_ORIGIN}/webhook_subscriptions/`)) {
    throw new CalendlyApiError(502, 'invalid_webhook_subscription');
  }
  return uri;
}

export async function deleteCalendlyWebhookSubscription(accessToken: string, subscriptionUri: string): Promise<void> {
  await calendlyApiRequest<void>(subscriptionUri, accessToken, { method: 'DELETE' });
}

export async function getCalendlyScheduledEvent(accessToken: string, eventUri: string): Promise<CalendlyScheduledEvent> {
  const result = await calendlyApiRequest<{ resource?: CalendlyScheduledEvent }>(eventUri, accessToken);
  if (!result?.resource?.uri) throw new CalendlyApiError(502, 'invalid_scheduled_event');
  return result.resource;
}

export async function getCalendlyInvitee(accessToken: string, inviteeUri: string): Promise<CalendlyInvitee> {
  const result = await calendlyApiRequest<{ resource?: CalendlyInvitee }>(inviteeUri, accessToken);
  if (!result?.resource?.uri) throw new CalendlyApiError(502, 'invalid_invitee');
  return result.resource;
}

export async function listCalendlyCollection<T>(
  accessToken: string,
  initialPath: string,
  maxItems = 1_000,
): Promise<T[]> {
  const items: T[] = [];
  let next: string | null = initialPath;
  const seen = new Set<string>();
  while (next && items.length < maxItems) {
    const normalized = normalizeCalendlyApiUrl(next).toString();
    if (seen.has(normalized) || seen.size >= 20) throw new CalendlyApiError(502, 'invalid_pagination');
    seen.add(normalized);
    const page: { collection?: T[]; pagination?: { next_page?: string | null } } = await calendlyApiRequest(normalized, accessToken);
    if (!Array.isArray(page.collection)) throw new CalendlyApiError(502, 'invalid_collection');
    items.push(...page.collection.slice(0, Math.max(0, maxItems - items.length)));
    next = typeof page.pagination?.next_page === 'string' ? page.pagination.next_page : null;
  }
  return items;
}
