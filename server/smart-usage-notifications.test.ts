import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  collect: vi.fn(),
  write: vi.fn(),
  old: vi.fn(),
}));
vi.mock("./notifications/usage-alert-evidence", () => ({
  collectUsageAlertEvidence: m.collect,
}));
vi.mock("./notifications/usage-alert-write", () => ({
  writeUsageAlert: m.write,
}));
import { appRouter } from "./routers";
const caller = (user: any = { id: 7, role: "admin" }) =>
  appRouter.createCaller({ user, req: { headers: {} }, res: {} } as any)
    .smartNotifications;
const names = [
  "sendTrialEndingNotifications",
  "sendUsageLimitNotifications",
  "scheduleSmartNotifications",
  "getNotificationStats",
] as const;
beforeEach(() => {
  vi.resetAllMocks();
  m.old.mockImplementation(() => {
    throw Error("Obsolete guessed usage reader");
  });
  m.collect.mockResolvedValue({
    totalMerchants: 3,
    unavailable: 1,
    checked: [
      {
        merchantId: 20,
        ownerId: 21,
        complete: true,
        unknownMetrics: [],
        trialDays: 2,
        alerts: [
          {
            key: "conversations",
            name: "المحادثات",
            used: 95,
            limit: 100,
            percentage: 95,
          },
        ],
      },
      {
        merchantId: 30,
        ownerId: 31,
        complete: false,
        unknownMetrics: ["messages"],
        trialDays: null,
        alerts: [],
      },
    ],
  });
  m.write.mockResolvedValue(51);
});
afterEach(() => vi.restoreAllMocks());
it("reports checked and unavailable merchants separately from metric totals", async () => {
  expect(await caller().getNotificationStats()).toMatchObject({
    trialEndingSoon: 1,
    usageAbove90: 1,
    usageAt100: 0,
    totalPending: 2,
    totalMerchants: 3,
    unavailableMerchants: 1,
    incompleteMerchants: 1,
    complete: false,
  });
  expect(m.old).not.toHaveBeenCalled();
  expect(m.write).not.toHaveBeenCalled();
});
it("writes a warning for the scoped owner and links to the reviewed usage workspace", async () => {
  expect(await caller().sendUsageLimitNotifications()).toMatchObject({
    success: true,
    count: 1,
    complete: false,
    notifications: [51],
  });
  expect(m.write).toHaveBeenCalledWith(
    21,
    20,
    expect.objectContaining({ link: "/merchant/usage", type: "warning" })
  );
  expect(m.write.mock.calls[0][2].message).toContain("95");
  expect(m.old).not.toHaveBeenCalled();
});
it("uses the effective trial duration and the canonical plan route", async () => {
  expect(await caller().sendTrialEndingNotifications()).toMatchObject({
    count: 1,
  });
  expect(m.write).toHaveBeenCalledWith(
    21,
    20,
    expect.objectContaining({
      link: "/merchant/subscription/plans",
      message: expect.stringContaining("2"),
    })
  );
});
it("runs the scheduled batch from one snapshot collection without a synthetic admin caller", async () => {
  expect(await caller().scheduleSmartNotifications()).toMatchObject({
    trialNotifications: 1,
    usageNotifications: 1,
    total: 2,
    complete: false,
  });
  expect(m.collect).toHaveBeenCalledOnce();
  expect(m.write).toHaveBeenCalledTimes(2);
});
it.each(names)("requires administrator authentication for %s", async name => {
  await expect(caller(null)[name]()).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
  await expect(caller({ id: 7, role: "user" })[name]()).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  expect(m.collect).not.toHaveBeenCalled();
  expect(m.old).not.toHaveBeenCalled();
  expect(m.write).not.toHaveBeenCalled();
});
it.each(names)(
  "redacts source failures and never returns healthy totals from %s",
  async name => {
    m.collect.mockRejectedValue(Error("PRIVATE_ALERT_SQL"));
    await expect(caller()[name]()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Usage notification source unavailable",
    });
    expect(m.write).not.toHaveBeenCalled();
  }
);
it.each(names)("rejects merchant and actor overrides in %s", async name => {
  await expect(
    (caller()[name] as any)({ merchantId: 20, actorId: 21 })
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(m.collect).not.toHaveBeenCalled();
  expect(m.write).not.toHaveBeenCalled();
});
it.each([
  null,
  [],
  [{}],
  [{ affectedRows: 0, insertId: 51 }],
  [{ affectedRows: 2, insertId: 51 }],
  [{ affectedRows: 1, insertId: 0 }],
])(
  "does not acknowledge an unconfirmed notification insert %j",
  async receipt => {
    m.write.mockResolvedValue(receipt);
    await expect(caller().sendUsageLimitNotifications()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Usage notification result unavailable; review before retrying",
    });
    expect(m.write).toHaveBeenCalledOnce();
  }
);
it("does not automatically repeat a write after a lost receipt", async () => {
  m.write.mockRejectedValue(Error("PRIVATE_WRITE_SQL"));
  await expect(caller().sendTrialEndingNotifications()).rejects.toMatchObject({
    message: "Usage notification result unavailable; review before retrying",
  });
  expect(m.write).toHaveBeenCalledOnce();
});
