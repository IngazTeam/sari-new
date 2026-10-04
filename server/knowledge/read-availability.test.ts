import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ pool: vi.fn(), execute: vi.fn() }));
vi.mock("../db", () => ({ getPool: m.pool }));
vi.mock("../db/schema-readiness", () => ({ assertRuntimeSchema: vi.fn() }));
import {
  getPendingReviewSections,
  getSectionById,
  getChangelog,
  getUnresolvedConflicts,
} from "../db/knowledge";
const cases = [
  ["pending", () => getPendingReviewSections(20), []],
  ["section", () => getSectionById(11, 20), null],
  ["history", () => getChangelog(20, 25), []],
  ["conflicts", () => getUnresolvedConflicts(20), []],
] as const;
beforeEach(() => {
  vi.resetAllMocks();
  m.pool.mockResolvedValue({ execute: m.execute });
  m.execute.mockResolvedValue([[]]);
});
it.each(cases)(
  "does not disguise unavailable storage as missing %s",
  async (_key, read) => {
    m.pool.mockResolvedValue(null);
    await expect(read()).rejects.toMatchObject({
      name: "KnowledgeStorageError",
      reason: "unavailable",
    });
    expect(m.execute).not.toHaveBeenCalled();
  }
);
it.each(cases)(
  "preserves actual empty %s with tenant-bound SQL",
  async (key, read, empty) => {
    expect(await read()).toEqual(empty);
    expect(m.execute.mock.calls[0][0]).toContain("merchant_id = ?");
    expect(m.execute.mock.calls[0][1]).toEqual(
      key === "section" ? [11, 20] : [20]
    );
  }
);
it.each(cases)(
  "propagates %s query failure without a second attempt",
  async (_key, read) => {
    m.execute.mockRejectedValue(new Error("synthetic unavailable query"));
    await expect(read()).rejects.toThrow("synthetic unavailable query");
    expect(m.execute).toHaveBeenCalledOnce();
  }
);
it.each([NaN, Infinity, -Infinity, 2.5])(
  "does not interpolate a non-integer history limit %s",
  async limit => {
    await expect(getChangelog(20, limit)).rejects.toThrow(
      "knowledge_history:invalid_limit"
    );
    expect(m.execute).not.toHaveBeenCalled();
  }
);
