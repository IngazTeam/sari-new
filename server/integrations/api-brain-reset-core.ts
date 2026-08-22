import type { ExternalProductSource } from './product-source-sync-core';

export const API_BRAIN_RESET_CONFIRMATION = 'RESET_API_MANAGED_KNOWLEDGE';

export type ApiBrainResetType = 'products' | 'faqs';

export interface ApiBrainResetRequest {
  types: ApiBrainResetType[];
  confirmation: typeof API_BRAIN_RESET_CONFIRMATION;
}

export class ApiBrainResetValidationError extends Error {
  constructor() {
    super('Invalid API brain reset request');
    this.name = 'ApiBrainResetValidationError';
  }
}

export function normalizeApiBrainResetRequest(input: unknown): ApiBrainResetRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ApiBrainResetValidationError();
  }

  const request = input as Record<string, unknown>;
  const keys = Object.keys(request).sort();
  if (keys.length !== 2 || keys[0] !== 'confirmation' || keys[1] !== 'types') {
    throw new ApiBrainResetValidationError();
  }
  if (request.confirmation !== API_BRAIN_RESET_CONFIRMATION || !Array.isArray(request.types)) {
    throw new ApiBrainResetValidationError();
  }
  if (request.types.length < 1 || request.types.length > 2) {
    throw new ApiBrainResetValidationError();
  }

  const allowedTypes = new Set<ApiBrainResetType>(['products', 'faqs']);
  const uniqueTypes = new Set<ApiBrainResetType>();
  for (const type of request.types) {
    if (typeof type !== 'string' || !allowedTypes.has(type as ApiBrainResetType)) {
      throw new ApiBrainResetValidationError();
    }
    uniqueTypes.add(type as ApiBrainResetType);
  }
  if (uniqueTypes.size !== request.types.length) throw new ApiBrainResetValidationError();

  return {
    types: (['products', 'faqs'] as const).filter(type => uniqueTypes.has(type)),
    confirmation: API_BRAIN_RESET_CONFIRMATION,
  };
}

export function apiProductSourceForMerchant(integrationSource: unknown): ExternalProductSource {
  return integrationSource === 'byaan' ? 'byaan' : 'api';
}
