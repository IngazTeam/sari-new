import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  review: vi.fn(),
  write: vi.fn(),
  receipt: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: mocks.access,
}));
vi.mock("./product-delete", () => ({
  reviewProductDeletion: mocks.review,
  deleteReviewedProducts: mocks.write,
  readProductDeletionReceipt: mocks.receipt,
}));
import { productEditorRouter } from "./routers-product-editor";
const requestId = "00000000-0000-4000-8000-000000000080",
  expectedDigest = "a".repeat(64);
const caller = (user: any = { id: 8 }) =>
  productEditorRouter.createCaller({ user, req: {}, res: {} } as any);
const write = {
  requestId,
  expectedDigest,
  reviewed: true as const,
  ids: [2, 1],
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({
    merchantId: 20,
    memberId: 3,
    role: "manager",
  });
});
describe("reviewed product deletion", () => {
  it("normalizes selection order and uses current actor and merchant", async () => {
    await caller().deleteReview({ ids: [2, 1] });
    expect(mocks.review).toHaveBeenCalledWith(20, 8, { ids: [1, 2] });
    await caller().deleteWrite(write);
    expect(mocks.write).toHaveBeenCalledWith(20, 8, { ...write, ids: [1, 2] });
  });
  it.each([
    [],
    [1, 1],
    [0],
    [-1],
    [1.5],
    Array.from({ length: 101 }, (_, i) => i + 1),
  ])("rejects invalid or oversized selection %j", async ids => {
    await expect(caller().deleteWrite({ ...write, ids })).rejects.toMatchObject(
      { code: "BAD_REQUEST" }
    );
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it.each([
    { reviewed: false },
    { expectedDigest: "old" },
    { requestId: "same" },
    { merchantId: 30 },
  ])("rejects unreviewed or invalid mutation %j", async patch => {
    await expect(
      caller().deleteWrite({ ...write, ...patch } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("blocks anonymous reads and viewer deletes while allowing receipt recovery", async () => {
    await expect(caller(null).deleteReview({ ids: [1] })).rejects.toMatchObject(
      { code: "UNAUTHORIZED" }
    );
    mocks.access.mockResolvedValue({
      merchantId: 20,
      memberId: 3,
      role: "viewer",
    });
    await expect(caller().deleteWrite(write)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.write).not.toHaveBeenCalled();
    await caller().deleteReceipt({ requestId });
    expect(mocks.receipt).toHaveBeenCalledWith(20, 8, { requestId });
  });
});
