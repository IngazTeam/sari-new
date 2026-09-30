import {
  orderListInput,
  orderReadInput,
  orderStates,
  orderPayments,
  type OrderDetail,
  type OrderWorkspace,
} from "../../../shared/order-workspace";
import {
  orderStatusIntent,
  orderStatusWrite,
  orderStatusReceiptInput,
  orderStatusHistoryInput,
  type OrderStatusReview,
  type OrderStatusReceipt,
} from "../../../shared/order-status-review";
import { fillOrderNotificationTemplate as formatOrderNotificationTemplate } from "../../../shared/order-notification-template";
export const orderPreviewId = 9000064;
export const orderPreviewScope = `${orderPreviewId}:${orderPreviewId}:orders`;
export const orderModes = {
  data: "طلبات توضيحية مرقمة",
  empty: "لا توجد طلبات",
  loading: "جارٍ التحميل",
  error: "تعذر القراءة",
  forbidden: "دون صلاحية قراءة",
  viewer: "قراءة فقط",
  missing: "الطلب لم يعد متاحًا",
  conflict: "تعارض عند الحفظ",
  lost: "حُفظ التغيير وضاعت الاستجابة",
  writeError: "تعذر تأكيد الحفظ",
  history: "سجل توضيحي طويل",
} as const;
export type OrderMode = keyof typeof orderModes;
function fail(code: string): never {
  throw Object.assign(Error("Local order simulation"), { data: { code } });
}
/** Memory-only fixture. Review tokens model interaction; they are not server signatures. */
export class OrderPreviewModel {
  mode: OrderMode = "data";
  revision = 0;
  generation = 0;
  rows: OrderDetail[] = [];
  private listeners = new Set<() => void>();
  private versions = new Map<number, number>();
  private receipts = new Map<
    string,
    { input: string; receipt: OrderStatusReceipt; id: number }
  >();
  private conflicted = new Set<number>();
  private serial = 100;
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
  constructor() {
    this.reset();
  }
  reset() {
    this.generation++;
    this.mode = "data";
    this.receipts.clear();
    this.versions.clear();
    this.conflicted.clear();
    this.serial = 100;
    this.rows = Array.from({ length: 27 }, (_, i) => {
      const id = i + 1,
        legacy = id === 6,
        truncated = id === 7;
      const items = [
        {
          name: "باقة متابعة المتجر",
          quantity: 3,
          unitPriceMinor: 1001,
          totalMinor: 3003,
        },
      ];
      this.versions.set(id, id);
      return {
        id,
        merchantId: orderPreviewId,
        number: `DEMO-ORD-${String(id).padStart(3, "0")}`,
        customerName:
          id === 1 ? "عميل المثال · ابدأ من هنا" : `عميل توضيحي ${id}`,
        customerPhone: `+12025550${String(100 + id)}`,
        status: orderStates[i % orderStates.length],
        paymentStatus: orderPayments[i % orderPayments.length],
        currency: id === 3 ? "USD" : "SAR",
        totalMinor: id === 7 ? null : 3453,
        externalReference: id === 8 ? "EXTERNAL-DEMO-8" : null,
        checkoutReviewRequired: false,
        createdAt: `2026-09-${String(30 - i).padStart(2, "0")}T12:00:00.000Z`,
        updatedAt: "2026-09-30T12:00:00.000Z",
        customerEmail: "customer@example.test",
        city: "الرياض",
        address: "عنوان توضيحي\nالحي · المبنى ١",
        trackingNumber: id === 4 ? "DEMO-TRACK" : null,
        notes: "طلب اصطناعي لتجربة التصميم. لا يمثل معاملة حقيقية.",
        paymentUrl: null,
        discountCode: null,
        subtotalMinor: null,
        discountMinor: null,
        discountReleased: false,
        isGift: id === 2,
        giftRecipientName: id === 2 ? "مستلم المثال" : null,
        giftMessage: id === 2 ? "شكرًا لك · رسالة هدية توضيحية" : null,
        reviewRequested: id === 5,
        reviewRequestedAt: id === 5 ? "2026-09-30T12:00:00.000Z" : null,
        items: legacy
          ? items.map(v => ({ ...v, unitPriceMinor: null, totalMinor: null }))
          : truncated
            ? []
            : items,
        rawItems: truncated
          ? "بيانات تاريخية تتجاوز حد العرض…"
          : JSON.stringify(
              legacy ? [{ name: "بند قديم", quantity: 3, price: 10.01 }] : items
            ),
        itemsState: truncated ? "truncated" : legacy ? "legacy" : "parsed",
        truncatedFields: truncated ? ["notes"] : [],
      };
    });
    this.changed();
  }
  setMode(mode: OrderMode) {
    if (!Object.hasOwn(orderModes, mode)) throw Error("Invalid mode");
    this.mode = mode;
    this.changed();
  }
  access(write = false) {
    if (this.mode === "error") fail("INTERNAL_SERVER_ERROR");
    if (this.mode === "forbidden" || (write && this.mode === "viewer"))
      fail("FORBIDDEN");
  }
  workspace(raw: unknown): OrderWorkspace & { canManage: boolean } {
    this.access();
    const selection = orderListInput.parse(raw),
      all = this.mode === "empty" ? [] : this.rows;
    const rows = all.filter(
      r =>
        [r.customerName, r.customerPhone, r.number || ""].some(v =>
          v.toLocaleLowerCase().includes(selection.search.toLocaleLowerCase())
        ) &&
        (selection.status === "all" || r.status === selection.status) &&
        (selection.payment === "all" || r.paymentStatus === selection.payment)
    );
    const pages = Math.max(1, Math.ceil(rows.length / 25)),
      page = Math.min(selection.page, pages);
    return structuredClone({
      merchantId: orderPreviewId,
      selection,
      generatedAt: new Date().toISOString(),
      timeZone: "UTC",
      total: all.length,
      filtered: rows.length,
      page,
      pages,
      pageSize: 25,
      canManage: this.mode !== "viewer",
      items: rows
        .slice((page - 1) * 25, page * 25)
        .map(
          ({
            id,
            merchantId,
            number,
            customerName,
            customerPhone,
            status,
            paymentStatus,
            currency,
            totalMinor,
            externalReference,
            checkoutReviewRequired,
            createdAt,
            updatedAt,
          }) => ({
            id,
            merchantId,
            number,
            customerName,
            customerPhone,
            status,
            paymentStatus,
            currency,
            totalMinor,
            externalReference,
            checkoutReviewRequired,
            createdAt,
            updatedAt,
          })
        ),
      statuses: orderStates.map(status => ({
        status,
        count: rows.filter(r => r.status === status).length,
      })),
      payments: orderPayments.map(status => ({
        status,
        count: rows.filter(r => r.paymentStatus === status).length,
      })),
      values: Array.from(new Set(rows.map(r => r.currency)))
        .sort()
        .map(currency => {
          const g = rows.filter(
              r => r.currency === currency && r.status !== "cancelled"
            ),
            v = g.filter(r => r.totalMinor !== null);
          return {
            currency,
            count: v.length,
            totalMinor: v.reduce((n, r) => n + r.totalMinor!, 0),
            markedPaidMinor: v
              .filter(r => r.paymentStatus === "paid")
              .reduce((n, r) => n + r.totalMinor!, 0),
            excludedAmounts: g.length - v.length,
          };
        }),
      valueBasis: "filtered_non_cancelled_stored_orders",
      unmeasured: {
        settledRevenue: null,
        profit: null,
        salesConversion: null,
        salesProficiency: null,
      },
    });
  }
  detail(id: number) {
    this.access();
    orderReadInput.parse({ id });
    return structuredClone(
      this.mode === "missing" || this.mode === "empty"
        ? null
        : (this.rows.find(r => r.id === id) ?? null)
    );
  }
  private token(id: number, intent: unknown) {
    const key = JSON.stringify([this.versions.get(id), intent]);
    let h = 2166136261;
    for (let i = 0; i < key.length; i++)
      h = Math.imul(h ^ key.charCodeAt(i), 16777619);
    return (h >>> 0).toString(16).padStart(64, "0");
  }
  review(raw: unknown): OrderStatusReview {
    this.access(true);
    const intent = orderStatusIntent.parse(raw),
      row = this.detail(intent.id);
    if (!row) fail("NOT_FOUND");
    const rank: Record<string, number> = {
      pending: 0,
      paid: 1,
      processing: 2,
      shipped: 3,
      delivered: 4,
    };
    if (
      row.externalReference ||
      ["cancelled", "delivered", "unknown"].includes(row.status) ||
      (intent.status !== "cancelled" && rank[intent.status] <= rank[row.status])
    )
      fail("PRECONDITION_FAILED");
    return {
      merchantId: orderPreviewId,
      actorId: orderPreviewId,
      intent,
      digest: this.token(row.id, intent),
      order: {
        id: row.id,
        number: row.number,
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        status: row.status,
        paymentStatus: row.paymentStatus,
        currency: row.currency,
        totalMinor: row.totalMinor,
        trackingNumber: row.trackingNumber,
      },
      notification: intent.notify
        ? {
            customerPhone: row.customerPhone,
            message: formatOrderNotificationTemplate(
              "مرحبًا {{customerName}}، طلبك {{orderNumber}} بقيمة {{total}} {{currency}} تم تحديثه. رقم التتبع: {{trackingNumber}}",
              {
                customerName: row.customerName,
                storeName: "متجر المثال",
                orderNumber: row.number || String(row.id),
                total: row.totalMinor!,
                currency: row.currency as "SAR" | "USD",
                trackingNumber: intent.trackingNumber,
              }
            ),
          }
        : null,
    };
  }
  write(raw: unknown) {
    this.access(true);
    const v = orderStatusWrite.parse(raw),
      key = JSON.stringify(v),
      old = this.receipts.get(v.requestId);
    if (old) {
      if (old.input !== key) fail("CONFLICT");
      return structuredClone(old.receipt);
    }
    if (this.mode === "writeError") fail("INTERNAL_SERVER_ERROR");
    const current = this.review(v.intent),
      row = this.rows.find(r => r.id === v.intent.id)!;
    if (this.mode === "conflict" && !this.conflicted.has(row.id)) {
      this.conflicted.add(row.id);
      this.versions.set(row.id, this.versions.get(row.id)! + 100);
      row.notes += "\nتعديل آخر توضيحي أثناء المراجعة.";
      this.changed();
      fail("CONFLICT");
    }
    if (v.expectedDigest !== current.digest) fail("CONFLICT");
    const receipt: OrderStatusReceipt = {
      version: "order-status.v1",
      merchantId: orderPreviewId,
      actorId: orderPreviewId,
      requestId: v.requestId,
      orderId: row.id,
      from: row.status as OrderStatusReceipt["from"],
      status: v.intent.status,
      trackingNumber: v.intent.trackingNumber ?? null,
      reason: v.intent.reason ?? null,
      notificationQueued: v.intent.notify,
      committedAt: new Date().toISOString(),
    };
    row.status = v.intent.status;
    if (v.intent.trackingNumber) row.trackingNumber = v.intent.trackingNumber;
    row.updatedAt = receipt.committedAt;
    this.versions.set(row.id, this.versions.get(row.id)! + 100);
    this.receipts.set(v.requestId, { input: key, receipt, id: ++this.serial });
    this.changed();
    if (this.mode === "lost") fail("INTERNAL_SERVER_ERROR");
    return structuredClone(receipt);
  }
  receipt(raw: unknown) {
    this.access(true);
    const v = orderStatusReceiptInput.parse(raw);
    return structuredClone(this.receipts.get(v.requestId)?.receipt ?? null);
  }
  history(raw: unknown) {
    this.access();
    const v = orderStatusHistoryInput.parse(raw);
    if (!this.detail(v.id)) fail("NOT_FOUND");
    const actual = Array.from(this.receipts.values())
      .filter(r => r.receipt.orderId === v.id)
      .map(({ id, receipt }) => ({ id, receipt }));
    const fixture =
      this.mode === "history"
        ? Array.from({ length: 22 }, (_, i) => ({
            id: i + 1,
            receipt: {
              version: "order-status.v1",
              merchantId: orderPreviewId,
              actorId: orderPreviewId,
              requestId: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
              orderId: v.id,
              from: "pending",
              status: "processing",
              trackingNumber: null,
              reason:
                "سطر اصطناعي لاختبار ترقيم السجل؛ لا يمثل تسلسل طلب حقيقي.",
              notificationQueued: false,
              committedAt: "2026-09-30T00:00:00.000Z",
            } as OrderStatusReceipt,
          }))
        : [];
    const rows = [...actual, ...fixture]
      .filter(r => !v.beforeId || r.id < v.beforeId)
      .sort((a, b) => b.id - a.id);
    return structuredClone({
      merchantId: orderPreviewId,
      orderId: v.id,
      beforeId: v.beforeId ?? null,
      items: rows.slice(0, 20),
      next: rows.length > 20 ? rows[19].id : null,
    });
  }
}
