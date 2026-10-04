import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ pool: vi.fn() }));
vi.mock("./db/connection", () => ({ getPool: m.pool }));
import {
  saveNotificationPreferences,
  projectPreferences,
} from "./notification-preferences-workspace";
import { defaultNotificationPreferences as defaults } from "../shared/notification-preferences-workspace";
let tx: any, stored: any[];
const input = () => ({
  ...defaults,
  expectedRevision: projectPreferences([], 1, 2, true).revision,
});
beforeEach(() => {
  vi.resetAllMocks();
  stored = [];
  tx = {
    query: vi.fn(),
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    destroy: vi.fn(),
    execute: vi.fn(async (sql: string) => {
      if (sql.includes("FROM merchants"))
        return [[{ id: 2, userId: 1, status: "active" }]];
      if (sql.includes("FROM users"))
        return [[{ id: 1, account_status: "active" }]];
      if (sql.includes("FROM merchant_members")) return [[]];
      if (sql.includes("information_schema"))
        return [
          [
            {
              COLUMN_NAME: "merchant_id",
              NON_UNIQUE: 0,
              SEQ_IN_INDEX: 1,
              SUB_PART: null,
            },
          ],
        ];
      if (sql.startsWith("SELECT")) return [stored];
      if (sql.startsWith("INSERT")) {
        stored = [
          {
            id: 1,
            merchant_id: 2,
            new_orders_enabled: 1,
            new_messages_enabled: 1,
            appointments_enabled: 1,
            order_status_enabled: 1,
            missed_messages_enabled: 1,
            whatsapp_disconnect_enabled: 1,
            preferred_method: "both",
            quiet_hours_enabled: 0,
            quiet_hours_start: "22:00",
            quiet_hours_end: "08:00",
            instant_notifications: 1,
            batch_notifications: 0,
            batch_interval: 30,
          },
        ];
        return [{ insertId: 1 }];
      }
      throw Error("Unexpected query");
    }),
  };
  m.pool.mockResolvedValue({ getConnection: async () => tx });
});
it("marks commit failure unknown and destroys the connection instead of claiming rollback", async () => {
  tx.commit.mockRejectedValue(Error("private connection detail"));
  await expect(
    saveNotificationPreferences(1, 2, input())
  ).rejects.toMatchObject({ reason: "unknown" });
  expect(tx.destroy).toHaveBeenCalledOnce();
  expect(tx.release).not.toHaveBeenCalled();
  expect(tx.rollback).not.toHaveBeenCalled();
});
it("fails closed before a write when uniqueness migration is absent", async () => {
  const original = tx.execute.getMockImplementation();
  tx.execute.mockImplementation((sql: string) =>
    sql.includes("information_schema") ? Promise.resolve([[]]) : original(sql)
  );
  await expect(
    saveNotificationPreferences(1, 2, input())
  ).rejects.toMatchObject({ reason: "unavailable" });
  expect(stored).toEqual([]);
  expect(tx.rollback).toHaveBeenCalledOnce();
  expect(tx.commit).not.toHaveBeenCalled();
});
it("destroys a connection whose rollback fails and never commits it", async () => {
  tx.rollback.mockRejectedValue(Error("private"));
  await expect(
    saveNotificationPreferences(1, 2, {
      ...input(),
      expectedRevision: "a".repeat(64),
    })
  ).rejects.toMatchObject({ reason: "stale" });
  expect(tx.destroy).toHaveBeenCalledOnce();
  expect(tx.commit).not.toHaveBeenCalled();
  expect(tx.release).not.toHaveBeenCalled();
});
it("rejects missing database before accepting settings", async () => {
  m.pool.mockResolvedValue(null);
  await expect(
    saveNotificationPreferences(1, 2, input())
  ).rejects.toMatchObject({ reason: "unavailable" });
});
