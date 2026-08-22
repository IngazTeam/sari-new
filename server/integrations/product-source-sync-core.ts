export type ExternalProductSource = 'api' | 'byaan';
export type ExternalProductSyncMode = 'append' | 'replace';

export class ProductSyncValidationError extends Error {
  constructor() {
    super('Invalid external product sync entry');
    this.name = 'ProductSyncValidationError';
  }
}

export interface NormalizedExternalProduct {
  externalId: string;
  name: string;
  nameAr: string | null;
  description: string | null;
  descriptionAr: string | null;
  price: number;
  currency: 'SAR' | 'USD';
  category: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  isActive: 0 | 1;
  stock: number | null;
  trackInventory: 0 | 1;
  productType: 'physical' | 'digital' | 'service';
  status: 'active' | 'draft';
  courseStartDate: string | null;
  courseEndDate: string | null;
  maxStudents: number | null;
  enrolledCount: number;
  registrationOpen: 0 | 1;
}

function stripMarkup(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new ProductSyncValidationError();
  const normalized = stripMarkup(value);
  if (!normalized || normalized.length > maxLength) throw new ProductSyncValidationError();
  return normalized;
}

function optionalHttpUrl(value: unknown): string | null {
  const candidate = optionalText(value, 500);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new ProductSyncValidationError();
    }
    const normalized = parsed.toString();
    if (normalized.length > 500) throw new ProductSyncValidationError();
    return normalized;
  } catch (error) {
    if (error instanceof ProductSyncValidationError) throw error;
    throw new ProductSyncValidationError();
  }
}

function boundedInteger(value: unknown, fallback: number | null): number | null {
  if (value === undefined || value === null || value === '') return fallback;
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) {
    throw new ProductSyncValidationError();
  }
  const numberValue = Number(value);
  if (!Number.isSafeInteger(numberValue) || numberValue < 0 || numberValue > 2_147_483_647) {
    throw new ProductSyncValidationError();
  }
  return numberValue;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') throw new ProductSyncValidationError();
  return value;
}

function mysqlTimestamp(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 64) throw new ProductSyncValidationError();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const isoWithTimezone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  if (!dateOnly && !isoWithTimezone) throw new ProductSyncValidationError();
  const timestamp = Date.parse(dateOnly ? `${value}T00:00:00Z` : value);
  if (!Number.isFinite(timestamp)) throw new ProductSyncValidationError();
  const iso = new Date(timestamp).toISOString();
  if (dateOnly && iso.slice(0, 10) !== value) throw new ProductSyncValidationError();
  return iso.slice(0, 19).replace('T', ' ');
}

export function normalizeExternalProductBatch(
  products: unknown,
  source: ExternalProductSource,
  now = new Date(),
): Map<string, NormalizedExternalProduct> {
  if (!Array.isArray(products) || products.length > 500 || !Number.isFinite(now.getTime())) {
    throw new ProductSyncValidationError();
  }

  const prefix = `${source}:`;
  const normalized = new Map<string, NormalizedExternalProduct>();
  for (const raw of products) {
    if (!raw || typeof raw !== 'object') throw new ProductSyncValidationError();
    const product = raw as Record<string, unknown>;
    if (
      (typeof product.id !== 'string' && typeof product.id !== 'number')
      || (typeof product.id === 'number' && !Number.isFinite(product.id))
      || typeof product.name !== 'string'
    ) {
      throw new ProductSyncValidationError();
    }

    const rawId = String(product.id).trim();
    const name = stripMarkup(product.name);
    if (
      !rawId || rawId.length > 100 - prefix.length
      || /[\u0000-\u001f\u007f]/.test(rawId)
      || !name || name.length > 255
    ) {
      throw new ProductSyncValidationError();
    }

    const price = boundedInteger(product.price, null);
    if (price === null) throw new ProductSyncValidationError();
    const maxStudents = boundedInteger(product.maxStudents, null);
    const enrolledCount = boundedInteger(product.enrolledCount ?? product.enrollmentCount, 0) as number;
    const explicitStock = boundedInteger(product.stock, null);

    const courseStartDate = mysqlTimestamp(product.startDate ?? product.courseStartDate);
    const courseEndDate = mysqlTimestamp(product.endDate ?? product.courseEndDate);
    if (courseStartDate && courseEndDate && courseStartDate > courseEndDate) {
      throw new ProductSyncValidationError();
    }

    const requestedActive = optionalBoolean(product.inStock) ?? optionalBoolean(product.isActive) ?? true;
    const requestedRegistration = optionalBoolean(product.registrationOpen) ?? true;
    const endTimestamp = courseEndDate ? Date.parse(`${courseEndDate.replace(' ', 'T')}Z`) : null;
    const isExpired = endTimestamp !== null && endTimestamp < now.getTime();
    const isFull = maxStudents !== null && enrolledCount >= maxStudents;
    const isActive = requestedActive && !isExpired;
    const stock = maxStudents !== null ? Math.max(0, maxStudents - enrolledCount) : explicitStock;
    const trackInventory = stock === null ? 0 : 1;
    const registrationOpen = requestedRegistration && isActive && !isFull;

    const rawCurrency = product.currency ?? 'SAR';
    if (rawCurrency !== 'SAR' && rawCurrency !== 'USD') throw new ProductSyncValidationError();
    const rawProductType = product.productType ?? (source === 'byaan' ? 'service' : 'physical');
    if (!['physical', 'digital', 'service'].includes(String(rawProductType))) {
      throw new ProductSyncValidationError();
    }

    const externalId = `${prefix}${rawId}`;
    normalized.set(externalId, {
      externalId,
      name,
      nameAr: optionalText(product.nameAr, 255),
      description: optionalText(product.description, 2_000),
      descriptionAr: optionalText(product.descriptionAr, 2_000),
      price,
      currency: rawCurrency,
      category: optionalText(product.category, 100),
      imageUrl: optionalHttpUrl(product.imageUrl),
      productUrl: optionalHttpUrl(product.productUrl),
      isActive: isActive ? 1 : 0,
      stock,
      trackInventory,
      productType: rawProductType as 'physical' | 'digital' | 'service',
      status: isActive ? 'active' : 'draft',
      courseStartDate,
      courseEndDate,
      maxStudents,
      enrolledCount,
      registrationOpen: registrationOpen ? 1 : 0,
    });
  }

  return normalized;
}
