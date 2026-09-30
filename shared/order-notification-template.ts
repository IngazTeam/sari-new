import type { Currency } from "./currency";

export const orderNotificationVariables = [
  "customerName",
  "storeName",
  "orderNumber",
  "total",
  "currency",
  "trackingNumber",
] as const;
export interface OrderNotificationData {
  customerName: string;
  storeName: string;
  orderNumber: string;
  /** The order's stored total in minor units. */
  total: number;
  currency: Currency;
  trackingNumber?: string;
}
export function fillOrderNotificationTemplate(
  template: string,
  data: OrderNotificationData
): string {
  if (data.currency !== "SAR" && data.currency !== "USD")
    throw Error("Unsupported order currency");
  if (
    template.includes("{{total}}") &&
    (!Number.isSafeInteger(data.total) || data.total < 0)
  )
    throw Error("Invalid order amount");
  // Render old default-style money phrases using the saved order currency, without rewriting stored templates.
  const currencyWords =
    "(?:ريال(?: سعودي)?|دولار(?: أمريكي)?|SAR|USD|ر\\.س\\.?|\\$)";
  const normalized = template.replace(
    new RegExp(
      "\\{\\{total\\}\\}[ \\t]+" +
        currencyWords +
        "(?![A-Za-z\\u0621-\\u064a])",
      "gi"
    ),
    "{{total}} {{currency}}"
  );
  const digits =
    Number.isSafeInteger(data.total) && data.total >= 0
      ? String(data.total).padStart(3, "0")
      : "";
  const total = digits ? digits.slice(0, -2) + "." + digits.slice(-2) : "";
  const values: Record<(typeof orderNotificationVariables)[number], string> = {
    customerName: data.customerName,
    storeName: data.storeName,
    orderNumber: data.orderNumber,
    total,
    currency: data.currency,
    trackingNumber: data.trackingNumber || "غير متوفر",
  };
  // One pass with a function replacement: neither $& nor later placeholders in names become executable substitutions.
  return normalized.replace(
    /\{\{(customerName|storeName|orderNumber|total|currency|trackingNumber)\}\}/g,
    (_, key: (typeof orderNotificationVariables)[number]) => values[key]
  );
}
