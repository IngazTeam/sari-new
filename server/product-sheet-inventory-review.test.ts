import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  prepare: vi.fn(),
  read: vi.fn(),
  commit: vi.fn(),
  receipt: vi.fn(),
  discard: vi.fn(),
  limit: vi.fn(),
  connection: vi.fn(),
  list: vi.fn(),
}));
vi.mock("./product-sheet-source", async original => ({
  ...(await original<typeof import("./product-sheet-source")>()),
  readProductSheetConnection: m.connection,
  listProductSheetSource: m.list,
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./api/distributed-rate-limit", () => ({
  reserveApiRateLimit: m.limit,
}));
vi.mock("./product-sheet-inventory-review", async original => ({
  ...(await original<typeof import("./product-sheet-inventory-review")>()),
  prepareInventorySheetReview: m.prepare,
  readInventorySheetReview: m.read,
  commitInventorySheetReview: m.commit,
  readInventorySheetReceipt: m.receipt,
  discardInventorySheetReview: m.discard,
}));
import { sheetInventoryRouter } from "./routers-sheet-inventory";
import {
  InventorySheetReviewExpired,
  InventorySheetReviewLimit,
  InventorySheetReviewSize,
} from "./product-sheet-inventory-review";
import { SheetInventoryEmpty } from "./product-sheet-inventory";
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
  selection: {
    expectedSourceDigest: expectedDigest,
    sheet: { id: 0, title: "Products", hidden: false, rows: 1000, columns: 26 },
    options: {},
  },
};
const write = { reviewId, requestId, expectedDigest, reviewed: true as const };
const caller = (user: any = { id: 7 }) =>
  sheetInventoryRouter.createCaller({
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
    await caller().connection();
    expect(m.connection).toHaveBeenCalledWith(20, 7);
    await caller().list({ expectedSourceDigest: expectedDigest });
    expect(m.list).toHaveBeenCalledWith(20, 7, {
      expectedSourceDigest: expectedDigest,
    });
    await caller().prepare(input as any);
    expect(m.prepare).toHaveBeenCalledWith(20, 7, input);
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
      () => caller().connection(),
      () => caller().list({ expectedSourceDigest: expectedDigest }),
      () => caller().prepare(input as any),
      () => caller().read({ reviewId } as any),
      () => caller().commit(write),
      () => caller().receipt({ requestId }),
      () => caller().discard({ reviewId, expectedDigest }),
    ])
      await expect(op()).rejects.toMatchObject({ code: "FORBIDDEN" });
    for (const fn of [
      m.connection,
      m.list,
      m.prepare,
      m.read,
      m.commit,
      m.receipt,
      m.discard,
    ])
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
    await expect(
      caller().list({ expectedSourceDigest: expectedDigest })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(m.list).not.toHaveBeenCalled();
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
    [new InventorySheetReviewExpired(), "PRECONDITION_FAILED", "expired"],
    [new InventorySheetReviewLimit(), "TOO_MANY_REQUESTS", "review_limit"],
    [new InventorySheetReviewSize(), "BAD_REQUEST", "review_size"],
    [new SheetInventoryEmpty(), "BAD_REQUEST", "empty_file"],
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
      message: `inventory_sheet:${reason}`,
    });
  });
});
