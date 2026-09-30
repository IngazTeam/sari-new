import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  merchant: vi.fn(),
  list: vi.fn(),
  count: vi.fn(),
  getProduct: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  pool: vi.fn(),
  reviewedDelete: vi.fn(),
}));
vi.mock("./product-delete", () => ({
  deleteReviewedProducts: mocks.reviewedDelete,
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: mocks.access,
}));
vi.mock("./product-catalog", () => ({ readProductCatalog: mocks.list }));
vi.mock("./db", () => ({
  getMerchantById: mocks.merchant,
  getProductsByMerchantId: mocks.list,
  getProductCountByMerchantId: mocks.count,
  getProductById: mocks.getProduct,
  updateProduct: mocks.update,
  deleteProduct: mocks.remove,
  getPool: mocks.pool,
}));
import { productsRouter } from "./routers-products";
const caller = () =>
  productsRouter.createCaller({ user: { id: 7 }, req: {}, res: {} } as any);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({
    merchantId: 20,
    memberId: 3,
    role: "manager",
  });
  mocks.merchant.mockResolvedValue({ id: 20 });
  mocks.list.mockResolvedValue({
    items: [
      { id: 1, name: "Same name", stock: 0 },
      { id: 2, name: "Same name", stock: 0 },
    ],
  });
  mocks.count.mockResolvedValue(2);
});
describe("product reads and team permissions", () => {
  it("lists stock-zero and same-name products without repairing or deleting anything", async () => {
    mocks.access.mockResolvedValue({
      merchantId: 20,
      memberId: 3,
      role: "viewer",
    });
    const result = await caller().list({ page: 1, pageSize: 10 });
    expect(result.items).toHaveLength(2);
    expect(result.items.map(item => item.stock)).toEqual([0, 0]);
    expect(mocks.list).toHaveBeenCalledWith(20, {
      page: 1,
      pageSize: 10,
      search: "",
      status: "all",
      inventory: "all",
      price: "all",
    });
    expect(result.canManage).toBe(false);
    expect(mocks.pool).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it("does not turn a catalog failure into an empty success or expose database details", async () => {
    mocks.list.mockRejectedValueOnce(Error("private database query"));
    await expect(caller().list()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Product catalog unavailable",
    });
  });
  it.each([
    { page: 1.5 },
    { page: 100001 },
    { pageSize: 0 },
    { pageSize: 1.5 },
    { pageSize: 101 },
    { merchantId: 30 },
  ])("rejects invalid list input %j before reading", async input => {
    await expect(caller().list(input as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("rejects viewer writes before loading a product", async () => {
    mocks.access.mockResolvedValue({
      merchantId: 20,
      memberId: 3,
      role: "viewer",
    });
    await expect(
      caller().editor.deleteWrite({
        ids: [1],
        reviewed: true,
        requestId: "11111111-1111-4111-8111-111111111111",
        expectedDigest: "a".repeat(64),
      })
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.getProduct).not.toHaveBeenCalled();
  });
  it("lets a manager mutate their own product without needing merchants.userId ownership", async () => {
    const input = {
      ids: [1],
      reviewed: true as const,
      requestId: "11111111-1111-4111-8111-111111111111",
      expectedDigest: "a".repeat(64),
    };
    mocks.reviewedDelete.mockResolvedValue({ requestId: input.requestId });
    await expect(caller().editor.deleteWrite(input)).resolves.toEqual({
      requestId: input.requestId,
    });
    expect(mocks.reviewedDelete).toHaveBeenCalledWith(20, 7, input);
  });
  it("blocks cross-tenant compatibility reads before side effects", async () => {
    mocks.getProduct.mockResolvedValue({ id: 1, merchantId: 30 });
    for (const request of [caller().getById({ productId: 1 })]) {
      await expect(request).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
