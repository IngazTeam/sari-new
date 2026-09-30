import { setupWebUrl } from '@shared/setup-catalog';

const text = (value: unknown) => typeof value === 'string' ? value : '';
/** Website prices are suggestions. Legacy extractors used zero for an unknown price. */
export function setupWebsiteProduct(value: unknown, id: string) {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const originalPrice = typeof row.price === 'string' || typeof row.price === 'number' ? String(row.price).trim() : '';
  // No clamping, rounding or default currency. A zero from this source is ambiguous
  // until the merchant explicitly enters 0 in the catalog editor.
  const price = originalPrice && Number(originalPrice) !== 0 ? originalPrice : '';
  const url = (value: unknown) => { const parsed = setupWebUrl.safeParse(value); return parsed.success ? parsed.data : ''; };
  return {
    id, name: text(row.name), description: text(row.description), price,
    currency: text(row.currency), imageUrl: url(row.imageUrl), productUrl: url(row.productUrl),
    category: text(row.category), websiteOriginalPrice: originalPrice,
  };
}
