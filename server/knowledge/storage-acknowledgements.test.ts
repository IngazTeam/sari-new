import { beforeEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  pool: vi.fn(),
  execute: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
}));
vi.mock("../db", () => ({ getPool: m.pool }));
vi.mock("../db/schema-readiness", () => ({ assertRuntimeSchema: vi.fn() }));
vi.mock("./intake-execution", () => ({
  runKnowledgeWrite: async (pool: any, _merchant: number, work: any) => {
    try {
      const r = await work(pool);
      m.commit();
      return r;
    } catch (e) {
      m.rollback();
      throw e;
    }
  },
}));
import {
  getSectionsByMerchantId,
  createSection,
  updateSection,
  logChange,
} from "../db/knowledge";
const data = {
  merchantId: 42,
  sectionType: "identity" as const,
  title: "Known business",
  content: "Verified source",
  source: "document" as const,
};
beforeEach(() => {
  vi.resetAllMocks();
  m.pool.mockResolvedValue({ execute: m.execute });
  m.execute.mockResolvedValue([{ affectedRows: 1, insertId: 11 }]);
});
it.each(["read", "create", "update", "log"])(
  "fails closed when storage is unavailable: %s",
  async method => {
    m.pool.mockResolvedValue(null);
    const action = () =>
      method === "read"
        ? getSectionsByMerchantId(42)
        : method === "create"
          ? createSection(data)
          : method === "update"
            ? updateSection(11, 42, { content: "Changed" })
            : logChange({ merchantId: 42, sectionId: 11, action: "evolve" });
    await expect(action()).rejects.toThrow();
    expect(m.execute).not.toHaveBeenCalled();
  }
);
it("distinguishes an actual empty database result", async () => {
  m.execute.mockResolvedValue([[]]);
  expect(await getSectionsByMerchantId(42)).toEqual([]);
});
it.each([0, 2, -1, "1", null, undefined])(
  "rejects an unconfirmed update count %s before the transaction can commit",
  async affectedRows => {
    m.execute.mockResolvedValue([{ affectedRows }]);
    await expect(
      updateSection(11, 42, { content: "Changed" })
    ).rejects.toThrow();
    expect(m.execute).toHaveBeenCalledOnce();
    expect(m.commit).not.toHaveBeenCalled();
    expect(m.rollback).toHaveBeenCalledOnce();
  }
);
it.each([0, -1, 1.1, "11", null, undefined, 2147483648])(
  "rejects an invalid insert identity %s",
  async insertId => {
    m.execute.mockResolvedValue([{ affectedRows: 1, insertId }]);
    await expect(createSection(data)).rejects.toThrow();
    await expect(
      logChange({ merchantId: 42, action: "add" })
    ).rejects.toThrow();
    expect(m.commit).not.toHaveBeenCalled();
  }
);
it.each([0, 2, undefined])(
  "rejects an unconfirmed insert count %s",
  async affectedRows => {
    m.execute.mockResolvedValue([{ affectedRows, insertId: 11 }]);
    await expect(createSection(data)).rejects.toThrow();
    await expect(
      logChange({ merchantId: 42, action: "add" })
    ).rejects.toThrow();
    expect(m.commit).not.toHaveBeenCalled();
  }
);
it("returns verified insert identity and keeps tenant-scoped update parameters", async () => {
  expect(await createSection(data)).toBe(11);
  expect(
    await logChange({ merchantId: 42, sectionId: 11, action: "add" })
  ).toBe(11);
  await updateSection(11, 42, { content: "Changed" });
  expect(m.execute.mock.calls[2][0]).toContain(
    "WHERE id = ? AND merchant_id = ?"
  );
  expect(m.execute.mock.calls[2][1].slice(-2)).toEqual([11, 42]);
  expect(m.commit).toHaveBeenCalledTimes(3);
});
it("never retries an uncertain driver failure", async () => {
  m.execute.mockRejectedValue(Error("uncertain"));
  await expect(createSection(data)).rejects.toThrow("uncertain");
  expect(m.execute).toHaveBeenCalledOnce();
  expect(m.commit).not.toHaveBeenCalled();
});
