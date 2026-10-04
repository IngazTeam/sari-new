import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ pool: vi.fn() }));
vi.mock("./db/connection", () => ({ getPool: m.pool }));
import {
  projectMerchantProfile,
  readMerchantProfileWorkspace,
  saveMerchantProfileWorkspace,
} from "./accounts/merchant-profile-workspace";
import {
  merchantProfileWorkspace,
  merchantProfileSave,
} from "../shared/merchant-profile-workspace";
const raw = {
  businessName: "Local",
  phone: null,
  autoReplyEnabled: 0,
  timezone: "Asia/Riyadh",
  logo_url: null,
};
let current: any, tx: any;
const input = () => ({
  ...projectMerchantProfile(1, 2, true, raw).values,
  businessName: "Updated",
  expectedRevision: projectMerchantProfile(1, 2, true, raw).revision,
});
beforeEach(() => {
  vi.resetAllMocks();
  current = { ...raw };
  tx = {
    query: vi.fn(),
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    destroy: vi.fn(),
    execute: vi.fn(async (sql: string, args: any[]) => {
      if (sql.startsWith("SELECT id,userId"))
        return [[{ id: 2, userId: 1, status: "active" }]];
      if (sql.includes("FROM users"))
        return [[{ id: 1, account_status: "active" }]];
      if (sql.includes("FROM merchant_members")) return [[]];
      if (sql.startsWith("SELECT businessName")) return [[current]];
      if (sql.startsWith("UPDATE merchants")) {
        current = {
          businessName: args[0],
          phone: args[1],
          autoReplyEnabled: Number(args[2]),
          timezone: args[3],
          logo_url: args[4],
        };
        return [{ affectedRows: 1 }];
      }
      throw Error("Unexpected query");
    }),
  };
  m.pool.mockResolvedValue({ getConnection: async () => tx });
});
it("preserves false and an unset phone/logo without inventing data", () => {
  expect(projectMerchantProfile(1, 2, true, raw)).toMatchObject({
    values: { phone: "", autoReplyEnabled: false, logoUrl: null },
    invalidFields: [],
  });
});
it("marks every unsupported old value instead of hiding it behind defaults", () => {
  const result = projectMerchantProfile(1, 2, true, {
    businessName: " ",
    phone: "abc",
    autoReplyEnabled: 2,
    timezone: "Unknown/Zone",
    logo_url: "javascript:alert(1)",
  });
  expect(result.invalidFields).toHaveLength(5);
  expect(Object.values(result.values!).every(v => v === null)).toBe(true);
});
it.each([
  { currency: "USD" },
  { merchantId: 3 },
  { userId: 3 },
  { greenApiToken: "private" },
  { businessName: " " },
  { phone: "abc" },
  { autoReplyEnabled: 1 },
  { timezone: "Fake/Time" },
  { logoUrl: "data:text/html,<x>" },
])("rejects injected or invalid input %j", delta => {
  expect(merchantProfileSave.safeParse({ ...input(), ...delta }).success).toBe(
    false
  );
});
it("does not expose a restricted profile, revision or edit capability", () => {
  const value = {
    actorId: 1,
    merchantId: 2,
    canView: false,
    canManage: false,
    revision: null,
    values: null,
    invalidFields: [],
  };
  expect(merchantProfileWorkspace.safeParse(value).success).toBe(true);
  expect(
    merchantProfileWorkspace.safeParse({ ...value, canManage: true }).success
  ).toBe(false);
  expect(
    merchantProfileWorkspace.safeParse({
      ...value,
      values: projectMerchantProfile(1, 2, true, raw).values,
    }).success
  ).toBe(false);
});
it("binds snapshots to actor, merchant and complete profile", () => {
  const first = projectMerchantProfile(1, 2, true, raw).revision;
  for (const d of [
    projectMerchantProfile(3, 2, true, raw),
    projectMerchantProfile(1, 3, true, raw),
    projectMerchantProfile(1, 2, true, { ...raw, phone: "+966500000001" }),
  ])
    expect(d.revision).not.toBe(first);
});
it("reads without writing", async () => {
  expect(await readMerchantProfileWorkspace(1, 2)).toMatchObject({
    values: { businessName: "Local" },
  });
  expect(
    tx.execute.mock.calls.some(([sql]: string[]) => sql.startsWith("UPDATE"))
  ).toBe(false);
});
it("does not save when the database is missing", async () => {
  m.pool.mockResolvedValue(null);
  await expect(
    saveMerchantProfileWorkspace(1, 2, input())
  ).rejects.toMatchObject({ reason: "unavailable" });
});
it("requires a fresh version before changing fields", async () => {
  await expect(
    saveMerchantProfileWorkspace(1, 2, {
      ...input(),
      expectedRevision: "a".repeat(64),
    })
  ).rejects.toMatchObject({ reason: "stale" });
  expect(current).toEqual(raw);
});
it("treats a lost commit response as unknown", async () => {
  tx.commit.mockRejectedValue(Error("private"));
  await expect(
    saveMerchantProfileWorkspace(1, 2, input())
  ).rejects.toMatchObject({ reason: "unknown" });
  expect(tx.destroy).toHaveBeenCalledOnce();
  expect(tx.release).not.toHaveBeenCalled();
  expect(tx.rollback).not.toHaveBeenCalled();
});
it("verifies all persisted fields before acknowledging a save", async () => {
  const original = tx.execute.getMockImplementation();
  tx.execute.mockImplementation((sql: string, args: any[]) =>
    sql.startsWith("UPDATE")
      ? Promise.resolve([{ affectedRows: 1 }])
      : original(sql, args)
  );
  await expect(
    saveMerchantProfileWorkspace(1, 2, input())
  ).rejects.toMatchObject({ reason: "unavailable" });
  expect(tx.commit).not.toHaveBeenCalled();
});
