import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  list: vi.fn(),
  read: vi.fn(),
  change: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./knowledge/page-workspace", () => ({
  listPageWorkspace: m.list,
  readPageWorkspace: m.read,
  changePageWorkspace: m.change,
}));
import { sariBrainRouter } from "./routers-sari-brain";
const caller = () =>
  sariBrainRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
    merchantId: 999,
  } as any);
beforeEach(() => {
  vi.clearAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner" });
  m.list.mockResolvedValue({
    saved: 2,
    enabled: 1,
    items: [],
    page: 1,
    totalPages: 1,
    total: 2,
  });
});
it.each(["owner", "manager", "viewer", "sales_supervisor"])(
  "scopes %s reads to resolved tenant",
  async role => {
    m.access.mockResolvedValue({ merchantId: 20, role });
    expect((await caller().pageWorkspace()).canManage).toBe(
      ["owner", "manager"].includes(role)
    );
    await caller().pageReview({ id: 4 });
    expect(m.read).toHaveBeenCalledWith(20, 4);
    expect(await caller().getWebsiteKnowledge()).toEqual({
      totalPages: 2,
      activePages: 1,
    });
  }
);
it.each(["viewer", "sales_supervisor"])(
  "blocks %s writes before storage",
  async role => {
    m.access.mockResolvedValue({ merchantId: 20, role });
    for (const name of [
      "changeWorkspacePage",
      "togglePageInBot",
      "deleteDiscoveredPage",
    ] as const)
      await expect(caller()[name]({} as any)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    expect(m.change).not.toHaveBeenCalled();
  }
);
it("requires explicit action, revision and acknowledgement", async () => {
  for (const patch of [
    { acknowledged: false },
    { expectedRevision: undefined },
    { action: undefined },
    { id: -1 },
  ])
    await expect(
      caller().changeWorkspacePage({
        id: 4,
        action: "delete",
        expectedRevision: "a".repeat(64),
        acknowledged: true,
        ...patch,
      } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect(m.change).not.toHaveBeenCalled();
});
it("scopes approved writes and retires blind legacy mutations", async () => {
  const input = {
    id: 4,
    action: "pause" as const,
    expectedRevision: "a".repeat(64),
    acknowledged: true as const,
  };
  await caller().changeWorkspacePage(input);
  expect(m.change).toHaveBeenCalledWith(20, input);
  for (const name of ["togglePageInBot", "deleteDiscoveredPage"] as const)
    await expect(
      caller()[name]({ pageId: 4, useInBot: false })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  expect(m.change).toHaveBeenCalledTimes(1);
});
it("fails closed and sanitizes read and write database errors", async () => {
  m.list.mockRejectedValue(Error("database secret"));
  m.read.mockRejectedValue(Error("database secret"));
  m.change.mockRejectedValue(Error("database secret"));
  await expect(caller().pageWorkspace()).rejects.toMatchObject({
    message: "Website knowledge unavailable",
  });
  await expect(caller().getWebsiteKnowledge()).rejects.toMatchObject({
    message: "Website knowledge unavailable",
  });
  await expect(caller().pageReview({ id: 4 })).rejects.toMatchObject({
    message: "Page review unavailable",
  });
  await expect(
    caller().changeWorkspacePage({
      id: 4,
      action: "pause",
      expectedRevision: "a".repeat(64),
      acknowledged: true,
    })
  ).rejects.toMatchObject({ message: "Page change could not be confirmed" });
});
