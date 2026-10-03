import { describe, it, expect } from 'vitest';
import {
  fillOrderNotificationTemplate as fill,
  type OrderNotificationData,
} from "../shared/order-notification-template";
import {
  defaultTemplates,
} from "./notifications/order-notifications";
const data: OrderNotificationData = {
  customerName: "Local",
  storeName: "Store",
  orderNumber: "ORDER",
  total: 3453,
  currency: "SAR",
};
describe("order notification monetary units and literal substitution", () => {
  it.each([0, 1, 99, 100, 3453, 2147483647, Number.MAX_SAFE_INTEGER])(
    "renders exact cents for %s",
    total => {
      const digits = String(total).padStart(3, "0");
      expect(fill("{{total}} {{currency}}", { ...data, total })).toBe(
        digits.slice(0, -2) + "." + digits.slice(-2) + " SAR"
      );
    }
  );
  it("uses the saved order currency and converts historical default money labels at render time", () => {
    expect(fill("الإجمالي: {{total}} ريال", { ...data, currency: "USD" })).toBe(
      "الإجمالي: 34.53 USD"
    );
    expect(fill("{{total}} {{currency}}", { ...data, currency: "USD" })).toBe(
      "34.53 USD"
    );
    expect(fill("{{total}} ريال سعودي", data)).toBe("34.53 SAR");
    expect(fill("{{total}} USD.", data)).toBe("34.53 SAR.");
  });
  it("does not replace arbitrary surrounding currency prose or words beginning with a currency code", () => {
    expect(fill("10 ريال مقدمًا؛ {{total}} {{currency}}", data)).toBe(
      "10 ريال مقدمًا؛ 34.53 SAR"
    );
    expect(fill("{{total}} SARY", data)).toBe("34.53 SARY");
  });
  it("keeps every substituted value literal and prevents recursive template interpretation", () => {
    const dangerous = {
      ...data,
      customerName: "$& {{total}} {{storeName}}",
      storeName: "$` {{currency}}",
      orderNumber: "$' {{trackingNumber}}",
      trackingNumber: "{{customerName}}",
    };
    expect(
      fill(
        "{{customerName}}|{{storeName}}|{{orderNumber}}|{{trackingNumber}}|{{total}}",
        dangerous
      )
    ).toBe(
      "$& {{total}} {{storeName}}|$` {{currency}}|$' {{trackingNumber}}|{{customerName}}|34.53"
    );
  });
  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects an invalid monetary value %s before notification creation",
    total =>
      expect(() => fill("{{total}}", { ...data, total })).toThrow(
        "Invalid order amount"
      )
  );
  it("does not invent an amount for a cancellation template without an amount field", () =>
    expect(fill("{{orderNumber}} cancelled", { ...data, total: -1 })).toBe(
      "ORDER cancelled"
    ));
  it("rejects unsupported currency rather than silently using SAR", () =>
    expect(() =>
      fill("{{total}}", { ...data, currency: "EUR" } as any)
    ).toThrow("Unsupported order currency"));
  it("retains new lines, repeated variables and unknown custom placeholders", () =>
    expect(fill("{{customerName}}\n{{customerName}} {{custom}}", data)).toBe(
      "Local\nLocal {{custom}}"
    ));
  it("all monetary defaults include the currency variable", () => {
    for (const template of Object.values(defaultTemplates)) {
      if (template.includes("{{total}}"))
        expect(template).toContain("{{total}} {{currency}}");
    }
  });
});
