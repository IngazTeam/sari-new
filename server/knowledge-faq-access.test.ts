import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  change: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: mocks.access,
}));
vi.mock("./knowledge/faq-workspace", () => ({
  listFaqWorkspace: mocks.list,
  createWorkspaceFaq: mocks.create,
  changeWorkspaceFaq: mocks.change,
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
  mocks.list.mockResolvedValue({ items: [], total: 0, page: 1, totalPages: 1 });
});
it.each(["owner", "manager", "viewer", "sales_supervisor"])(
  "scopes %s reads and advertises the correct editing permission",
  async role => {
    mocks.access.mockResolvedValue({ merchantId: 20, role });
    expect((await caller().faqWorkspace()).canManage).toBe(
      ["owner", "manager"].includes(role)
    );
    expect(mocks.list).toHaveBeenCalledWith(20, {
      search: "",
      status: "all",
      page: 1,
    });
  }
);
it.each(["viewer", "sales_supervisor"])(
  "blocks %s writes before storage work",
  async role => {
    mocks.access.mockResolvedValue({ merchantId: 20, role });
    for (const action of ["createFaq", "updateFaq", "deleteFaq"] as const)
      await expect((caller()[action] as any)({})).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.change).not.toHaveBeenCalled();
  }
);
it("scopes writes to resolved membership", async () => {
  await caller().createFaq({ question: "Question", answer: "Answer" });
  expect(mocks.create).toHaveBeenCalledWith(20, {
    question: "Question",
    answer: "Answer",
  });
});
it("fails closed without leaking database details", async () => {
  mocks.list.mockRejectedValue(Error("Secret connection string"));
  await expect(caller().faqWorkspace()).rejects.toMatchObject({
    code: "INTERNAL_SERVER_ERROR",
    message: "FAQ workspace unavailable",
  });
});
it("does not leak storage details from mutations", async () => {
  mocks.create.mockRejectedValue(Error("Secret connection string"));
  await expect(
    caller().createFaq({ question: "Question", answer: "Answer" })
  ).rejects.toMatchObject({
    code: "INTERNAL_SERVER_ERROR",
    message: "FAQ result could not be confirmed",
  });
});
