import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  pool: vi.fn(),
  execute: vi.fn(),
  workspace: vi.fn(),
}));
vi.mock("./db/connection", () => ({ getPool: m.pool }));
vi.mock("./accounts/usage-workspace", () => ({
  readUsageWorkspace: m.workspace,
}));
import {
  collectUsageAlertEvidence,
  usageAlertEvidence,
} from "./notifications/usage-alert-evidence";
import { usagePreviewSnapshot } from "../prototypes/tenant-dashboard/src/usage-preview-model";
import { usageQuota } from "../shared/usage-workspace";
const snapshot = () => usagePreviewSnapshot(269, 1269, "normal");
beforeEach(() => {
  vi.resetAllMocks();
  m.pool.mockResolvedValue({ execute: m.execute });
  m.execute.mockResolvedValue([[{ id: 269, userId: 1269 }]]);
  m.workspace.mockResolvedValue(snapshot());
});
it("uses actual subscription counters rather than invented campaign and product limits", () => {
  const s = snapshot();
  s.quotas.conversations = usageQuota(95, 100);
  s.quotas.voiceMessages = usageQuota(1, 0);
  expect(usageAlertEvidence(s)).toMatchObject({
    complete: true,
    alerts: [
      { key: "conversations", used: 95, limit: 100, percentage: 95 },
      { key: "voiceMessages", used: 1, limit: 0, percentage: 100 },
    ],
  });
});
it("does not turn unknown counters or allowance into a healthy result", () => {
  const s = snapshot();
  s.quotas.conversations = usageQuota(null, 100);
  s.quotas.messages = usageQuota(50, null);
  expect(usageAlertEvidence(s)).toMatchObject({
    complete: false,
    unknownMetrics: ["conversations", "messages"],
    alerts: [],
  });
});
it("ignores explicit unlimited allowance and zero usage within zero allowance", () => {
  expect(usageAlertEvidence(snapshot())).toMatchObject({
    alerts: [],
    complete: true,
  });
});
it.each(["none", "expired", "ambiguous", "unknown"] as const)(
  "does not send capacity alerts for %s",
  state => {
    const s = snapshot();
    s.subscription.state = state;
    s.quotas.conversations = usageQuota(101, 100);
    expect(usageAlertEvidence(s)).toMatchObject({
      alerts: [],
      trialDays: null,
      complete: state === "none" || state === "expired",
    });
  }
);
it("derives trial reminders from the effective source date and source clock", () => {
  const s = snapshot();
  s.subscription.state = "trial";
  s.subscription.endDate = "2026-10-07T12:00:00.000Z";
  expect(usageAlertEvidence(s).trialDays).toBe(3);
  s.subscription.endDate = "2026-10-07T12:00:00.001Z";
  expect(usageAlertEvidence(s).trialDays).toBeNull();
  s.subscription.endDate = s.checkedAt;
  expect(usageAlertEvidence(s).trialDays).toBeNull();
});
it("takes owner identity only from the current merchant list and verifies snapshot scope", async () => {
  const result = await collectUsageAlertEvidence();
  expect(result).toMatchObject({ unavailable: 0, totalMerchants: 1 });
  expect(m.workspace).toHaveBeenCalledWith(1269, 269);
  m.workspace.mockResolvedValue({ ...snapshot(), merchantId: 270 });
  expect(await collectUsageAlertEvidence()).toMatchObject({
    checked: [],
    unavailable: 1,
  });
});
it("distinguishes a snapshot failure from a checked merchant with no warning", async () => {
  m.workspace.mockRejectedValue(Error("PRIVATE_SQL"));
  expect(await collectUsageAlertEvidence()).toEqual({
    checked: [],
    unavailable: 1,
    totalMerchants: 1,
  });
});
it.each([
  null,
  {},
  [{ id: 269, userId: -1 }],
  [
    { id: 269, userId: 1269 },
    { id: 269, userId: 1269 },
  ],
])("rejects invalid merchant source %j", async value => {
  m.execute.mockResolvedValue([value]);
  await expect(collectUsageAlertEvidence()).rejects.toThrow(
    "usage_alerts:unavailable"
  );
  expect(m.workspace).not.toHaveBeenCalled();
});
it("does not treat missing storage as an empty merchant list", async () => {
  m.pool.mockResolvedValue(null);
  await expect(collectUsageAlertEvidence()).rejects.toThrow(
    "usage_alerts:unavailable"
  );
});
it("allows a confirmed empty list without inventing a merchant", async () => {
  m.execute.mockResolvedValue([[]]);
  expect(await collectUsageAlertEvidence()).toEqual({
    checked: [],
    unavailable: 0,
    totalMerchants: 0,
  });
});
