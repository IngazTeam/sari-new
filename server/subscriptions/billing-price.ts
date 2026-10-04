import { planPriceMinor } from '../../shared/plan-catalog-workspace';

/** Stored billing prices are exact decimal strings, never permissively parsed. */
export function billingPriceMinor(value: unknown, allowZero = false): number {
  const minor = planPriceMinor(value);
  if (minor === null || minor > 100_000_000 || (!allowZero && minor === 0))
    throw new Error('INVALID_BILLING_PRICE');
  return minor;
}

export function billingCurrency(value: unknown): 'SAR' | 'USD' {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (normalized !== 'SAR' && normalized !== 'USD') throw new Error('INVALID_BILLING_CURRENCY');
  return normalized;
}

export function assertProrationCharge(value: number): number {
  const minor = Math.round(value * 100);
  if (!Number.isFinite(value) || value < 0 || minor > 100_000_000 ||
      !Number.isSafeInteger(minor) || Math.abs(value * 100 - minor) > 0.000001)
    throw new Error('INVALID_PRORATION_CHARGE');
  return minor / 100;
}
