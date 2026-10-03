import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  remove: vi.fn(),
  access: vi.fn(),
  read: vi.fn(),
  detail: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./competitor-workspace", async original => ({
  ...(await original<typeof import("./competitor-workspace")>()),
  readCompetitorWorkspace: m.read,
  readCompetitorDetail: m.detail,
  deleteReviewedCompetitor: m.remove,
}));
import { router } from "./_core/trpc";
import { competitorReadProcedures } from "./routers-competitor-workspace";
import { CompetitorWorkspaceError } from "./competitor-workspace";
const caller = () =>
  router(competitorReadProcedures).createCaller({
    user: { id: 7, role: "user" },
    req: { headers: {} },
    res: {},
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "viewer" });
  m.read.mockResolvedValue({ rows: [] });
  m.detail.mockResolvedValue({ report: { id: 8 } });
});
it("forwards authenticated actor and server-selected merchant for reads", async () => {
  await caller().competitorWorkspace({ query: " sample " });
  await caller().competitorDetail({ id: 8 });
  expect(m.read).toHaveBeenCalledWith(7, 20, {
    query: "sample",
    state: "all",
    sort: "newest",
    page: 1,
  });
  expect(m.detail).toHaveBeenCalledWith(7, 20, { id: 8, productPage: 1 });
});
it("rejects client scope injection without reading", async () => {
  await expect(
    caller().competitorWorkspace({ merchantId: 30 } as any)
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(m.read).not.toHaveBeenCalled();
});
it.each([
  ["forbidden", "FORBIDDEN"],
  ["missing", "NOT_FOUND"],
  ["unavailable", "INTERNAL_SERVER_ERROR"],
] as const)("maps %s without private data", async (reason, code) => {
  m.detail.mockRejectedValue(new CompetitorWorkspaceError(reason));
  await expect(caller().competitorDetail({ id: 8 })).rejects.toMatchObject({
    code,
    message: "competitor_workspace:unavailable",
  });
});
it("maps unknown failures to static error text", async () => {
  m.read.mockRejectedValue(new Error("PRIVATE_SQL_CONNECTION"));
  await expect(caller().competitorWorkspace({})).rejects.toMatchObject({
    code: "INTERNAL_SERVER_ERROR",
    message: "competitor_workspace:unavailable",
  });
});
const deletion = {
  id: 8,
  expectedRevision: "a".repeat(64),
  acknowledged: true as const,
};
it.each(["viewer", "sales_supervisor"])(
  "denies deletion for %s before touching storage",
  async role => {
    m.access.mockResolvedValue({ merchantId: 20, role });
    await expect(
      caller().deleteReviewedCompetitor(deletion)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(m.remove).not.toHaveBeenCalled();
  }
);
it.each([
  { ...deletion, acknowledged: false },
  { ...deletion, expectedRevision: "bad" },
  { ...deletion, merchantId: 30 },
])("rejects unreviewed or forged deletion %j", async value => {
  m.access.mockResolvedValue({ merchantId: 20, role: "owner" });
  await expect(
    caller().deleteReviewedCompetitor(value as any)
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(m.remove).not.toHaveBeenCalled();
});
it.each([
  ["stale", "CONFLICT"],
  ["running", "PRECONDITION_FAILED"],
  ["reference", "PRECONDITION_FAILED"],
] as const)("maps deletion %s", async (reason, code) => {
  m.access.mockResolvedValue({ merchantId: 20, role: "owner" });
  m.remove.mockRejectedValue(new CompetitorWorkspaceError(reason));
  await expect(
    caller().deleteReviewedCompetitor(deletion)
  ).rejects.toMatchObject({ code, message: "competitor_workspace:" + reason });
});
it("passes only server scope and the reviewed revision to deletion", async () => {
  m.access.mockResolvedValue({ merchantId: 20, role: "manager" });
  m.remove.mockResolvedValue({ success: true });
  await caller().deleteReviewedCompetitor(deletion);
  expect(m.remove).toHaveBeenCalledWith(7, 20, deletion);
});
