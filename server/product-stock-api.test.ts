import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ read: vi.fn(), access: vi.fn() }));
vi.mock("./product-stock", () => ({ readProductStock: m.read }));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
import { productsRouter } from "./routers-products";
const caller = (user: any = { id: 7 }) =>
  productsRouter.createCaller({
    user,
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "viewer" });
});
describe("stock API tenant boundary", () => {
  it("permits viewer reads only in the resolved tenant", async () => {
    m.read.mockResolvedValue({ total: 0 });
    await expect(caller().getLowStock()).resolves.toEqual({ total: 0 });
    expect(m.read).toHaveBeenCalledWith(20, {
      page: 1,
      pageSize: 20,
      search: "",
      kind: "all",
      state: "all",
    });
  });
  it("rejects unauthenticated access before reading stock", async () => {
    await expect(caller(null).getLowStock()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(m.read).not.toHaveBeenCalled();
  });
  it.each([
    { merchantId: 21 },
    { productId: 5 },
    { page: -1 },
    { pageSize: 101 },
    { state: "available" },
  ])("rejects unscoped or invalid filter %j", async input => {
    await expect(caller().getLowStock(input as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(m.read).not.toHaveBeenCalled();
  });
  it("does not reveal storage errors or return a misleading zero", async () => {
    m.read.mockRejectedValue(Error("Private SQL path and customer data"));
    await expect(caller().getLowStock()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Product stock unavailable",
    });
  });
});
