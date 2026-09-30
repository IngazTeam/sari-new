import { describe, it, expect } from "vitest";
import { OrderPreviewModel } from "../prototypes/tenant-dashboard/src/order-model";
import { OrderFinanceModel } from "../prototypes/tenant-dashboard/src/order-finance-model";
const costs = { taxMinor: 0, shippingCostMinor: 0, otherCostMinor: 0 };
const fixture = () => {
  const orders = new OrderPreviewModel();
  return { orders, finance: new OrderFinanceModel(orders) };
};
const approval = (finance: OrderFinanceModel) => ({
  orderId: 2,
  expectedAmountMinor: 3453,
  totalIsFinal: true,
  margin: {
    costs,
    evidence: finance.preview({ orderId: 2, costs }).evidence,
    reviewedCosts: true,
  },
});
const payment = (finance: OrderFinanceModel) => {
  const a = finance.attempts(1)[0];
  return {
    orderId: 1,
    attemptId: a.id,
    evidence: a.evidence,
    chargeId: "chg_demo000065",
    reviewed: true,
  };
};
describe("order financial prototype journeys", () => {
  it("requires explicit reviewed costs and preserves unpaid settlement", () => {
    const { orders, finance } = fixture();
    expect(() =>
      finance.preview({ orderId: 2, costs: { ...costs, taxMinor: NaN } })
    ).toThrow();
    expect(() =>
      finance.approve({
        orderId: 2,
        expectedAmountMinor: 3453,
        totalIsFinal: true,
      })
    ).toThrow();
    expect(finance.approve(approval(finance))).toEqual({
      approved: true,
      paymentUrl: null,
    });
    expect(orders.detail(2)).toMatchObject({
      checkoutReviewRequired: false,
      paymentStatus: "unpaid",
    });
  });
  it("rejects stale amounts and stale policy evidence", () => {
    const { orders, finance } = fixture(),
      v = approval(finance);
    orders.rows[1].totalMinor = 4000;
    expect(() => finance.approve(v)).toThrow();
    orders.rows[1].totalMinor = 3453;
    finance.setMode("below");
    expect(() => finance.approve(v)).toThrow();
    expect(orders.detail(2)?.checkoutReviewRequired).toBe(true);
  });
  it("requires and records a privileged below-floor exception", () => {
    const { finance } = fixture();
    finance.setMode("below");
    const v = approval(finance);
    expect(() => finance.approve(v)).toThrow();
    finance.approve({
      ...v,
      margin: {
        ...v.margin,
        exception: { reason: "استثناء توضيحي لعميل مستمر", reviewed: true },
      },
    });
    expect(finance.marginAudit(2)).toMatchObject({
      reason: "استثناء توضيحي لعميل مستمر",
      calculation: { profitMinor: 303 },
    });
  });
  it("denies a supervisor exception without its permission", () => {
    const { finance } = fixture();
    finance.setMode("supervisor");
    const v = approval(finance);
    expect(() =>
      finance.approve({
        ...v,
        margin: {
          ...v.margin,
          exception: { reason: "استثناء توضيحي لعميل مستمر", reviewed: true },
        },
      })
    ).toThrow();
  });
  it("blocks missing cost and invalid net revenue", () => {
    const { finance } = fixture();
    finance.setMode("missing");
    expect(finance.preview({ orderId: 2, costs }).status).toBe("missing_cost");
    expect(() => finance.approve(approval(finance))).toThrow();
    finance.setMode("normal");
    expect(
      finance.preview({ orderId: 2, costs: { ...costs, taxMinor: 3453 } })
        .status
    ).toBe("invalid_totals");
  });
  it("can approve with a disabled policy but still requires the exact total", () => {
    const { finance } = fixture();
    finance.setMode("policyOff");
    expect(
      finance.approve({
        orderId: 2,
        expectedAmountMinor: 3453,
        totalIsFinal: true,
      }).approved
    ).toBe(true);
  });
  it("keeps a saved invoice readable after a lost response without inventing a payment URL", () => {
    const { finance, orders } = fixture();
    finance.setMode("lostInvoice");
    expect(() => finance.approve(approval(finance))).toThrow();
    expect(orders.detail(2)).toMatchObject({
      checkoutReviewRequired: false,
      paymentUrl: null,
      paymentStatus: "unpaid",
    });
  });
  it("verifies an attempt once without marking a customer payment paid", () => {
    const { finance, orders } = fixture(),
      v = payment(finance),
      before = orders.detail(1)?.paymentStatus;
    expect(finance.reconcile(v).outcome).toBe("verified");
    expect(finance.attempts(1)[0]).toMatchObject({
      state: "created",
      canReview: false,
      lastReview: { outcome: "verified" },
    });
    expect(orders.detail(1)?.paymentStatus).toBe(before);
    expect(() => finance.reconcile(v)).toThrow();
  });
  it("shows an unverified result and allows a fresh review without turning it into success", () => {
    const { finance } = fixture();
    finance.setMode("paymentUnverified");
    expect(finance.reconcile(payment(finance)).outcome).toBe("unverified");
    expect(finance.attempts(1)[0]).toMatchObject({
      state: "unknown",
      canReview: true,
    });
    finance.setMode("paymentError");
    expect(() => finance.reconcile(payment(finance))).toThrow();
    expect(finance.attempts(1)[0].lastReview?.outcome).toBe("unverified");
  });
  it("releases once with an audit and blocks unsafe or stale requests", () => {
    const { finance, orders } = fixture(),
      d = finance.discount(6)!;
    const v = {
      orderId: 6,
      evidence: d.evidence,
      reason: "إلغاء المثال بطلب العميل",
      reviewed: true,
    };
    finance.setMode("releaseBlocked");
    expect(() => finance.release(v)).toThrow();
    finance.setMode("normal");
    expect(finance.release(v)).toMatchObject({
      released: true,
      alreadyReleased: false,
    });
    expect(finance.release(v)).toMatchObject({ alreadyReleased: true });
    expect(finance.discount(6)).toMatchObject({
      state: "released",
      audit: { usedBefore: 1, usedAfter: 0, reason: v.reason },
    });
    expect(orders.detail(6)?.discountReleased).toBe(true);
  });
  it("rejects viewer writes and external or other-currency financial records", () => {
    const { finance, orders } = fixture(),
      v = approval(finance);
    orders.setMode("viewer");
    expect(() => finance.approve(v)).toThrow();
    expect(() => finance.reconcile(payment(finance))).toThrow();
    expect(() =>
      finance.release({
        orderId: 6,
        evidence: finance.discount(6)!.evidence,
        reason: "سبب مراجعة توضيحي",
        reviewed: true,
      })
    ).toThrow();
    expect(() => finance.attempts(8)).toThrow();
    expect(() => finance.attempts(3)).toThrow();
  });
  it("resets financial fixtures and audits with the order example", () => {
    const { finance, orders } = fixture();
    finance.approve(approval(finance));
    orders.reset();
    finance.sync();
    expect(orders.detail(2)?.checkoutReviewRequired).toBe(true);
    expect(finance.marginAudit(2)).toBeNull();
  });
});
