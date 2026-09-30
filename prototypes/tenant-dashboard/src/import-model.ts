import {
  productImportPrepareInput,
  productImportReadInput,
  productImportCommitInput,
  productImportDiscardInput,
  productImportReviewSchema,
  type ProductImportReceipt,
} from "../../../shared/product-import";
import { productCatalogInput } from "../../../shared/product-catalog";
import { productEditableFields } from "../../../shared/product-editor";
import {
  previewProductImport,
  type ProductImportPreview,
} from "../../../server/product-import-preview";
import { createHash } from "./import-preview-crypto";
export const importPreviewId = 9000087,
  importPreviewScope = "9000087:9000087:product-import";
export const importModes = {
  data: "ملف صالح ·25 صفًا",
  empty: "قبل اختيار الملف",
  errors: "أخطاء صفوف",
  loading: "تحميل",
  error: "فشل القراءة",
  offline: "اتصال موقوف",
  forbidden: "دون صلاحية",
  session: "انتهاء الجلسة",
  viewer: "قراءة فقط",
  source: "مصدر كتالوج مرتبط",
  wrongTenant: "تيننت مختلف",
  wrongSelection: "اختيار سابق",
  missing: "مراجعة غير موجودة",
  expired: "مراجعة منتهية",
  long: "نصوص طويلة",
  prepareError: "رفض تجهيز الملف",
  prepareUncertain: "تجهيز مع فقد الرد",
  conflict: "تعارض عند الاعتماد",
  uncertain: "اعتماد مع فقد الرد",
  notCommitted: "اعتماد لم يصل",
  receiptError: "فشل فحص الإيصال",
  wrongReceipt: "إيصال غير مطابق",
} as const;
export type ImportMode = keyof typeof importModes;
const failure = (code: string, message = code) =>
  Object.assign(Error(message), { data: { code } });
const hash = (value: unknown) =>
  createHash("synthetic").update(JSON.stringify(value)).digest("hex");
type Review = {
  preview: ProductImportPreview;
  input: string;
  createdAt: string;
  expiresAt: string;
  receipt: ProductImportReceipt | null;
};
export const importSampleId = "00000000-0000-4000-8000-000000000087";
export function importSampleCsv() {
  return (
    "\uFEFFالاسم,السعر,العملة,الكمية,رمز الصنف,نوع المنتج,الحالة\r\n" +
    Array.from(
      { length: 25 },
      (_, i) =>
        `منتج تجريبي ${i + 1},${i === 0 ? "0" : "12.34"},${i % 2 ? "USD" : "SAR"},${i % 3 ? "2" : ""},IMPORT-DEMO-${i + 1},${i % 3 ? "physical" : "service"},draft`
    ).join("\r\n")
  );
}
export class ImportPreviewStore {
  mode: ImportMode = "data";
  version = 0;
  generation = 0;
  private listeners = new Set<() => void>();
  private reviews = new Map<string, Review>();
  private receipts = new Map<
    string,
    { input: string; result: ProductImportReceipt }
  >();
  private nextId = 100;
  createdCount = 0;
  private delivered = new Set<string>();
  constructor() {
    this.seed();
  }
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
  setMode = (mode: ImportMode) => {
    if (Object.hasOwn(importModes, mode)) {
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
    this.reviews.clear();
    this.receipts.clear();
    this.delivered.clear();
    this.createdCount = 0;
    this.nextId = 100;
    this.mode = "data";
    this.seed();
    this.generation++;
    this.changed();
  };
  private seed() {
    const rows = Array.from({ length: 25 }, (_, i) => {
      const fields = productEditableFields.parse({
        name: `منتج تجريبي ${i + 1}`,
        description: null,
        price: i === 0 ? "0" : "12.34",
        currency: i % 2 ? "USD" : "SAR",
        stock: i % 3 ? 2 : null,
        sku: `IMPORT-DEMO-${i + 1}`,
        barcode: null,
        imageUrl: null,
        compareAtPrice: null,
        costPrice: null,
        weight: null,
        category: null,
        categoryId: null,
        tags: null,
        productType: i % 3 ? "physical" : "service",
        status: "draft",
        lowStockAlert: 5,
        trackInventory: 1,
      });
      return {
        number: i + 2,
        values: [
          fields.name,
          fields.price,
          fields.currency,
          fields.stock == null ? "" : String(fields.stock),
          fields.sku!,
          fields.productType,
          fields.status,
        ],
        fields,
        issues: [],
      };
    });
    const preview: ProductImportPreview = {
      fileName: "sary-import-demo.csv",
      format: "csv",
      digest: hash(rows),
      currency: "SAR",
      productType: "physical",
      status: "draft",
      sheets: [],
      sheet: null,
      headers: (
        [
          "name",
          "price",
          "currency",
          "stock",
          "sku",
          "productType",
          "status",
        ] as const
      ).map((field, column) => ({ column, label: field, field })),
      issues: [],
      rows,
      total: 25,
      valid: 25,
      invalid: 0,
    };
    this.reviews.set(importSampleId, {
      preview,
      input: "sample",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      receipt: null,
    });
  }
  sample() {
    const row = this.reviews.get(importSampleId)!;
    return {
      reviewId: importSampleId,
      digest: row.preview.digest,
      fingerprint: hash(importSampleCsv()),
      attempt: null,
      receipt: null,
    };
  }
  private access(writes = false) {
    if (this.mode === "session") throw failure("UNAUTHORIZED");
    if (this.mode === "forbidden" || (writes && this.mode === "viewer"))
      throw failure("FORBIDDEN");
    if (writes && this.mode === "source")
      throw failure("PRECONDITION_FAILED", "product_import:source_locked");
  }
  list(raw: unknown) {
    const selection = productCatalogInput.parse(raw);
    return {
      merchantId: this.mode === "wrongTenant" ? 1 : importPreviewId,
      canManage: !["viewer", "forbidden", "session"].includes(this.mode),
      readAt: new Date().toISOString(),
      selection,
      currency: "SAR",
      integrationSource: this.mode === "source" ? "salla" : "none",
      items: [],
      total: 0,
      page: selection.page,
      pageSize: selection.pageSize,
      totalPages: 0,
      summary: {
        all: 0,
        out: 0,
        low: 0,
        untracked: 0,
        unknown: 0,
        priceReview: 0,
      },
    };
  }
  read = (raw: unknown) => {
    this.access();
    const selection = productImportReadInput.parse(raw),
      stored = this.reviews.get(selection.reviewId);
    if (!stored || this.mode === "missing") throw failure("NOT_FOUND");
    const preview = structuredClone(stored.preview);
    if (this.mode === "errors") {
      preview.rows[0].fields = null;
      preview.rows[0].values[1] = "";
      preview.rows[0].issues = [
        { code: "missing_price", field: "price", column: 1 },
      ];
      preview.valid = preview.rows.filter(row => row.fields).length;
      preview.invalid = preview.total - preview.valid;
    }
    if (this.mode === "long")
      for (const row of preview.rows) {
        if (row.fields) {
          row.fields.name = "اسم طويل للمعاينة ".repeat(12);
          row.fields.description = "تفاصيل المنتج ".repeat(100);
          row.values[0] = row.fields.name;
        }
      }
    const filtered =
        selection.filter === "errors"
          ? preview.rows.filter(row => !row.fields)
          : preview.rows,
      canManage = !["viewer", "forbidden", "session"].includes(this.mode),
      expired =
        this.mode === "expired" || Date.parse(stored.expiresAt) <= Date.now();
    return productImportReviewSchema.parse({
      merchantId: this.mode === "wrongTenant" ? 1 : importPreviewId,
      actorId: importPreviewId,
      reviewId: selection.reviewId,
      selection:
        this.mode === "wrongSelection"
          ? { ...selection, page: selection.page + 1 }
          : selection,
      createdAt: stored.createdAt,
      expiresAt: stored.expiresAt,
      expired,
      canManage,
      integrationSource: this.mode === "source" ? "salla" : "none",
      canCommit:
        canManage &&
        this.mode !== "source" &&
        !expired &&
        !stored.receipt &&
        preview.invalid === 0 &&
        !preview.issues.length,
      receipt:
        stored.receipt &&
        ["uncertain", "wrongReceipt", "receiptError"].includes(this.mode) &&
        !this.delivered.has(stored.receipt.requestId)
          ? null
          : stored.receipt,
      preview: {
        ...preview,
        rows: filtered.slice(
          (selection.page - 1) * selection.pageSize,
          selection.page * selection.pageSize
        ),
        filteredTotal: filtered.length,
        totalPages: Math.ceil(filtered.length / selection.pageSize),
      },
    });
  };
  prepare = async (raw: unknown) => {
    this.access(true);
    const input = productImportPrepareInput.parse(raw),
      prior = this.reviews.get(input.reviewId),
      encoded = JSON.stringify(input);
    if (prior) {
      if (prior.input !== encoded) throw failure("CONFLICT");
      return this.read({ reviewId: input.reviewId });
    }
    if (this.mode === "prepareError")
      throw failure("BAD_REQUEST", "product_import:row_limit");
    // Same parser and validation as the app, running wholly in this browser. Digest is a mock in the browser build.
    const generation = this.generation,
      preview = await previewProductImport(input.file);
    if (generation !== this.generation) throw failure("CONFLICT");
    this.reviews.set(input.reviewId, {
      preview,
      input: encoded,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      receipt: null,
    });
    this.changed();
    if (this.mode === "prepareUncertain")
      throw Error("Simulated lost preview reply");
    return this.read({ reviewId: input.reviewId });
  };
  commit = async (raw: unknown) => {
    this.access(true);
    const input = productImportCommitInput.parse(raw),
      prior = this.receipts.get(input.requestId),
      encoded = JSON.stringify(input);
    if (prior) {
      if (prior.input !== encoded) throw failure("CONFLICT");
      return structuredClone(prior.result);
    }
    const stored = this.reviews.get(input.reviewId);
    if (!stored) throw failure("NOT_FOUND");
    if (
      stored.receipt ||
      stored.preview.digest !== input.expectedDigest ||
      this.mode === "conflict"
    )
      throw failure("CONFLICT");
    const review = this.read({ reviewId: input.reviewId });
    if (!review.canCommit) throw failure("PRECONDITION_FAILED");
    if (this.mode === "notCommitted")
      throw Error("Simulated request not received");
    const result: ProductImportReceipt = {
      merchantId: importPreviewId,
      actorId: importPreviewId,
      reviewId: input.reviewId,
      requestId: input.requestId,
      kind: "import",
      digest: stored.preview.digest,
      productIds: Array.from(
        { length: stored.preview.total },
        () => ++this.nextId
      ),
      count: stored.preview.total,
      createdAt: new Date().toISOString(),
    };
    stored.receipt = result;
    this.createdCount += result.count;
    this.receipts.set(input.requestId, { input: encoded, result });
    this.changed();
    if (this.mode === "uncertain") throw Error("Simulated lost reply");
    return this.mode === "wrongReceipt"
      ? { ...result, merchantId: 1 }
      : structuredClone(result);
  };
  receipt = async ({ requestId }: { requestId: string }) => {
    this.access();
    if (this.mode === "receiptError") throw Error("Simulated receipt failure");
    this.delivered.add(requestId);
    this.changed();
    return structuredClone(this.receipts.get(requestId)?.result ?? null);
  };
  discard = async (raw: unknown) => {
    this.access(true);
    const input = productImportDiscardInput.parse(raw),
      prior = this.reviews.get(input.reviewId);
    if (prior && prior.preview.digest !== input.expectedDigest)
      throw failure("CONFLICT");
    this.reviews.delete(input.reviewId);
    this.changed();
    return { discarded: true as const };
  };
}
