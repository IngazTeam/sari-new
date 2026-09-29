import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  list: vi.fn(),
  read: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./knowledge/website-reports", () => ({
  listWebsiteReports: m.list,
  readWebsiteReport: m.read,
  deleteReviewedWebsiteReport: m.remove,
}));
import { websiteAnalysisRouter } from "./routers-website-analysis";
import { estimatedScore, reportListInput } from "../shared/website-reports";
const caller = () =>
  websiteAnalysisRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
    merchantId: 999,
  } as any);
beforeEach(() => {
  vi.clearAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner" });
  m.list.mockResolvedValue({ items: [], total: 0, page: 1, totalPages: 1 });
});
it.each(["owner", "manager", "viewer", "sales_supervisor"])(
  "scopes %s report reads to resolved tenant",
  async role => {
    m.access.mockResolvedValue({ merchantId: 20, role });
    expect((await caller().reports()).canManage).toBe(
      ["owner", "manager"].includes(role)
    );
    await caller().report({ id: 3 });
    expect(m.read).toHaveBeenCalledWith(20, 3);
  }
);
it.each(["viewer", "sales_supervisor"])(
  "blocks %s writes before storage",
  async role => {
    m.access.mockResolvedValue({ merchantId: 20, role });
    for (const name of [
      "deleteReviewedReport",
      "deleteAnalysis",
      "analyze",
    ] as const)
      await expect(caller()[name]({} as any)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    expect(m.remove).not.toHaveBeenCalled();
  }
);
it("requires acknowledgement and current revision for deletion", async () => {
  for (const patch of [
    { acknowledged: false },
    { expectedRevision: undefined },
    { id: -1 },
  ])
    await expect(
      caller().deleteReviewedReport({
        id: 4,
        acknowledged: true,
        expectedRevision: "a".repeat(64),
        ...patch,
      } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(m.remove).not.toHaveBeenCalled();
  await caller().deleteReviewedReport({
    id: 4,
    acknowledged: true,
    expectedRevision: "a".repeat(64),
  });
  expect(m.remove).toHaveBeenCalledWith(20, expect.objectContaining({ id: 4 }));
});
it("retires the blind delete and rejects unacknowledged full analysis", async () => {
  await expect(caller().deleteAnalysis({ id: 4 })).rejects.toMatchObject({
    code: "PRECONDITION_FAILED",
  });
  await expect(
    caller().analyze({ url: "https://example.test" } as any)
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(m.remove).not.toHaveBeenCalled();
});
it("does not turn missing, invalid or unfinished scores into zero", () => {
  for (const status of ["pending", "analyzing", "failed"])
    expect(estimatedScore(80, status)).toBeNull();
  for (const value of [null, undefined, NaN, Infinity, -1, 101, "80"])
    expect(estimatedScore(value, "completed")).toBeNull();
  expect(estimatedScore(0, "completed")).toBe(0);
  expect(estimatedScore(100, "completed")).toBe(100);
});
it("bounds search and pagination", () => {
  expect(reportListInput.safeParse({ page: 0 }).success).toBe(false);
  expect(reportListInput.safeParse({ search: "x".repeat(201) }).success).toBe(
    false
  );
  expect(reportListInput.parse(undefined).page).toBe(1);
});
it("does not expose database error details to report clients", async () => {
  m.read.mockRejectedValue(Error("SELECT private_database_details"));
  await expect(caller().report({id:4})).rejects.toMatchObject({code:"INTERNAL_SERVER_ERROR",message:"Website report operation unavailable"});
});
