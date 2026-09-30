import { describe, expect, it } from "vitest";
import {
  setupCompletionFields,
  setupCompletionInput,
  setupCatalogConflicts,
} from "../shared/setup-completion";
export const validSetupFields = () =>
  setupCompletionFields.parse({
    businessType: "both",
    businessName: "متجر اختبار",
    phone: "+966500000001",
    workingHoursType: "custom",
    workingHours: { sunday: { open: "09:00", close: "18:00", isOpen: true } },
    botTone: "professional",
    botLanguage: "ar",
    welcomeMessage: "أهلاً",
    products: [
      { name: "منتج", priceMinor: 1234, currency: "USD", category: "تجربة" },
    ],
    services: [
      { name: "خدمة", priceMinor: 0, durationMinutes: 90, category: "تجربة" },
    ],
  });
describe("setup completion review contract", () => {
  it("preserves exact minor prices, explicit free service, duration and URL attribution", () => {
    const fields = setupCompletionFields.parse({
      ...validSetupFields(),
      websiteAnalysis: {
        websiteUrl: "https://example.test/shop",
        platform: "unknown",
      },
    });
    expect(fields.products[0].priceMinor).toBe(1234);
    expect(fields.services[0]).toMatchObject({
      priceMinor: 0,
      durationMinutes: 90,
    });
  });
  it.each([
    { merchantId: 2 },
    { autoReplyEnabled: 1 },
    {
      workingHours: { sunday: { open: "25:00", close: "18:00", isOpen: true } },
    },
    { products: [{ name: "A", priceMinor: 1.5 }] },
    { services: [{ name: "A", priceMinor: 0, currency: "USD" }] },
    {
      websiteAnalysis: {
        websiteUrl: "https://secret:password@example.test",
        platform: "custom",
      },
    },
    {
      websiteAnalysis: {
        websiteUrl: "https://example.test",
        platform: "custom",
        analysisStatus: "completed",
      },
    },
    { templateId: -1 },
    { welcomeMessage: "a".repeat(2001) },
    { phone: "invalid" },
  ])("rejects ambiguous or privileged input: %j", patch => {
    expect(
      setupCompletionFields.safeParse({ ...validSetupFields(), ...patch })
        .success
    ).toBe(false);
  });
  it("requires explicit review, a stable UUID and snapshot digest", () => {
    expect(
      setupCompletionInput.safeParse({ fields: validSetupFields() }).success
    ).toBe(false);
    expect(
      setupCompletionInput.safeParse({
        fields: validSetupFields(),
        reviewed: true,
        expectedDigest: "a".repeat(64),
        requestId: "63055d6e-9b7d-469c-bf3c-237c0097bdf6",
      }).success
    ).toBe(true);
  });
  it("reports both draft duplicates without mutating or silently skipping rows", () => {
    const fields = validSetupFields();
    fields.products.push({ ...fields.products[0], name: "  منتج  " });
    const before = structuredClone(fields);
    expect(
      setupCatalogConflicts(fields, { products: [], services: [] })
    ).toEqual([
      { kind: "products", index: 0, reason: "draft_duplicate" },
      { kind: "products", index: 1, reason: "draft_duplicate" },
    ]);
    expect(fields).toEqual(before);
  });
  it("normalizes existing names but keeps products and services independent", () => {
    const fields = validSetupFields();
    fields.products[0].name = " Ａ  B ";
    fields.services[0].name = "a b";
    expect(
      setupCatalogConflicts(fields, {
        products: [{ name: "a b" }],
        services: [],
      })
    ).toEqual([{ kind: "products", index: 0, reason: "existing_name" }]);
  });
});
