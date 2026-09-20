import { formatCurrency, type Currency } from './currency';

export const MAX_MONEY_MINOR = 2_147_483_647;
export class ProductMoneyError extends Error {
  constructor() { super('Product price requires verification'); this.name = 'ProductMoneyError'; }
}

/** Decimal input at human/provider boundaries. Never silently round a price. */
export function majorToMinor(value: number | string): number {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new ProductMoneyError();
  const [whole, rawFraction = ''] = text.split('.');
  const fraction = rawFraction.replace(/0+$/, '');
  if (fraction.length > 2) throw new ProductMoneyError();
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return requireMinor(result);
}

export function requireMinor(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > MAX_MONEY_MINOR) {
    throw new ProductMoneyError();
  }
  return value;
}

type PriceFields = { price?: number | null; compareAtPrice?: number | null; costPrice?: number | null };
export function normalizeProductMoneyWrite<T extends PriceFields>(data: T, inputUnit: 'major' | 'minor' = 'minor') {
  const result = { ...data };
  for (const key of ['price', 'compareAtPrice', 'costPrice'] as const) {
    if (data[key] != null) result[key] = inputUnit === 'major' ? majorToMinor(data[key]!) : requireMinor(data[key]);
  }
  return { ...result, ...(data.price !== undefined ? { priceUnit: 'minor' as const } : {}) };
}

export type CatalogPrice = { price: unknown; priceUnit?: unknown; currency?: unknown };
export function verifiedProductMoney(product: CatalogPrice): { minor: number; currency: Currency } {
  if (product.priceUnit !== 'minor' || !['SAR', 'USD'].includes(String(product.currency))) throw new ProductMoneyError();
  return { minor: requireMinor(product.price), currency: product.currency as Currency };
}

export function formatProductPrice(product: CatalogPrice, locale = 'ar-SA', unavailable = 'السعر يحتاج مراجعة'): string {
  try { const price = verifiedProductMoney(product); return formatCurrency(price.minor / 100, price.currency, locale); }
  catch { return unavailable; }
}

export function formatMinorMoney(amount: number, currency: Currency = 'SAR', locale = 'ar-SA'): string {
  return formatCurrency(requireMinor(amount) / 100, currency, locale);
}
