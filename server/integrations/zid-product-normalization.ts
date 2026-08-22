export type NormalizedZidProduct = {
  externalId: string;
  name: string;
  nameAr: string | null;
  description: string | null;
  descriptionAr: string | null;
  price: number;
  compareAtPrice: number | null;
  costPrice: number | null;
  currency: 'SAR' | 'USD';
  stock: number;
  trackInventory: number;
  imageUrl: string | null;
  images: string;
  productUrl: string | null;
  category: string | null;
  sku: string | null;
  barcode: string | null;
  isActive: number;
  status: 'active' | 'draft';
  hasVariants: number;
  lastSyncedAt: string;
};

export class ZidProductSyncError extends Error {
  constructor(public readonly code: 'busy' | 'invalid_store' | 'invalid_product' | 'invalid_page' | 'limit') {
    super(code);
  }
}

export function normalizeZidProductExternalId(value: unknown): string {
  const candidate = typeof value === 'number' && Number.isSafeInteger(value)
    ? String(value)
    : typeof value === 'string' ? value.trim() : '';
  // `products.sallaProductId` is varchar(100); reserve four characters for
  // the `zid:` source namespace used by projections.
  if (!candidate || candidate.length > 96 || /[\u0000-\u001f\u007f]/.test(candidate)) {
    throw new ZidProductSyncError('invalid_product');
  }
  return candidate;
}

export function zidProductProjectionId(externalId: string): string {
  return `zid:${normalizeZidProductExternalId(externalId)}`;
}

export function formatZidProductSyncTime(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new ZidProductSyncError('invalid_product');
  return value.toISOString().slice(0, 23).replace('T', ' ');
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

export function safeZidText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function localizedText(value: unknown, maxLength: number, preferred: 'ar' | 'en' = 'ar'): string | null {
  if (typeof value === 'string') return safeZidText(value, maxLength);
  const localized = record(value);
  const fallback = preferred === 'ar' ? 'en' : 'ar';
  return safeZidText(localized[preferred], maxLength) || safeZidText(localized[fallback], maxLength);
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeInt(value: unknown): number | null {
  const parsed = finiteNumber(value);
  if (parsed === null || parsed < 0) return null;
  return Math.min(2_147_483_647, Math.floor(parsed));
}

function cents(value: unknown): number | null {
  const parsed = finiteNumber(value);
  if (parsed === null || parsed < 0 || parsed > 21_474_836.47) return null;
  return Math.round(parsed * 100);
}

export function safeZidHttpUrl(value: unknown): string | null {
  const candidate = safeZidText(value, 500);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function productStock(product: Record<string, any>): { stock: number; trackInventory: number } {
  if (product.is_infinite === true) return { stock: 0, trackInventory: 0 };
  const directQuantity = nonNegativeInt(product.quantity);
  if (directQuantity !== null) return { stock: directQuantity, trackInventory: 1 };
  if (!Array.isArray(product.stocks)) return { stock: 0, trackInventory: 1 };
  let stock = 0;
  for (const rawStock of product.stocks.slice(0, 500)) {
    const item = record(rawStock);
    if (item.is_infinite === true) return { stock: 0, trackInventory: 0 };
    stock = Math.min(2_147_483_647, stock + (nonNegativeInt(item.available_quantity) || 0));
  }
  return { stock, trackInventory: 1 };
}

export function normalizeZidProduct(value: unknown, now = new Date()): NormalizedZidProduct {
  const product = record(value);
  const rawExternalId = typeof product.id === 'number' ? String(product.id) : product.id;
  const externalId = normalizeZidProductExternalId(rawExternalId);
  const name = localizedText(product.name ?? product.title, 255);
  const basePrice = cents(product.price);
  if (
    !name
    || basePrice === null
  ) {
    throw new ZidProductSyncError('invalid_product');
  }

  const salePrice = product.sale_price === null || product.sale_price === undefined
    ? null
    : cents(product.sale_price);
  if (product.sale_price !== null && product.sale_price !== undefined && salePrice === null) {
    throw new ZidProductSyncError('invalid_product');
  }
  const rawImages = Array.isArray(product.images) ? product.images.slice(0, 50) : [];
  const imageUrls = rawImages
    .map(image => safeZidHttpUrl(record(image).url ?? record(image).image_url))
    .filter((url): url is string => Boolean(url));
  const firstCategory = Array.isArray(product.categories)
    ? record(product.categories[0])
    : record(product.category);
  const published = product.is_published !== false
    && product.is_draft !== true
    && product.is_active !== false;
  const stock = productStock(product);
  const descriptionSource = product.short_description ?? product.description;
  const costPrice = product.cost === null || product.cost === undefined ? null : cents(product.cost);
  if (product.cost !== null && product.cost !== undefined && costPrice === null) {
    throw new ZidProductSyncError('invalid_product');
  }
  const rawCurrency = product.currency ?? 'SAR';
  if (rawCurrency !== 'SAR' && rawCurrency !== 'USD') {
    throw new ZidProductSyncError('invalid_product');
  }

  return {
    externalId,
    name,
    nameAr: localizedText(product.name ?? product.title, 255, 'ar'),
    description: localizedText(descriptionSource, 50_000, 'en')
      || localizedText(descriptionSource, 50_000, 'ar'),
    descriptionAr: localizedText(descriptionSource, 50_000, 'ar'),
    price: salePrice ?? basePrice,
    compareAtPrice: salePrice === null ? null : basePrice,
    costPrice,
    currency: rawCurrency,
    stock: stock.stock,
    trackInventory: stock.trackInventory,
    imageUrl: imageUrls[0] || safeZidHttpUrl(record(product.image).url),
    images: JSON.stringify(imageUrls),
    productUrl: safeZidHttpUrl(product.html_url ?? product.url),
    category: localizedText(firstCategory.name, 100),
    sku: safeZidText(product.sku, 100),
    barcode: safeZidText(product.barcode, 100),
    isActive: published ? 1 : 0,
    status: published ? 'active' : 'draft',
    hasVariants: product.has_options === true || product.has_fields === true ? 1 : 0,
    lastSyncedAt: formatZidProductSyncTime(now),
  };
}
