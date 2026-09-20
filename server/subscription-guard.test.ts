import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  subscription: vi.fn(),
  plan: vi.fn(),
  count: vi.fn(),
  conversation: vi.fn(),
  instances: vi.fn(),
}));
vi.mock("./db", () => ({
  getMerchantCurrentSubscription: mocks.subscription,
  getSubscriptionPlanById: mocks.plan,
  getCustomerCountByMerchant: mocks.count,
  getConversationByMerchantAndPhone: mocks.conversation,
  getWhatsAppInstancesByMerchantId: mocks.instances,
}));
import {
  checkCustomerLimit,
  checkWhatsAppNumberLimit,
  getRemainingCustomerSlots,
} from "./helpers/subscriptionGuard";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.subscription.mockResolvedValue({ planId: 2 });
  mocks.plan.mockResolvedValue({ maxCustomers: 10, maxWhatsAppNumbers: 2 });
  mocks.count.mockResolvedValue(3);
  mocks.conversation.mockResolvedValue(null);
  mocks.instances.mockResolvedValue([]);
});
describe("subscription quota behavior", () => {
  it("reports the actual finite remaining quota", async () => {
    expect(await getRemainingCustomerSlots(7)).toEqual({
      current: 3,
      max: 10,
      remaining: 7,
      percentage: 30,
    });
    expect(mocks.count).toHaveBeenCalledWith(7);
  });
  it("rejects new customers at the exact limit", async () => {
    mocks.count.mockResolvedValue(10);
    await expect(checkCustomerLimit(7, "966500000009")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("allows an existing customer at the quota without counting it twice", async () => {
    mocks.conversation.mockResolvedValue({ id: 8 });
    await expect(checkCustomerLimit(7, "966500000009")).resolves.toBe(true);
    expect(mocks.conversation).toHaveBeenCalledWith(7, "966500000009");
    expect(mocks.count).not.toHaveBeenCalled();
  });
  it("does not bypass a missing subscription for an existing customer", async () => {
    mocks.subscription.mockResolvedValue(null);
    await expect(checkCustomerLimit(7, "966500000009")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.conversation).not.toHaveBeenCalled();
    expect(await getRemainingCustomerSlots(7)).toEqual({
      current: 0,
      max: 0,
      remaining: 0,
      percentage: 0,
    });
  });
  it("allows a new customer below quota", async () => {
    await expect(checkCustomerLimit(7, "966500000009")).resolves.toBe(true);
  });
  it("caps percentage without hiding actual overage", async () => {
    mocks.count.mockResolvedValue(12);
    expect(await getRemainingCustomerSlots(7)).toEqual({
      current: 12,
      max: 10,
      remaining: 0,
      percentage: 100,
    });
  });
  it("does not return NaN for a zero-sized plan", async () => {
    mocks.plan.mockResolvedValue({ maxCustomers: 0 });
    mocks.count.mockResolvedValue(0);
    expect(await getRemainingCustomerSlots(7)).toEqual({
      current: 0,
      max: 0,
      remaining: 0,
      percentage: 0,
    });
    await expect(checkCustomerLimit(7)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it.each([undefined, NaN, Infinity, -1, 1.5])(
    "fails closed on invalid stored quota %s",
    async maxCustomers => {
      mocks.plan.mockResolvedValue({ maxCustomers });
      await expect(checkCustomerLimit(7)).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
      await expect(getRemainingCustomerSlots(7)).rejects.toMatchObject({
        code: "INTERNAL_SERVER_ERROR",
      });
    }
  );
  it("propagates a database failure instead of treating it as available quota", async () => {
    mocks.subscription.mockRejectedValue(new Error("offline"));
    await expect(checkCustomerLimit(7)).rejects.toThrow("offline");
  });
  it("fails closed when a subscribed plan cannot be loaded", async () => {
    mocks.plan.mockResolvedValue(null);
    await expect(checkCustomerLimit(7)).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });
  it("checks WhatsApp number capacity against the selected merchant", async () => {
    mocks.instances.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    await expect(checkWhatsAppNumberLimit(7)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.instances).toHaveBeenCalledWith(7);
    mocks.instances.mockResolvedValue([{ id: 1 }]);
    await expect(checkWhatsAppNumberLimit(7)).resolves.toBe(true);
  });
});
