import { beforeEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ access: vi.fn(), read: vi.fn() }));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./knowledge/activity-readout", () => ({
  readKnowledgeActivity: m.read,
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
  m.access.mockResolvedValue({ merchantId: 20, role: "viewer" });
  m.read.mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    pageSize: 15,
    totalPages: 0,
    actionTypes: [],
    actionTypesTruncated: false,
  });
});
it("allows a verified viewer to read only the selected merchant", async () => {
  await caller().getActivityLog();
  expect(m.read).toHaveBeenCalledWith(20, undefined);
});
it.each([
  { page: 1.5 },
  { pageSize: 5.5 },
  { page: -1 },
  { pageSize: 100 },
  { actionType: "" },
  { actionType: "x".repeat(101) },
  { merchantId: 30 },
  { limit: 1.2 },
])("rejects invalid or overriding pagination/filter input %j", async input => {
  await expect(caller().getActivityLog(input as any)).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });
  expect(m.read).not.toHaveBeenCalled();
});
it("preserves validated exact filters and refuses database failures instead of inventing an empty feed", async () => {
  m.read.mockRejectedValue(Error("private schema details"));
  const call = caller().getActivityLog({
    page: 2,
    pageSize: 10,
    actionType: "products_deleted",
  });
  await expect(call).rejects.toMatchObject({
    code: "INTERNAL_SERVER_ERROR",
    message: "Knowledge activity is temporarily unavailable",
  });
  expect(m.read).toHaveBeenCalledWith(20, {
    page: 2,
    pageSize: 10,
    actionType: "products_deleted",
  });
});
it("refuses revoked membership before the reader", async () => {
  m.access.mockResolvedValue(null);
  await expect(caller().getActivityLog()).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  expect(m.read).not.toHaveBeenCalled();
});
it("preserves literal legacy filter values instead of interpolating or rewriting them", async () => {
  await caller().getActivityLog({ actionType: "' OR 1=1" });
  expect(m.read).toHaveBeenCalledWith(20, {
    page: 1,
    pageSize: 15,
    actionType: "' OR 1=1",
  });
});
