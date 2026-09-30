import {
  calculateCheckoutMargin,
  previewMarginSchema,
  invoiceApprovalSchema,
} from "../../../shared/checkout-margin";
import { reconcileCheckoutSchema } from "../../../shared/checkout-reconciliation";
import { checkoutDiscountReleaseSchema } from "../../../shared/checkout-discount-release";
import { OrderPreviewModel, orderPreviewId } from "./order-model";
export const financeModes = {
  normal: "أدوات مالية توضيحية",
  below: "هامش أقل من الحد",
  missing: "تكلفة منتج غير معروفة",
  policyOff: "حماية الهامش متوقفة",
  supervisor: "دون صلاحية استثناء الهامش",
  error: "تعذر قراءة الأدوات المالية",
  lostInvoice: "اعتماد فاتورة ثم ضياع الاستجابة",
  paymentUnverified: "عدم تطابق دليل الدفع",
  paymentError: "تعذر التحقق من الدفع",
  releaseBlocked: "تحرير الخصم محظور بدليل دفع",
} as const;
export type FinanceMode = keyof typeof financeModes;
function fail(code = "PRECONDITION_FAILED"): never {
  throw Object.assign(Error("Local financial simulation"), { data: { code } });
}
const token = (value: unknown) => {
  const s = JSON.stringify(value);
  let n = 2166136261;
  for (let i = 0; i < s.length; i++)
    n = Math.imul(n ^ s.charCodeAt(i), 16777619);
  return (n >>> 0).toString(16).padStart(64, "0");
};
export class OrderFinanceModel {
  mode: FinanceMode = "normal";
  private generation = -1;
  private audit: any = null;
  private releaseAudit: any = null;
  private paymentReview: any = null;
  constructor(private orders: OrderPreviewModel) {
    this.sync();
  }
  sync() {
    if (this.generation === this.orders.generation) return;
    this.generation = this.orders.generation;
    this.mode = "normal";
    this.audit = null;
    this.releaseAudit = null;
    this.paymentReview = null;
    const invoice = this.orders.rows.find(r => r.id === 2)!;
    Object.assign(invoice, {
      status: "pending",
      paymentStatus: "unpaid",
      checkoutReviewRequired: true,
      subtotalMinor: 4000,
      discountMinor: 547,
      discountCode: "DEMO65",
    });
    invoice.items = [
      {
        name: "باقة متابعة المتجر",
        quantity: 1,
        unitPriceMinor: 4000,
        totalMinor: 4000,
      },
    ];
    invoice.rawItems = JSON.stringify(invoice.items);
    const cancelled = this.orders.rows.find(r => r.id === 6)!;
    Object.assign(cancelled, {
      paymentStatus: "unpaid",
      subtotalMinor: 4000,
      discountMinor: 547,
      discountCode: "DEMO65",
    });
  }
  setMode(mode: FinanceMode) {
    if (!Object.hasOwn(financeModes, mode)) throw Error("Invalid finance mode");
    this.sync();
    this.mode = mode;
    this.orders.changed();
  }
  private access(write = false) {
    this.sync();
    this.orders.access(write);
    if (this.mode === "error") fail("INTERNAL_SERVER_ERROR");
  }
  private row(id: number, write = false) {
    this.access(write);
    const row = this.orders.rows.find(r => r.id === id);
    if (!row || row.externalReference || row.currency !== "SAR")
      fail("NOT_FOUND");
    return row;
  }
  policy() {
    this.access();
    return {
      policy: { enabled: this.mode !== "policyOff", minPercent: 20 },
      revision: 1,
      evidence: token(this.mode === "policyOff" ? "off" : "on"),
      canManage: this.mode !== "supervisor" && this.orders.mode !== "viewer",
    };
  }
  preview(raw: unknown) {
    const v = previewMarginSchema.parse(raw),
      row = this.row(v.orderId),
      policy = this.policy();
    if (row.id !== 2 || !row.checkoutReviewRequired) fail();
    const unitCost =
      this.mode === "missing"
        ? null
        : this.mode === "below" || this.mode === "supervisor"
          ? 3150
          : 1500;
    let calculation = null,
      status = "missing_cost";
    if (unitCost !== null) {
      try {
        calculation = calculateCheckoutMargin(
          row.totalMinor!,
          unitCost,
          v.costs,
          policy.policy.minPercent
        );
        status = calculation.passes ? "pass" : "below_floor";
      } catch {
        status = "invalid_totals";
      }
    }
    return {
      status,
      productCostMinor: unitCost,
      calculation,
      lines: [
        {
          productId: 1,
          variantId: null,
          name: "باقة متابعة المتجر",
          quantity: 1,
          unitCostMinor: unitCost,
        },
      ],
      costs: v.costs,
      policy: policy.policy,
      policyRevision: 1,
      totalMinor: row.totalMinor,
      evidence: token([row.id, row.totalMinor, policy, unitCost, v.costs]),
    };
  }
  approve(raw: unknown) {
    const v = invoiceApprovalSchema.parse(raw),
      row = this.row(v.orderId, true);
    if (
      row.id !== 2 ||
      !row.checkoutReviewRequired ||
      row.totalMinor !== v.expectedAmountMinor
    )
      fail();
    if (this.policy().policy.enabled) {
      if (!v.margin) fail();
      const p = this.preview({ orderId: v.orderId, costs: v.margin.costs });
      if (
        p.evidence !== v.margin.evidence ||
        !["pass", "below_floor"].includes(p.status)
      )
        fail();
      if (
        p.status === "below_floor" &&
        (!v.margin.exception || !this.policy().canManage)
      )
        fail("FORBIDDEN");
      if (v.margin.exception)
        this.audit = {
          id: 1,
          actorUserId: orderPreviewId,
          reason: v.margin.exception.reason,
          createdAt: new Date().toISOString(),
          totalMinor: row.totalMinor,
          policyRevision: 1,
          policy: p.policy,
          calculation: p.calculation,
        };
    }
    row.checkoutReviewRequired = false;
    this.orders.changed();
    if (this.mode === "lostInvoice") fail("INTERNAL_SERVER_ERROR");
    return { approved: true, paymentUrl: null };
  }
  marginAudit(id: number) {
    this.row(id);
    return id === 2 ? structuredClone(this.audit) : null;
  }
  attempts(id: number) {
    const row = this.row(id);
    if (id !== 1) return [];
    return [
      {
        id: "00000000-0000-4000-8000-000000000065",
        state:
          this.paymentReview?.outcome === "verified" ? "created" : "unknown",
        reference: "sari_pl_" + token(id),
        amountMinor: row.totalMinor,
        currency: "SAR",
        paymentId: this.paymentReview?.outcome === "verified" ? 65 : null,
        createdAt: "2026-09-30T00:00:00.000Z",
        updatedAt: "2026-09-30T00:00:00.000Z",
        canReview:
          this.paymentReview?.outcome !== "verified" &&
          this.orders.mode !== "viewer",
        evidence: token([id, this.paymentReview]),
        lastReview: this.paymentReview,
      },
    ];
  }
  reconcile(raw: unknown) {
    const v = reconcileCheckoutSchema.parse(raw),
      row = this.row(v.orderId, true),
      a = this.attempts(v.orderId)[0];
    if (!a || a.id !== v.attemptId || a.evidence !== v.evidence || !a.canReview)
      fail();
    if (this.mode === "paymentError") fail("INTERNAL_SERVER_ERROR");
    const outcome =
      this.mode === "paymentUnverified" ? "unverified" : "verified";
    this.paymentReview = { outcome, at: new Date().toISOString() };
    // Reconciliation confirms an existing checkout attempt, not settlement or receipt of customer money.
    this.orders.changed();
    return { outcome };
  }
  discount(id: number) {
    this.row(id);
    if (id !== 6) return null;
    return {
      code: "DEMO65",
      discountMinor: 547,
      state: this.releaseAudit
        ? "released"
        : this.mode === "releaseBlocked"
          ? "blocked"
          : "eligible",
      blocker: this.releaseAudit
        ? null
        : this.mode === "releaseBlocked"
          ? "payment"
          : null,
      evidence: token([id, this.releaseAudit, this.mode === "releaseBlocked"]),
      audit: this.releaseAudit,
    };
  }
  release(raw: unknown) {
    const v = checkoutDiscountReleaseSchema.parse(raw),
      row = this.row(v.orderId, true),
      d = this.discount(v.orderId);
    if (!d) fail();
    if (this.releaseAudit) return { released: true, alreadyReleased: true };
    if (
      d.state !== "eligible" ||
      d.evidence !== v.evidence ||
      row.status !== "cancelled" ||
      row.paymentStatus !== "unpaid"
    )
      fail();
    this.releaseAudit = {
      actorUserId: orderPreviewId,
      reason: v.reason,
      usedBefore: 1,
      usedAfter: 0,
      at: new Date().toISOString(),
    };
    row.discountReleased = true;
    row.paymentUrl = null;
    this.orders.changed();
    return { released: true, alreadyReleased: false };
  }
}
