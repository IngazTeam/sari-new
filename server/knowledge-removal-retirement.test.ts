import { beforeEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  remove: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./knowledge/source-lifecycle", async original => ({
  ...(await original<typeof import("./knowledge/source-lifecycle")>()),
  removeKnowledgeSource: m.remove,
  resetKnowledgeSources: m.reset,
}));
import { appRouter } from "./routers";
const caller = () =>
  appRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
  } as any);
beforeEach(() => {
  vi.clearAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "manager" });
});
it.each(["deleteSource", "resetBrain", "deleteDocument"])(
  "retires %s before any legacy deletion",
  async method => {
    const c = caller();
    const run = () =>
      method === "deleteSource"
        ? c.sariBrain.deleteSource({
            sourceType: "products",
            sourceId: "products-20",
          })
        : method === "resetBrain"
          ? c.sariBrain.resetBrain()
          : c.knowledgeDocs.delete();
    await expect(run()).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(m.remove).not.toHaveBeenCalled();
    expect(m.reset).not.toHaveBeenCalled();
  }
);
