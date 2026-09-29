import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  inventory: vi.fn(),
  create: vi.fn(),
  change: vi.fn(),
  embed: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./knowledge/source-inventory", () => ({
  readKnowledgeSourceInventory: m.inventory,
}));
vi.mock("./knowledge/section-workspace", () => ({
  createWorkspaceSection: m.create,
  changeWorkspaceSection: m.change,
  listSectionWorkspace: vi.fn(),
  readSectionWorkspace: vi.fn(),
  sectionReadiness: vi.fn(),
}));
vi.mock("./knowledge/conflict-indexing", () => ({
  indexApprovedConflict: m.embed,
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
  m.inventory.mockResolvedValue({ documents: { total: 0 } });
});
it.each(["owner", "manager", "viewer", "sales_supervisor"])(
  "scopes %s source counts to authenticated tenant",
  async role => {
    m.access.mockResolvedValue({ merchantId: 20, role });
    await caller().getSourceInventory();
    expect(m.inventory).toHaveBeenCalledWith(20);
  }
);
it("redacts an inventory failure instead of fabricating zero counts", async () => {
  m.inventory.mockRejectedValue(Error("secret database location"));
  await expect(caller().getSourceInventory()).rejects.toMatchObject({
    code: "INTERNAL_SERVER_ERROR",
    message: "Source inventory unavailable",
  });
});
it.each(["createSection", "updateSection", "deleteSection"] as const)(
  "retires %s for managers and owners even with plausible legacy input",
  async name => {
    for (const role of ["owner", "manager"]) {
      m.access.mockResolvedValue({ merchantId: 20, role });
      await expect(
        caller()[name]({
          sectionId: 42,
          sectionType: "custom",
          title: "Legacy",
          content: "Unreviewed",
          status: "approved",
          useInBot: true,
        })
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    }
    expect(m.create).not.toHaveBeenCalled();
    expect(m.change).not.toHaveBeenCalled();
    expect(m.embed).not.toHaveBeenCalled();
  }
);
it.each(["createSection", "updateSection", "deleteSection"] as const)(
  "authorizes %s before disclosing its retirement message",
  async name => {
    m.access.mockResolvedValue({ merchantId: 20, role: "viewer" });
    await expect(caller()[name]({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  }
);
it("denies source metadata after access is revoked", async () => {
  m.access.mockResolvedValue(null);
  await expect(caller().getSourceInventory()).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  expect(m.inventory).not.toHaveBeenCalled();
});
