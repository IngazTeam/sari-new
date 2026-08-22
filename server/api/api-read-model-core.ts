export interface ApiListPagination {
  limit: number;
  offset: number;
}

export interface ApiListPaginationOptions {
  defaultLimit?: number;
  maxLimit?: number;
}

export type PlatformConversationStatus = 'all' | 'active' | 'closed' | 'archived';

export interface PlatformConversationQuery extends ApiListPagination {
  page: number;
  status: PlatformConversationStatus;
}

export type PlatformEnrollmentPeriod = 'week' | 'month' | 'year';

export interface PlatformEnrollmentQuery {
  limit: number;
  period: PlatformEnrollmentPeriod;
}

export class ApiReadModelValidationError extends Error {
  constructor() {
    super('Invalid API read query');
    this.name = 'ApiReadModelValidationError';
  }
}

function decimalQueryInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/.test(value)) {
    throw new ApiReadModelValidationError();
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new ApiReadModelValidationError();
  }
  return parsed;
}

export function normalizeApiListPagination(
  query: unknown,
  options: ApiListPaginationOptions = {},
): ApiListPagination {
  const defaultLimit = options.defaultLimit ?? 50;
  const maxLimit = options.maxLimit ?? 200;
  if (
    !Number.isSafeInteger(defaultLimit) || !Number.isSafeInteger(maxLimit)
    || defaultLimit < 1 || maxLimit < 1 || defaultLimit > maxLimit || maxLimit > 200
  ) {
    throw new Error('Invalid API pagination policy');
  }
  if (query === undefined || query === null) return { limit: defaultLimit, offset: 0 };
  if (typeof query !== 'object' || Array.isArray(query)) throw new ApiReadModelValidationError();

  const values = query as Record<string, unknown>;
  const keys = Object.keys(values);
  if (keys.some(key => key !== 'limit' && key !== 'offset')) {
    throw new ApiReadModelValidationError();
  }

  return {
    limit: decimalQueryInteger(values.limit, defaultLimit, 1, maxLimit),
    offset: decimalQueryInteger(values.offset, 0, 0, 10_000),
  };
}

function strictQueryRecord(query: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (query === undefined || query === null) return {};
  if (typeof query !== 'object' || Array.isArray(query)) throw new ApiReadModelValidationError();
  const values = query as Record<string, unknown>;
  if (Object.keys(values).some(key => !allowed.includes(key))) throw new ApiReadModelValidationError();
  return values;
}

export function normalizePlatformConversationQuery(query: unknown): PlatformConversationQuery {
  const values = strictQueryRecord(query, ['limit', 'page', 'status']);
  const limit = decimalQueryInteger(values.limit, 15, 1, 100);
  const page = decimalQueryInteger(values.page, 1, 1, 10_001);
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset) || offset > 10_000) throw new ApiReadModelValidationError();
  const status = values.status ?? 'all';
  if (
    typeof status !== 'string'
    || !(['all', 'active', 'closed', 'archived'] as const).includes(status as PlatformConversationStatus)
  ) {
    throw new ApiReadModelValidationError();
  }
  return { limit, offset, page, status: status as PlatformConversationStatus };
}

export function normalizePlatformEnrollmentQuery(query: unknown): PlatformEnrollmentQuery {
  const values = strictQueryRecord(query, ['limit', 'period']);
  const limit = decimalQueryInteger(values.limit, 50, 1, 200);
  const period = values.period ?? 'month';
  if (
    typeof period !== 'string'
    || !(['week', 'month', 'year'] as const).includes(period as PlatformEnrollmentPeriod)
  ) {
    throw new ApiReadModelValidationError();
  }
  return { limit, period: period as PlatformEnrollmentPeriod };
}
