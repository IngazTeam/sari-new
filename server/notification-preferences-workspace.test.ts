import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ pool: vi.fn() }));
vi.mock("./db/connection", () => ({ getPool: m.pool }));
import {
  projectPreferences,
  readNotificationPreferences,
  preferenceColumns,
} from "./notification-preferences-workspace";
import {
  defaultNotificationPreferences,
  notificationPreferenceWorkspace,
  notificationPreferenceConfiguration,
} from "../shared/notification-preferences-workspace";
const record = () =>
  Object.fromEntries(
    Object.entries({
      ...defaultNotificationPreferences,
      instantNotifications: true,
      batchNotifications: false,
      batchInterval: 30,
    }).map(([key, value]) => [
      preferenceColumns[key as keyof typeof preferenceColumns],
      typeof value === "boolean" ? (value ? 1 : 0) : value,
    ])
  );
beforeEach(() => vi.resetAllMocks());
it("distinguishes real absence from a saved configuration, without claiming unsupported delivery", () => {
  const empty = projectPreferences([], 1, 2, true),
    saved = projectPreferences([{ id: 8, ...record() }], 1, 2, true);
  expect(empty).toMatchObject({
    status: "default",
    storedRecords: 0,
    values: { ...defaultNotificationPreferences },
    batchingAvailable: false,
    instantToggleApplied: false,
    quietHoursBehavior: "suppressed_not_queued",
    quietHoursBypass: "whatsapp_disconnect",
  });
  expect(saved.status).toBe("saved");
  expect(saved.revision).not.toBe(empty.revision);
  expect(saved.quietHoursTimeZone.length).toBeGreaterThan(0);
});
it.each(Object.keys(preferenceColumns))(
  "retains unknown legacy field %s explicitly instead of inventing a default",
  key => {
    const row = record();
    row[preferenceColumns[key as keyof typeof preferenceColumns]] =
      key === "batchInterval"
        ? -7
        : key === "quietHoursStart" || key === "quietHoursEnd"
          ? "99:99"
          : null;
    const result = projectPreferences([row], 1, 2, true);
    expect(result.status).toBe("invalid");
    expect(result.values![key as keyof typeof result.values]).toBeNull();
    expect(result.invalidFields).toEqual([key]);
  }
);
it("does not choose between duplicate records", () => {
  const data = projectPreferences(
    [
      { id: 1, ...record() },
      { id: 2, ...record(), preferred_method: "email" },
    ],
    1,
    2,
    true
  );
  expect(data).toMatchObject({
    status: "duplicate",
    storedRecords: 2,
    values: null,
  });
  expect(
    notificationPreferenceWorkspace.safeParse({
      ...data,
      values: projectPreferences([], 1, 2, true).values,
    }).success
  ).toBe(false);
});
it("preserves false values and binds the snapshot to actor, merchant and contents", () => {
  const row = { id: 1, ...record(), new_orders_enabled: 0 };
  const result = projectPreferences([row], 1, 2, false);
  expect(result.values!.newOrdersEnabled).toBe(false);
  expect(result.canManage).toBe(false);
  for (const args of [
    [[row], 3, 2, false],
    [[row], 1, 3, false],
    [[{ ...row, preferred_method: "email" }], 1, 2, false],
  ] as const)
    expect(projectPreferences(...(args as any)).revision).not.toBe(
      result.revision
    );
});
it.each([
  { ...defaultNotificationPreferences, quietHoursStart: "25:00" },
  { ...defaultNotificationPreferences, quietHoursEnd: "08:99" },
  { ...defaultNotificationPreferences, merchantId: 3 },
  { ...defaultNotificationPreferences, batchNotifications: true },
])("rejects invalid or unsupported preference writes (%#)", value =>
  expect(notificationPreferenceConfiguration.safeParse(value).success).toBe(
    false
  )
);
it("fails a missing database instead of returning default preferences", async () => {
  m.pool.mockResolvedValue(null);
  await expect(readNotificationPreferences(1, 2)).rejects.toMatchObject({
    reason: "unavailable",
  });
});
