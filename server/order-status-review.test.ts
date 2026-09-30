import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  orderStatusIntent,
  orderStatusWrite,
} from "../shared/order-status-review";
const intent = { id: 1, status: "processing", notify: false };
describe("reviewed manual order status input", () => {
  it.each([
    { ...intent, status: "paid" },
    { ...intent, status: "pending" },
    { ...intent, merchantId: 99 },
    { ...intent, id: 0 },
    { ...intent, id: 1.5 },
    { ...intent, notify: "true" },
    { ...intent, status: "cancelled" },
    { ...intent, reason: "Unexpected" },
    { ...intent, trackingNumber: "Unexpected" },
    { ...intent, status: "shipped", trackingNumber: "x".repeat(101) },
    { ...intent, status: "cancelled", reason: "x".repeat(501) },
  ])("rejects unsupported or contradictory intent %j", v =>
    expect(orderStatusIntent.safeParse(v).success).toBe(false)
  );
  it("normalizes reviewed cancellation and shipment text once", () => {
    expect(
      orderStatusIntent.parse({
        ...intent,
        status: "cancelled",
        reason: "  Local reason  ",
      }).reason
    ).toBe("Local reason");
    expect(
      orderStatusIntent.parse({
        ...intent,
        status: "shipped",
        trackingNumber: " TRACK ",
      }).trackingNumber
    ).toBe("TRACK");
  });
  it.each([
    {},
    { reviewed: false },
    { requestId: "invalid" },
    { expectedDigest: "bad" },
    { actorId: 99 },
  ])("requires exact request evidence and acknowledgement %j", override => {
    const valid = {
      requestId: randomUUID(),
      intent,
      expectedDigest: "a".repeat(64),
      reviewed: true,
    };
    const input = Object.keys(override).length
      ? { ...valid, ...override }
      : { intent };
    expect(orderStatusWrite.safeParse(input).success).toBe(false);
  });
});
