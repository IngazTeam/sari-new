import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ pool: vi.fn() }));
vi.mock("./db/connection", () => ({ getPool: m.pool }));
import {
  readCompetitorWorkspace,
  readCompetitorDetail,
} from "./competitor-workspace";
import {
  competitorSelection,
  competitorDetailSelection,
} from "../shared/competitor-workspace";
beforeEach(() => vi.resetAllMocks());
function tx() {
  const t = {
    query: vi.fn(),
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    destroy: vi.fn(),
    execute: vi.fn(),
  };
  t.execute
    .mockResolvedValueOnce([[{ id: 2, userId: 7, status: "active" }]])
    .mockResolvedValueOnce([[{ id: 7, account_status: "active" }]])
    .mockResolvedValueOnce([[]])
    .mockResolvedValueOnce([
      [{ total: 0, completed: 0, running: 0, failed: 0 }],
    ])
    .mockResolvedValueOnce([[{ total: 0 }]])
    .mockResolvedValueOnce([[]]);
  m.pool.mockResolvedValue({ getConnection: vi.fn().mockResolvedValue(t) });
  return t;
}
it.each([
  { merchantId: 4 },
  { actorId: 5 },
  { role: "owner" },
  { page: 0 },
  { page: 1.5 },
  { page: 100001 },
  { query: "x".repeat(201) },
  { sort: "DROP" },
  { state: "unknown" },
])("rejects forged scope and invalid selection %j", input =>
  expect(competitorSelection.safeParse(input).success).toBe(false)
);
it.each([
  { id: 0 },
  { id: 1, merchantId: 7 },
  { id: 2147483648 },
  { id: 1, productPage: 0 },
])("rejects invalid detailed selection %j", input =>
  expect(competitorDetailSelection.safeParse(input).success).toBe(false)
);
it.each([0, -1, NaN, 1.2, 2147483648])(
  "rejects invalid direct actor before database access %s",
  async actor => {
    await expect(readCompetitorWorkspace(actor, 2, {})).rejects.toMatchObject({
      reason: "forbidden",
    });
    expect(m.pool).not.toHaveBeenCalled();
  }
);
it("commits and releases successful empty reads", async () => {
  const t = tx();
  expect(await readCompetitorWorkspace(7, 2, {})).toMatchObject({
    rows: [],
    canManage: true,
  });
  expect(t.commit).toHaveBeenCalledOnce();
  expect(t.release).toHaveBeenCalledOnce();
});
it("destroys connections when commit outcome is uncertain", async () => {
  const t = tx();
  t.commit.mockRejectedValue(new Error("PRIVATE_SQL"));
  await expect(readCompetitorWorkspace(7, 2, {})).rejects.toMatchObject({
    message: "competitor_workspace:unavailable",
  });
  expect(t.destroy).toHaveBeenCalledOnce();
  expect(t.release).not.toHaveBeenCalled();
  expect(t.rollback).not.toHaveBeenCalled();
});
it("rolls back query failure and destroys connections when rollback fails", async () => {
  const t = tx();
  t.execute.mockReset().mockRejectedValue(new Error("PRIVATE_SQL"));
  t.rollback.mockRejectedValue(new Error("PRIVATE_SQL"));
  await expect(readCompetitorWorkspace(7, 2, {})).rejects.toMatchObject({
    message: "competitor_workspace:unavailable",
  });
  expect(t.destroy).toHaveBeenCalledOnce();
});
it("never reports database outage as an empty workspace or missing detail", async () => {
  m.pool.mockResolvedValue(null);
  await expect(readCompetitorWorkspace(7, 2, {})).rejects.toMatchObject({
    reason: "unavailable",
  });
  await expect(readCompetitorDetail(7, 2, { id: 1 })).rejects.toMatchObject({
    reason: "unavailable",
  });
});
