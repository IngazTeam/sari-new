import { expect, it } from "vitest";
import {
  usageQuota,
  usageQuotaSchema,
  usageWorkspaceSchema,
} from "../shared/usage-workspace";
it("keeps zero allowance, unlimited, absent limits and unknown counts separate", () => {
  expect(usageQuota(0, 0)).toEqual({
    used: 0,
    limit: 0,
    unlimited: false,
    remaining: 0,
    percentage: 0,
  });
  expect(usageQuota(3, 0)).toMatchObject({
    used: 3,
    limit: 0,
    percentage: 100,
  });
  expect(usageQuota(3, null)).toEqual({
    used: 3,
    limit: null,
    unlimited: null,
    remaining: null,
    percentage: null,
  });
  expect(usageQuota(3, -1)).toEqual({
    used: 3,
    limit: null,
    unlimited: true,
    remaining: null,
    percentage: null,
  });
  expect(usageQuota(undefined, 100)).toEqual({
    used: null,
    limit: 100,
    unlimited: false,
    remaining: null,
    percentage: null,
  });
});
it("retains actual over-limit usage while capping only the progress bar", () => {
  expect(usageQuota(150, 100)).toEqual({
    used: 150,
    limit: 100,
    unlimited: false,
    remaining: 0,
    percentage: 100,
  });
});
it("uses the legacy unlimited sentinel only for resource allowances", () => {
  expect(usageQuota(4, 999999, true).unlimited).toBe(true);
  expect(usageQuota(4, 999999).unlimited).toBe(false);
  expect(usageQuota(4, 1000000, true).unlimited).toBe(false);
});
it.each([NaN, Infinity, -1, 1.1, "2", null, undefined])(
  "does not invent a count for %s",
  value => {
    expect(usageQuota(value, 100).used).toBeNull();
  }
);
it.each([NaN, Infinity, -2, 1.1, "2", null, undefined])(
  "does not invent a quota for %s",
  value => {
    expect(usageQuota(1, value)).toMatchObject({
      used: 1,
      limit: null,
      unlimited: null,
      percentage: null,
    });
  }
);
it.each([
  { ...usageQuota(2, 10), remaining: 9 },
  { ...usageQuota(2, 10), percentage: 99 },
  { ...usageQuota(2, -1), percentage: 0 },
  { ...usageQuota(2, null), limit: 100 },
])("rejects contradictory metric evidence %j", value => {
  expect(usageQuotaSchema.safeParse(value).success).toBe(false);
});
const fixture = () => ({
  actorId: 7,
  merchantId: 20,
  checkedAt: "2026-10-04T12:00:00.000Z",
  timezone: "UTC",
  subscription: {
    state: "none",
    id: null,
    planId: null,
    nameAr: null,
    nameEn: null,
    billingCycle: null,
    startDate: null,
    endDate: null,
    lastResetAt: null,
    limitsSource: "unknown",
  },
  quotas: {
    conversations: usageQuota(null, null),
    messages: usageQuota(null, null),
    voiceMessages: usageQuota(null, null),
  },
  resources: {
    customers: usageQuota(0, null),
    whatsappNumbers: usageQuota(0, null),
    products: usageQuota(0, null),
  },
  activity: {
    month: "2026-10",
    from: "2026-10-01T00:00:00.000Z",
    to: "2026-10-04T12:00:00.000Z",
    campaigns: 0,
    outgoingMessages: 0,
  },
  history: [
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
    "2026-09",
    "2026-10",
  ].map(month => ({ month, campaigns: 0, outgoingMessages: 0 })),
});
it("accepts a consistent six-month UTC snapshot", () => {
  expect(usageWorkspaceSchema.safeParse(fixture()).success).toBe(true);
});
it.each([
  "duplicate month",
  "wrong current month",
  "wrong start",
  "wrong cutoff",
  "mismatched count",
  "invalid timestamp",
  "short history",
])("rejects inconsistent usage periods: %s", kind => {
  const value = fixture();
  if (kind === "duplicate month")
    value.history[0].month = value.history[1].month;
  if (kind === "wrong current month") value.activity.month = "2026-09";
  if (kind === "wrong start") value.activity.from = "2026-10-02T00:00:00.000Z";
  if (kind === "wrong cutoff") value.activity.to = "2026-10-05T12:00:00.000Z";
  if (kind === "mismatched count") value.activity.campaigns = 2;
  if (kind === "invalid timestamp") value.checkedAt = "invalid";
  if (kind === "short history") value.history.pop();
  expect(usageWorkspaceSchema.safeParse(value).success).toBe(false);
});
