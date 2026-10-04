import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  safeAccountNotificationLink,
  accountNotificationsInput,
  accountNotificationAction,
  accountNotificationsWorkspace,
} from "../shared/account-notifications-workspace";
const mocks = vi.hoisted(() => ({
  pool: vi.fn(),
  tx: {
    query: vi.fn(),
    beginTransaction: vi.fn(),
    execute: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    destroy: vi.fn(),
    release: vi.fn(),
  },
}));
vi.mock("./db/connection", async original => ({
  ...(await original<typeof import("./db/connection")>()),
  getPool: mocks.pool,
}));
import {
  projectAccountNotification,
  readAccountNotifications,
  readAccountNotification,
  applyAccountNotificationAction,
  markAccountNotificationsRead,
} from "./accounts/notification-workspace";
import { accountNotificationsWorkspaceRouter } from "./routers-account-notifications-workspace";
const raw = () => ({
  id: 1,
  userId: 21,
  type: "info",
  title: "Notice",
  message: "Stored account message",
  link: "/merchant/orders/5",
  isRead: 0,
  createdAt: "2026-10-04 10:30:00",
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.pool.mockResolvedValue({ getConnection: async () => mocks.tx });
  mocks.tx.execute.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM users"))
      return [[{ id: 21, account_status: "active" }]];
    throw Error("Unexpected query");
  });
});
afterEach(() => vi.restoreAllMocks());
it.each([
  "/merchant/dashboard",
  "/merchant/orders/123",
  "/merchant/bookings?booking=5",
  "/merchant/payment-links?link=123",
])("preserves safe local destination %s", link =>
  expect(safeAccountNotificationLink(link)).toBe(link)
);
it.each([
  "https://evil.test",
  "//evil.test/merchant",
  "javascript:alert(1)",
  "/merchant/../../login",
  "/merchant/%2e%2e/login",
  "/merchant\\evil",
  "/merchant-evil",
  "/merchant/orders#javascript:hi",
  " /merchant/orders",
  "/merchant/orders\n",
  "/merchant/%2f%2fevil",
  "/admin/users",
])("rejects unsafe or out-of-scope link %s", link =>
  expect(safeAccountNotificationLink(link)).toBeNull()
);
it("normalizes only proved fields and binds revisions to account and source values", () => {
  const a = projectAccountNotification(21, raw());
  expect(a.createdAt).toBe("2026-10-04T10:30:00.000Z");
  expect(a.state).toBe("unread");
  expect(a.revision).not.toBe(
    projectAccountNotification(22, { ...raw(), userId: 22 }).revision
  );
  expect(a.revision).not.toBe(
    projectAccountNotification(21, { ...raw(), message: "Changed" }).revision
  );
  expect(() => projectAccountNotification(22, raw())).toThrow("forbidden");
  const bad = projectAccountNotification(21, {
    ...raw(),
    isRead: 2,
    createdAt: "2026-02-30 00:00:00",
    type: "alien",
    link: "https://private.test/?token=secret",
  });
  expect(bad).toMatchObject({
    state: "unknown",
    type: null,
    createdAt: null,
    link: null,
    linkUnavailable: true,
  });
  expect(JSON.stringify(bad)).not.toContain("secret");
});
it.each(["list", "detail", "action", "all"])(
  "fails closed without a database: %s",
  async name => {
    mocks.pool.mockResolvedValue(null);
    const p = projectAccountNotification(21, raw());
    await expect(
      name === "list"
        ? readAccountNotifications(21, {})
        : name === "detail"
          ? readAccountNotification(21, { id: 1 })
          : name === "action"
            ? applyAccountNotificationAction(21, {
                id: 1,
                expectedRevision: p.revision,
                action: "read",
                reviewed: true,
              })
            : markAccountNotificationsRead(21, {
                throughId: 1,
                unreadCount: 1,
                expectedRevision: p.revision,
                reviewed: true,
              })
    ).rejects.toThrow("unavailable");
  }
);
it("checks active account status before reading notification rows", async () => {
  mocks.tx.execute.mockResolvedValue([
    [{ id: 21, account_status: "deletion_pending" }],
  ]);
  await expect(readAccountNotifications(21, {})).rejects.toThrow("forbidden");
  expect(mocks.tx.execute).toHaveBeenCalledTimes(1);
  expect(mocks.tx.rollback).toHaveBeenCalled();
});
it("does not adopt a row belonging to another account", async () => {
  mocks.tx.execute.mockImplementation(async (sql: string) =>
    sql.includes("FROM users")
      ? [[{ id: 21, account_status: "active" }]]
      : [[raw()]]
  );
  await expect(readAccountNotification(21, { id: 1 })).resolves.toMatchObject({
    id: 1,
    state: "found",
  });
  mocks.tx.execute.mockImplementation(async (sql: string) =>
    sql.includes("FROM users")
      ? [[{ id: 21, account_status: "active" }]]
      : [[{ ...raw(), userId: 22 }]]
  );
  await expect(readAccountNotification(21, { id: 1 })).rejects.toThrow(
    "forbidden"
  );
});
it("labels an uncertain commit and discards the connection without retrying", async () => {
  mocks.tx.execute.mockImplementation(async (sql: string) =>
    sql.includes("FROM users")
      ? [[{ id: 21, account_status: "active" }]]
      : [[raw()]]
  );
  mocks.tx.commit.mockRejectedValue(Error("lost ack"));
  await expect(readAccountNotification(21, { id: 1 })).rejects.toThrow(
    "unknown"
  );
  expect(mocks.tx.commit).toHaveBeenCalledTimes(1);
  expect(mocks.tx.destroy).toHaveBeenCalledOnce();
  expect(mocks.tx.release).not.toHaveBeenCalled();
});
it("rolls back a missing write acknowledgement instead of claiming success", async () => {
  const r = raw();
  mocks.tx.execute.mockImplementation(async (sql: string) =>
    sql.includes("FROM users")
      ? [[{ id: 21, account_status: "active" }]]
      : sql.startsWith("UPDATE")
        ? [{ affectedRows: 0 }]
        : [[r]]
  );
  await expect(
    applyAccountNotificationAction(21, {
      id: 1,
      expectedRevision: projectAccountNotification(21, r).revision,
      action: "read",
      reviewed: true,
    })
  ).rejects.toThrow("unavailable");
  expect(mocks.tx.rollback).toHaveBeenCalled();
  expect(mocks.tx.commit).not.toHaveBeenCalled();
});
it("rejects stale revisions before changing a record", async () => {
  mocks.tx.execute.mockImplementation(async (sql: string) =>
    sql.includes("FROM users")
      ? [[{ id: 21, account_status: "active" }]]
      : [[raw()]]
  );
  await expect(
    applyAccountNotificationAction(21, {
      id: 1,
      expectedRevision: "a".repeat(64),
      action: "delete",
      reviewed: true,
    })
  ).rejects.toThrow("stale");
  expect(
    mocks.tx.execute.mock.calls.some(([sql]) => /^(UPDATE|DELETE)/.test(sql))
  ).toBe(false);
});
it("redacts database diagnostics at the router boundary", async () => {
  mocks.pool.mockRejectedValue(Error("secret db endpoint"));
  const caller = accountNotificationsWorkspaceRouter.createCaller({
    user: { id: 21, role: "user" },
    req: { headers: {} },
    res: {},
  } as any);
  await expect(caller.list({})).rejects.toMatchObject({
    code: "INTERNAL_SERVER_ERROR",
    message: "account_notifications:unavailable",
  });
});
it.each([
  { actorId: 99 },
  { merchantId: 88 },
  { userId: 77 },
  { page: 0 },
  { pageSize: 100 },
  { search: "x".repeat(101) },
])("rejects untrusted filter overrides %o", input => {
  expect(accountNotificationsInput.safeParse(input).success).toBe(false);
});
it("requires explicit record review and a bounded identity", () => {
  const base = {
    id: 1,
    expectedRevision: "a".repeat(64),
    action: "delete",
    reviewed: true,
  };
  expect(accountNotificationAction.safeParse(base).success).toBe(true);
  for (const patch of [
    { reviewed: false },
    { actorId: 2 },
    { merchantId: 2 },
    { id: 0 },
    { expectedRevision: "bad" },
  ])
    expect(
      accountNotificationAction.safeParse({ ...base, ...patch }).success
    ).toBe(false);
});
it("rejects contradictory totals, state filters and duplicate page rows", () => {
  const record = projectAccountNotification(21, raw()),
    base = {
      actorId: 21,
      scope: "account",
      source: "local_notifications",
      checkedAt: new Date().toISOString(),
      filters: accountNotificationsInput.parse({}),
      totals: { total: 1, unread: 1, read: 0, unknown: 0 },
      markAll: { throughId: 1, unreadCount: 1, revision: "a".repeat(64) },
      items: [record],
      hasNext: false,
    };
  expect(accountNotificationsWorkspace.safeParse(base).success).toBe(true);
  for (const patch of [
    { totals: { ...base.totals, read: 1 } },
    { hasNext: true },
    { items: [record, record] },
    { markAll: { ...base.markAll, unreadCount: 0 } },
    { filters: { ...base.filters, state: "read" } },
  ])
    expect(
      accountNotificationsWorkspace.safeParse({ ...base, ...patch }).success
    ).toBe(false);
});
