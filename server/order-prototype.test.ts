import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  OrderPreviewModel,
  orderPreviewId,
  orderModes,
} from "../prototypes/tenant-dashboard/src/order-model";
const intent = { id: 1, status: "processing" as const, notify: false };
function prepared(m: OrderPreviewModel) {
  return {
    requestId: randomUUID(),
    intent,
    expectedDigest: m.review(intent).digest,
    reviewed: true as const,
  };
}
describe("order prototype interaction fixtures", () => {
  it("paginates all records without returning raw details in the list", () => {
    const m = new OrderPreviewModel(),
      a = m.workspace({}),
      b = m.workspace({ page: 2 });
    expect(a.items).toHaveLength(25);
    expect(b.items).toHaveLength(2);
    expect(new Set([...a.items, ...b.items].map(r => r.id)).size).toBe(27);
    expect(a.items[0]).not.toHaveProperty("rawItems");
    expect(m.workspace({ page: 99 }).page).toBe(2);
  });
  it("keeps money, currencies, stored payments and unmeasured sales distinct", () => {
    const m = new OrderPreviewModel(),
      v = m.workspace({});
    expect(v.values.map(r => r.currency)).toEqual(["SAR", "USD"]);
    expect(v.values.find(r => r.currency === "SAR")?.excludedAmounts).toBe(1);
    expect(v.unmeasured.salesProficiency).toBeNull();
    expect(m.detail(3)?.paymentStatus).toBe("refunded");
    expect(m.detail(3)?.currency).toBe("USD");
  });
  it("preserves the gift and raw historical detail states", () => {
    const m = new OrderPreviewModel();
    expect(m.detail(2)).toMatchObject({
      isGift: true,
      giftRecipientName: "مستلم المثال",
    });
    expect(m.detail(6)).toMatchObject({ itemsState: "legacy" });
    expect(m.detail(7)).toMatchObject({
      itemsState: "truncated",
      truncatedFields: ["notes"],
    });
  });
  it("uses literal filters and a usable empty result", () => {
    const m = new OrderPreviewModel();
    expect(m.workspace({ search: "%_" }).filtered).toBe(0);
    expect(m.workspace({ search: "DEMO-ORD-027" }).filtered).toBe(1);
    m.setMode("empty");
    expect(m.workspace({})).toMatchObject({
      page: 1,
      pages: 1,
      items: [],
      total: 0,
    });
  });
  it("prepares a notification without changing status and formats minor units once", () => {
    const m = new OrderPreviewModel(),
      r = m.review({ ...intent, notify: true });
    expect(r).toMatchObject({
      merchantId: orderPreviewId,
      actorId: orderPreviewId,
    });
    expect(r.notification?.message).toContain("34.53 SAR");
    expect(m.detail(1)?.status).toBe("pending");
    expect(m.history({ id: 1 }).items).toHaveLength(0);
  });
  it("saves one receipt and replays the same request after the state has moved", () => {
    const m = new OrderPreviewModel(),
      v = prepared(m),
      notes = m.detail(1)?.notes,
      r = m.write(v);
    expect(m.write(v)).toEqual(r);
    expect(m.history({ id: 1 }).items).toHaveLength(1);
    expect(m.detail(1)?.notes).toBe(notes);
    expect(() =>
      m.write({ ...v, intent: { ...intent, status: "shipped" } })
    ).toThrow();
  });
  it("recovers a lost response from the receipt without a duplicate change", () => {
    const m = new OrderPreviewModel();
    m.setMode("lost");
    const v = prepared(m);
    expect(() => m.write(v)).toThrow();
    expect(m.receipt({ requestId: v.requestId })?.status).toBe("processing");
    expect(m.write(v).status).toBe("processing");
    expect(m.history({ id: 1 }).items).toHaveLength(1);
  });
  it("keeps a conflict read-only until a fresh review is made", () => {
    const m = new OrderPreviewModel();
    m.setMode("conflict");
    const v = prepared(m);
    expect(() => m.write(v)).toThrow();
    expect(m.detail(1)?.status).toBe("pending");
    expect(m.receipt({ requestId: v.requestId })).toBeNull();
    expect(m.write(prepared(m)).status).toBe("processing");
  });
  it("does not fabricate a receipt for a failed write", () => {
    const m = new OrderPreviewModel();
    m.setMode("writeError");
    const v = prepared(m);
    expect(() => m.write(v)).toThrow();
    expect(m.receipt({ requestId: v.requestId })).toBeNull();
    expect(m.detail(1)?.status).toBe("pending");
  });
  it.each(["viewer", "forbidden"] as const)(
    "blocks writes in %s mode",
    mode => {
      const m = new OrderPreviewModel(),
        v = prepared(m);
      m.setMode(mode);
      expect(() => m.write(v)).toThrow();
    }
  );
  it.each([5, 6, 7, 8])("blocks final, unknown or external order %s", id => {
    const m = new OrderPreviewModel();
    expect(() =>
      m.review({ id, status: "cancelled", reason: "Demo", notify: false })
    ).toThrow();
  });
  it("pages the labelled artificial history without duplicate IDs", () => {
    const m = new OrderPreviewModel();
    m.setMode("history");
    const a = m.history({ id: 1 }),
      b = m.history({ id: 1, beforeId: a.next! });
    expect(a.items).toHaveLength(20);
    expect(b.items).toHaveLength(2);
    expect(new Set([...a.items, ...b.items].map(v => v.id)).size).toBe(22);
    expect(b.beforeId).toBe(a.next);
  });
  it("exposes explicit loading/error/missing fixtures and resets memory only", () => {
    const m = new OrderPreviewModel();
    expect(Object.keys(orderModes)).toHaveLength(11);
    m.setMode("error");
    expect(() => m.workspace({})).toThrow();
    m.setMode("missing");
    expect(m.detail(1)).toBeNull();
    m.reset();
    expect(m.detail(1)?.status).toBe("pending");
  });
});
