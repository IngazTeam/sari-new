import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
  receipt: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: mocks.access,
}));
vi.mock("./product-editor", async original => ({
  ...(await original<typeof import("./product-editor")>()),
  readProductEditor: mocks.read,
  writeProductEditor: mocks.write,
  readProductEditorReceipt: mocks.receipt,
}));
import { productEditorRouter } from "./routers-product-editor";
import { productEditorWrite } from "../shared/product-editor";
import {
  ProductEditorConflict,
  ProductEditorForbidden,
  ProductEditorMissing,
  ProductEditorLocked,
  ProductEditorInvalid,
} from "./product-editor";
const requestId = "00000000-0000-4000-8000-000000000079";
const fields = {
  name: "منتج",
  description: null,
  price: "0",
  currency: "SAR",
  imageUrl: null,
  stock: 0,
  sku: null,
  barcode: null,
  compareAtPrice: null,
  costPrice: null,
  weight: null,
  category: null,
  categoryId: null,
  tags: null,
  productType: "physical",
  status: "active",
  lowStockAlert: 5,
  trackInventory: 1,
};
const create = () => ({ kind: "create", requestId, fields });
const caller = (user: any = { id: 7 }) =>
  productEditorRouter.createCaller({
    user,
    req: {},
    res: {},
    merchantId: 999,
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({
    merchantId: 20,
    memberId: 3,
    role: "manager",
  });
});
describe("product editor contracts", () => {
  it("uses current membership and actor, accepts a free price and explicit nulls", async () => {
    await caller().write(create() as any);
    expect(mocks.write).toHaveBeenCalledWith(20, 7, create());
  });
  it("accepts a patch without forcing historical price verification", () => {
    expect(
      productEditorWrite.parse({
        kind: "update",
        requestId,
        id: 1,
        expectedDigest: "a".repeat(64),
        fields: { description: null, name: "Changed" },
      })
    ).toMatchObject({ fields: { description: null } });
  });
  it.each([
    { name: " " },
    { name: "a".repeat(256) },
    { price: "1.005" },
    { price: "NaN" },
    { price: "-1" },
    { price: "21474836.48" },
    { imageUrl: "javascript:alert(1)" },
    { imageUrl: "data:text/html,hi" },
    { stock: -1 },
    { stock: 1.5 },
    { trackInventory: 2 },
    { lowStockAlert: 1.5 },
    { lowStockAlert: 100000 },
    { sku: "x".repeat(101) },
    { categoryId: 1.5 },
    { tags: "bad\u0000value" },
    { productType: "bad" },
    { status: "deleted" },
  ])("rejects invalid fields before writing %j", async patch => {
    await expect(
      caller().write({ ...create(), fields: { ...fields, ...patch } } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it.each([
    {
      kind: "update",
      requestId,
      id: 1,
      expectedDigest: "a".repeat(64),
      fields: {},
    },
    {
      kind: "update",
      requestId,
      id: 1,
      expectedDigest: "a".repeat(64),
      fields: { name: undefined },
    },
    { ...create(), merchantId: 30 },
    { ...create(), requestId: "same" },
  ])("rejects empty patches and untrusted scope %j", async input => {
    await expect(caller().write(input as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("blocks anonymous access and viewer writes, but permits scoped viewer reads", async () => {
    await expect(caller(null).read({ id: 1 })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    mocks.access.mockResolvedValue({
      merchantId: 20,
      memberId: 3,
      role: "viewer",
    });
    await expect(caller().write(create() as any)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.write).not.toHaveBeenCalled();
    await caller().read({ id: 1 });
    expect(mocks.read).toHaveBeenCalledWith(20, 7, { id: 1 });
    await caller().receipt({ requestId });
    expect(mocks.receipt).toHaveBeenCalledWith(20, 7, { requestId });
  });
  it.each([
    [ProductEditorConflict, "CONFLICT"],
    [ProductEditorForbidden, "FORBIDDEN"],
    [ProductEditorMissing, "NOT_FOUND"],
    [ProductEditorLocked, "PRECONDITION_FAILED"],
    [ProductEditorInvalid, "BAD_REQUEST"],
    [Error, "INTERNAL_SERVER_ERROR"],
  ] as const)(
    "maps %s without exposing storage details",
    async (ErrorType, code) => {
      mocks.write.mockRejectedValue(new ErrorType("private SQL"));
      await expect(caller().write(create() as any)).rejects.toMatchObject({
        code,
        message: "Product editor unavailable",
      });
    }
  );
});
