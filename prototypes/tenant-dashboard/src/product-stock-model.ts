import {
  productStockInput,
  productStockSnapshot,
  type ProductStockSnapshot,
} from "../../../shared/product-stock";
import { ProductPreviewStore, productPreviewId } from "./product-model";
import { ProductDetailPreviewStore } from "./product-detail-model";

export const stockModes = {
  data: "مخزون المنتجات والنسخ الحالية",
  empty: "دون عناصر تحتاج متابعة",
  loading: "تحميل المخزون",
  error: "فشل قراءة المخزون",
  offline: "قراءة المخزون موقوفة",
  forbidden: "دون صلاحية قراءة",
  session: "جلسة منتهية",
  wrongTenant: "مخزون متجر مختلف",
  wrongSelection: "نتيجة فلتر سابق",
  malformed: "رد غير مكتمل",
} as const;
export type StockMode = keyof typeof stockModes;
const error = (code: string) => Object.assign(Error(code), { data: { code } });
export class ProductStockPreviewStore {
  mode: StockMode = "data";
  constructor(
    private products: ProductPreviewStore,
    private details: ProductDetailPreviewStore
  ) {}
  setMode = (mode: StockMode) => {
    if (Object.hasOwn(stockModes, mode)) {
      this.mode = mode;
      this.products.changed();
    }
  };
  reset = () => {
    this.mode = "data";
    this.products.changed();
  };
  refresh = async () => {
    if (!["data", "empty", "forbidden", "session"].includes(this.mode))
      this.mode = "data";
    await this.details.refresh();
  };
  read = (raw: unknown): ProductStockSnapshot => {
    const selection = productStockInput.parse(raw);
    for (const mode of [this.mode, this.products.mode]) {
      if (mode === "forbidden") throw error("FORBIDDEN");
      if (mode === "session") throw error("UNAUTHORIZED");
      if (mode === "error") throw error("INTERNAL_SERVER_ERROR");
    }
    const rows: ProductStockSnapshot["items"] = [];
    for (const parent of this.products.stockProducts()) {
      if (
        this.mode === "empty" ||
        parent.merchantId !== productPreviewId ||
        parent.status !== "active" ||
        parent.isActive !== 1 ||
        parent.trackInventory !== 1 ||
        parent.productType !== "physical"
      )
        continue;
      const base = {
        merchantId: productPreviewId,
        productId: parent.id,
        variantId: null,
        kind: "product" as const,
        productName: parent.name,
        name: parent.name,
        sku: parent.sku,
        stock: parent.stock,
        threshold: parent.lowStockAlert,
      };
      const candidates: Array<
        | typeof base
        | (Omit<typeof base, "variantId" | "kind"> & {
            variantId: number;
            kind: "variant";
          })
      > = [];
      if (parent.hasVariants === 0) candidates.push(base);
      else if (parent.hasVariants === 1) {
        const snapshot = this.details.read({ productId: parent.id });
        if (
          snapshot.merchantId !== productPreviewId ||
          snapshot.actorId !== productPreviewId
        )
          throw error("FORBIDDEN");
        candidates.push(
          ...snapshot.variants
            .filter(
              v =>
                v.merchantId === productPreviewId &&
                v.productId === parent.id &&
                v.isActive === 1
            )
            .map(v => ({
              ...base,
              kind: "variant" as const,
              variantId: v.id,
              name: v.name,
              sku: v.sku,
              stock: v.stock,
            }))
        );
      }
      if (!candidates.length)
        rows.push({
          ...base,
          stock: null,
          state: "unknown",
          issue:
            parent.hasVariants === 1
              ? "no_available_variants"
              : "invalid_variant_setup",
        });
      for (const row of candidates) {
        const unknown = row.stock === null || row.stock < 0;
        if (
          unknown ||
          row.stock === 0 ||
          (row.threshold !== null && row.stock! <= row.threshold)
        )
          rows.push({
            ...row,
            state: unknown ? "unknown" : row.stock === 0 ? "out" : "low",
            issue: unknown ? "stock_unknown" : null,
          });
      }
    }
    const order = { unknown: 0, out: 1, low: 2 };
    rows.sort(
      (a, b) =>
        order[a.state] - order[b.state] ||
        a.productId - b.productId ||
        (a.variantId ?? 0) - (b.variantId ?? 0)
    );
    const filtered = rows.filter(
      row =>
        (selection.kind === "all" || row.kind === selection.kind) &&
        (selection.state === "all" || row.state === selection.state) &&
        [row.productName, row.name, row.sku].some(value =>
          value?.toLowerCase().includes(selection.search.toLowerCase())
        )
    );
    const snapshot = productStockSnapshot.parse({
      merchantId: productPreviewId,
      readAt: new Date().toISOString(),
      selection,
      items: filtered.slice(
        (selection.page - 1) * selection.pageSize,
        selection.page * selection.pageSize
      ),
      total: filtered.length,
      totalPages: Math.ceil(filtered.length / selection.pageSize),
      summary: {
        total: rows.length,
        out: rows.filter(r => r.state === "out").length,
        low: rows.filter(r => r.state === "low").length,
        unknown: rows.filter(r => r.state === "unknown").length,
      },
    });
    if (this.mode === "wrongTenant" || this.products.mode === "wrongTenant") {
      snapshot.merchantId = 1;
      snapshot.items.forEach(row => {
        row.merchantId = 1;
      });
    }
    if (
      this.mode === "wrongSelection" ||
      this.products.mode === "wrongSelection"
    )
      snapshot.selection.page++;
    if (this.mode === "malformed") snapshot.summary.total++;
    return snapshot;
  };
}
