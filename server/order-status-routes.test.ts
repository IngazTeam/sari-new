import { randomUUID } from "node:crypto";
import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  review: vi.fn(),
  write: vi.fn(),
  receipt: vi.fn(),
  history: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./order-status-review", () => ({
  reviewOrderStatus: m.review,
  writeOrderStatus: m.write,
  readOrderStatusReceipt: m.receipt,
  readOrderStatusHistory: m.history,
  OrderStatusConflict: class extends Error {},
  OrderStatusUnavailable: class extends Error {},
  OrderStatusPrecondition: class extends Error {},
}));
import { orderWorkspaceRouter } from "./routers-order-workspace";
import {
  OrderStatusConflict,
  OrderStatusUnavailable,
  OrderStatusPrecondition,
} from "./order-status-review";
const caller = () =>
  orderWorkspaceRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
    merchantId: 999,
  } as any);
const intent = { id: 1, status: "processing" as const, notify: false };
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner" });
});
describe("reviewed status router boundary", () => {
  it("scopes every operation to resolved membership and authenticated actor", async () => {
    const requestId = randomUUID(),
      write = {
        requestId,
        intent,
        expectedDigest: "a".repeat(64),
        reviewed: true as const,
      };
    await caller().statusReview(intent);
    expect(m.review).toHaveBeenCalledWith(20, 7, intent);
    await caller().statusWrite(write);
    expect(m.write).toHaveBeenCalledWith(20, 7, write);
    await caller().statusReceipt({ requestId });
    expect(m.receipt).toHaveBeenCalledWith(20, 7, { requestId });
    await caller().statusHistory({ id: 1 });
    expect(m.history).toHaveBeenCalledWith(20, { id: 1 });
  });
  it("permits viewer history but denies review, writes and personal receipt queries", async () => {
    m.access.mockResolvedValue({ merchantId: 20, role: "viewer" });
    await caller().statusHistory({ id: 1 });
    expect(m.history).toHaveBeenCalledWith(20, { id: 1 });
    await expect(caller().statusReview(intent)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller().statusWrite({
        requestId: randomUUID(),
        intent,
        expectedDigest: "a".repeat(64),
        reviewed: true,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller().statusReceipt({ requestId: randomUUID() })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(m.review).not.toHaveBeenCalled();
    expect(m.write).not.toHaveBeenCalled();
    expect(m.receipt).not.toHaveBeenCalled();
  });
  it.each([
    [new OrderStatusConflict(), "CONFLICT"],
    [new OrderStatusUnavailable(), "NOT_FOUND"],
    [new OrderStatusPrecondition(), "PRECONDITION_FAILED"],
    [Error("SQL private"), "INTERNAL_SERVER_ERROR"],
  ])(
    "maps service failures without exposing source details",
    async (error, code) => {
      m.review.mockRejectedValue(error);
      await expect(caller().statusReview(intent)).rejects.toMatchObject({
        code,
      });
      await expect(caller().statusReview(intent)).rejects.not.toHaveProperty(
        "message",
        "SQL private"
      );
    }
  );
});
