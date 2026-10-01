import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ pool: vi.fn(), query: vi.fn(), execute: vi.fn(), beginTransaction: vi.fn(), rollback: vi.fn(), commit: vi.fn(), release: vi.fn(), destroy: vi.fn() }));
vi.mock("../db/connection", () => ({ getPool: m.pool }));
import { readKnowledgeSourceGroups } from "./source-groups";
beforeEach(() => {
  vi.resetAllMocks();
  m.pool.mockResolvedValue({ getConnection: async () => m });
  m.execute.mockRejectedValue(Error('private query failure'));
});
it.each([0,-1,1.5,NaN,2147483648])("rejects invalid merchant %s before storage", async id => {
  await expect(readKnowledgeSourceGroups(id)).rejects.toThrow();
  expect(m.pool).not.toHaveBeenCalled();
});
it("fails explicitly on unavailable storage", async () => {
  m.pool.mockResolvedValue(null);
  await expect(readKnowledgeSourceGroups(3)).rejects.toThrow('unavailable');
});
it("requests a coherent read-only snapshot and rolls back failures instead of returning zero counts", async () => {
  await expect(readKnowledgeSourceGroups(3)).rejects.toThrow('query failure');
  expect(m.query.mock.calls.map(c=>c[0])).toEqual(['SET TRANSACTION ISOLATION LEVEL REPEATABLE READ','SET TRANSACTION READ ONLY']);
  expect(m.beginTransaction).toHaveBeenCalledOnce();
  expect(m.execute.mock.calls[0][1]).toEqual([3]);
  expect(m.rollback).toHaveBeenCalledOnce();
  expect(m.commit).not.toHaveBeenCalled();
  expect(m.release).toHaveBeenCalledOnce();
});
it("discards a connection that cannot roll back", async () => {
  m.rollback.mockRejectedValue(Error('disconnected'));
  await expect(readKnowledgeSourceGroups(3)).rejects.toThrow();
  expect(m.destroy).toHaveBeenCalledOnce();
  expect(m.release).not.toHaveBeenCalled();
});
