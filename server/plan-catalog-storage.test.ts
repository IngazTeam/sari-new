import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ authority: vi.fn(), execute: vi.fn() }));
vi.mock("./accounts/merchant-settings-authority", () => ({
  withMerchantOwnerSettings: m.authority,
}));
import { readPlanCatalogWorkspace } from "./subscriptions/plan-catalog-workspace";
beforeEach(() => {
  vi.resetAllMocks();
  m.authority.mockImplementation((_actor, _tenant, _write, work) =>
    work({ execute: m.execute }, { canManage: false })
  );
  m.execute
    .mockResolvedValueOnce([[{ now: "2026-10-04 12:00:00.000" }]])
    .mockResolvedValueOnce([[]]);
});
it("returns a confirmed empty list with live identity and a database timestamp", async () => {
  expect(await readPlanCatalogWorkspace(7, 20)).toEqual({
    actorId: 7,
    merchantId: 20,
    canManage: false,
    checkedAt: "2026-10-04T12:00:00.000Z",
    plans: [],
  });
  expect(m.authority).toHaveBeenCalledWith(7, 20, false, expect.any(Function));
});
it("does not disguise a failed list query as an empty catalog", async () => {
  m.execute
    .mockReset()
    .mockResolvedValueOnce([[{ now: "2026-10-04 12:00:00" }]])
    .mockRejectedValueOnce(Error("Storage unavailable"));
  await expect(readPlanCatalogWorkspace(7, 20)).rejects.toThrow(
    "Storage unavailable"
  );
});
it.each([null, "invalid", "2026-02-30 12:00:00"])(
  "does not invent a source timestamp for %s",
  async now => {
    m.execute.mockReset().mockResolvedValueOnce([[{ now }]]);
    await expect(readPlanCatalogWorkspace(7, 20)).rejects.toThrow(
      "plan_catalog:unavailable"
    );
    expect(m.execute).toHaveBeenCalledOnce();
  }
);
it("rejects a malformed result envelope", async () => {
  m.execute
    .mockReset()
    .mockResolvedValueOnce([[{ now: "2026-10-04 12:00:00" }]])
    .mockResolvedValueOnce([null]);
  await expect(readPlanCatalogWorkspace(7, 20)).rejects.toThrow(
    "plan_catalog:unavailable"
  );
});
