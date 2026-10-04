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
    const minor = requireMinor(amount);
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      currencyDisplay: "code",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(minor / 100);
  } catch {
    return null;
  }
}
