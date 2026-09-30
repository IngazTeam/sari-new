import {
  inventorySheetExportInput,
  inventoryExportReceipt,
} from "../../../shared/inventory-sheet-export";
import { projectInventoryExport } from "../../../shared/inventory-sheet-export-plan";
import { importPreviewId } from "./import-model";
export const exportPreviewScope = `${importPreviewId}:${importPreviewId}:data-sync`;
export const exportModes = {
  ready: "جاهز للتصدير",
  unlinked: "غير مربوط",
  oauth: "OAuth غير جاهز",
  loading: "تحميل الحالة",
  offline: "اتصال موقوف",
  readError: "فشل قراءة الحالة",
  forbidden: "دون صلاحية",
  session: "انتهاء الجلسة",
  wrongTenant: "تيننت مختلف",
  sourceChanged: "تغير الاتصال عند الإرسال",
  empty: "كتالوج فارغ",
  limit: "حد حجم التصدير",
  destination: "ورقة المخزون غير موجودة",
  rateLimit: "حد المحاولات",
  failure: "فشل مرجع قديم",
  lostReply: "تمت الكتابة وفُقد الرد",
  notSent: "فُقد الرد قبل الكتابة",
  wrongReceipt: "إقرار لوجهة مختلفة",
  long: "اسم منتج طويل",
};
export type ExportMode = keyof typeof exportModes;
const failure = (code: string, reason: string) =>
  Object.assign(Error(`inventory_export:${reason}`), { data: { code } });
export class ExportPreviewStore {
  mode: ExportMode = "ready";
  sent = 0;
  accepted = 0;
  rows: string[][] = [];
  constructor(private changed: () => void = () => {}) {}
  setMode = (mode: ExportMode) => {
    if (mode in exportModes) {
      this.mode = mode;
      this.changed();
    }
  };
  reset = () => {
    this.mode = "ready";
    this.sent = 0;
    this.accepted = 0;
    this.rows = [];
    this.changed();
  };
  refresh = async () => {
    this.changed();
  };
  status = () => {
    if (this.mode === "forbidden") throw failure("FORBIDDEN", "unavailable");
    if (this.mode === "session") throw failure("UNAUTHORIZED", "unavailable");
    if (this.mode === "readError")
      throw failure("INTERNAL_SERVER_ERROR", "unavailable");
    const linked = !["unlinked", "oauth"].includes(this.mode);
    return {
      merchantId:
        this.mode === "wrongTenant" ? importPreviewId + 1 : importPreviewId,
      actorId: importPreviewId,
      isConnected: linked,
      spreadsheetId: linked ? "local-export-demo" : undefined,
      sourceDigest: linked ? "a".repeat(64) : undefined,
      reason: linked
        ? null
        : this.mode === "oauth"
          ? "oauth_disabled"
          : "unlinked",
      lastSync: undefined,
    };
  };
  send = async (raw: unknown) => {
    const input = inventorySheetExportInput.parse(raw),
      current = this.status(),
      mode = this.mode;
    if (
      !current.isConnected ||
      input.expectedSourceDigest !== current.sourceDigest ||
      current.merchantId !== importPreviewId
    )
      throw failure("PRECONDITION_FAILED", "unavailable");
    this.sent++;
    this.changed();
    await new Promise(resolve => setTimeout(resolve, 40));
    const blocked = {
      sourceChanged: ["CONFLICT", "unavailable"],
      empty: ["BAD_REQUEST", "empty"],
      limit: ["BAD_REQUEST", "limit"],
      destination: ["BAD_GATEWAY", "destination"],
      rateLimit: ["TOO_MANY_REQUESTS", "rate_limit"],
    } as const;
    if (mode in blocked) {
      const [code, reason] = blocked[mode as keyof typeof blocked];
      throw failure(code, reason);
    }
    if (mode === "failure") return { success: false as const };
    if (mode === "notSent") throw Error("Local reply lost");
    const at = new Date().toISOString();
    const items = Array.from({ length: 25 }, (_, i) => ({
      id: 901 + i,
      merchantId: importPreviewId,
      name:
        mode === "long" && i === 0
          ? "منتج محلي باسم طويل ".repeat(12).slice(0, 255)
          : `منتج محلي ${i + 1}`,
      category: "المثال",
      price: 1234 + i,
      priceUnit: i === 2 ? "unverified" : "minor",
      currency: i % 2 ? "USD" : "SAR",
      stock: i === 0 ? 0 : i === 1 ? null : i + 3,
    }));
    const result = projectInventoryExport(items, importPreviewId, at);
    this.rows = result.rows;
    this.accepted++;
    this.changed();
    if (mode === "lostReply") throw Error("Local accepted reply lost");
    return inventoryExportReceipt.parse({
      success: true,
      merchantId: importPreviewId,
      actorId: importPreviewId,
      sourceDigest: input.expectedSourceDigest,
      spreadsheetId:
        mode === "wrongReceipt" ? "foreign-demo" : "local-export-demo",
      sheetId: 0,
      rows: this.rows.length,
      unknownStock: result.unknownStock,
      unverifiedPrice: result.unverifiedPrice,
      confirmedAt: at,
    });
  };
}
