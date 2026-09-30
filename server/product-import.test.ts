import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  prepare: vi.fn(),
  read: vi.fn(),
  commit: vi.fn(),
  receipt: vi.fn(),
  discard: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: mocks.access,
}));
vi.mock("./api/distributed-rate-limit", () => ({
  reserveApiRateLimit: mocks.limit,
}));
vi.mock("./product-import", async original => ({
  ...(await original<typeof import("./product-import")>()),
  prepareProductImport: mocks.prepare,
  readProductImport: mocks.read,
  commitProductImport: mocks.commit,
  readProductImportReceipt: mocks.receipt,
  discardProductImport: mocks.discard,
}));
import { productImportRouter } from "./routers-product-import";
import {
  ProductImportExpired,
  ProductImportLimit,
  ProductImportSize,
} from "./product-import";
import { ProductImportFileError } from "./product-import-preview";
import {
  ProductEditorConflict,
  ProductEditorForbidden,
  ProductEditorMissing,
  ProductEditorLocked,
  ProductEditorInvalid,
} from "./product-editor";
const reviewId = "00000000-0000-4000-8000-000000000085",
  requestId = "00000000-0000-4000-8000-000000000086",
  expectedDigest = "a".repeat(64);
const input = {
  reviewId,
  file: {
    format: "csv" as const,
    fileName: "products.csv",
    csvData: "name,price\nTest,1",
    currency: "SAR" as const,
  },
};
const write = { reviewId, requestId, expectedDigest, reviewed: true as const };
const caller = (user: any = { id: 7 }) =>
  productImportRouter.createCaller({
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
  mocks.limit.mockResolvedValue({ allowed: true });
});
describe("product import boundary", () => {
  it("uses the resolved tenant and authenticated actor for every operation", async () => {
    await caller().prepare(input as any);
    expect(mocks.prepare).toHaveBeenCalledWith(20, 7, {
      ...input,
      file: {
        ...input.file,
        status: "draft",
        productType: "physical",
        delimiter: ",",
      },
    });
    await caller().read({ reviewId } as any);
    expect(mocks.read).toHaveBeenCalledWith(20, 7, {
      reviewId,
      page: 1,
      pageSize: 20,
      filter: "all",
    });
    await caller().commit(write);
    expect(mocks.commit).toHaveBeenCalledWith(20, 7, write);
    await caller().receipt({ requestId });
    expect(mocks.receipt).toHaveBeenCalledWith(20, 7, { requestId });
    await caller().discard({ reviewId, expectedDigest });
    expect(mocks.discard).toHaveBeenCalledWith(20, 7, {
      reviewId,
      expectedDigest,
    });
  });
  it("rejects anonymous access and viewer writes before parsing/storage", async () => {
    await expect(caller(null).read({ reviewId } as any)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    mocks.access.mockResolvedValue({ merchantId: 20, role: "viewer" });
    await expect(caller().prepare(input as any)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller().commit(write)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller().discard({ reviewId, expectedDigest })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.discard).not.toHaveBeenCalled();
  });
  it.each([
    { ...write, reviewed: false },
    { ...write, merchantId: 30 },
    { ...write, expectedDigest: "bad" },
    { ...write, requestId: "retry" },
    { ...write, rows: [{ name: "Injected" }] },
  ])("rejects forged/invalid commit %j", async invalid => {
    await expect(caller().commit(invalid as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(mocks.commit).not.toHaveBeenCalled();
  });
  it.each([
    { reviewId, pageSize: 21 },
    { reviewId, page: 0 },
    { reviewId, filter: "valid" },
    { reviewId, actorId: 9 },
  ])("bounds preview reads %j", async invalid => {
    await expect(caller().read(invalid as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each([
    [new ProductEditorConflict(), "CONFLICT"],
    [new ProductEditorForbidden(), "FORBIDDEN"],
    [new ProductEditorMissing(), "NOT_FOUND"],
    [new ProductEditorLocked(), "PRECONDITION_FAILED"],
    [new ProductImportExpired(), "PRECONDITION_FAILED"],
    [new ProductImportLimit(), "TOO_MANY_REQUESTS"],
    [new ProductImportSize(), "BAD_REQUEST"],
    [new ProductEditorInvalid(), "BAD_REQUEST"],
    [new ProductImportFileError("row_limit"), "BAD_REQUEST"],
    [new Error("SQL secret"), "INTERNAL_SERVER_ERROR"],
  ] as const)(
    "maps failure %s without leaking storage details",
    async (error, code) => {
      mocks.prepare.mockRejectedValue(error);
      await expect(caller().prepare(input as any)).rejects.toMatchObject({
        code,
        message: expect.stringMatching(/^product_import:/),
      });
      try {
        await caller().prepare(input as any);
      } catch (error) {
        expect((error as Error).message).not.toContain("SQL secret");
      }
    }
  );
  it("enforces a tenant rate limit before parsing the file", async () => {
    mocks.limit.mockResolvedValue({ allowed: false });
    await expect(caller().prepare(input as any)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.limit).toHaveBeenCalledWith(
      expect.objectContaining({ identity: "20", maxRequests: 30 })
    );
  });
});
