import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./order-workspace", () => ({
  readOrderWorkspace: m.list,
  readOrderDetail: m.detail,
}));
import { orderWorkspaceRouter } from "./routers-order-workspace";
const caller = () =>
  orderWorkspaceRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
    merchantId: 999,
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "viewer" });
  m.list.mockResolvedValue({ merchantId: 20, items: [] });
  m.detail.mockResolvedValue(null);
});
describe("order workspace membership and permission", () => {
  it("uses resolved membership instead of a context tenant and declares viewer capability", async () => {
    expect(await caller().list({})).toMatchObject({
      merchantId: 20,
      canManage: false,
    });
    expect(m.list).toHaveBeenCalledWith(20, {
      search: "",
      status: "all",
      payment: "all",
      page: 1,
    });
    expect(await caller().detail({ id: 2 })).toBeNull();
    expect(m.detail).toHaveBeenCalledWith(20, 2);
  });
  it.each(["owner", "manager", "sales_supervisor"])(
    "declares management for %s without performing a write",
    async role => {
      m.access.mockResolvedValue({ merchantId: 20, role });
      expect((await caller().list({})).canManage).toBe(true);
    }
  );
  it("denies roles without the read permission", async () => {
    m.access.mockResolvedValue({ merchantId: 20, role: "support_agent" });
    await expect(caller().list({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller().detail({ id: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(m.list).not.toHaveBeenCalled();
    expect(m.detail).not.toHaveBeenCalled();
  });
  it("rejects tenant injection and unsafe identifiers before the source", async () => {
    await expect(
      caller().list({ merchantId: 999 } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller().detail({ id: Number.MAX_SAFE_INTEGER + 1 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.list).not.toHaveBeenCalled();
    expect(m.detail).not.toHaveBeenCalled();
  });
  it("sanitizes source failure rather than returning empty success", async () => {
    m.list.mockRejectedValue(Error("SQL private"));
    m.detail.mockRejectedValue(Error("SQL private"));
    await expect(caller().list({})).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Orders unavailable",
    });
    await expect(caller().detail({ id: 1 })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Orders unavailable",
    });
  });
});
