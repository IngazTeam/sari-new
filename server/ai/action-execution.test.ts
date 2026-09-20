import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  products: vi.fn(),
  create: vi.fn(),
  settings: vi.fn(),
  orders: vi.fn(),
  link: vi.fn(),
  followup: vi.fn(),
  variants: vi.fn(),
}));
vi.mock("./openai", () => ({ callGPT4: vi.fn() }));
vi.mock("../db", () => ({
  getProductsByMerchantId: mocks.products,
  createOrder: mocks.create,
  getMerchantPaymentSettings: mocks.settings,
  getOrdersByCustomerPhone: mocks.orders,
}));
vi.mock("../payment/order-payment-link", () => ({
  issueCanonicalOrderPaymentLink: mocks.link,
}));
vi.mock("../db/customer-intelligence", () => ({
  getOrCreateProfile: vi.fn().mockResolvedValue({ displayName: "fixture" }),
}));
vi.mock("../db/products", () => ({ getVariantsByProductId: mocks.variants }));
vi.mock("./proactive-followup", () => ({ scheduleFollowUp: mocks.followup }));
import { executeAction } from "./action-selector";
import {
  withInboundExecution,
  type InboundExecution,
} from "../messaging/inbound-context";
const context = (): InboundExecution => ({
  id: 1,
  merchantId: 7,
  instanceId: 1,
  token: "fixture",
  eventKey: "event",
  partitionKey: "conversation",
  sendOrdinal: 0,
  assertOwned: vi.fn().mockResolvedValue(undefined),
});
const request = (sendMessage = vi.fn().mockResolvedValue(undefined)) => ({
  action: { type: "confirm_order" as const, items: ["منتج"] },
  merchantId: 7,
  conversationId: 8,
  customerPhone: "966500000009",
  sendMessage,
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.products.mockResolvedValue([
    { id: 4, name: "منتج", price: 12500, isActive: 1, priceUnit: "minor", currency: "SAR", trackInventory: 0 },
  ]);
  mocks.settings.mockResolvedValue(null);
  mocks.create.mockResolvedValue({ id: 45 });
  mocks.link.mockResolvedValue({ issued: false, reason: "gateway_not_ready" });
  mocks.variants.mockResolvedValue([]);
});
describe("supplementary action outcome truth", () => {
  it.each([{priceUnit:'unverified'}, {currency:'USD'}])('does not create an order with uncertain money: %j', async patch => {
    mocks.products.mockResolvedValue([{id:4,name:'منتج',price:9999,priceUnit:'minor',currency:'SAR',isActive:1,trackInventory:0,...patch}]);
    const input = request();
    if (patch.priceUnit === 'unverified') {
      await executeAction(input);
      expect(input.sendMessage.mock.calls[0][1]).toContain('لم يُنشأ طلب');
    } else await expect(executeAction(input)).rejects.toThrow();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('keeps a free variant at zero and charges a 99.99 product as exactly 9999', async () => {
    mocks.products.mockResolvedValue([{id:4,name:'منتج',price:9999,priceUnit:'minor',currency:'SAR',isActive:1,trackInventory:0}]);
    await executeAction(request());
    expect(mocks.create.mock.calls[0][0].totalAmount).toBe(9999);
    mocks.products.mockResolvedValue([{id:4,name:'منتج',price:9999,priceUnit:'minor',currency:'SAR',isActive:1,hasVariants:1,trackInventory:0}]);
    mocks.variants.mockResolvedValue([{id:8,name:'مجاني',price:0,priceUnit:'minor',isActive:1}]);
    const input=request();input.action.items=['منتج مجاني'];
    await executeAction(input);
    expect(mocks.create.mock.calls[1][0].totalAmount).toBe(0);
  });
  it("confirms a recorded order using its real identifier", async () => {
    const input = request();
    await executeAction(input);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(input.sendMessage).toHaveBeenCalledTimes(1);
    expect(input.sendMessage.mock.calls[0][1]).toContain("#45");
  });
  it("does not claim an order is absent when confirmation delivery fails after persistence", async () => {
    const ctx = context(),
      send = vi
        .fn()
        .mockRejectedValue(new Error("provider accepted; reply lost"));
    await expect(
      withInboundExecution(ctx, () => executeAction(request(send)))
    ).rejects.toThrow("reply lost");
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(ctx.uncertainEffect).toBe(true);
    expect(send.mock.calls[0][1]).not.toContain("لم يتم تسجيله");
  });
  it("does not fabricate a failure confirmation when INSERT acknowledgement is lost", async () => {
    mocks.create.mockRejectedValue(new Error("commit result unknown"));
    const input = request(),
      ctx = context();
    await expect(
      withInboundExecution(ctx, () => executeAction(input))
    ).rejects.toThrow("commit result unknown");
    expect(input.sendMessage).not.toHaveBeenCalled();
    expect(ctx.uncertainEffect).toBe(true);
  });
  it("does not register a partial order when one requested item cannot be matched", async () => {
    const input = request();
    input.action.items.push("مفقود");
    await executeAction(input);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(input.sendMessage.mock.calls[0][1]).toContain("لم يُنشأ طلب");
  });
  it("requires a unique product match before persisting an order", async () => {
    mocks.products.mockResolvedValue([
      { id: 4, name: "منتج أ", price: 100, isActive: 1, priceUnit: "minor", currency: "SAR", trackInventory: 0 },
      { id: 5, name: "منتج ب", price: 200, isActive: 1, priceUnit: "minor", currency: "SAR", trackInventory: 0 },
    ]);
    const input = request();
    await executeAction(input);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(input.sendMessage.mock.calls[0][1]).toContain("لم يُنشأ طلب");
  });
  it("does not substitute the base product for an unresolved variant", async () => {
    mocks.products.mockResolvedValue([
      { id: 4, name: "منتج", price: 100, isActive: 1, priceUnit: "minor", currency: "SAR", hasVariants: 1, trackInventory: 0 },
    ]);
    mocks.variants.mockResolvedValue([
      { id: 8, name: "أزرق", price: 120, isActive: 1 },
    ]);
    await executeAction(request());
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not persist an order when tax settings cannot be verified", async () => {
    mocks.settings.mockRejectedValue(new Error("tax settings unavailable"));
    await expect(executeAction(request())).rejects.toThrow(
      "tax settings unavailable"
    );
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.link).not.toHaveBeenCalled();
  });
  it("records failed payment-link issuance for review while reporting the existing order honestly", async () => {
    mocks.link.mockRejectedValue(new Error("unknown payment-link write"));
    const input = request(),
      ctx = context();
    await withInboundExecution(ctx, () => executeAction(input));
    expect(ctx.uncertainEffect).toBe(true);
    expect(input.sendMessage.mock.calls[0][1]).toContain("#45");
  });
  it("propagates failed scheduling instead of marking inbound processing successful", async () => {
    const ctx = context();
    mocks.followup.mockRejectedValue(new Error("schedule unavailable"));
    await expect(
      withInboundExecution(ctx, () =>
        executeAction({
          ...request(),
          action: {
            type: "schedule_followup",
            delayHours: 2,
            reason: "fixture",
          },
        })
      )
    ).rejects.toThrow("schedule unavailable");
    expect(ctx.uncertainEffect).toBe(true);
  });
  it("does not start an action after worker ownership has expired", async () => {
    const ctx = context();
    vi.mocked(ctx.assertOwned).mockRejectedValue(new Error("lease lost"));
    await expect(
      withInboundExecution(ctx, () => executeAction(request()))
    ).rejects.toThrow("lease lost");
    expect(mocks.products).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
