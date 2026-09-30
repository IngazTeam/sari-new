import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  send: vi.fn(),
  read: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: mocks.access,
}));
vi.mock("./quotation-delivery", async original => ({
  ...(await original<typeof import("./quotation-delivery")>()),
  sendReviewedQuotation: mocks.send,
  readQuotationDelivery: mocks.read,
}));
import { quotationWorkspaceRouter } from "./routers-quotations";
import {
  canDispatchQuotation,
  quotationDeliveryKey,
} from "./quotation-delivery";
const input = () => ({
  requestId: randomUUID(),
  reviewId: 1,
  snapshotHash: "a".repeat(64),
  confirmed: true as const,
});
const caller = () =>
  quotationWorkspaceRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ merchantId: 20, role: "owner" });
});
describe("reviewed quotation send boundary", () => {
  it("takes content from the stored review and binds user identity", async () => {
    const v = input();
    await caller().sendReviewed(v);
    await caller().delivery({ requestId: v.requestId });
    expect(mocks.send).toHaveBeenCalledWith(20, 7, v);
    expect(mocks.read).toHaveBeenCalledWith(20, 7, { requestId: v.requestId });
  });
  it.each([
    { confirmed: false },
    { confirmed: undefined },
    { to: "+966500000000" },
    { mediaUrl: "https://evil.example/file" },
    { merchantId: 9 },
    { retryFailed: true },
    { reviewId: 0 },
    { snapshotHash: "guess" },
  ])("rejects unreviewed or caller-controlled effects %j", async patch => {
    await expect(
      caller().sendReviewed({ ...input(), ...patch } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("denies viewer sends and private receipt reads", async () => {
    mocks.access.mockResolvedValue({ merchantId: 20, role: "viewer" });
    await expect(caller().sendReviewed(input())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      caller().delivery({ requestId: randomUUID() })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("refuses missing authority and retryFailed before touching the database", async () => {
    const base = {
      merchantId: 20,
      to: "+966500000000",
      kind: "text" as const,
      text: "fake",
      idempotencyKey: quotationDeliveryKey(20, 1),
    };
    expect(await canDispatchQuotation(base, {} as any)).toBe(false);
    expect(
      await canDispatchQuotation(
        {
          ...base,
          quotationGuard: { deliveryId: 1, snapshotHash: "a".repeat(64) },
          retryFailed: true,
        },
        {} as any
      )
    ).toBe(false);
  });
});
