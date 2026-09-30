import {
  productDetailsSnapshot,
  productDetailWrite,
  productDetailReceipt,
  planProductDetailChange,
  ProductDetailPlanFailure,
  type ProductOptionRow,
  type ProductVariantRow,
} from "../../../shared/product-details";
import { ProductPreviewStore, productPreviewId } from "./product-model";
export const detailModes = {
  data: "خيارات ونسخ المنتج",
  empty: "دون خيارات أو نسخ",
  loading: "تحميل التفاصيل",
  error: "فشل القراءة",
  offline: "اتصال موقوف",
  forbidden: "دون صلاحية",
  session: "جلسة منتهية",
  viewer: "قراءة فقط",
  source: "مصدر خارجي",
  wrongTenant: "نطاق غير مطابق",
  missing: "منتج غير موجود",
  long: "أسماء طويلة",
  legacy: "أسعار قديمة ومخزون مجهول",
  broken: "اختيارات قديمة غير مقروءة",
  limit: "بلوغ حدود الخيارات والنسخ",
  saveError: "رفض الحفظ",
  uncertain: "حفظ مع فقد الرد",
  notCommitted: "طلب لم يصل",
  receiptError: "فشل قراءة الإيصال",
  wrongReceipt: "إيصال غير مطابق",
} as const;
export type DetailMode = keyof typeof detailModes;
const error = (code: string) => Object.assign(Error(code), { data: { code } });
// A synthetic fingerprint for the local model, not a database or cryptographic guarantee.
function fingerprint(value: unknown) {
  let hash = 2166136261;
  for (const c of JSON.stringify(value))
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0").repeat(8);
}
type Rows = { options: ProductOptionRow[]; variants: ProductVariantRow[] };
function option(productId: number, index = 1): ProductOptionRow {
  return {
    id: productId * 1000 + index,
    merchantId: productPreviewId,
    productId,
    name: index === 1 ? "المقاس" : `خيار ${index}`,
    nameEn: null,
    values: '["صغير","كبير"]',
    sortOrder: index,
  };
}
function variant(productId: number, index = 1): ProductVariantRow {
  return {
    id: productId * 1000 + index,
    merchantId: productPreviewId,
    productId,
    name:
      index === 1
        ? "النسخة الصغيرة"
        : index === 2
          ? "النسخة الكبيرة"
          : `نسخة ${index}`,
    sku: `VAR-${productId}-${index}`,
    price: index === 1 ? null : 2025,
    priceUnit: "minor",
    compareAtPrice: null,
    costPrice: index === 1 ? 0 : null,
    stock: index === 1 ? null : 7,
    barcode: null,
    weight: null,
    imageUrl: null,
    options:
      index <= 2
        ? JSON.stringify([
            {
              optionId: productId * 1000 + 1,
              value: index === 1 ? "صغير" : "كبير",
            },
          ])
        : "[]",
    isActive: 1,
    sortOrder: index,
  };
}
export class ProductDetailPreviewStore {
  mode: DetailMode = "data";
  private rows = new Map<number, Rows>();
  private receipts = new Map<
    string,
    { input: string; result: ReturnType<typeof productDetailReceipt.parse> }
  >();
  private revision = 0;
  private nextId = 1000000;
  constructor(private products: ProductPreviewStore) {}
  setMode = (mode: DetailMode) => {
    if (Object.hasOwn(detailModes, mode)) {
      this.mode = mode;
      this.products.changed();
    }
  };
  reset = () => {
    this.rows.clear();
    this.receipts.clear();
    this.mode = "data";
    this.revision++;
    this.products.changed();
  };
  remove = (ids: number[]) => {
    for (const id of ids) this.rows.delete(id);
  };
  private visible(productId: number): Rows {
    const parent = this.products.read({ id: productId }).product;
    let rows = structuredClone(
      this.rows.get(productId) ??
        (parent.hasVariants
          ? {
              options: [option(productId)],
              variants: [variant(productId), variant(productId, 2)],
            }
          : { options: [], variants: [] })
    );
    rows.options.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    rows.variants.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    if (this.mode === "empty") rows = { options: [], variants: [] };
    if (
      ["long", "legacy", "broken", "limit"].includes(this.mode) &&
      !rows.variants.length
    )
      rows = {
        options: [option(productId)],
        variants: [variant(productId), variant(productId, 2)],
      };
    if (this.mode === "long")
      rows = {
        options: rows.options.map(r => ({
          ...r,
          name: "خيار باسم طويل ".repeat(6) + r.id,
        })),
        variants: rows.variants.map(r => ({
          ...r,
          name: "نسخة باسم طويل ".repeat(12) + r.id,
        })),
      };
    if (this.mode === "legacy")
      rows.variants = rows.variants.map(r => ({
        ...r,
        price: 1234,
        priceUnit: "unverified",
        compareAtPrice: 1500,
        costPrice: 700,
        stock: null,
      }));
    if (this.mode === "broken") {
      if (!rows.options.length) rows.options = [option(productId)];
      rows.options[0].values = "unreadable old data";
      rows.variants[0].options = '{"old-size":"value"}';
    }
    if (this.mode === "limit")
      rows = {
        options: Array.from({ length: 20 }, (_, i) => option(productId, i + 1)),
        variants: Array.from({ length: 500 }, (_, i) =>
          variant(productId, i + 1)
        ),
      };
    return rows;
  }
  summary = (id: number) => {
    const rows = this.visible(id);
    return {
      options: rows.options.length,
      variants: rows.variants.length,
      digest: fingerprint(rows),
    };
  };
  private authority() {
    for (const mode of [this.mode, this.products.mode]) {
      if (mode === "session") throw error("UNAUTHORIZED");
      if (["forbidden", "viewer", "wrongTenant"].includes(mode))
        throw error("FORBIDDEN");
    }
  }
  read = (input: { productId: number }) => {
    for (const mode of [this.mode, this.products.mode]) {
      if (mode === "forbidden") throw error("FORBIDDEN");
      if (mode === "session") throw error("UNAUTHORIZED");
      if (mode === "error") throw error("INTERNAL_SERVER_ERROR");
      if (mode === "missing") throw error("NOT_FOUND");
    }
    const parent = this.products.read({ id: input.productId }),
      rows = this.visible(input.productId);
    return productDetailsSnapshot.parse({
      merchantId: productPreviewId,
      actorId:
        this.mode === "wrongTenant" || parent.merchantId !== productPreviewId
          ? 1
          : productPreviewId,
      productId: input.productId,
      productName: parent.product.name,
      currency: parent.product.currency,
      hasVariants: parent.product.hasVariants,
      canManage: parent.canManage && this.mode !== "viewer",
      locked: parent.locked || this.mode === "source",
      digest: fingerprint([parent.digest, rows, this.revision]),
      ...rows,
    });
  };
  refresh = async () => {
    if (
      ["loading", "error", "offline", "wrongTenant", "missing"].includes(
        this.mode
      )
    )
      this.mode = "data";
    await this.products.refresh();
  };
  conflict = () => {
    this.revision++;
    this.products.changed();
  };
  write = async (raw: unknown) => {
    const input = productDetailWrite.parse(raw);
    this.authority();
    const previous = this.receipts.get(input.requestId),
      serialized = JSON.stringify(input);
    if (previous) {
      if (previous.input !== serialized) throw error("CONFLICT");
      return structuredClone(previous.result);
    }
    const snapshot = this.read({ productId: input.productId });
    if (snapshot.locked) throw error("PRECONDITION_FAILED");
    if (input.expectedDigest !== snapshot.digest) throw error("CONFLICT");
    if (this.mode === "saveError") throw error("BAD_REQUEST");
    if (
      [this.mode, this.products.mode].some(mode =>
        ["offline", "loading", "notCommitted"].includes(mode)
      )
    )
      throw Error("Preview connection lost");
    let plan: ReturnType<typeof planProductDetailChange>;
    try {
      plan = planProductDetailChange(snapshot, input);
    } catch (reason) {
      if (reason instanceof ProductDetailPlanFailure)
        throw error(reason.reason === "conflict" ? "CONFLICT" : "BAD_REQUEST");
      throw reason;
    }
    const rows = {
        options: structuredClone(snapshot.options),
        variants: structuredClone(snapshot.variants),
      },
      detailId = "id" in input ? input.id : ++this.nextId;
    if (input.kind.startsWith("option_"))
      rows.options = rows.options
        .filter(r => r.id !== detailId)
        .concat(
          plan.after
            ? [{ ...(plan.after as ProductOptionRow), id: detailId }]
            : []
        );
    else
      rows.variants = rows.variants
        .filter(r => r.id !== detailId)
        .concat(
          plan.after
            ? [{ ...(plan.after as ProductVariantRow), id: detailId }]
            : []
        );
    this.rows.set(input.productId, rows);
    this.products.applyDetailFlag(input.productId, plan.hasVariants);
    this.revision++;
    const resultMode = this.mode;
    if (["empty", "long", "legacy", "broken", "limit"].includes(this.mode))
      this.mode = "data";
    const result = productDetailReceipt.parse({
      merchantId: productPreviewId,
      actorId: productPreviewId,
      productId: input.productId,
      detailId,
      requestId: input.requestId,
      kind: input.kind,
      digest: this.read({ productId: input.productId }).digest,
      confirmedAt: new Date().toISOString(),
    });
    this.receipts.set(input.requestId, { input: serialized, result });
    this.products.changed();
    if (["uncertain", "receiptError"].includes(resultMode))
      throw Error("Preview reply lost");
    return resultMode === "wrongReceipt"
      ? { ...result, actorId: 1 }
      : structuredClone(result);
  };
  receipt = async (requestId: string) => {
    this.authority();
    if (this.mode === "receiptError")
      throw Error("Preview receipt unavailable");
    return structuredClone(this.receipts.get(requestId)?.result ?? null);
  };
}
