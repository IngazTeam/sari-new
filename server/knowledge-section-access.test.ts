import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  list: vi.fn(),
  read: vi.fn(),
  health: vi.fn(),
  create: vi.fn(),
  change: vi.fn(),
  receipt: vi.fn(),
  index: vi.fn(async () => "unconfirmed"),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: mocks.access,
}));
vi.mock("./knowledge/section-workspace", () => ({
  listSectionWorkspace: mocks.list,
  readSectionWorkspace: mocks.read,
  sectionReadiness: mocks.health,
  createWorkspaceSection: mocks.create,
  changeWorkspaceSection: mocks.change,
  readSectionCreation: mocks.receipt,
}));
vi.mock("./knowledge/conflict-indexing", () => ({
  indexApprovedConflict: mocks.index,
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
  mocks.access.mockResolvedValue({ merchantId: 20, role: "owner" });
  mocks.list.mockResolvedValue({ items: [], page: 1, totalPages: 1, total: 0 });
  mocks.create.mockResolvedValue({ success: true, id: 3 });
});
it.each(["owner", "manager", "viewer", "sales_supervisor"])(
  "scopes %s reads and readiness",
  async role => {
    mocks.access.mockResolvedValue({ merchantId: 20, role });
    expect((await caller().sectionWorkspace()).canManage).toBe(
      ["owner", "manager"].includes(role)
    );
    await caller().sectionReview({ id: 5 });
    await caller().getHealthScore();
    expect(mocks.read).toHaveBeenCalledWith(20, 5);
    expect(mocks.health).toHaveBeenCalledWith(20);
    expect(mocks.list).toHaveBeenCalledWith(20, {
      search: "",
      type: "all",
      state: "all",
      page: 1,
    });
  }
);
it.each(["viewer", "sales_supervisor"])(
  "blocks %s writes before storage",
  async role => {
    mocks.access.mockResolvedValue({ merchantId: 20, role });
    for (const name of [
      "createWorkspaceSection",
      "updateWorkspaceSection",
      "deleteWorkspaceSection",
    ] as const)
      await expect((caller()[name] as any)({})).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.change).not.toHaveBeenCalled();
  }
);
it("scopes a saved creation and does not turn an indexing failure into save failure", async () => {
  expect(
    await caller().createWorkspaceSection({
      title: "Title",
      content: "Text",
      sectionType: "custom",
      parentId: null,
      useInBot: true,
      requestId: "a56f25af-4b44-4f29-baa9-15a3874e7a87",
      acknowledged: true,
    })
  ).toMatchObject({ success: true, id: 3, indexing: "unconfirmed" });
  expect(mocks.create.mock.calls[0][0]).toBe(20);
});
it("rejects blind updates and deletions", async () => {
  for (const name of [
    "updateWorkspaceSection",
    "deleteWorkspaceSection",
  ] as const)
    await expect((caller()[name] as any)({ id: 3 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  expect(mocks.change).not.toHaveBeenCalled();
});
it.each(["saved", "changed", "deleted"])(
  "does not reindex a %s replay",
  async state => {
    mocks.create.mockResolvedValue({
      success: true,
      id: 3,
      replayed: true,
      state,
    });
    const result = await caller().createWorkspaceSection({
      title: "Title",
      content: "Text",
      useInBot: true,
      sectionType: "custom",
      parentId: null,
      requestId: "a56f25af-4b44-4f29-baa9-15a3874e7a87",
      acknowledged: true,
    });
    expect(result.indexing).toBe("not_requested");
    expect(mocks.index).not.toHaveBeenCalled();
  }
);
it("scopes receipt reads to authenticated merchant and redacts storage failures", async () => {
  const requestId = "a56f25af-4b44-4f29-baa9-15a3874e7a87";
  mocks.receipt.mockResolvedValue({ state: "deleted", id: 3 });
  expect(await caller().sectionCreationReceipt({ requestId })).toEqual({
    state: "deleted",
    id: 3,
  });
  expect(mocks.receipt).toHaveBeenCalledWith(20, requestId);
  mocks.receipt.mockRejectedValue(Error("Secret DB"));
  await expect(
    caller().sectionCreationReceipt({ requestId })
  ).rejects.toMatchObject({ message: "Section creation receipt unavailable" });
});
it.each(["viewer", "sales_supervisor"])(
  "blocks %s receipt access",
  async role => {
    mocks.access.mockResolvedValue({ merchantId: 20, role });
    await expect(
      caller().sectionCreationReceipt({
        requestId: "a56f25af-4b44-4f29-baa9-15a3874e7a87",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.receipt).not.toHaveBeenCalled();
  }
);
it("redacts read and readiness failures instead of returning zeros or empty lists", async () => {
  mocks.list.mockRejectedValue(Error("Database secret"));
  mocks.health.mockRejectedValue(Error("Database secret"));
  await expect(caller().sectionWorkspace()).rejects.toMatchObject({
    message: "Knowledge sections unavailable",
  });
  await expect(caller().getHealthScore()).rejects.toMatchObject({
    message: "Knowledge readiness unavailable",
  });
});
