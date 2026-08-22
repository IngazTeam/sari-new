export const API_KEY_SCOPES = [
  'merchant:read',
  'brain:read',
  'brain:test',
  'brain:write',
  'products:read',
  'products:write',
  'faqs:read',
  'faqs:write',
  'conversations:read',
  'analytics:read',
  'trainees:write',
  'settings:write',
  'integrations:read',
  'integrations:write',
  'conversions:read',
  'conversions:write',
  'instances:read',
  'instances:write',
] as const;

export type ApiKeyScope = typeof API_KEY_SCOPES[number];

export const API_KEY_SCOPE_PRESETS = {
  read: [
    'merchant:read',
    'brain:read',
    'products:read',
    'faqs:read',
    'conversations:read',
    'analytics:read',
    'integrations:read',
    'conversions:read',
    'instances:read',
  ],
  sync: [
    'merchant:read',
    'brain:read',
    'brain:test',
    'products:read',
    'products:write',
    'faqs:read',
    'faqs:write',
    'conversations:read',
    'analytics:read',
    'trainees:write',
    'settings:write',
    'integrations:read',
    'conversions:read',
    'conversions:write',
    'instances:read',
  ],
  full: [...API_KEY_SCOPES],
} as const satisfies Record<string, readonly ApiKeyScope[]>;

const SCOPE_SET = new Set<string>(API_KEY_SCOPES);

interface StoredApiKeyPermissions {
  version: 1;
  scopes: ApiKeyScope[];
}

export function normalizeApiKeyScopes(input: unknown = API_KEY_SCOPE_PRESETS.full): ApiKeyScope[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > API_KEY_SCOPES.length) {
    throw new Error('Invalid API key permissions');
  }
  const requested = new Set<string>();
  for (const scope of input) {
    if (typeof scope !== 'string' || !SCOPE_SET.has(scope) || requested.has(scope)) {
      throw new Error('Invalid API key permissions');
    }
    requested.add(scope);
  }
  return API_KEY_SCOPES.filter((scope) => requested.has(scope));
}

export function encodeApiKeyPermissions(input: unknown = API_KEY_SCOPE_PRESETS.full): string {
  const permissions: StoredApiKeyPermissions = {
    version: 1,
    scopes: normalizeApiKeyScopes(input),
  };
  return JSON.stringify(permissions);
}

export function parseApiKeyPermissions(input: unknown): ApiKeyScope[] | null {
  try {
    const parsed = typeof input === 'string' ? JSON.parse(input) : input;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (record.version !== 1 || Object.keys(record).some((key) => key !== 'version' && key !== 'scopes')) return null;
    return normalizeApiKeyScopes(record.scopes);
  } catch {
    return null;
  }
}

const EXACT_ROUTE_SCOPES: Readonly<Record<string, ApiKeyScope>> = {
  'GET /me': 'merchant:read',
  'GET /brain/sources': 'brain:read',
  'POST /brain/test': 'brain:test',
  'POST /brain/reset': 'brain:write',
  'GET /products': 'products:read',
  'POST /sync/products': 'products:write',
  'GET /faqs': 'faqs:read',
  'POST /sync/faqs': 'faqs:write',
  'GET /conversations': 'conversations:read',
  'GET /stats': 'analytics:read',
  'POST /sync/trainees': 'trainees:write',
  'POST /sync/settings': 'settings:write',
  'POST /connect/byaan': 'integrations:write',
  'DELETE /connect/byaan': 'integrations:write',
  'GET /conversions': 'conversions:read',
  'POST /conversions': 'conversions:write',
  'GET /integration': 'integrations:read',
  'GET /instances': 'instances:read',
};

export function requiredApiKeyScope(method: string, path: string): ApiKeyScope | null {
  const normalizedMethod = method.toUpperCase();
  const exact = EXACT_ROUTE_SCOPES[`${normalizedMethod} ${path}`];
  if (exact) return exact;
  if (normalizedMethod === 'PUT' && /^\/instances\/[1-9]\d*$/.test(path)) return 'instances:write';
  return null;
}

export function hasApiKeyScope(scopes: readonly ApiKeyScope[], required: ApiKeyScope): boolean {
  return scopes.includes(required);
}
