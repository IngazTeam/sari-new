import { expect, it } from "vitest";
import { getPaymentLinkAvailability } from "./payment/payment-link-policy";
const now = new Date("2026-10-04T12:00:00Z");
const active = {
  isActive: 1,
  status: "active",
  usageCount: 0,
  maxUsageCount: null,
  expiresAt: null,
};
it.each([
  { isActive: 2 },
  { isActive: -1 },
  { isActive: "1" },
  { isActive: null },
  { isActive: undefined },
  { status: "unknown" },
  { status: "ACTIVE" },
  { status: undefined },
  { usageCount: -1 },
  { usageCount: 0.5 },
  { usageCount: NaN },
  { usageCount: "0" },
  { usageCount: null },
  { usageCount: 2147483648 },
  { maxUsageCount: 0 },
  { maxUsageCount: -1 },
  { maxUsageCount: 1.5 },
  { maxUsageCount: "1" },
  { maxUsageCount: 2147483648 },
  { expiresAt: "" },
  { expiresAt: "bad" },
  { expiresAt: "2027-02-30 12:00:00" },
  { expiresAt: "2027-10-04 24:00:00" },
  { expiresAt: 123 },
  { expiresAt: new Date(NaN) },
])("never admits an invalid stored availability field %j", patch => {
  expect(
    getPaymentLinkAvailability({ ...active, ...patch } as any, now)
  ).toEqual({ available: false, reason: "invalid" });
});
it("honors an explicit expired status even when expiry is absent or future", () => {
  for (const expiresAt of [null, "2027-01-01T00:00:00Z"])
    expect(
      getPaymentLinkAvailability(
        { ...active, status: "expired", expiresAt },
        now
      )
    ).toEqual({ available: false, reason: "expired" });
});
it.each([
  "2026-10-04 12:00:00",
  "2026-10-04T12:00:00Z",
  "2026-10-04T15:00:00+03:00",
  new Date("2026-10-04T12:00:00Z"),
])("blocks the inclusive expiry boundary %s", expiresAt =>
  expect(getPaymentLinkAvailability({ ...active, expiresAt }, now)).toEqual({
    available: false,
    reason: "expired",
  })
);
it("keeps valid unlimited, boolean and bounded links available before expiry", () => {
  for (const patch of [
    {},
    { isActive: true },
    { maxUsageCount: 2, usageCount: 1 },
    { expiresAt: "2026-10-04 12:00:01" },
    { expiresAt: "2026-10-04T15:00:01+03:00" },
  ])
    expect(getPaymentLinkAvailability({ ...active, ...patch }, now)).toEqual({
      available: true,
    });
});
it("does not infer availability when the decision clock is invalid", () =>
  expect(getPaymentLinkAvailability(active, new Date(NaN))).toEqual({
    available: false,
    reason: "invalid",
  }));
it("preserves disabled and completed terminal states", () => {
  expect(getPaymentLinkAvailability({ ...active, isActive: 0 }, now)).toEqual({
    available: false,
    reason: "disabled",
  });
  expect(
    getPaymentLinkAvailability({ ...active, status: "disabled" }, now)
  ).toEqual({ available: false, reason: "disabled" });
  expect(
    getPaymentLinkAvailability({ ...active, status: "completed" }, now)
  ).toEqual({ available: false, reason: "exhausted" });
  expect(
    getPaymentLinkAvailability(
      { ...active, maxUsageCount: 1, usageCount: 1 },
      now
    )
  ).toEqual({ available: false, reason: "exhausted" });
});
