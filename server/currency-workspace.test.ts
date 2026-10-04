import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ pool: vi.fn() }));
vi.mock("./db/connection", () => ({ getPool: m.pool }));
import {
  projectCurrency,
  readCurrencyWorkspace,
  saveCurrencyWorkspace,
} from "./currency-workspace";
import {
  currencySave,
  currencyWorkspace,
  currencySaveResult,
} from "../shared/currency-workspace";
let tx: any, stored: string;
const input = () => ({
  currency: "USD",
  expectedRevision: projectCurrency(1, 2, true, "SAR").revision,
});
beforeEach(() => {
  vi.resetAllMocks();
  stored = "SAR";
  tx = {
    query: vi.fn(),
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    destroy: vi.fn(),
    execute: vi.fn(async (sql: string, args: any[]) => {
      if (sql.startsWith("SELECT id,userId"))
        return [[{ id: 2, userId: 1, status: "active", currency: stored }]];
      if (sql.includes("FROM users"))
        return [[{ id: 1, account_status: "active" }]];
      if (sql.includes("FROM merchant_members")) return [[]];
      if (sql.startsWith("UPDATE merchants")) {
        stored = args[0];
        return [{ affectedRows: 1 }];
      }
      if (sql.startsWith("SELECT currency")) return [[{ currency: stored }]];
      throw Error("Unexpected query");
    }),
  };
  m.pool.mockResolvedValue({ getConnection: async () => tx });
});
it.each([undefined, null, "", "EUR", 0, false])(
  "marks an unsupported stored currency unknown: %s",
  value => {
    expect(projectCurrency(1, 2, true, value).currency).toBe(null);
  }
);
it("binds the fingerprint to currency, actor and tenant", () => {
  const baseline = projectCurrency(1, 2, true, "SAR").revision;
  for (const item of [
    projectCurrency(3, 2, true, "SAR"),
    projectCurrency(1, 3, true, "SAR"),
    projectCurrency(1, 2, true, "USD"),
  ])
    expect(item.revision).not.toBe(baseline);
});
it("reads without an update and returns only the bounded contract", async () => {
  expect(await readCurrencyWorkspace(1, 2)).toEqual(
    projectCurrency(1, 2, true, "SAR")
  );
  expect(
    tx.execute.mock.calls.some(([sql]: string[]) => sql.startsWith("UPDATE"))
  ).toBe(false);
});
it("never claims successful persistence when the database is absent", async () => {
  m.pool.mockResolvedValue(null);
  await expect(saveCurrencyWorkspace(1, 2, input())).rejects.toMatchObject({
    reason: "unavailable",
  });
});
it("treats a lost commit response as unknown and discards the connection", async () => {
  tx.commit.mockRejectedValue(Error("private"));
  await expect(saveCurrencyWorkspace(1, 2, input())).rejects.toMatchObject({
    reason: "unknown",
  });
  expect(tx.destroy).toHaveBeenCalledOnce();
  expect(tx.release).not.toHaveBeenCalled();
  expect(tx.rollback).not.toHaveBeenCalled();
});
it("rejects a stale snapshot before updating", async () => {
  await expect(
    saveCurrencyWorkspace(1, 2, {
      ...input(),
      expectedRevision: "a".repeat(64),
    })
  ).rejects.toMatchObject({ reason: "stale" });
  expect(stored).toBe("SAR");
  expect(tx.commit).not.toHaveBeenCalled();
});
it("checks the stored result before commit", async () => {
  const original = tx.execute.getMockImplementation();
  tx.execute.mockImplementation((sql: string, args: any[]) =>
    sql.startsWith("SELECT currency")
      ? Promise.resolve([[{ currency: "SAR" }]])
      : original(sql, args)
  );
  await expect(saveCurrencyWorkspace(1, 2, input())).rejects.toMatchObject({
    reason: "unavailable",
  });
  expect(tx.rollback).toHaveBeenCalledOnce();
  expect(tx.commit).not.toHaveBeenCalled();
});
it("discards a connection after failed rollback", async () => {
  tx.rollback.mockRejectedValue(Error("private"));
  await expect(
    saveCurrencyWorkspace(1, 2, {
      ...input(),
      expectedRevision: "a".repeat(64),
    })
  ).rejects.toMatchObject({ reason: "stale" });
  expect(tx.destroy).toHaveBeenCalledOnce();
  expect(tx.release).not.toHaveBeenCalled();
});
it.each([
  { currency: "EUR" },
  { currency: null },
  { merchantId: 3 },
  { currency: "" },
  { expectedRevision: "short" },
])("rejects invalid or injected save values %j", delta => {
  expect(currencySave.safeParse({ ...input(), ...delta }).success).toBe(false);
});
it("rejects extra response fields and false conversion claims", () => {
  const workspace = projectCurrency(1, 2, true, "SAR");
  expect(
    currencyWorkspace.safeParse({ ...workspace, convertsAmounts: true }).success
  ).toBe(false);
  expect(
    currencyWorkspace.safeParse({ ...workspace, apiKey: "private" }).success
  ).toBe(false);
  expect(currencySaveResult.safeParse({ workspace, changed: 1 }).success).toBe(
    false
  );
});
