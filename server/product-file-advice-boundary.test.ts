import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  start: vi.fn(),
  read: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./product-file-advice-requests", async original => ({
  ...(await original<typeof import("./product-file-advice-requests")>()),
  startProductFileAdvice: m.start,
  readProductFileAdvice: m.read,
}));
import { productFileAdviceRouter } from "./routers-product-file-advice";
import { ProductFileAdviceLimit } from "./product-file-advice-requests";
import {
  ProductEditorConflict,
  ProductEditorForbidden,
  ProductEditorMissing,
} from "./product-editor";
import { ProductImportFileError } from "./product-import-preview";
import { ProductFileAdviceError } from "./product-file-advice";
const requestId = "11111111-1111-4111-8111-111111111191";
const input = {
  requestId,
  reviewed: true as const,
  file: {
    format: "csv" as const,
    fileName: "products.csv",
    currency: "SAR" as const,
    csvData: "name,price\nTest,1",
  },
};
const receipt = () => ({
  merchantId: 20,
  actorId: 7,
  requestId,
  fileName: "products.csv",
  fileDigest: "a".repeat(64),
  sampleDigest: "b".repeat(64),
  state: "processing",
  failure: null,
  startedAt: "2026-09-30T12:00:00.000Z",
  finishedAt: null,
  result: null,
});
const caller = (user: any = { id: 7 }) =>
  productFileAdviceRouter.createCaller({
    user,
    req: {},
    res: {},
    merchantId: 999,
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, memberId: 3, role: "manager" });
  m.start.mockResolvedValue(receipt());
  m.read.mockResolvedValue(receipt());
});
describe("file advice authorization and result boundary", () => {
  it("uses the resolved tenant and current actor, never client tenant fields", async () => {
    await caller().start(input as any);
    expect(m.start.mock.calls[0].slice(0, 2)).toEqual([20, 7]);
    expect(m.start.mock.calls[0][2]).toMatchObject({
      requestId,
      reviewed: true,
      language: "ar",
      intent: "auto",
    });
    await caller().read({ requestId });
    expect(m.read).toHaveBeenCalledWith(20, 7, { requestId });
  });
  it("blocks anonymous reads and viewer generation before any provider service", async () => {
    await expect(caller(null).read({ requestId })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    m.access.mockResolvedValue({ merchantId: 20, role: "viewer" });
    await expect(caller().start(input as any)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(m.start).not.toHaveBeenCalled();
    expect(m.read).not.toHaveBeenCalled();
  });
  it.each([
    { ...input, reviewed: false },
    { ...input, merchantId: 99 },
    { ...input, requestId: "bad" },
    { ...input, file: { ...input.file, source: "url" } },
  ])("rejects an unreviewed or changed input shape %j", async raw => {
    await expect(caller().start(raw as any)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(m.start).not.toHaveBeenCalled();
  });
  it.each([
    [new ProductEditorConflict(), "CONFLICT"],
    [new ProductEditorForbidden(), "FORBIDDEN"],
    [new ProductEditorMissing(), "NOT_FOUND"],
    [new ProductFileAdviceLimit(), "TOO_MANY_REQUESTS"],
    [new ProductImportFileError("xlsx_invalid"), "BAD_REQUEST"],
    [new ProductFileAdviceError("invalid_citation"), "BAD_REQUEST"],
    [Error("SELECT password FROM private_table"), "INTERNAL_SERVER_ERROR"],
  ])(
    "maps domain failure without exposing internal errors %#",
    async (error, code) => {
      m.start.mockRejectedValue(error);
      await expect(caller().start(input as any)).rejects.toMatchObject({
        code,
      });
      await expect(caller().start(input as any)).rejects.not.toThrow(
        "SELECT password"
      );
    }
  );
  it("rejects malformed completed responses", async () => {
    m.read.mockResolvedValue({ ...receipt(), state: "completed" });
    await expect(caller().read({ requestId })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });
});
