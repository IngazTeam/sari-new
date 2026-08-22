export interface ApiListPagination {
  limit: number;
  offset: number;
}

export interface ApiListPaginationOptions {
  defaultLimit?: number;
  maxLimit?: number;
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
