import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ pool: vi.fn(), schema: vi.fn() }));
vi.mock("./db/connection", () => ({ getPool: mocks.pool }));
vi.mock("./db/schema-readiness", () => ({ assertRuntimeSchema: mocks.schema }));
import {
  writeCustomerAnnotation,
  readCustomerAnnotations,
} from "./customer-annotations";
let c: any;
const input = () => ({
  key: "966500000074",
  kind: "note" as const,
  content: "Note",
  requestId: randomUUID(),
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.schema.mockResolvedValue(undefined);
  c = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    destroy: vi.fn(),
    query: vi.fn(async (sql: string) =>
      sql.includes("DATE_FORMAT")
        ? [[{ now: "2026-09-30T12:00:00.000Z" }]]
        : [[]]
    ),
    execute: vi.fn(async (sql: string) => {
      if (sql.startsWith("SELECT id,userId"))
        return [[{ id: 20, userId: 74, status: "active" }]];
      if (sql.startsWith("SELECT account_status"))
        return [[{ account_status: "active" }]];
      if (sql.startsWith("SELECT role")) return [[]];
      if (sql.startsWith("SELECT actor_id")) return [[]];
      if (sql.startsWith("WITH raw"))
        return [[{ customerKey: "966500000074" }]];
      if (sql.startsWith("INSERT INTO customer_workspace_notes"))
        return [{ insertId: 1 }];
      if (sql.startsWith("INSERT INTO customer_annotation_receipts"))
        return [{ insertId: 1 }];
      if (sql.startsWith("SELECT revision")) return [[]];
      if (sql.startsWith("SELECT COUNT")) return [[{ total: 0 }]];
      throw Error("Unexpected query");
    }),
  };
  mocks.pool.mockResolvedValue({ getConnection: async () => c });
});
describe("customer annotation failure handling", () => {
  it("refuses unavailable migration before touching business data", async () => {
    mocks.schema.mockRejectedValue(Error("schema unavailable"));
    await expect(writeCustomerAnnotation(20, 74, input())).rejects.toThrow();
    expect(mocks.pool).not.toHaveBeenCalled();
  });
  it("refuses absent storage rather than an empty success", async () => {
    mocks.pool.mockResolvedValue(null);
    await expect(readCustomerAnnotations(20, { key: "x" })).rejects.toThrow(
      "Customers unavailable"
    );
  });
  it("rolls back invalid inserted note identity before storing a receipt", async () => {
    const execute = c.execute.getMockImplementation();
    c.execute.mockImplementation(async (sql: string, ...args: any[]) =>
      sql.startsWith("INSERT INTO customer_workspace_notes")
        ? [{}]
        : execute(sql, ...args)
    );
    await expect(writeCustomerAnnotation(20, 74, input())).rejects.toThrow();
    expect(c.rollback).toHaveBeenCalledOnce();
    expect(c.commit).not.toHaveBeenCalled();
    expect(
      c.execute.mock.calls.some((call: any[]) =>
        call[0].startsWith("INSERT INTO customer_annotation_receipts")
      )
    ).toBe(false);
  });
  it("destroys the connection when the commit result is unknown, never reuses or rolls it back", async () => {
    c.commit.mockRejectedValue(Error("lost acknowledgement"));
    await expect(writeCustomerAnnotation(20, 74, input())).rejects.toThrow();
    expect(c.destroy).toHaveBeenCalledOnce();
    expect(c.release).not.toHaveBeenCalled();
    expect(c.rollback).not.toHaveBeenCalled();
  });
  it("destroys a connection whose rollback failed", async () => {
    c.execute.mockRejectedValue(Error("read failed"));
    c.rollback.mockRejectedValue(Error("rollback failed"));
    await expect(writeCustomerAnnotation(20, 74, input())).rejects.toThrow(
      "read failed"
    );
    expect(c.destroy).toHaveBeenCalledOnce();
    expect(c.release).not.toHaveBeenCalled();
  });
  it.each([null, "", -1, "not-number"])(
    "does not turn corrupt note count %j into zero",
    async total => {
      const execute = c.execute.getMockImplementation();
      c.execute.mockImplementation(async (sql: string, ...args: any[]) =>
        sql.startsWith("SELECT COUNT") ? [[{ total }]] : execute(sql, ...args)
      );
      await expect(
        readCustomerAnnotations(20, { key: "966500000074" })
      ).rejects.toThrow();
    }
  );
  it("validates tenant and actor IDs before schema or storage", async () => {
    await expect(writeCustomerAnnotation(0, 74, input())).rejects.toThrow();
    await expect(writeCustomerAnnotation(20, 0, input())).rejects.toThrow();
    expect(mocks.schema).not.toHaveBeenCalled();
  });
});
