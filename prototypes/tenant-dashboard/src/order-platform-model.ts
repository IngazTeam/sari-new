import { z } from "zod";
import { OrderPreviewModel, orderPreviewId } from "./order-model";
import {
  sallaCheckoutCartListInput,
  sallaCheckoutCartListOutput,
  sallaCheckoutEvidenceInput,
  sallaCheckoutEvidenceOutput,
  sallaEvidenceComparison,
} from "../../../shared/salla-checkout-evidence";
import {
  sallaCheckoutAuditInput,
  sallaCheckoutAuditItem,
  sallaCheckoutAuditListInput,
  sallaCheckoutAuditPage,
} from "../../../shared/salla-checkout-audit";
import {
  sallaCartProblemListInput,
  sallaCartProblemPage,
  sallaCartRecoveryInput,
  sallaCartRecoveryOutput,
} from "../../../shared/salla-cart-recovery";
export const platformModes = {
  normal: "أمثلة سلة وزد",
  empty: "قوائم المنصات فارغة",
  listError: "تعذر قراءة قوائم المنصات",
  accessError: "تعذر التحقق من صلاحية أداة سلة",
  different: "مراجع مختلفة في سلة",
  absent: "مراجع سلة غائبة",
  inspectError: "تعذر فحص سلة",
  saveError: "تعذر حفظ فحص سلة",
  lostAudit: "حُفظ الفحص وضاعت الاستجابة",
  recoveryError: "تعذر استعادة سلة",
  history: "سجل فحوص توضيحي طويل",
  zidError: "تعذر التحقق لدى زد",
  zidPending: "تأكد طلب زد وبقي تحديث السجل",
} as const;
export type PlatformMode = keyof typeof platformModes;
function fail(code = "PRECONDITION_FAILED"): never {
  throw Object.assign(Error("Local platform simulation"), { data: { code } });
}
const uuid = (id: number) =>
  `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`;
const date = "2026-09-30T06:00:00.000Z";
const cursorInput = z
  .object({ beforeId: z.number().int().positive().safe().optional() })
  .strict();
const zidInput = z
  .object({
    quotationId: z.number().int().positive().safe(),
    orderId: z.number().int().positive().safe(),
    reviewed: z.literal(true),
  })
  .strict();
type Cart = z.infer<typeof sallaCheckoutCartListOutput>["items"][number];
type Audit = z.infer<typeof sallaCheckoutAuditItem>;
type Problem = z.infer<typeof sallaCartProblemPage>["items"][number];
/** Demonstration-only store. It never contacts a platform or records payment/attribution facts. */
export class OrderPlatformModel {
  mode: PlatformMode = "normal";
  private generation = -1;
  private carts: Cart[] = [];
  private problems: Problem[] = [];
  private audits: Audit[] = [];
  private auditInputs = new Map<string, string>();
  private recovered = new Map<
    string,
    z.infer<typeof sallaCartRecoveryOutput>
  >();
  private zid: Array<{
    id: number;
    number: string;
    customerName: string;
    phone: string;
    reference: string | null;
    orderId: number | null;
    canReview: boolean;
    projectionPending: boolean;
    state: "unknown" | "processing" | "succeeded";
  }> = [];
  constructor(private orders: OrderPreviewModel) {
    this.sync();
  }
  sync() {
    if (this.generation === this.orders.generation) return;
    this.generation = this.orders.generation;
    this.mode = "normal";
    this.audits = [];
    this.auditInputs.clear();
    this.recovered.clear();
    this.carts = Array.from({ length: 22 }, (_, i) => ({
      id: 100 - i,
      requestId: uuid(100 - i),
      createdAt: date,
      cart:
        i === 1
          ? null
          : {
              cartId: String(66000 + 100 - i),
              preparedTotalMinor: 3453,
              currency: "SAR",
            },
    }));
    this.problems = Array.from({ length: 23 }, (_, i) => ({
      id: 200 - i,
      requestId: uuid(200 - i),
      createdAt: date,
      state: "review",
      diagnostic:
        i === 1
          ? "missing_reference"
          : i === 2
            ? "invalid_evidence"
            : "verifiable",
      cartId: i === 1 || i === 2 ? null : String(66200 - i),
    }));
    for (const [i, state] of (
      ["preparing", "dispatching", "rejected"] as const
    ).entries())
      this.problems.push({
        id: 210 + i,
        requestId: uuid(210 + i),
        createdAt: date,
        state,
        diagnostic:
          state === "rejected" ? "rejected_before_send" : "in_progress",
        cartId: null,
      });
    this.zid = Array.from({ length: 27 }, (_, i) => ({
      id: 366 - i,
      number: `DEMO-ZID-${366 - i}`,
      customerName: `عميل مثال زد ${i + 1}`,
      phone: "+12025550100",
      reference: i === 2 ? null : `SARY-CHECKOUT:${uuid(366 - i)}`,
      orderId: i === 3 ? 9901 : null,
      canReview: i !== 1 && i !== 2,
      projectionPending: i === 3,
      state: i === 3 ? "succeeded" : i === 1 ? "processing" : "unknown",
    }));
  }
  setMode(mode: PlatformMode) {
    if (!Object.hasOwn(platformModes, mode))
      throw Error("Unknown platform mode");
    this.sync();
    this.mode = mode;
    if (mode === "history" && !this.audits.length) {
      for (let i = 1; i <= 21; i++) {
        const evidence = this.evidence({
            requestId: uuid(100),
            orderId: String(77000 + i),
          }),
          reviewId = uuid(1000 + i);
        this.audits.unshift(
          sallaCheckoutAuditItem.parse({
            id: i,
            merchantId: orderPreviewId,
            reviewerUserId: orderPreviewId,
            reviewId,
            savedAt: date,
            evidence,
          })
        );
        this.auditInputs.set(
          reviewId,
          JSON.stringify({ requestId: uuid(100), orderId: String(77000 + i) })
        );
      }
    }
    this.orders.changed();
  }
  private access(write = false) {
    this.sync();
    this.orders.access(write);
  }
  accessInfo() {
    this.access();
    if (this.mode === "accessError") fail("INTERNAL_SERVER_ERROR");
    return {
      merchantId: orderPreviewId,
      canInspect: this.orders.mode !== "viewer",
    };
  }
  private listAccess() {
    this.access();
    if (this.mode === "listError") fail("INTERNAL_SERVER_ERROR");
  }
  private page<T extends { id: number }>(
    rows: T[],
    beforeId: number | undefined,
    size = 20
  ) {
    const eligible =
      this.mode === "empty"
        ? []
        : rows
            .filter(r => !beforeId || r.id < beforeId)
            .sort((a, b) => b.id - a.id);
    const items = structuredClone(eligible.slice(0, size));
    return {
      merchantId: orderPreviewId,
      items,
      nextCursor: eligible.length > size ? items.at(-1)!.id : null,
    };
  }
  listCarts(raw: unknown) {
    this.listAccess();
    const v = sallaCheckoutCartListInput.parse(raw);
    return sallaCheckoutCartListOutput.parse(this.page(this.carts, v.beforeId));
  }
  inspect(raw: unknown) {
    this.access(true);
    if (this.mode === "inspectError") fail("INTERNAL_SERVER_ERROR");
    return this.evidence(raw);
  }
  private evidence(raw: unknown) {
    const v = sallaCheckoutEvidenceInput.parse(raw);
    const item = this.carts.find(r => r.requestId === v.requestId);
    if (!item?.cart) fail("NOT_FOUND");
    const order = {
      orderId: v.orderId,
      checkoutId:
        this.mode === "absent"
          ? null
          : this.mode === "different"
            ? "999999"
            : item.cart.cartId,
      status: "under_review",
      draft: false,
      totalMinor: 3453,
      currency: "SAR" as const,
    };
    const transaction = v.transactionId
      ? {
          transactionId: v.transactionId,
          orderId: this.mode === "different" ? "999999" : v.orderId,
          cartId:
            this.mode === "absent"
              ? null
              : this.mode === "different"
                ? "999999"
                : item.cart.cartId,
          status: "pending",
          totalMinor: 3453,
          currency: "SAR" as const,
        }
      : null;
    return sallaCheckoutEvidenceOutput.parse({
      requestId: v.requestId,
      observedAt: date,
      cart: item.cart,
      order,
      transaction,
      comparison: sallaEvidenceComparison(item.cart.cartId, order, transaction),
      providerLinkContract: "not_verified",
      attribution: "not_recorded",
      paymentFact: "not_recorded",
    });
  }
  saveAudit(raw: unknown) {
    this.access(true);
    const v = sallaCheckoutAuditInput.parse(raw),
      input = JSON.stringify(v.evidence),
      old = this.audits.find(a => a.reviewId === v.reviewId);
    if (old) {
      if (this.auditInputs.get(v.reviewId) !== input) fail("CONFLICT");
      return structuredClone(old);
    }
    if (this.mode === "saveError") fail("INTERNAL_SERVER_ERROR");
    const audit = sallaCheckoutAuditItem.parse({
      id: Math.max(0, ...this.audits.map(a => a.id)) + 1,
      merchantId: orderPreviewId,
      reviewerUserId: orderPreviewId,
      reviewId: v.reviewId,
      savedAt: new Date().toISOString(),
      evidence: this.inspect(v.evidence),
    });
    this.audits.unshift(audit);
    this.auditInputs.set(v.reviewId, input);
    if (this.mode === "lostAudit") fail("INTERNAL_SERVER_ERROR");
    return structuredClone(audit);
  }
  listAudits(raw: unknown) {
    this.listAccess();
    const v = sallaCheckoutAuditListInput.parse(raw);
    return sallaCheckoutAuditPage.parse(this.page(this.audits, v.beforeId));
  }
  listProblems(raw: unknown) {
    this.listAccess();
    const v = sallaCartProblemListInput.parse(raw);
    return sallaCartProblemPage.parse(
      this.page(
        this.problems.filter(
          p => p.state === v.state && !this.recovered.has(p.requestId)
        ),
        v.beforeId
      )
    );
  }
  recover(raw: unknown) {
    this.access(true);
    const v = sallaCartRecoveryInput.parse(raw),
      old = this.recovered.get(v.requestId);
    if (old) return { ...structuredClone(old), replayed: true };
    const p = this.problems.find(p => p.requestId === v.requestId);
    if (!p || p.diagnostic !== "verifiable" || !p.cartId) fail();
    if (this.mode === "recoveryError") fail("INTERNAL_SERVER_ERROR");
    const recovery = {
      reviewerUserId: orderPreviewId,
      observedAt: new Date().toISOString(),
    };
    const result = sallaCartRecoveryOutput.parse({
      merchantId: orderPreviewId,
      requestId: v.requestId,
      cartId: p.cartId,
      recovery,
      replayed: false,
      outcome: "contents_verified",
      paymentFact: "not_recorded",
      attribution: "not_recorded",
      customerMessage: "not_sent",
    });
    this.recovered.set(v.requestId, result);
    this.carts.unshift({
      id: p.id,
      requestId: p.requestId,
      createdAt: p.createdAt,
      cart: { cartId: p.cartId, preparedTotalMinor: 3453, currency: "SAR" },
      recovery,
    });
    return structuredClone(result);
  }
  listZid(raw: unknown) {
    this.listAccess();
    const v = cursorInput.parse(raw ?? {}),
      { merchantId, ...page } = this.page(this.zid, v.beforeId, 25);
    return { ...page, canManage: this.orders.mode !== "viewer" };
  }
  reconcileZid(raw: unknown) {
    this.access(true);
    const v = zidInput.parse(raw),
      item = this.zid.find(r => r.id === v.quotationId);
    if (
      !item?.canReview ||
      !item.reference ||
      (item.orderId !== null && item.orderId !== v.orderId)
    )
      fail();
    if (this.mode === "zidError") fail("CONFLICT");
    if (this.mode === "zidPending") {
      item.orderId = v.orderId;
      item.state = "succeeded";
      item.projectionPending = true;
      return { verified: true, projectionPending: true };
    }
    this.zid = this.zid.filter(r => r.id !== item.id);
    return { verified: true, projectionPending: false };
  }
}
