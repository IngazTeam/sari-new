import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  connection: vi.fn(),
  list: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./product-sheet-source", async original => ({
  ...(await original<typeof import("./product-sheet-source")>()),
  readProductSheetConnection: m.connection,
  listProductSheetSource: m.list,
}));
vi.mock("./api/distributed-rate-limit", () => ({
  reserveApiRateLimit: m.limit,
}));
import { productSheetRouter } from "./routers-product-sheet";
import {
  ProductEditorConflict,
  ProductEditorForbidden,
  ProductEditorLocked,
} from "./product-editor";
import { ProductSheetProviderError } from "./product-sheet-provider";
import { ProductSheetDisconnected } from "./product-sheet-source";
const input = { expectedSourceDigest: "a".repeat(64) };
const caller = (user: any = { id: 7 }) =>
  productSheetRouter.createCaller({
    user,
    req: {},
    res: {},
    merchantId: 999,
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, memberId: 3, role: "manager" });
  m.limit.mockResolvedValue({ allowed: true });
});
describe("product Sheet connection boundaries", () => {
  it("resolves the current tenant and actor instead of supplied context identity", async () => {
    await caller().connection();
    await caller().list(input);
    expect(m.connection).toHaveBeenCalledWith(20, 7);
    expect(m.list).toHaveBeenCalledWith(20, 7, input);
    expect(m.limit).toHaveBeenCalledWith(
      expect.objectContaining({ identity: "20", maxRequests: 30 })
    );
  });
  it("rejects anonymous and viewer reads before the source", async () => {
    await expect(caller(null).connection()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    m.access.mockResolvedValue({ merchantId: 20, role: "viewer" });
    await expect(caller().list(input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(m.list).not.toHaveBeenCalled();
    expect(m.connection).not.toHaveBeenCalled();
    expect(m.limit).not.toHaveBeenCalled();
  });
  it.each([
    { ...input, merchantId: 1 },
    { ...input, spreadsheetId: "other" },
    { ...input, auth: {} },
    { expectedSourceDigest: "invalid" },
  ])("rejects injected selection %j", async raw => {
    await expect(caller().list(raw as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(m.list).not.toHaveBeenCalled();
  });
  it("blocks rate-limited provider reads", async () => {
    m.limit.mockResolvedValue({ allowed: false });
    await expect(caller().list(input)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(m.list).not.toHaveBeenCalled();
  });
  it.each([
    [new ProductEditorConflict(), "CONFLICT"],
    [new ProductEditorForbidden(), "FORBIDDEN"],
    [new ProductEditorLocked(), "PRECONDITION_FAILED"],
    [new ProductSheetDisconnected(), "PRECONDITION_FAILED"],
    [new ProductSheetProviderError("authentication"), "BAD_GATEWAY"],
    [Error("private SQL credentials"), "INTERNAL_SERVER_ERROR"],
  ])("redacts failure %#", async (error, code) => {
    m.list.mockRejectedValue(error);
    await expect(caller().list(input)).rejects.toMatchObject({
      code,
      message: "product_sheet:unavailable",
    });
  });
});
