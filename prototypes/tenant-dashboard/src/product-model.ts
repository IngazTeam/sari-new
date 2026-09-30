import {
  productCatalogInput,
  productInventoryState,
  type ProductWorkspaceRow,
} from "../../../shared/product-catalog";
import {
  productEditorWrite,
  type ProductEditorReceipt,
} from "../../../shared/product-editor";
import {
  productDeleteReviewInput,
  productDeleteWriteInput,
  type ProductDeleteReceipt,
} from "../../../shared/product-delete";
import { majorToMinor } from "../../../shared/product-money";
import {
  categorySnapshot,
  productCategorySelectable,
} from "../../../shared/product-categories";
export const productPreviewId = 9000082;
export const productPreviewScope = "9000082:9000082:products";
export const productModes = {
  data: "بيانات وتجربة الحفظ",
  empty: "كتالوج فارغ",
  loading: "تحميل",
  error: "فشل القراءة",
  offline: "اتصال موقوف",
  forbidden: "دون صلاحية",
  session: "انتهاء الجلسة",
  viewer: "قراءة فقط",
  wrongTenant: "بيانات متجر مختلف",
  wrongSelection: "بيانات اختيار سابق",
  missing: "منتج غير موجود",
  long: "نصوص طويلة",
  legacy: "أسعار قديمة ومخزون مجهول",
  source: "مصدر مرتبط",
  references: "مراجع تمنع الحذف",
  saveError: "رفض الحفظ",
  uncertain: "حفظ مع فقد الرد",
  receiptError: "فشل قراءة الإيصال",
  notCommitted: "طلب لم يصل للخادم",
  wrongReceipt: "إيصال غير مطابق",
} as const;
export type ProductMode = keyof typeof productModes;
const error = (code: string) => Object.assign(Error(code), { data: { code } });
const createdAt = "2026-09-30T12:00:00.000Z";
// Deliberately synthetic fingerprint; this mock does not implement server locking or cryptography.
function fingerprint(value: unknown) {
  let hash = 2166136261;
  for (const char of JSON.stringify(value))
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0").repeat(8);
}
function fixture(id: number): ProductWorkspaceRow {
  return {
    id,
    merchantId: productPreviewId,
    name: `منتج توضيحي ${id}`,
    description: "وصف محلي للعرض والتجربة",
    price: 1234 + id * 100,
    priceUnit: "minor",
    currency: id % 2 ? "SAR" : "USD",
    imageUrl: null,
    stock: id % 5 === 0 ? 0 : id % 5 === 1 ? null : id % 5 === 2 ? 2 : 15,
    sku: `MOCK-${id}`,
    barcode: null,
    compareAtPrice: 2500,
    costPrice: 0,
    weight: null,
    category: "قهوة",
    categoryId: null,
    tags: null,
    productType: "physical",
    status: id % 3 ? "active" : "draft",
    lowStockAlert: 5,
    trackInventory: id % 5 === 3 ? 0 : 1,
    isActive: id % 3 ? 1 : 0,
    hasVariants: id === 1 ? 1 : 0,
    sallaProductId: null,
  };
}
export class ProductPreviewStore {
  detailSummary?: (id: number) => {
    options: number;
    variants: number;
    digest: string;
  };
  removeDetails?: (ids: number[]) => void;
  applyDetailFlag(id: number, hasVariants: 0 | 1) {
    const row = this.rows.get(id);
    if (!row) throw error("NOT_FOUND");
    this.rows.set(id, { ...row, hasVariants });
    this.detailRevisions.set(id, (this.detailRevisions.get(id) ?? 0) + 1);
  }
  private detailRevisions = new Map<number, number>();
  private editorDigest(row: ProductWorkspaceRow) {
    return fingerprint([row, this.detailRevisions.get(row.id) ?? 0]);
  }
  categorySource?: () => unknown;
  categoryUsage = () => {
    const counts = new Map<number, number>();
    for (const row of this.rows.values())
      if (row.categoryId !== null)
        counts.set(row.categoryId, (counts.get(row.categoryId) ?? 0) + 1);
    return counts;
  };
  mode: ProductMode = "data";
  version = 0;
  private listeners = new Set<() => void>();
  private rows = new Map(
    Array.from({ length: 27 }, (_, i) => [i + 1, fixture(i + 1)])
  );
  private receipts = new Map<
    string,
    { input: string; result: ProductEditorReceipt | ProductDeleteReceipt }
  >();
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  changed = () => {
    this.version++;
    this.listeners.forEach(fn => fn());
  };
  setMode = (mode: ProductMode) => {
    if (Object.hasOwn(productModes, mode)) {
      this.mode = mode;
      this.changed();
    }
  };
  refresh = async () => {
    if (
      [
        "loading",
        "error",
        "offline",
        "wrongTenant",
        "wrongSelection",
        "missing",
      ].includes(this.mode)
    )
      this.mode = "data";
    this.changed();
  };
  reset = () => {
    this.detailRevisions.clear();
    this.rows = new Map(
      Array.from({ length: 27 }, (_, i) => [i + 1, fixture(i + 1)])
    );
    this.receipts.clear();
    this.mode = "data";
    this.changed();
  };
  private all() {
    return [...this.rows.values()]
      .filter(row => this.mode !== "empty" || row.id > 27)
      .sort((a, b) => b.id - a.id)
      .map(row => {
        const value = { ...row };
        if (this.mode === "long") {
          value.name = "منتج توضيحي باسم طويل ".repeat(10);
          value.description = "وصف طويل ".repeat(100);
          value.sku = "SKU".repeat(30);
        }
        if (this.mode === "legacy") {
          value.priceUnit = "unverified";
          value.stock = null;
        }
        if (this.mode === "source") value.sallaProductId = String(value.id);
        return value;
      });
  }
  private canManage() {
    return !["viewer", "forbidden", "session"].includes(this.mode);
  }
  private source() {
    return this.mode === "source" ? "salla" : "none";
  }
  private identity() {
    return this.mode === "wrongTenant" ? 1 : productPreviewId;
  }
  private find(id: number) {
    const row = this.all().find(row => row.id === id);
    if (!row || this.mode === "missing") throw error("NOT_FOUND");
    return row;
  }
  list(raw: unknown) {
    const selection = productCatalogInput.parse(raw),
      all = this.all();
    const rows = all.filter(
      row =>
        (!selection.search ||
          [row.name, row.description, row.sku, row.barcode, row.category].some(
            value =>
              value?.toLowerCase().includes(selection.search.toLowerCase())
          )) &&
        (selection.status === "all" || row.status === selection.status) &&
        (selection.inventory === "all" ||
          productInventoryState(row) === selection.inventory) &&
        (selection.price === "all" ||
          (selection.price === "verified") ===
            (row.priceUnit === "minor" && row.price >= 0))
    );
    return {
      merchantId: this.identity(),
      readAt: createdAt,
      selection:
        this.mode === "wrongSelection"
          ? { ...selection, page: selection.page + 1 }
          : selection,
      currency: "SAR",
      integrationSource: this.source(),
      canManage: this.canManage(),
      items: rows.slice(
        (selection.page - 1) * selection.pageSize,
        selection.page * selection.pageSize
      ),
      total: rows.length,
      page: selection.page,
      pageSize: selection.pageSize,
      totalPages: Math.ceil(rows.length / selection.pageSize),
      summary: {
        all: all.length,
        out: all.filter(row => productInventoryState(row) === "out").length,
        low: all.filter(row => productInventoryState(row) === "low").length,
        unknown: all.filter(row => productInventoryState(row) === "unknown")
          .length,
        untracked: all.filter(row => productInventoryState(row) === "untracked")
          .length,
        priceReview: all.filter(
          row => row.priceUnit !== "minor" || row.price < 0
        ).length,
      },
    };
  }
  read(raw: { id: number }) {
    const product = this.find(raw.id);
    return {
      merchantId: this.identity(),
      selection: this.mode === "wrongSelection" ? { id: raw.id + 1 } : raw,
      product,
      digest: this.editorDigest(product),
      external: this.mode === "source",
      canManage: this.canManage(),
      integrationSource: this.source(),
      locked: this.mode === "source",
    };
  }
  conflict = () => {
    const row = this.rows.get(27);
    if (row)
      this.rows.set(27, {
        ...row,
        description: `تعديل زميل محاكى ${this.version}`,
        stock: (row.stock ?? 0) + 1,
      });
    this.changed();
  };
  deleteReview(raw: unknown) {
    const selection = productDeleteReviewInput.parse(raw),
      items = selection.ids.map(id => {
        const row = this.find(id);
        return {
          id,
          name: row.name,
          price: row.price,
          priceUnit: row.priceUnit,
          currency: row.currency,
          status: row.status,
          variants:
            this.detailSummary?.(id).variants ?? (row.hasVariants ? 2 : 0),
          options:
            this.detailSummary?.(id).options ?? (row.hasVariants ? 1 : 0),
          locked: this.mode === "source",
          blocked: this.mode === "references",
          references: {
            rewards: 0,
            comparisons: 0,
            reviews: this.mode === "references" ? 1 : 0,
            promotions: 0,
            unreadablePromotions: 0,
            foreignDetails: 0,
          },
        };
      });
    return {
      merchantId: this.identity(),
      selection:
        this.mode === "wrongSelection"
          ? { ids: selection.ids.map(id => id + 1) }
          : selection,
      digest: fingerprint([
        items,
        selection.ids.map(id => this.find(id)),
        selection.ids.map(id => this.detailSummary?.(id).digest),
      ]),
      canManage: this.canManage(),
      canDelete:
        this.canManage() && !items.some(row => row.locked || row.blocked),
      items,
    };
  }
  private authorize() {
    if (!this.canManage())
      throw error(this.mode === "session" ? "UNAUTHORIZED" : "FORBIDDEN");
    if (this.mode === "source") throw error("PRECONDITION_FAILED");
    if (this.mode === "saveError") throw error("BAD_REQUEST");
    if (this.mode === "notCommitted") throw error("INTERNAL_SERVER_ERROR");
  }
  private prior(requestId: string, input: unknown) {
    const receipt = this.receipts.get(requestId);
    if (!receipt) return null;
    if (receipt.input !== JSON.stringify(input)) throw error("CONFLICT");
    return receipt.result;
  }
  private finish(
    input: { requestId: string },
    result: ProductEditorReceipt | ProductDeleteReceipt
  ) {
    this.receipts.set(input.requestId, {
      input: JSON.stringify(input),
      result,
    });
    this.changed();
    if (["uncertain", "receiptError"].includes(this.mode))
      throw error("INTERNAL_SERVER_ERROR");
    return this.mode === "wrongReceipt" ? { ...result, merchantId: 1 } : result;
  }
  write = async (raw: unknown) => {
    const input = productEditorWrite.parse(raw);
    this.authorize();
    const previous = this.prior(input.requestId, input);
    if (previous) return previous;
    const row =
      input.kind === "update"
        ? this.find(input.id)
        : {
            ...fixture(Math.max(0, ...this.rows.keys()) + 1),
            sku: null,
            compareAtPrice: null,
            costPrice: null,
            stock: null,
            description: null,
            category: null,
            hasVariants: 0,
          };
    if (
      input.kind === "update" &&
      input.expectedDigest !== this.editorDigest(row)
    )
      throw error("CONFLICT");
    if (
      input.kind === "update" &&
      input.fields.currency &&
      input.fields.currency !== row.currency
    )
      throw error("BAD_REQUEST");
    const fields = input.fields as Record<string, unknown>,
      next = { ...row };
    if (
      input.fields.categoryId != null &&
      input.fields.categoryId !== row.categoryId
    ) {
      const categories = categorySnapshot.safeParse(this.categorySource?.());
      if (
        !categories.success ||
        categories.data.actorId !== productPreviewId ||
        categories.data.merchantId !== productPreviewId ||
        !categories.data.canManage ||
        categories.data.locked ||
        !productCategorySelectable(
          categories.data.rows,
          input.fields.categoryId
        )
      )
        throw error("BAD_REQUEST");
    }
    if (row.priceUnit !== "minor" && fields.price !== undefined) {
      next.compareAtPrice = null;
      next.costPrice = null;
    }
    for (const [key, value] of Object.entries(fields)) {
      if (["price", "compareAtPrice", "costPrice"].includes(key))
        (next as any)[key] =
          value === null ? null : majorToMinor(value as string);
      else (next as any)[key] = value;
    }
    if (fields.price !== undefined) next.priceUnit = "minor";
    if (fields.status !== undefined)
      next.isActive = fields.status === "active" ? 1 : 0;
    this.rows.set(next.id, next);
    return this.finish(input, {
      merchantId: productPreviewId,
      actorId: productPreviewId,
      requestId: input.requestId,
      kind: input.kind,
      productId: next.id,
      digest: this.editorDigest(next),
      createdAt,
    });
  };
  deleteWrite = async (raw: unknown) => {
    const input = productDeleteWriteInput.parse(raw);
    this.authorize();
    const previous = this.prior(input.requestId, input);
    if (previous) return previous;
    const review = this.deleteReview({ ids: input.ids });
    if (!review.canDelete) throw error("PRECONDITION_FAILED");
    if (input.expectedDigest !== review.digest) throw error("CONFLICT");
    input.ids.forEach(id => this.rows.delete(id));
    this.removeDetails?.(input.ids);
    return this.finish(input, {
      merchantId: productPreviewId,
      actorId: productPreviewId,
      requestId: input.requestId,
      kind: "delete",
      ids: input.ids,
      digest: review.digest,
      createdAt,
    });
  };
  receipt = async (requestId: string, kind: "editor" | "delete") => {
    if (this.mode === "receiptError") throw error("INTERNAL_SERVER_ERROR");
    const value = this.receipts.get(requestId)?.result;
    if (!value || (value.kind === "delete") !== (kind === "delete"))
      throw error("NOT_FOUND");
    return value;
  };
}
