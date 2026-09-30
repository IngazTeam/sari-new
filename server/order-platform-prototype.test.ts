import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import { OrderPreviewModel } from "../prototypes/tenant-dashboard/src/order-model";
import { OrderPlatformModel } from "../prototypes/tenant-dashboard/src/order-platform-model";
const fixture = () => {
  const orders = new OrderPreviewModel();
  return { orders, platforms: new OrderPlatformModel(orders) };
};
const evidence = (p: OrderPlatformModel) => ({
  requestId: p.listCarts({}).items[0].requestId,
  orderId: "77001",
  transactionId: "88001",
});
describe("order platform memory prototype", () => {
  it("paginates carts, problem states and Zid without dropping their tails", () => {
    const { platforms: p } = fixture(),
      a = p.listCarts({}),
      b = p.listCarts({ beforeId: a.nextCursor! });
    expect(a.items).toHaveLength(20);
    expect(b.items).toHaveLength(2);
    expect(a.items[1].cart).toBeNull();
    const r = p.listProblems({ state: "review" });
    expect(r.items).toHaveLength(20);
    expect(
      p.listProblems({ state: "review", beforeId: r.nextCursor! }).items
    ).toHaveLength(3);
    for (const state of ["preparing", "dispatching", "rejected"])
      expect(p.listProblems({ state }).items).toHaveLength(1);
    const z = p.listZid({});
    expect(z.items).toHaveLength(25);
    expect(p.listZid({ beforeId: z.nextCursor! }).items).toHaveLength(2);
  });
  it("distinguishes literal equality from payment and attribution", () => {
    const { platforms: p } = fixture(),
      v = p.inspect(evidence(p));
    expect(v.comparison).toEqual({
      checkoutReference: "equal",
      transactionOrderReference: "equal",
      transactionCartReference: "equal",
    });
    expect(v).toMatchObject({
      providerLinkContract: "not_verified",
      paymentFact: "not_recorded",
      attribution: "not_recorded",
    });
  });
  it("represents differing, absent and unchecked references truthfully", () => {
    const { platforms: p } = fixture(),
      v = evidence(p);
    p.setMode("different");
    expect(Object.values(p.inspect(v).comparison)).toEqual([
      "different",
      "different",
      "different",
    ]);
    p.setMode("absent");
    expect(Object.values(p.inspect(v).comparison)).toEqual([
      "absent",
      "equal",
      "absent",
    ]);
    expect(
      p.inspect({ requestId: v.requestId, orderId: v.orderId }).comparison
        .transactionOrderReference
    ).toBe("not_checked");
  });
  it("rejects invalid identifiers, missing carts and unavailable inspection", () => {
    const { platforms: p } = fixture(),
      v = evidence(p);
    expect(() => p.inspect({ ...v, orderId: "0" })).toThrow();
    expect(() => p.inspect({ ...v, requestId: randomUUID() })).toThrow();
    p.setMode("inspectError");
    expect(() => p.inspect(v)).toThrow();
  });
  it("recovers a lost audit response using the same review id and rejects changed evidence", () => {
    const { platforms: p } = fixture(),
      v = { reviewId: randomUUID(), evidence: evidence(p) };
    p.setMode("lostAudit");
    expect(() => p.saveAudit(v)).toThrow();
    expect(p.listAudits({}).items).toHaveLength(1);
    expect(p.saveAudit(v).reviewId).toBe(v.reviewId);
    expect(p.listAudits({}).items).toHaveLength(1);
    expect(() =>
      p.saveAudit({ ...v, evidence: { ...v.evidence, orderId: "77002" } })
    ).toThrow();
  });
  it("keeps failed saves distinct from saved history", () => {
    const { platforms: p } = fixture(),
      v = { reviewId: randomUUID(), evidence: evidence(p) };
    p.setMode("saveError");
    expect(() => p.saveAudit(v)).toThrow();
    expect(p.listAudits({}).items).toHaveLength(0);
  });
  it("paginates the explicitly artificial long history", () => {
    const { platforms: p } = fixture();
    p.setMode("history");
    const a = p.listAudits({});
    expect(a.items).toHaveLength(20);
    expect(p.listAudits({ beforeId: a.nextCursor! }).items).toHaveLength(1);
  });
  it("recovers a verifiable cart once without sending or recording payment", () => {
    const { platforms: p } = fixture(),
      item = p.listProblems({ state: "review" }).items[0],
      v = { requestId: item.requestId };
    const r = p.recover(v);
    expect(r).toMatchObject({
      replayed: false,
      outcome: "contents_verified",
      paymentFact: "not_recorded",
      attribution: "not_recorded",
      customerMessage: "not_sent",
    });
    expect(p.recover(v).replayed).toBe(true);
    expect(
      p
        .listProblems({ state: "review" })
        .items.some(i => i.requestId === v.requestId)
    ).toBe(false);
    expect(p.listCarts({}).items[0]).toMatchObject({
      requestId: v.requestId,
      recovery: { reviewerUserId: 9000064 },
    });
  });
  it("does not recover missing references or in-progress operations", () => {
    const { platforms: p } = fixture(),
      rows = p.listProblems({ state: "review" }).items;
    for (const i of [
      rows[1],
      rows[2],
      p.listProblems({ state: "dispatching" }).items[0],
    ])
      expect(() => p.recover({ requestId: i.requestId })).toThrow();
    p.setMode("recoveryError");
    expect(() => p.recover({ requestId: rows[0].requestId })).toThrow();
    expect(p.listProblems({ state: "review" }).items[0].requestId).toBe(
      rows[0].requestId
    );
  });
  it("requires eligible Zid references and immutable confirmed order identity", () => {
    const { platforms: p } = fixture(),
      v = { quotationId: 366, orderId: 9900, reviewed: true };
    expect(() => p.reconcileZid({ ...v, quotationId: 365 })).toThrow();
    expect(() => p.reconcileZid({ ...v, quotationId: 364 })).toThrow();
    p.setMode("zidPending");
    expect(p.reconcileZid(v)).toMatchObject({
      verified: true,
      projectionPending: true,
    });
    expect(p.listZid({}).items[0]).toMatchObject({
      state: "succeeded",
      orderId: 9900,
      projectionPending: true,
    });
    expect(() => p.reconcileZid({ ...v, orderId: 9901 })).toThrow();
    p.setMode("normal");
    expect(p.reconcileZid(v).projectionPending).toBe(false);
    expect(p.listZid({}).items.some(i => i.id === 366)).toBe(false);
  });
  it("shows a genuine read error and denies viewer writes", () => {
    const { orders, platforms: p } = fixture(),
      v = evidence(p);
    p.setMode("listError");
    expect(() => p.listCarts({})).toThrow();
    p.setMode("normal");
    orders.setMode("viewer");
    expect(() => p.setMode("history")).not.toThrow();
    expect(p.accessInfo().canInspect).toBe(false);
    expect(p.listZid({}).canManage).toBe(false);
    expect(() => p.inspect(v)).toThrow();
    expect(() =>
      p.saveAudit({ reviewId: randomUUID(), evidence: v })
    ).toThrow();
    expect(() =>
      p.reconcileZid({ quotationId: 366, orderId: 99, reviewed: true })
    ).toThrow();
  });
  it("resets all writes with the demo and supports explicit empty lists", () => {
    const { orders, platforms: p } = fixture();
    p.saveAudit({ reviewId: randomUUID(), evidence: evidence(p) });
    orders.reset();
    p.sync();
    expect(p.listAudits({}).items).toHaveLength(0);
    p.setMode("empty");
    expect(p.listCarts({}).items).toHaveLength(0);
    expect(p.listZid({}).items).toHaveLength(0);
  });
});
