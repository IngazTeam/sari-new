import { expect, it } from "vitest";
import {
  planPriceMinor,
  projectCatalogPlan,
  planCatalogWorkspaceSchema,
} from "../shared/plan-catalog-workspace";
const plan = () => ({
  id: 1,
  name: "باقة مثال",
  name_en: "Sample plan",
  description: null,
  description_en: null,
  monthly_price: "99.90",
  yearly_price: "1000.00",
  currency: "SAR",
  max_customers: 999999,
  max_whatsapp_numbers: 0,
  conversation_limit: 100,
  message_limit: -1,
  voice_message_limit: 20,
  features: '["Support"]',
});
it("keeps whitespace features empty and rejects a price without a supported currency", () => {
  expect(projectCatalogPlan({ ...plan(), features: "  " })).toMatchObject({
    features: [],
    invalidFields: [],
  });
  const value = {
    actorId: 2,
    merchantId: 3,
    canManage: false,
    checkedAt: "2026-10-04T12:00:00.000Z",
    plans: [{ ...projectCatalogPlan(plan()), currency: null }],
  };
  expect(planCatalogWorkspaceSchema.safeParse(value).success).toBe(false);
});
it.each([
  ["0", 0],
  ["0.00", 0],
  ["99.90", 9990],
  ["1.5", 150],
  ["99999999.99", 9999999999],
] as const)(
  "parses stored decimal %s exactly into two-decimal minor units",
  (value, expected) => {
    expect(planPriceMinor(value)).toBe(expected);
  }
);
it.each([
  null,
  undefined,
  0,
  NaN,
  Infinity,
  "-1",
  "1.001",
  "1e3",
  "1.00 SAR",
  " 1.00",
  "100000000.00",
  "",
])("keeps invalid price %s unknown", value => {
  expect(planPriceMinor(value)).toBeNull();
});
it("preserves recorded zero, unlimited and finite allowances without inventing limits", () => {
  expect(projectCatalogPlan(plan())).toMatchObject({
    monthlyMinor: 9990,
    yearlyMinor: 100000,
    currency: "SAR",
    invalidFields: [],
    limits: {
      customers: { limit: null, unlimited: true },
      whatsappNumbers: { limit: 0, unlimited: false },
      conversations: { limit: 100, unlimited: false },
      messages: { limit: null, unlimited: true },
    },
  });
});
it("retains a plan with malformed fields and flags unknown values", () => {
  const p = projectCatalogPlan({
    ...plan(),
    monthly_price: "-10.00",
    message_limit: -2,
    name: "",
    currency: "XYZ",
    features: '["Visible",12,{}]',
  });
  expect(p).toMatchObject({
    currency: null,
    recordedCurrency: "XYZ",
    monthlyMinor: null,
    yearlyMinor: null,
    nameAr: null,
    features: ["Visible"],
    limits: { messages: { limit: null, unlimited: null } },
  });
  expect(p.invalidFields).toEqual(
    expect.arrayContaining([
      "currency",
      "monthly_price",
      "name",
      "features",
      "message_limit",
    ])
  );
});
it.each(["{}", "[broken", '{"feature":"secret"}'])(
  "does not display invalid structured features %s as valid claims",
  features => {
    const p = projectCatalogPlan({ ...plan(), features });
    expect(p.features).toEqual([]);
    expect(p.invalidFields).toContain("features");
  }
);
it("preserves legacy plain-text features without interpreting HTML", () => {
  expect(
    projectCatalogPlan({ ...plan(), features: "<b>Sample</b>" }).features
  ).toEqual(["<b>Sample</b>"]);
});
it("keeps a confirmed empty catalog distinct from an invalid snapshot", () => {
  const base = {
    actorId: 2,
    merchantId: 3,
    canManage: false,
    checkedAt: "2026-10-04T12:00:00.000Z",
    plans: [],
  };
  expect(planCatalogWorkspaceSchema.safeParse(base).success).toBe(true);
  expect(
    planCatalogWorkspaceSchema.safeParse({ ...base, plans: null }).success
  ).toBe(false);
  expect(
    planCatalogWorkspaceSchema.safeParse({
      ...base,
      plans: [projectCatalogPlan(plan()), projectCatalogPlan(plan())],
    }).success
  ).toBe(false);
});
