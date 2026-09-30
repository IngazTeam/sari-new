import { describe, it, expect, beforeEach } from "vitest";
import {
  ExportPreviewStore,
  exportModes,
} from "../prototypes/tenant-dashboard/src/export-model";
let store: ExportPreviewStore;
const input = { expectedSourceDigest: "a".repeat(64), reviewed: true };
beforeEach(() => {
  store = new ExportPreviewStore();
});
describe("local export model uses production projection", () => {
  it("exercises 19 modes, writes 25 rows and preserves zero, unknown stock and currencies", async () => {
    expect(Object.keys(exportModes)).toHaveLength(19);
    const r = await store.send(input);
    expect(r).toMatchObject({
      success: true,
      rows: 25,
      unknownStock: 1,
      unverifiedPrice: 1,
    });
    expect(store.rows[0][4]).toBe("0");
    expect(store.rows[1][4]).toBe("");
    expect(store.rows[0][3]).toBe("12.34 SAR");
    expect(store.rows[1][3]).toBe("12.35 USD");
    expect(store.rows[2][3]).toBe("");
    expect(store.accepted).toBe(1);
  });
  it.each([
    "sourceChanged",
    "empty",
    "limit",
    "destination",
    "rateLimit",
  ] as const)("rejects %s without a write", async mode => {
    store.setMode(mode);
    await expect(store.send(input)).rejects.toThrow();
    expect(store.accepted).toBe(0);
    expect(store.rows).toEqual([]);
  });
  it.each([
    "unlinked",
    "oauth",
    "wrongTenant",
    "forbidden",
    "session",
    "readError",
  ] as const)("blocks missing authorization or source %s", async mode => {
    store.setMode(mode);
    await expect(store.send(input)).rejects.toThrow();
    expect(store.sent).toBe(0);
    expect(store.accepted).toBe(0);
  });
  it("rejects unreviewed or foreign-source requests", async () => {
    await expect(store.send({ ...input, reviewed: false })).rejects.toThrow();
    await expect(
      store.send({ ...input, expectedSourceDigest: "b".repeat(64) })
    ).rejects.toThrow();
    expect(store.sent).toBe(0);
  });
  it.each([
    ["lostReply", 1],
    ["notSent", 0],
  ] as const)(
    "distinguishes %s in simulation without sending again",
    async (mode, count) => {
      store.setMode(mode);
      await expect(store.send(input)).rejects.toThrow();
      expect(store.accepted).toBe(count);
      expect(store.sent).toBe(1);
      await store.refresh();
      expect(store.sent).toBe(1);
    }
  );
  it("retains a resolved false result as failure and simulates a foreign acknowledgement", async () => {
    store.setMode("failure");
    expect(await store.send(input)).toEqual({ success: false });
    expect(store.accepted).toBe(0);
    store.setMode("wrongReceipt");
    expect(await store.send(input)).toMatchObject({
      spreadsheetId: "foreign-demo",
    });
    expect(store.accepted).toBe(1);
  });
  it("keeps a bounded long name and resets only this model", async () => {
    store.setMode("long");
    await store.send(input);
    expect(store.rows[0][1].length).toBeLessThanOrEqual(255);
    expect(store.rows[0][1].length).toBeGreaterThan(150);
    store.reset();
    expect(store.rows).toEqual([]);
    expect(store.accepted).toBe(0);
    expect(store.mode).toBe("ready");
  });
});
