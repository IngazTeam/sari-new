import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
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
