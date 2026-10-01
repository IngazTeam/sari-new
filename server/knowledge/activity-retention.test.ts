import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ pool: vi.fn(), execute: vi.fn(), schema: vi.fn() }));
vi.mock("../db/connection", () => ({ getPool: m.pool }));
vi.mock("../db/schema-readiness", () => ({ assertRuntimeSchema: m.schema }));
import { purgeExpiredKnowledgeActivity, runKnowledgeActivityRetention } from "./activity-retention";
beforeEach(() => {
  vi.clearAllMocks();
  m.pool.mockResolvedValue({ execute: m.execute });
  m.schema.mockResolvedValue(undefined);
  m.execute.mockResolvedValue([{ affectedRows: 2 }]);
});
it.each([undefined, {}, { merchantId: 0 }, { merchantId: 1.5 }, { allMerchants: false }, { merchantId: 3, allMerchants: true }])("rejects an absent or ambiguous maintenance scope %j", async scope => {
  await expect(purgeExpiredKnowledgeActivity(scope as any)).rejects.toThrow();
  expect(m.execute).not.toHaveBeenCalled();
});
it.each([0, -1, 1.5, 1001, NaN])("rejects an invalid batch %s", async limit => {
  await expect(purgeExpiredKnowledgeActivity({ merchantId: 3 }, limit)).rejects.toThrow();
  expect(m.execute).not.toHaveBeenCalled();
});
it("keeps merchant scope parameterized and expiration on the database clock", async () => {
  expect(await purgeExpiredKnowledgeActivity({ merchantId: 3 }, 10)).toBe(2);
  const [sql, args] = m.execute.mock.calls[0];
  expect(args).toEqual([3]);
  expect(sql).toContain("merchant_id=? AND");
  expect(sql).toContain("created_at < TIMESTAMPADD(DAY,-90,UTC_TIMESTAMP())");
  expect(sql).toContain("ORDER BY id LIMIT 10");
  expect(sql).not.toContain("knowledge_sections");
});
it("does not silently treat missing storage or schema as a successful cleanup", async () => {
  m.pool.mockResolvedValue(null);
  await expect(purgeExpiredKnowledgeActivity({ merchantId: 3 })).rejects.toThrow();
  m.schema.mockRejectedValue(Error("schema"));
  await expect(purgeExpiredKnowledgeActivity({ merchantId: 3 })).rejects.toThrow("schema");
  expect(m.execute).not.toHaveBeenCalled();
});
it("prevents overlapping cron batches and releases the guard after failure", async () => {
  let reject!: (error: Error) => void;
  m.execute.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
  const first = runKnowledgeActivityRetention();
  const rejected = expect(first).rejects.toThrow("interrupted");
  await vi.waitFor(() => expect(m.execute).toHaveBeenCalledTimes(1));
  expect(await runKnowledgeActivityRetention()).toBe(0);
  reject(Error("interrupted"));
  await rejected;
  expect(await runKnowledgeActivityRetention()).toBe(2);
  expect(m.execute).toHaveBeenCalledTimes(2);
  expect(m.execute.mock.calls[1][0]).not.toContain("merchant_id=?");
  expect(m.execute.mock.calls[1][0]).toContain("LIMIT 500");
});
