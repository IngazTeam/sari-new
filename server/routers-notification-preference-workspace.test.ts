import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn(), save: vi.fn() }));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./notification-preferences-workspace", async original => ({
  ...(await original<typeof import("./notification-preferences-workspace")>()),
  readNotificationPreferences: m.read,
  saveNotificationPreferences: m.save,
}));
import { router } from "./_core/trpc";
import { notificationPreferenceReadProcedures } from "./routers-notification-preference-workspace";
import { NotificationPreferenceError } from "./notification-preferences-workspace";
const caller = () =>
  router(notificationPreferenceReadProcedures).createCaller({
    user: { id: 7, role: "user" },
    req: { headers: {} },
    res: {},
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "viewer" });
  m.read.mockResolvedValue({ actorId: 7, merchantId: 20 });
});
it("reads the server-selected tenant for a member without guessing owner scope", async () => {
  expect(await caller().workspace()).toEqual({ actorId: 7, merchantId: 20 });
  expect(m.read).toHaveBeenCalledWith(7, 20);
});
it.each(["forbidden", "unavailable", "raw"])(
  "uses a static error for %s",
  async reason => {
    m.read.mockRejectedValue(
      reason === "raw"
        ? new Error("PRIVATE_DATABASE")
        : new NotificationPreferenceError(reason as "forbidden" | "unavailable")
    );
    await expect(caller().workspace()).rejects.toMatchObject({
      code: reason === "forbidden" ? "FORBIDDEN" : "INTERNAL_SERVER_ERROR",
      message: "notification_preferences:unavailable",
    });
  }
);
it("does not call the workspace without an authorized membership", async () => {
  m.access.mockResolvedValue(null);
  await expect(caller().workspace()).rejects.toBeDefined();
  expect(m.read).not.toHaveBeenCalled();
});

import { defaultNotificationPreferences } from "../shared/notification-preferences-workspace";
const write = () => ({
  ...defaultNotificationPreferences,
  expectedRevision: "a".repeat(64),
});
it("saves only through the server-selected tenant and actor", async () => {
  m.save.mockResolvedValue({ changed: true });
  await caller().saveReviewed(write());
  expect(m.save).toHaveBeenCalledWith(7, 20, write());
});
it.each(["forbidden", "stale", "duplicate", "unknown", "raw"])(
  "uses static reviewed write errors for %s",
  async reason => {
    m.save.mockRejectedValue(
      reason === "raw"
        ? new Error("PRIVATE")
        : new NotificationPreferenceError(reason as any)
    );
    await expect(caller().saveReviewed(write())).rejects.toMatchObject({
      code:
        reason === "forbidden"
          ? "FORBIDDEN"
          : ["stale", "duplicate"].includes(reason)
            ? "CONFLICT"
            : "INTERNAL_SERVER_ERROR",
      message:
        "notification_preferences:" +
        (reason === "raw" ? "unavailable" : reason),
    });
  }
);
it.each([
  { merchantId: 30 },
  { actorId: 3 },
  { batchNotifications: true },
  { quietHoursStart: "25:00" },
])("rejects unreviewed inputs %#", async extra => {
  await expect(
    caller().saveReviewed({ ...write(), ...extra } as any)
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(m.save).not.toHaveBeenCalled();
});
