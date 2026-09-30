import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  schema: vi.fn(),
  pool: vi.fn(),
  query: vi.fn(),
  execute: vi.fn(),
  begin: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  actor: vi.fn(),
}));
vi.mock("./db/connection", () => ({ getPool: m.pool }));
vi.mock("./db/schema-readiness", () => ({ assertRuntimeSchema: m.schema }));
vi.mock("./quotation-review", async original => ({
  ...(await original<typeof import("./quotation-review")>()),
  quotationActor: m.actor,
  quotationClock: async () => "2026-09-30T00:00:00.000Z",
}));
import {
  writeQuotationTemplate,
  readTemplateWorkspace,
} from "./quotation-template-workspace";
beforeEach(() => {
  vi.resetAllMocks();
  m.pool.mockResolvedValue({
    getConnection: async () => ({
      query: m.query,
      execute: m.execute,
      beginTransaction: m.begin,
      commit: m.commit,
      rollback: m.rollback,
      release: m.release,
    }),
  });
  m.execute.mockImplementation(async (sql: string) =>
    sql.startsWith("SELECT COUNT")
      ? [[{ total: 0 }]]
      : sql.startsWith("INSERT INTO quotation_templates ")
        ? [{ insertId: 3 }]
        : [[]]
  );
});
const input = () => ({
  action: "create",
  requestId: randomUUID(),
  fields: {
    name: "Template",
    headerImageUrl: null,
    footerText: null,
    termsText: null,
    isDefault: true,
  },
});
describe("template atomicity and schema", () => {
  it.each([
    "INSERT INTO quotation_template_receipts",
    "INSERT INTO sari_activity_log",
  ])("rolls back the template/defaults when %s fails", async prefix => {
    const impl = m.execute.getMockImplementation()!;
    m.execute.mockImplementation(async (sql, ...args) => {
      if (sql.startsWith(prefix)) throw Error("write failed");
      return impl(sql, ...args);
    });
    await expect(writeQuotationTemplate(20, 7, input())).rejects.toThrow(
      "write failed"
    );
    expect(m.commit).not.toHaveBeenCalled();
    expect(m.rollback).toHaveBeenCalledTimes(1);
    expect(m.release).toHaveBeenCalledTimes(1);
    expect(
      m.execute.mock.calls.some(([sql]) =>
        sql.startsWith("UPDATE quotation_templates SET is_default=0")
      )
    ).toBe(true);
  });
  it("does not reach SQL writes when current authority was revoked", async () => {
    m.actor.mockRejectedValue(Error("revoked"));
    await expect(writeQuotationTemplate(20, 7, input())).rejects.toThrow(
      "revoked"
    );
    expect(m.execute).not.toHaveBeenCalled();
    expect(m.rollback).toHaveBeenCalledTimes(1);
  });
  it("fails rather than inventing an empty workspace when the source is absent", async () => {
    m.pool.mockResolvedValue(null);
    await expect(readTemplateWorkspace(20, {})).rejects.toThrow("unavailable");
  });
  it("registers the migration once with unique merchant requests and cascade cleanup", () => {
    const sql = readFileSync(
        "drizzle/0170_quotation_template_receipts.sql",
        "utf8"
      ),
      journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    expect(
      journal.entries.filter(
        (e: any) => e.tag === "0170_quotation_template_receipts"
      )
    ).toHaveLength(1);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS");
    expect(sql).toContain("(`merchant_id`,`request_id`)");
    expect(sql).toContain("ON DELETE CASCADE");
  });
});
