import {
  calculateQuotation,
  quotationDraftInput,
  quotationChangeInput,
  quotationTargetInput,
  type QuotationReceipt,
} from "../../../shared/quotation-mutations";
import {
  quotationListInput,
  quotationStatuses,
  type QuotationDetail,
  type QuotationWorkspace,
} from "../../../shared/quotation-workspace";
import { quotationReviewInput } from "../../../shared/quotation-review";
import { quotationDeliveryInput } from "../../../shared/quotation-delivery";
export const previewIdentity = 9000054;
export const previewScope = `${previewIdentity}:${previewIdentity}:sales-hub`;
export const previewModes = {
  normal: "بيانات توضيحية",
  empty: "بلا عروض",
  loading: "جارٍ التحميل",
  error: "تعذر القراءة",
  forbidden: "دون صلاحية قراءة",
  viewer: "قراءة فقط",
  supervisor: "مشرف مبيعات",
  conflict: "تعارض عند الحفظ",
  lostSave: "حُفظ الطلب وضاعت الاستجابة",
  prepareFailed: "تعذر تحضير المراجعة",
  unknownSend: "نتيجة إرسال غير مؤكدة",
  rejectedSend: "رفض مزود تجريبي",
  deliveredSend: "وصول تجريبي",
  expiredReview: "مراجعة منتهية",
} as const;
export type PreviewMode = keyof typeof previewModes;
type DemoReview = {
  id: number;
  requestId: string;
  quotationId: number;
  revision: number;
  snapshotHash: string;
  expiresAt: string;
  [key: string]: any;
};
const fail = (code: string) => {
  throw Object.assign(Error("Local simulation"), { data: { code } });
};
export class QuotationPreviewModel {
  mode: PreviewMode = "normal";
  rows: QuotationDetail[] = [];
  target = {
    id: 1,
    amountMinor: 100000,
    revision: 1,
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
  };
  receipts = new Map<string, QuotationReceipt>();
  inputs = new Map<string, string>();
  reviews = new Map<string, DemoReview>();
  deliveries = new Map<string, any>();
  revision = 0;
  private listeners = new Set<() => void>();
  constructor() {
    this.reset();
  }
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  changed = () => {
    this.revision++;
    this.listeners.forEach(fn => fn());
  };
  setMode(mode: PreviewMode) {
    this.mode = mode;
    this.changed();
  }
  reset() {
    this.rows = Array.from({ length: 26 }, (_, i) => ({
      id: i + 1,
      merchantId: previewIdentity,
      number: `DEMO-26-${String(i + 1).padStart(4, "0")}`,
      customerName:
        i === 0 ? "متجر المثال · تجهيز عرض جديد" : `عميل توضيحي ${i + 1}`,
      customerPhone: `+12025550${String(i + 100).padStart(3, "0")}`,
      status: quotationStatuses[i % quotationStatuses.length],
      currency: i % 4 === 0 ? "USD" : "SAR",
      subtotalMinor: 3003,
      taxMinor: 450,
      totalMinor: 3453,
      createdAt: `2026-09-${String(30 - i).padStart(2, "0")}T12:00:00.000Z`,
      validUntil: i % 7 === 5 ? "2026-09-29" : "2026-10-07",
      validityElapsed: i % 7 === 5,
      managed: i === 7,
      provider: i === 7 ? "mock" : null,
      conversationId: null,
      orderId: null,
      revision: 1,
      taxBasisPoints: 1500,
      items: [
        {
          name: "خدمة متابعة المبيعات",
          description: "بنود توضيحية كاملة، قابلة للمراجعة والنسخ قبل الإجراء.",
          quantity: 3,
          unitPriceMinor: 1001,
          totalMinor: 3003,
        },
      ],
      rawItems: i === 6 ? "نص تاريخي تجريبي يحتاج مراجعة" : null,
      itemsTruncated: false,
    }));
    this.target = {
      id: 1,
      amountMinor: 100000,
      revision: 1,
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
    };
    this.receipts.clear();
    this.inputs.clear();
    this.reviews.clear();
    this.deliveries.clear();
    this.mode = "normal";
    this.changed();
  }
  access(write = false, target = false) {
    if (this.mode === "error") fail("INTERNAL_SERVER_ERROR");
    if (
      this.mode === "forbidden" ||
      (write && this.mode === "viewer") ||
      (target && this.mode === "supervisor")
    )
      fail("FORBIDDEN");
  }
  workspace(
    raw: unknown
  ): QuotationWorkspace & { canManage: boolean; canSetTarget: boolean } {
    this.access();
    const selection = quotationListInput.parse(raw),
      rows = this.mode === "empty" ? this.rows.filter(q => q.id > 26) : this.rows,
      accepted = rows.filter(q => q.status === "accepted"),
      sar = accepted.filter(q => q.currency === "SAR" && q.totalMinor !== null),
      sum = sar.reduce((a, q) => a + q.totalMinor!, 0),
      matches = rows.filter(
        q =>
          (selection.status === "all" || q.status === selection.status) &&
          [q.number, q.customerName, q.customerPhone].some(s =>
            s?.toLowerCase().includes(selection.search.toLowerCase())
          )
      );
    return {
      merchantId: previewIdentity,
      canManage: this.mode !== "viewer",
      canSetTarget: !["viewer", "supervisor"].includes(this.mode),
      selection,
      generatedAt: "2026-09-30T12:00:00.000Z",
      timeZone: "UTC",
      total: rows.length,
      statuses: quotationStatuses.map(status => ({
        status,
        count: rows.filter(q => q.status === status).length,
      })),
      acceptedShare: rows.length ? (accepted.length / rows.length) * 100 : null,
      values: [...new Set(accepted.map(q => q.currency))].map(currency => {
        const group = accepted.filter(q => q.currency === currency);
        return {
          currency,
          count: group.length,
          totalMinor: group.reduce((a, q) => a + (q.totalMinor ?? 0), 0),
          excludedAmounts: group.filter(q => q.totalMinor === null).length,
        };
      }),
      currentMonth: {
        from: "2026-09-01T00:00:00.000Z",
        through: "2026-09-30T12:00:00.000Z",
        end: "2026-09-30",
      },
      target: { ...this.target },
      targetBasis: {
        created: rows.length,
        accepted: accepted.length,
        acceptedSar: sar.length,
        acceptedSarMinor: sum,
        excludedSarAmounts: 0,
        progress:
          this.target.amountMinor > 0
            ? (sum / this.target.amountMinor) * 100
            : null,
      },
      list: {
        items: structuredClone(
          matches.slice(
            (selection.page - 1) * selection.pageSize,
            selection.page * selection.pageSize
          )
        ),
        total: matches.length,
        totalPages: Math.ceil(matches.length / selection.pageSize),
      },
      unmeasured: {
        delivered: null,
        settledRevenue: null,
        salesConversion: null,
        salesProficiency: null,
      },
    };
  }
  detail(id: number) {
    this.access();
    const row = this.rows.find(q => q.id === id);
    if (!row) fail("NOT_FOUND");
    return structuredClone(row!);
  }
  receipt(requestId: string) {
    this.access();
    return this.receipts.get(requestId) ?? null;
  }
  mutate(kind: "create" | "status" | "target", raw: unknown) {
    this.access(true, kind === "target");
    const input =
        kind === "create"
          ? quotationDraftInput.parse(raw)
          : kind === "status"
            ? quotationChangeInput.parse(raw)
            : quotationTargetInput.parse(raw),
      key = JSON.stringify([kind, input]);
    const old = this.receipts.get(input.requestId);
    if (old) {
      if (this.inputs.get(input.requestId) !== key) fail("CONFLICT");
      return structuredClone(old);
    }
    if (this.mode === "conflict") {
      this.mode = "normal";
      if (kind === "status")
        this.rows.find(q => q.id === (input as any).id)!.revision++;
      else if (kind === "target") this.target.revision++;
      this.changed();
      fail("CONFLICT");
    }
    let recordId: number, revision: number;
    if (kind === "create") {
      const value = quotationDraftInput.parse(input),
        totals = calculateQuotation(value.items, value.taxBasisPoints);
      recordId = Math.max(...this.rows.map(q => q.id), 0) + 1;
      revision = 1;
      this.rows.unshift({
        id: recordId,
        merchantId: previewIdentity,
        number: `DEMO-NEW-${recordId}`,
        customerName: value.customerName ?? null,
        customerPhone: value.customerPhone ?? null,
        status: "draft",
        currency: value.currency,
        subtotalMinor: totals.subtotalMinor,
        taxMinor: totals.taxMinor,
        totalMinor: totals.totalMinor,
        createdAt: "2026-09-30T12:00:00.000Z",
        validUntil: new Date(Date.UTC(2026, 8, 30 + value.validDays))
          .toISOString()
          .slice(0, 10),
        validityElapsed: false,
        managed: false,
        provider: null,
        conversationId: null,
        orderId: null,
        revision,
        taxBasisPoints: value.taxBasisPoints,
        items: totals.items.map(v => ({
          name: v.name,
          description: v.description ?? null,
          quantity: v.quantity,
          unitPriceMinor: Math.round(v.unitPrice * 100),
          totalMinor: Math.round(v.total * 100),
        })),
        rawItems: null,
        itemsTruncated: false,
      });
    } else if (kind === "status") {
      const value = quotationChangeInput.parse(input),
        q = this.rows.find(q => q.id === value.id);
      if (!q) fail("NOT_FOUND");
      if (
        q!.managed ||
        q!.revision !== value.expectedRevision ||
        q!.status !== value.expectedStatus ||
        (q!.validityElapsed && value.status === "accepted")
      )
        fail("CONFLICT");
      q!.status = value.status;
      revision = ++q!.revision;
      recordId = q!.id;
    } else {
      const value = quotationTargetInput.parse(input);
      if (
        value.expectedRevision !== this.target.revision ||
        value.period !== "2026-09"
      )
        fail("CONFLICT");
      this.target.amountMinor = Math.round(value.amount * 100);
      revision = ++this.target.revision;
      recordId = this.target.id;
    }
    const receipt: QuotationReceipt = {
      merchantId: previewIdentity,
      requestId: input.requestId,
      kind,
      recordId,
      revision,
      changed: true,
      committedAt: new Date().toISOString(),
    };
    this.receipts.set(input.requestId, receipt);
    this.inputs.set(input.requestId, key);
    const lost = this.mode === "lostSave";
    if (lost) this.mode = "normal";
    this.changed();
    if (lost) fail("TIMEOUT");
    return structuredClone(receipt);
  }
  sendWorkspace(id: number) {
    this.access(true);
    const q = this.detail(id),
      review =
        [...this.reviews.values()].filter(r => r.quotationId === id).at(-1) ??
        null,
      delivery =
        [...this.deliveries.values()]
          .filter(r => r.quotationId === id)
          .at(-1) ?? null;
    return {
      merchantId: previewIdentity,
      actorId: previewIdentity,
      quotationId: id,
      number: q.number,
      revision: q.revision,
      reason: q.managed
        ? "managed"
        : !["draft", "sent", "viewed"].includes(q.status)
          ? "closed"
          : q.validityElapsed
            ? "expired"
            : !q.customerPhone
              ? "phone"
              : delivery?.state === "dispatching"
                ? "attempted"
                : null,
      accounts: [
        { id: 1, provider: "mock", label: "حساب محاكاة محلي", primary: true },
      ],
      templates: [{ id: 1, name: "شروط توضيحية مختارة صراحةً" }],
      accountsTruncated: false,
      templatesTruncated: false,
      review: review ? structuredClone(review) : null,
      delivery: delivery ? structuredClone(delivery) : null,
      deliveryOwned: true,
    };
  }
  prepare(raw: unknown) {
    this.access(true);
    const input = quotationReviewInput.parse(raw),
      old = this.reviews.get(input.requestId);
    if (old) return structuredClone(old);
    if (this.mode === "prepareFailed") fail("INTERNAL_SERVER_ERROR");
    const q = this.detail(input.quotationId);
    if (
      this.sendWorkspace(q.id).reason ||
      q.revision !== input.expectedRevision ||
      input.instanceRecordId !== 1 ||
      ![null, 1].includes(input.templateId) ||
      q.rawItems !== null
    )
      fail("CONFLICT");
    const id = this.reviews.size + 1,
      review: DemoReview = {
        id,
        requestId: input.requestId,
        merchantId: previewIdentity,
        actorId: previewIdentity,
        quotationId: q.id,
        revision: q.revision,
        status: q.status,
        snapshotHash: id.toString(16).padStart(64, "0"),
        instanceRecordId: 1,
        provider: "mock",
        accountLabel: "حساب محاكاة محلي",
        templateId: input.templateId,
        document: {
          data: {
            quotationNumber: q.number,
            merchantName: "متجر نواة · نموذج محلي",
            merchantPhone: null,
            customerName: q.customerName,
            customerPhone: q.customerPhone,
            items: q.items.map(v => ({
              name: v.name,
              description: v.description,
              quantity: v.quantity,
              unitPrice: v.unitPriceMinor! / 100,
              total: v.totalMinor! / 100,
            })),
            subtotal: q.subtotalMinor! / 100,
            taxAmount: q.taxMinor! / 100,
            taxRate: q.taxBasisPoints! / 10000,
            total: q.totalMinor! / 100,
            currency: q.currency,
            createdAt: q.createdAt.slice(0, 10),
            validUntil: q.validUntil,
            termsText: input.templateId
              ? "هذه شروط توضيحية لا تمثل اتفاقًا حقيقيًا."
              : null,
            footerText: input.templateId ? "نموذج محلي دون إرسال" : null,
          },
          logoDataUrl: null,
          logoOmitted: false,
        },
        caption: `عرض توضيحي ${q.number} · لا إرسال خارجي`,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(
          Date.now() + (this.mode === "expiredReview" ? -1000 : 900000)
        ).toISOString(),
        expired: this.mode === "expiredReview",
        sent: false,
      };
    this.reviews.set(input.requestId, review);
    this.changed();
    return structuredClone(review);
  }
  send(raw: unknown) {
    this.access(true);
    const input = quotationDeliveryInput.parse(raw),
      old = this.deliveries.get(input.requestId);
    if (old) return structuredClone(old);
    const review = [...this.reviews.values()].find(
      r => r.id === input.reviewId
    );
    if (
      !review ||
      review.snapshotHash !== input.snapshotHash ||
      Date.parse(review.expiresAt) <= Date.now()
    )
      fail("CONFLICT");
    const q = this.rows.find(q => q.id === review!.quotationId)!;
    if (this.sendWorkspace(q.id).reason || q.revision !== review.revision)
      fail("CONFLICT");
    const transport =
      this.mode === "unknownSend"
        ? "unknown"
        : this.mode === "rejectedSend"
          ? "rejected"
          : this.mode === "deliveredSend"
            ? "delivered"
            : "accepted";
    const receipt = {
      id: this.deliveries.size + 1,
      requestId: input.requestId,
      merchantId: previewIdentity,
      quotationId: q.id,
      reviewId: review.id,
      snapshotHash: review.snapshotHash,
      state: "dispatching",
      transport,
      projection: ["accepted", "delivered"].includes(transport)
        ? "recorded"
        : "pending",
      providerMessageId: ["accepted", "delivered"].includes(transport)
        ? `DEMO-ONLY-${review.id}`
        : null,
      preparationFailed: false,
      expired: false,
      recipient: q.customerPhone,
      caption: review.caption,
    };
    this.deliveries.set(input.requestId, receipt);
    if (receipt.projection === "recorded") {
      q.status = "sent";
      q.revision++;
    }
    this.changed();
    return structuredClone(receipt);
  }
}
