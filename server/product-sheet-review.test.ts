import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  prepare: vi.fn(),
  read: vi.fn(),
  commit: vi.fn(),
  receipt: vi.fn(),
  discard: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./api/distributed-rate-limit", () => ({
  reserveApiRateLimit: m.limit,
}));
vi.mock("./product-sheet-review", async original => ({
  ...(await original<typeof import("./product-sheet-review")>()),
  prepareProductSheetReview: m.prepare,
  readProductSheetReview: m.read,
  commitProductSheetReview: m.commit,
  readProductSheetReceipt: m.receipt,
  discardProductSheetReview: m.discard,
}));
import { productSheetRouter } from "./routers-product-sheet";
import {
  ProductSheetReviewExpired,
  ProductSheetReviewLimit,
  ProductSheetReviewSize,
} from "./product-sheet-review";
import { ProductSheetCatalogLimit } from "./product-sheet-catalog";
import {
  ProductEditorConflict,
  ProductEditorForbidden,
  ProductEditorMissing,
  ProductEditorLocked,
  ProductEditorInvalid,
} from "./product-editor";
import { ProductSheetProviderError } from "./product-sheet-provider";
const reviewId = "00000000-0000-4000-8000-000000000099",
  requestId = "00000000-0000-4000-8000-000000000100",
  expectedDigest = "a".repeat(64);
const input = {
  reviewId,
  mode: "sku" as const,
  selection: {
    expectedSourceDigest: expectedDigest,
    sheet: { id: 0, title: "Products", hidden: false, rows: 1000, columns: 26 },
    options: { sheetId: 0, currency: "SAR" as const },
  },
};
const write = { reviewId, requestId, expectedDigest, reviewed: true as const };
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
describe("Sheets review API boundaries", () => {
  it("uses authenticated tenant and actor on every operation", async () => {
    await caller().prepare(input as any);
    expect(m.prepare).toHaveBeenCalledWith(20, 7, {
      ...input,
      selection: {
        ...input.selection,
        options: {
          ...input.selection.options,
          productType: "physical",
          status: "draft",
        },
      },
    });
    await caller().read({ reviewId } as any);
    expect(m.read).toHaveBeenCalledWith(20, 7, {
      reviewId,
      page: 1,
      pageSize: 20,
      filter: "all",
    });
    await caller().commit(write);
    expect(m.commit).toHaveBeenCalledWith(20, 7, write);
    await caller().receipt({ requestId });
    expect(m.receipt).toHaveBeenCalledWith(20, 7, { requestId });
    await caller().discard({ reviewId, expectedDigest });
    expect(m.discard).toHaveBeenCalledWith(20, 7, { reviewId, expectedDigest });
  });
  it("requires products.manage even for sensitive before/after review and receipt reads", async () => {
    await expect(caller(null).read({ reviewId } as any)).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    m.access.mockResolvedValue({ merchantId: 20, role: "viewer" });
    for (const op of [
      () => caller().prepare(input as any),
      () => caller().read({ reviewId } as any),
      () => caller().commit(write),
      () => caller().receipt({ requestId }),
      () => caller().discard({ reviewId, expectedDigest }),
    ])
      await expect(op()).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const fn of [m.prepare, m.read, m.commit, m.receipt, m.discard])
      expect(fn).not.toHaveBeenCalled();
  });
  it.each([
    { ...input, merchantId: 1 },
    { ...input, rows: [] },
    { ...input, source: {} },
    { ...input, mode: "auto" },
    { ...input, selection: { ...input.selection, spreadsheetId: "foreign" } },
    { ...input, selection: { ...input.selection, auth: {} } },
    {
      ...input,
      selection: {
        ...input.selection,
        options: { ...input.selection.options, sheetId: 5 },
      },
    },
  ])("rejects forged preparation %#", async raw => {
    await expect(caller().prepare(raw as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(m.prepare).not.toHaveBeenCalled();
  });
  it.each([
    { ...write, reviewed: false },
    { ...write, expectedDigest: "wrong" },
    { ...write, requestId: "again" },
    { ...write, rows: [] },
    { ...write, actorId: 8 },
  ])("rejects invalid or injected commits %#", async raw => {
    await expect(caller().commit(raw as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(m.commit).not.toHaveBeenCalled();
  });
  it.each([
    { reviewId, page: 0 },
    { reviewId, pageSize: 21 },
    { reviewId, filter: "valid" },
    { reviewId, actorId: 8 },
  ])("bounds review reads %#", async raw => {
    await expect(caller().read(raw as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(m.read).not.toHaveBeenCalled();
  });
  it("limits only preparation provider work, leaving recovery queries available", async () => {
    m.limit.mockResolvedValue({ allowed: false });
    await expect(caller().prepare(input as any)).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(m.prepare).not.toHaveBeenCalled();
    await caller().receipt({ requestId });
    await caller().read({ reviewId } as any);
    expect(m.receipt).toHaveBeenCalled();
    expect(m.read).toHaveBeenCalled();
  });
  it.each([
    [new ProductEditorConflict(), "CONFLICT", "unavailable"],
    [new ProductEditorForbidden(), "FORBIDDEN", "unavailable"],
    [new ProductEditorMissing(), "NOT_FOUND", "unavailable"],
    [new ProductEditorLocked(), "PRECONDITION_FAILED", "unavailable"],
    [new ProductSheetReviewExpired(), "PRECONDITION_FAILED", "expired"],
    [new ProductSheetReviewLimit(), "TOO_MANY_REQUESTS", "review_limit"],
    [new ProductSheetReviewSize(), "BAD_REQUEST", "review_size"],
    [new ProductSheetCatalogLimit(), "BAD_REQUEST", "catalog_limit"],
    [new ProductEditorInvalid(), "BAD_REQUEST", "unavailable"],
    [
      new ProductSheetProviderError("authentication"),
      "BAD_GATEWAY",
      "unavailable",
    ],
    [
      Error("private database/provider detail"),
      "INTERNAL_SERVER_ERROR",
      "unavailable",
    ],
  ])("maps and redacts failure %#", async (error, code, reason) => {
    m.prepare.mockRejectedValue(error);
    await expect(caller().prepare(input as any)).rejects.toMatchObject({
      code,
      message: `product_sheet:${reason}`,
    });
  });
});
