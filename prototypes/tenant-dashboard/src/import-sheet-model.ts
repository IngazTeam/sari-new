import { z } from "zod";
import { productEditableFields } from "../../../shared/product-editor";
import {
  productSheetCatalogItem,
  productSheetListInput,
} from "../../../shared/product-sheet-import";
import {
  productSheetPrepareInput,
  productSheetReadInput,
  productSheetCommitInput,
  productSheetDiscardInput,
  productSheetReceiptInput,
  productSheetReview,
  productSheetReceipt,
  type ProductSheetReceipt,
} from "../../../shared/product-sheet-review";
import { previewProductSheet } from "../../../server/product-sheet-preview";
import { planProductSheet } from "../../../server/product-sheet-plan";
import { createHash } from "./import-preview-crypto";
import { importPreviewId } from "./import-model";
export const sheetModes = {
  ready: "اتصال جاهز ·25 صفًا",
  unlinked: "غير مربوط",
  oauth: "تفويض غير متاح",
  source: "منصة تدير الكتالوج",
  loading: "تحميل",
  readError: "فشل قراءة",
  offline: "دون اتصال",
  forbidden: "دون صلاحية",
  session: "انتهاء الجلسة",
  wrongTenant: "نتيجة لتيننت آخر",
  wrongSource: "قائمة من ربط مختلف",
  emptySheets: "ملف بلا أوراق",
  emptyRows: "ورقة فارغة",
  invalidRows: "أخطاء أسعار وصفوف",
  ambiguous: "مطابقة ملتبسة",
  external: "منتج تديره منصة",
  legacy: "سعر قديم غير مثبت",
  currency: "عملة مختلفة",
  long: "نصوص طويلة",
  limited: "نطاق قراءة محدود",
  expired: "مراجعة منتهية",
  sourceChanged: "تغير الربط",
  conflict: "تعارض عند الاعتماد",
  prepareLost: "مراجعة محفوظة وفقد الرد",
  commitLost: "اعتماد محفوظ وفقد الرد",
  notCommitted: "اعتماد لم يصل",
  receiptError: "تعذر فحص الإيصال",
  wrongReceipt: "إيصال مختلف",
  missing: "مراجعة مفقودة",
} as const;
export type SheetMode = keyof typeof sheetModes;
type Item = z.infer<typeof productSheetCatalogItem>;
type Entry = {
  input: z.infer<typeof productSheetPrepareInput>;
  snapshot: ReturnType<typeof previewProductSheet>;
  plan: ReturnType<typeof planProductSheet>;
  digest: string;
  createdAt: string;
  expiresAt: string;
  receipt: ProductSheetReceipt | null;
};
const fail = (code: string, message = code) =>
  Object.assign(Error(message), { data: { code } });
const hash = (v: unknown) =>
  createHash("synthetic").update(JSON.stringify(v)).digest("hex");
const tabs = [
  {
    id: 0,
    title: "المنتجات · Products",
    hidden: false,
    rows: 1000,
    columns: 26,
  },
  { id: 5, title: "العروض · Offers", hidden: true, rows: 12000, columns: 70 },
];
/** Read-only local Sheet fixtures; all product and receipt writes stay in this isolated in-memory store. */
export class ImportSheetStore {
  mode: SheetMode = "ready";
  reads = 0;
  createdCount = 0;
  updatedCount = 0;
  private nextId = 910;
  private catalog: Item[] = [];
  private reviews = new Map<string, Entry>();
  private receipts = new Map<
    string,
    { input: string; value: ProductSheetReceipt }
  >();
  private hiddenReviews = new Set<string>();
  private hiddenReceipts = new Set<string>();
  constructor(private changed: () => void = () => {}) {
    this.seed();
  }
  private seed() {
    this.catalog = [1, 2].map(id => {
      const fields = productEditableFields.parse({
        name: `منتج محلي ${id}`,
        price: id === 1 ? "10.00" : "12.34",
        currency: "SAR",
        description: "وصف محفوظ لا تغيره الأعمدة الغائبة",
        stock: 7,
        sku: `SHEET-${id}`,
        barcode: null,
        compareAtPrice: null,
        costPrice: "5.00",
        imageUrl: null,
        weight: null,
        category: null,
        categoryId: null,
        tags: null,
        productType: "physical",
        status: "active",
        lowStockAlert: 2,
        trackInventory: 1,
      });
      return {
        id: 900 + id,
        name: fields.name,
        sku: fields.sku,
        fields,
        digest: hash(fields),
        locked: false,
      };
    });
  }
  setMode = (mode: SheetMode) => {
    if (Object.hasOwn(sheetModes, mode)) {
      this.mode = mode;
      this.changed();
    }
  };
  reset = () => {
    this.mode = "ready";
    this.reads = 0;
    this.createdCount = 0;
    this.updatedCount = 0;
    this.nextId = 910;
    this.reviews.clear();
    this.receipts.clear();
    this.hiddenReviews.clear();
    this.hiddenReceipts.clear();
    this.seed();
    this.changed();
  };
  refresh = async () => {
    this.hiddenReviews.clear();
    this.hiddenReceipts.clear();
    if (
      [
        "loading",
        "readError",
        "offline",
        "wrongTenant",
        "wrongSource",
        "missing",
        "receiptError",
      ].includes(this.mode)
    )
      this.mode = "ready";
    this.changed();
  };
  private access() {
    if (this.mode === "session") throw fail("UNAUTHORIZED");
    if (this.mode === "forbidden") throw fail("FORBIDDEN");
  }
  private source() {
    return {
      integrationId: 101,
      spreadsheetId: "local-sheet-prototype-101",
      digest: hash(
        this.mode === "sourceChanged"
          ? "changed-connection"
          : "sheet-connection"
      ),
    };
  }
  private availableSheets() {
    return tabs.map(sheet =>
      this.mode === "limited" && sheet.id === 0
        ? { ...sheet, rows: 12000, columns: 70 }
        : { ...sheet }
    );
  }
  connection = () => {
    this.access();
    return {
      merchantId: this.mode === "wrongTenant" ? 1 : importPreviewId,
      actorId: importPreviewId,
      integrationSource: this.mode === "source" ? "salla" : "none",
      source: ["unlinked", "oauth"].includes(this.mode) ? null : this.source(),
      reason:
        this.mode === "unlinked"
          ? "unlinked"
          : this.mode === "oauth"
            ? "oauth_disabled"
            : null,
    };
  };
  list = (raw: unknown) => {
    this.access();
    const input = productSheetListInput.parse(raw);
    if (input.expectedSourceDigest !== this.source().digest)
      throw fail("CONFLICT");
    return {
      merchantId: importPreviewId,
      actorId: importPreviewId,
      source:
        this.mode === "wrongSource"
          ? { ...this.source(), digest: hash("wrong") }
          : this.source(),
      sheets: this.mode === "emptySheets" ? [] : this.availableSheets(),
    };
  };
  private currentCatalog() {
    const catalog = structuredClone(this.catalog);
    if (this.mode === "ambiguous")
      catalog.push({ ...structuredClone(catalog[0]), id: 908 });
    if (this.mode === "external") catalog[0].locked = true;
    if (this.mode === "legacy") catalog[0].fields = null;
    if (this.mode === "currency" && catalog[0].fields)
      catalog[0].fields.currency = "USD";
    return catalog;
  }
  prepare = async (raw: unknown) => {
    this.access();
    const input = productSheetPrepareInput.parse(raw),
      old = this.reviews.get(input.reviewId);
    if (old) {
      if (JSON.stringify(old.input) !== JSON.stringify(input))
        throw fail("CONFLICT");
      return this.read({ reviewId: input.reviewId });
    }
    if (["source", "unlinked", "oauth"].includes(this.mode))
      throw fail("PRECONDITION_FAILED");
    if (input.selection.expectedSourceDigest !== this.source().digest)
      throw fail("CONFLICT");
    const sheet = this.availableSheets().find(
      s => s.id === input.selection.sheet.id
    );
    if (
      !sheet ||
      JSON.stringify(sheet) !== JSON.stringify(input.selection.sheet)
    )
      throw fail("CONFLICT");
    if (this.mode === "emptyRows")
      throw fail("BAD_REQUEST", "product_sheet:empty_file");
    const values: (string | number)[][] = [["name", "price", "sku"]];
    for (let i = 1; i <= 25; i++)
      values.push([
        i <= 2
          ? `منتج محلي ${i}`
          : `عنصر من الورقة ${i}${this.mode === "long" ? " تفاصيل طويلة للمراجعة".repeat(9) : ""}`,
        this.mode === "invalidRows" && i === 3 ? "" : i === 4 ? 0 : 12.34,
        `SHEET-${i}`,
      ]);
    const snapshot = previewProductSheet(
      {
        spreadsheetId: this.source().spreadsheetId,
        sheets: [
          {
            properties: {
              sheetId: sheet.id,
              title: sheet.title,
              hidden: sheet.hidden,
              sheetType: "GRID",
              gridProperties: {
                rowCount: sheet.rows,
                columnCount: sheet.columns,
              },
            },
            data: [
              {
                rowData: values.map(row => ({
                  values: row.map(x => ({
                    userEnteredValue:
                      typeof x === "number"
                        ? { numberValue: x }
                        : { stringValue: x },
                  })),
                })),
              },
            ],
          },
        ],
      },
      {
        spreadsheetId: this.source().spreadsheetId,
        sheet,
        options: input.selection.options,
        readAt: new Date().toISOString(),
      }
    );
    const plan = planProductSheet(snapshot, input.mode, this.currentCatalog()),
      digest = hash({ input, snapshot, plan });
    this.reviews.set(input.reviewId, {
      input,
      snapshot,
      plan,
      digest,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      receipt: null,
    });
    this.reads++;
    if (this.mode === "prepareLost") {
      this.hiddenReviews.add(input.reviewId);
      this.changed();
      throw fail("INTERNAL_SERVER_ERROR");
    }
    this.changed();
    return this.read({ reviewId: input.reviewId });
  };
  read = (raw: unknown) => {
    this.access();
    const selection = productSheetReadInput.parse(raw),
      r = this.reviews.get(selection.reviewId);
    if (!r || this.mode === "missing") throw fail("NOT_FOUND");
    if (this.hiddenReviews.has(selection.reviewId))
      throw fail("INTERNAL_SERVER_ERROR");
    const { preview, ...snapshot } = r.snapshot,
      { rows, ...meta } = preview;
    const sourceCurrent =
        r.input.selection.expectedSourceDigest === this.source().digest,
      expired = this.mode === "expired",
      connection = this.connection();
    const pairs = r.plan.rows.map((change, i) => ({ source: rows[i], change })),
      filtered =
        selection.filter === "all"
          ? pairs
          : pairs.filter(p => p.change.action === selection.filter);
    return productSheetReview.parse({
      merchantId: importPreviewId,
      actorId: importPreviewId,
      reviewId: selection.reviewId,
      digest: r.digest,
      selection,
      source: {
        ...this.source(),
        digest: r.input.selection.expectedSourceDigest,
      },
      options: r.input.selection,
      mode: r.input.mode,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      expired,
      canManage: true,
      integrationSource: connection.integrationSource,
      sourceCurrent,
      canCommit:
        sourceCurrent &&
        !expired &&
        !r.receipt &&
        !r.plan.counts.blocked &&
        connection.integrationSource === "none",
      receipt: this.hiddenReceipts.has(r.receipt?.requestId ?? "")
        ? null
        : r.receipt,
      snapshot,
      preview: meta,
      counts: r.plan.counts,
      rows: filtered.slice(
        (selection.page - 1) * selection.pageSize,
        selection.page * selection.pageSize
      ),
      filteredTotal: filtered.length,
      totalPages: Math.ceil(filtered.length / selection.pageSize),
    });
  };
  commit = async (raw: unknown) => {
    this.access();
    const input = productSheetCommitInput.parse(raw),
      prior = this.receipts.get(input.requestId);
    if (prior) {
      if (prior.input !== JSON.stringify(input)) throw fail("CONFLICT");
      return structuredClone(prior.value);
    }
    const r = this.reviews.get(input.reviewId);
    if (!r || this.mode === "missing") throw fail("NOT_FOUND");
    if (this.mode === "expired") throw fail("PRECONDITION_FAILED");
    if (["source", "unlinked", "oauth"].includes(this.mode))
      throw fail("PRECONDITION_FAILED");
    if (
      r.receipt ||
      r.digest !== input.expectedDigest ||
      r.input.selection.expectedSourceDigest !== this.source().digest ||
      this.mode === "conflict"
    )
      throw fail("CONFLICT");
    if (r.plan.counts.blocked) throw fail("BAD_REQUEST");
    if (
      planProductSheet(r.snapshot, r.input.mode, this.currentCatalog())
        .digest !== r.plan.digest
    )
      throw fail("CONFLICT");
    if (["notCommitted", "receiptError", "wrongReceipt"].includes(this.mode))
      throw fail("INTERNAL_SERVER_ERROR");
    const next = structuredClone(this.catalog),
      rows: ProductSheetReceipt["rows"] = [];
    let nextId = this.nextId;
    for (const change of r.plan.rows) {
      if (change.action === "blocked") throw fail("BAD_REQUEST");
      const fields = change.after!;
      let productId = change.productId;
      if (change.action === "create") {
        productId = nextId++;
        next.push({
          id: productId,
          name: fields.name,
          sku: fields.sku,
          fields,
          digest: hash(fields),
          locked: false,
        });
      } else if (change.action === "update") {
        const index = next.findIndex(p => p.id === productId);
        if (index < 0) throw fail("CONFLICT");
        next[index] = {
          ...next[index],
          name: fields.name,
          sku: fields.sku,
          fields,
          digest: hash(fields),
        };
      }
      rows.push({
        number: change.number,
        action: change.action,
        productId: productId!,
      });
    }
    const result = productSheetReceipt.parse({
      merchantId: importPreviewId,
      actorId: importPreviewId,
      reviewId: input.reviewId,
      requestId: input.requestId,
      kind: "sheet_import",
      digest: r.digest,
      sourceDigest: r.input.selection.expectedSourceDigest,
      snapshotDigest: r.snapshot.digest,
      createdAt: new Date().toISOString(),
      rows,
      counts: {
        create: r.plan.counts.create,
        update: r.plan.counts.update,
        unchanged: r.plan.counts.unchanged,
      },
    });
    this.catalog = next;
    this.nextId = nextId;
    this.createdCount += result.counts.create;
    this.updatedCount += result.counts.update;
    r.receipt = result;
    this.receipts.set(input.requestId, {
      input: JSON.stringify(input),
      value: result,
    });
    if (this.mode === "commitLost") {
      this.hiddenReceipts.add(input.requestId);
      this.changed();
      throw fail("INTERNAL_SERVER_ERROR");
    }
    this.changed();
    return structuredClone(result);
  };
  receipt = async (raw: unknown) => {
    this.access();
    const { requestId } = productSheetReceiptInput.parse(raw);
    if (this.mode === "receiptError") throw fail("INTERNAL_SERVER_ERROR");
    this.hiddenReceipts.delete(requestId);
    this.changed();
    const r = this.receipts.get(requestId)?.value;
    if (this.mode === "wrongReceipt") return { merchantId: 1 };
    return r ? structuredClone(r) : null;
  };
  discard = async (raw: unknown) => {
    this.access();
    const input = productSheetDiscardInput.parse(raw),
      r = this.reviews.get(input.reviewId);
    if (r && r.digest !== input.expectedDigest) throw fail("CONFLICT");
    this.reviews.delete(input.reviewId);
    this.changed();
    return { discarded: true };
  };
}
