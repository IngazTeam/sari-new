import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  receipt: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./product-details", () => ({
  readProductDetails: m.read,
  writeProductDetail: m.write,
  readProductDetailReceipt: m.receipt,
}));
import { productDetailsRouter } from "./routers-product-details";
import { ProductDetailPlanFailure } from "../shared/product-details";
import {
  ProductEditorConflict,
  ProductEditorLocked,
  ProductEditorForbidden,
  ProductEditorMissing,
} from "./product-editor";
const requestId = "22222222-2222-4222-8222-222222222222";
const input = {
  kind: "option_create" as const,
  productId: 3,
  requestId,
  reviewed: true as const,
  expectedDigest: "a".repeat(64),
  fields: { name: "Size", nameEn: null, values: ["S", "L"], sortOrder: 0 },
};
const caller = (user: any = { id: 9 }) =>
  productDetailsRouter.createCaller({
    user,
    req: { headers: { "x-merchant-id": "7" } },
    res: {},
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 7, role: "manager" });
});
describe("product detail API authority", () => {
  it("resolves the selected tenant and actor for every operation", async () => {
    await caller().read({ productId: 3 });
    await caller().write(input);
    await caller().receipt({ requestId });
    expect(m.read).toHaveBeenCalledWith(7, 9, { productId: 3 });
    expect(m.write).toHaveBeenCalledWith(7, 9, input);
    expect(m.receipt).toHaveBeenCalledWith(7, 9, { requestId });
  });
  it("permits viewer reads but denies writes and anonymous reads", async () => {
    m.access.mockResolvedValue({ merchantId: 7, role: "viewer" });
    await caller().read({ productId: 3 });
    await expect(caller().write(input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller(null).read({ productId: 3 })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(m.write).not.toHaveBeenCalled();
  });
  it.each([
    { merchantId: 8 },
    { productId: -1 },
    { reviewed: false },
    { expectedDigest: "bad" },
    { fields: { ...input.fields, values: [] } },
  ])("rejects invalid request %j", async patch => {
    await expect(
      caller().write({ ...input, ...patch } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.write).not.toHaveBeenCalled();
  });
  it.each([
    [new ProductEditorConflict(), "CONFLICT"],
    [new ProductEditorLocked(), "PRECONDITION_FAILED"],
    [new ProductEditorForbidden(), "FORBIDDEN"],
    [new ProductEditorMissing(), "NOT_FOUND"],
    [new Error("private database string"), "INTERNAL_SERVER_ERROR"],
  ] as const)("sanitizes storage errors", async (error, code) => {
    m.write.mockRejectedValue(error);
    await expect(caller().write(input)).rejects.toMatchObject({
      code,
      message: "Product details unavailable",
    });
  });
  it("returns only a bounded plan reason", async () => {
    m.write.mockRejectedValue(new ProductDetailPlanFailure("in_use"));
    await expect(caller().write(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "product-detail:in_use",
    });
  });
});
