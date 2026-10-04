import {
  currencyWorkspace,
  currencySaveResult,
  type CurrencyWorkspace,
} from "@shared/currency-workspace";
export function scopedCurrency(
  value: unknown,
  actorId: number,
  merchantId: number
): CurrencyWorkspace | null {
  const parsed = currencyWorkspace.safeParse(value);
  return parsed.success &&
    parsed.data.actorId === actorId &&
    parsed.data.merchantId === merchantId
    ? parsed.data
    : null;
}
export function verifiedCurrencySave(
  value: unknown,
  actorId: number,
  merchantId: number,
  desired: string
) {
  const parsed = currencySaveResult.safeParse(value);
  return parsed.success &&
    scopedCurrency(parsed.data.workspace, actorId, merchantId) &&
    parsed.data.workspace.currency === desired
    ? parsed.data
    : null;
}
