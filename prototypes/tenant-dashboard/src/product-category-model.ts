import { z } from "zod";
import {
  categoryReceipt,
  categorySnapshot,
  categoryWrite,
  planCategoryChange,
  type CategoryRow,
} from "../../../shared/product-categories";
import { productPreviewId } from "./product-model";

export const categoryModes = {
  data: "فئات وفروع ومنتجات مرتبطة",
  empty: "فئات فارغة",
  loading: "تحميل الفئات",
  error: "فشل قراءة الفئات",
  offline: "توقف الاتصال",
  forbidden: "دون صلاحية",
  session: "جلسة منتهية",
  viewer: "قراءة فقط",
  source: "كتالوج خارجي",
  wrongTenant: "نطاق متجر غير مطابق",
  long: "أسماء طويلة",
  broken: "فئات قديمة تحتاج إصلاح الأب",
  limit: "بلوغ حد الفئات",
  saveError: "رفض الحفظ",
  uncertain: "حفظ مع فقد الرد",
  notCommitted: "طلب لم يصل",
  receiptError: "تعذر قراءة الإيصال",
  wrongReceipt: "إيصال غير مطابق",
} as const;
export type CategoryMode = keyof typeof categoryModes;
const error = (code: string) => Object.assign(Error(code), { data: { code } });
// Synthetic preview fingerprint only; the application hashes the database snapshot.
function fingerprint(value: unknown) {
  let hash = 2166136261;
  for (const char of JSON.stringify(value))
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0").repeat(8);
}
function fixture(id: number): CategoryRow {
  return {
    id,
    merchantId: productPreviewId,
    name: id === 1 ? "القهوة" : id === 2 ? "قهوة مختصة" : `فئة توضيحية ${id}`,
    nameEn: `Category ${id}`,
    parentId: id === 2 ? 1 : null,
    sortOrder: id,
    isActive: id === 3 ? 0 : 1,
    productCount: id === 1 ? 4 : 0,
  };
}
type Receipt = z.infer<typeof categoryReceipt>;
export class ProductCategoryPreviewStore {
  mode: CategoryMode = "data";
  private rows = new Map(
    Array.from({ length: 25 }, (_, i) => [i + 1, fixture(i + 1)])
  );
  private receipts = new Map<string, { input: string; result: Receipt }>();
  private revision = 0;
  constructor(
    private changed = () => {},
    private productUsage = () => new Map<number, number>()
  ) {}
  setMode = (mode: CategoryMode) => {
    if (Object.hasOwn(categoryModes, mode)) {
      this.mode = mode;
      this.changed();
    }
  };
  reset = () => {
    this.rows = new Map(
      Array.from({ length: 25 }, (_, i) => [i + 1, fixture(i + 1)])
    );
    this.receipts.clear();
    this.revision++;
    this.mode = "data";
    this.changed();
  };
  private visibleRows() {
    let rows = [...this.rows.values()].map(row => ({ ...row }));
    if (this.mode === "empty") rows = rows.filter(row => row.id > 1000);
    if (this.mode === "long")
      rows = rows.map(row => ({
        ...row,
        name: "فئة باسم طويل ".repeat(10).slice(0, 90) + row.id,
      }));
    if (this.mode === "broken")
      rows = rows.map(row => (row.id === 2 ? { ...row, parentId: 9999 } : row));
    if (this.mode === "limit")
      rows = Array.from(
        { length: 1000 },
        (_, i) => this.rows.get(i + 1) ?? fixture(i + 1)
      );
    const usage = this.productUsage();
    return rows.map(row => ({
      ...row,
      productCount: row.productCount + (usage.get(row.id) ?? 0),
    }));
  }
  read = () => {
    if (this.mode === "forbidden") throw error("FORBIDDEN");
    if (this.mode === "session") throw error("UNAUTHORIZED");
    if (this.mode === "error") throw error("INTERNAL_SERVER_ERROR");
    const rows = this.visibleRows(),
      locked = this.mode === "source";
    return categorySnapshot.parse({
      merchantId: productPreviewId,
      actorId: this.mode === "wrongTenant" ? 1 : productPreviewId,
      canManage: this.mode !== "viewer",
      locked,
      digest: fingerprint([rows, locked, this.revision]),
      rows,
    });
  };
  refresh = async () => {
    if (["loading", "error", "offline", "wrongTenant"].includes(this.mode))
      this.mode = "data";
    this.changed();
    try {
      return { data: this.read(), error: null };
    } catch (reason) {
      return { data: undefined, error: reason };
    }
  };
  conflict = () => {
    const row = this.rows.get(1);
    if (row) this.rows.set(1, { ...row, name: row.name + " · تعديل زميل" });
    this.revision++;
    this.changed();
  };
  write = async (raw: unknown) => {
    const input = categoryWrite.parse(raw),
      snapshot = this.read();
    if (!snapshot.canManage || snapshot.actorId !== productPreviewId)
      throw error("FORBIDDEN");
    const prior = this.receipts.get(input.requestId),
      serialized = JSON.stringify(input);
    if (prior) {
      if (prior.input !== serialized) throw error("CONFLICT");
      return structuredClone(prior.result);
    }
    if (snapshot.locked) throw error("PRECONDITION_FAILED");
    if (input.expectedDigest !== snapshot.digest) throw error("CONFLICT");
    if (this.mode === "saveError") throw error("BAD_REQUEST");
    if (["notCommitted", "loading", "offline"].includes(this.mode))
      throw Error("Preview connection lost");
    const plan = planCategoryChange(productPreviewId, snapshot.rows, input);
    // Materialize the displayed fixture so a correction persists when leaving its scenario.
    const usage = this.productUsage();
    this.rows = new Map(
      snapshot.rows.map(row => [
        row.id,
        { ...row, productCount: row.productCount - (usage.get(row.id) ?? 0) },
      ])
    );
    const categoryId =
      input.kind === "create"
        ? Math.max(1000, ...this.rows.keys()) + 1
        : input.id;
    if (input.kind === "delete") this.rows.delete(categoryId);
    else
      this.rows.set(categoryId, {
        ...plan.after!,
        id: categoryId,
        merchantId: productPreviewId,
        productCount:
          (plan.before?.productCount ?? 0) - (usage.get(categoryId) ?? 0),
      });
    this.revision++;
    const result = categoryReceipt.parse({
      merchantId: productPreviewId,
      actorId: productPreviewId,
      categoryId,
      requestId: input.requestId,
      kind: input.kind,
      digest: fingerprint([...this.rows.values()]),
      confirmedAt: new Date().toISOString(),
    });
    this.receipts.set(input.requestId, { input: serialized, result });
    if (["broken", "long", "empty", "limit"].includes(this.mode))
      this.mode = "data";
    this.changed();
    if (["uncertain", "receiptError"].includes(this.mode))
      throw Error("Preview reply lost");
    return this.mode === "wrongReceipt"
      ? { ...result, actorId: 1 }
      : structuredClone(result);
  };
  receipt = async (requestId: string) => {
    if (this.read().actorId !== productPreviewId) throw error("FORBIDDEN");
    if (this.mode === "receiptError")
      throw Error("Preview recovery unavailable");
    return structuredClone(this.receipts.get(requestId)?.result ?? null);
  };
}
