import {
  customerListInput,
  customerDetailInput,
  customerExportInput,
  type CustomerList,
  type CustomerDetail,
  type CustomerRow,
} from "../../../shared/customer-workspace";
import {
  customerAnnotationWrite,
  type CustomerAnnotationReceipt,
} from "../../../shared/customer-annotations";
import { buildCsv } from "../../../server/utils/csv";
export const customerPreviewScope = "9000076:9000076:customers";
export const customerPreviewId = 9000076;
export const customerModes = {
  data: "بيانات وتجربة الحفظ",
  empty: "قائمة فارغة",
  loading: "تحميل",
  error: "فشل القراءة",
  offline: "اتصال موقوف",
  forbidden: "دون صلاحية",
  session: "انتهاء الجلسة",
  viewer: "قراءة فقط",
  wrongTenant: "بيانات متجر مختلف",
  wrongSelection: "بيانات اختيار سابق",
  missing: "عميل غير موجود",
  long: "نصوص طويلة",
  ambiguous: "ولاء ملتبس وقيمة غير صالحة",
  saveError: "رفض الحفظ",
  uncertain: "حفظ مع فقد الرد",
  receiptError: "فشل التحقق من الإيصال",
  exportError: "فشل التصدير",
  exportSlow: "تصدير مؤجل",
} as const;
export type CustomerMode = keyof typeof customerModes;
const through = "2026-09-30T12:00:00.000Z";
const pagination = (page: number, total: number) => ({
  page,
  pageSize: 25 as const,
  total,
  pages: Math.ceil(total / 25),
});
const error = (code: string) => Object.assign(Error(code), { data: { code } });
export class CustomerPreviewStore {
  mode: CustomerMode = "data";
  version = 0;
  private listeners = new Set<() => void>();
  private annotations = new Map<
    string,
    {
      tags: string[];
      revision: number;
      notes: {
        id: number;
        actorId: number;
        content: string;
        createdAt: string;
      }[];
    }
  >();
  private receipts = new Map<
    string,
    { input: string; result: CustomerAnnotationReceipt }
  >();
  private pending = new Set<() => void>();
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  changed = () => {
    this.version++;
    this.listeners.forEach(fn => fn());
  };
  setMode = (mode: CustomerMode) => {
    if (!(mode in customerModes)) return;
    this.mode = mode;
    this.changed();
  };
  refresh = async () => {
    if (
      ["error", "offline", "loading", "wrongTenant", "wrongSelection"].includes(
        this.mode
      )
    )
      this.mode = "data";
    this.changed();
  };
  reset = () => {
    this.annotations.clear();
    this.receipts.clear();
    this.mode = "data";
    this.changed();
    this.release();
  };
  release = () => {
    this.pending.forEach(fn => fn());
    this.pending.clear();
  };
  private rows(): CustomerRow[] {
    if (this.mode === "empty") return [];
    return Array.from({ length: 32 }, (_, i) => ({
      key:
        i === 1
          ? "customer%2F76"
          : `966500000${String(i + 1).padStart(3, "0")}`,
      name:
        this.mode === "long"
          ? "اسم عميل توضيحي طويل جدًا ".repeat(18)
          : i === 2
            ? "<img src=x onerror=alert(1)>"
            : `عميل توضيحي ${i + 1}`,
      firstRecordedAt:
        i < 3 ? "2026-09-01T08:00:00.000Z" : "2026-08-01T08:00:00.000Z",
      lastInteractionAt:
        i % 4 === 3
          ? null
          : i % 4 === 2
            ? "2026-07-01T08:00:00.000Z"
            : i % 4 === 1
              ? "2026-09-10T08:00:00.000Z"
              : through,
      activity: (["active", "recent", "inactive", "unknown"] as const)[i % 4],
      sources: ["conversation", "order", "profile", "zid", "loyalty"],
      conversationCount: 28,
      orderCount: 27,
      profileCount: 1,
      zidCount: 1,
      loyaltyCount: this.mode === "ambiguous" ? 2 : 1,
    }));
  }
  list(raw: unknown): CustomerList {
    const selection = customerListInput.parse(raw),
      all = this.rows(),
      rows = all.filter(
        r =>
          (!selection.search ||
            (r.name + " " + r.key).includes(selection.search)) &&
          (selection.activity === "all" || r.activity === selection.activity)
      );
    return {
      merchantId: this.mode === "wrongTenant" ? 1 : customerPreviewId,
      canManage: this.mode !== "viewer",
      through,
      selection:
        this.mode === "wrongSelection"
          ? { ...selection, page: selection.page + 1 }
          : selection,
      totals: {
        all: all.length,
        active: all.filter(r => r.activity === "active").length,
        recent: all.filter(r => r.activity === "recent").length,
        inactive: all.filter(r => r.activity === "inactive").length,
        unknown: all.filter(r => r.activity === "unknown").length,
        firstRecordedThisMonth: all.filter(r =>
          r.firstRecordedAt!.startsWith("2026-09")
        ).length,
        excludedEmptyIdentifiers: this.mode === "empty" ? 0 : 2,
        excludedInvalidIdentifiers: this.mode === "empty" ? 0 : 1,
      },
      pagination: pagination(selection.page, rows.length),
      rows: rows.slice((selection.page - 1) * 25, selection.page * 25),
    };
  }
  detail(raw: unknown): CustomerDetail {
    const selection = customerDetailInput.parse(raw),
      customer =
        this.mode === "missing"
          ? null
          : this.rows().find(r => r.key === selection.key) || null;
    const orders = customer
      ? Array.from({ length: 27 }, (_, i) => ({
          id: 7600 + i,
          reference:
            this.mode === "long" ? "REFERENCE".repeat(40) : `MOCK-76-${i + 1}`,
          customerPhone: selection.key,
          currency: i % 2 ? ("USD" as const) : ("SAR" as const),
          totalMinor:
            this.mode === "ambiguous" && i === 2 ? null : 12500 + i * 100,
          status: i === 0 ? "pending" : i === 1 ? "cancelled" : "delivered",
          paymentStatus: i % 2 ? "paid" : "unpaid",
          createdAt: through,
        }))
      : [];
    const amounts = (["SAR", "USD"] as const).flatMap(currency => {
      const eligible = orders.filter(
        o => o.currency === currency && o.status === "delivered"
      );
      return eligible.length
        ? [
            {
              currency,
              eligibleOrders: eligible.length,
              excludedAmounts: eligible.filter(o => o.totalMinor === null)
                .length,
              totalMinor: eligible.reduce(
                (sum, o) => sum + (o.totalMinor ?? 0),
                0
              ),
              markedPaidMinor: eligible
                .filter(o => o.paymentStatus === "paid")
                .reduce((sum, o) => sum + (o.totalMinor ?? 0), 0),
            },
          ]
        : [];
    });
    const conversations = customer
      ? Array.from({ length: 28 }, (_, i) => ({
          id: 7600 + i,
          customerPhone: selection.key,
          name: `اسم المصدر ${i + 1}`,
          status: i % 2 ? "closed" : "active",
          createdAt: through,
          lastMessageAt: through,
        }))
      : [];
    return {
      merchantId: this.mode === "wrongTenant" ? 1 : customerPreviewId,
      through,
      selection:
        this.mode === "wrongSelection"
          ? { ...selection, ordersPage: selection.ordersPage + 1 }
          : selection,
      customer,
      amounts,
      loyalty: {
        records: customer ? (this.mode === "ambiguous" ? 2 : 1) : 0,
        points: customer && this.mode !== "ambiguous" ? 76 : null,
      },
      orders: {
        pagination: pagination(selection.ordersPage, orders.length),
        rows: orders.slice(
          (selection.ordersPage - 1) * 25,
          selection.ordersPage * 25
        ),
      },
      conversations: {
        pagination: pagination(
          selection.conversationsPage,
          conversations.length
        ),
        rows: conversations.slice(
          (selection.conversationsPage - 1) * 25,
          selection.conversationsPage * 25
        ),
      },
    };
  }
  private record(key: string) {
    let value = this.annotations.get(key);
    if (!value) {
      value = { tags: ["عميل توضيحي"], revision: 0, notes: [] };
      this.annotations.set(key, value);
    }
    return value;
  }
  read(input: { key: string; page: number }) {
    const value = this.record(input.key);
    return {
      merchantId: this.mode === "wrongTenant" ? 1 : customerPreviewId,
      key: input.key,
      selection:
        this.mode === "wrongSelection"
          ? { ...input, page: input.page + 1 }
          : input,
      canManage: this.mode !== "viewer",
      revision: value.revision,
      tags: [...value.tags],
      pagination: pagination(input.page, value.notes.length),
      notes: value.notes.slice((input.page - 1) * 25, input.page * 25),
    };
  }
  conflict(key: string) {
    const value = this.record(key);
    value.tags = ["وسم أضافه زميل في المحاكاة"];
    value.revision++;
    this.changed();
  }
  async write(raw: unknown) {
    const input = customerAnnotationWrite.parse(raw);
    if (["viewer", "forbidden", "session"].includes(this.mode))
      throw error(this.mode === "session" ? "UNAUTHORIZED" : "FORBIDDEN");
    if (this.mode === "saveError") throw error("BAD_REQUEST");
    const previous = this.receipts.get(input.requestId);
    if (previous) {
      if (previous.input !== JSON.stringify(input)) throw error("CONFLICT");
      return structuredClone(previous.result);
    }
    const value = this.record(input.key);
    if (input.kind === "tags" && input.expectedRevision !== value.revision)
      throw error("CONFLICT");
    const result: CustomerAnnotationReceipt = {
      merchantId: customerPreviewId,
      actorId: customerPreviewId,
      key: input.key,
      requestId: input.requestId,
      kind: input.kind,
      noteId: null,
      tags: null,
      revision: null,
      createdAt: through,
    };
    if (input.kind === "note") {
      result.noteId = 76000 + value.notes.length;
      value.notes.unshift({
        id: result.noteId,
        actorId: customerPreviewId,
        content: input.content,
        createdAt: through,
      });
    } else {
      value.tags = [...input.tags];
      value.revision++;
      result.tags = [...value.tags];
      result.revision = value.revision;
    }
    this.receipts.set(input.requestId, {
      input: JSON.stringify(input),
      result,
    });
    this.changed();
    if (["uncertain", "receiptError"].includes(this.mode))
      throw Error("Simulated lost acknowledgement");
    return structuredClone(result);
  }
  async receipt(requestId: string) {
    if (this.mode === "receiptError")
      throw Error("Simulated receipt unavailable");
    return structuredClone(this.receipts.get(requestId)?.result ?? null);
  }
  async exportCsv(raw: unknown) {
    const selection = customerExportInput.parse(raw);
    if (this.mode === "exportError") throw Error("Simulated export failure");
    const result = this.list({
      search: selection.search,
      activity: selection.activity,
      page: 1,
    });
    const all = this.rows().filter(
      r =>
        (!selection.search ||
          (r.name + " " + r.key).includes(selection.search)) &&
        (selection.activity === "all" || r.activity === selection.activity)
    );
    const headings =
      selection.language === "en"
        ? [
            "Identifier",
            "Name",
            "Activity",
            "First recorded UTC",
            "Last interaction UTC",
            "Conversations",
            "All orders",
            "Eligible SAR",
            "Eligible USD",
            "Excluded amounts",
            "Loyalty records",
            "Single balance",
            "Sources",
            "Snapshot UTC",
          ]
        : [
            "المعرّف",
            "الاسم",
            "النشاط",
            "أول تسجيل UTC",
            "آخر نشاط UTC",
            "المحادثات",
            "كل الطلبات",
            "الطلبات المؤهلة SAR",
            "الطلبات المؤهلة USD",
            "مبالغ مستبعدة",
            "سجلات الولاء",
            "رصيد منفرد",
            "المصادر",
            "اللقطة UTC",
          ];
    const data = buildCsv(
      headings,
      all.map(row => {
        const detail = this.detail({ key: row.key });
        return [
          /^\d+$/.test(row.key) ? "'" + row.key : row.key,
          row.name ?? "",
          row.activity,
          row.firstRecordedAt ?? "",
          row.lastInteractionAt ?? "",
          row.conversationCount,
          row.orderCount,
          ...(["SAR", "USD"] as const).map(c =>
            (
              (detail.amounts.find(a => a.currency === c)?.totalMinor ?? 0) /
              100
            ).toFixed(2)
          ),
          detail.amounts.reduce((sum, a) => sum + a.excludedAmounts, 0),
          detail.loyalty.records,
          detail.loyalty.points ?? "",
          row.sources.join(" / "),
          through,
        ];
      })
    );
    if (this.mode === "exportSlow")
      await new Promise<void>(resolve => this.pending.add(resolve));
    return {
      merchantId: result.merchantId,
      selection,
      through,
      count: all.length,
      limit: 5000,
      filename: "sary-customer-preview.csv",
      mimeType: "text/csv;charset=utf-8",
      data,
    };
  }
}
