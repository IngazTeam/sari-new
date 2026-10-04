import { requireMinor } from "./product-money";

// The current payment producer stores SAR in hundredths. USD legacy amounts
// share that scale; other currencies require explicit source-unit evidence.
export function formatStoredPaymentMoney(
  amount: unknown,
  currency: unknown,
  locale: string
): string | null {
  try {
    if (currency !== "SAR" && currency !== "USD") return null;
    return formatPaymentTotalMoney(requireMinor(amount), currency, locale);
  } catch {
    return null;
  }
}
export function formatPaymentTotalMoney(
  amount: unknown,
  currency: unknown,
  locale: string
): string | null {
  try {
    if (
      (currency !== "SAR" && currency !== "USD") ||
      typeof amount !== "number" ||
      !Number.isSafeInteger(amount) ||
      amount < 0
    )
      return null;
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount / 100);
  } catch {
    return null;
  }
}
