import { z } from "zod";
import { productSheetListInput } from "../../../shared/product-sheet-import";
import {
  inventorySheetPrepareInput,
  inventorySheetReadInput,
  inventorySheetCommitInput,
  inventorySheetDiscardInput,
  inventorySheetReceiptInput,
  inventorySheetReview,
  inventorySheetReceipt,
  type InventorySheetReceipt,
} from "../../../shared/product-sheet-inventory-review";
import { readProductSheetGrid } from "../../../server/product-sheet-preview";
import { sheetInventoryCatalogItem } from "../../../shared/product-sheet-inventory";
import {
  previewSheetInventory,
  planSheetInventory,
} from "../../../server/product-sheet-inventory";
import { createHash } from "./import-preview-crypto";
import { importPreviewId } from "./import-model";
export const inventoryModes = {
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
  invalidRows: "كمية فارغة أو غير صالحة",
  ambiguous: "عناوين ملتبسة",
  duplicate: "معرّف مكرر",
  unknown: "منتج مفقود",
  formula: "معادلة في الكمية",
  boolean: "قيمة منطقية في الكمية",
  external: "منتج تديره منصة",
  invalidCurrent: "كمية حالية غير صالحة",
  nullStock: "كمية حالية مجهولة",
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
export const inventoryPreviewScope = `${importPreviewId}:${importPreviewId}:sheet-inventory`;
export type InventoryMode = keyof typeof inventoryModes;
type Item = z.infer<typeof sheetInventoryCatalogItem>;
type Entry = {
  input: z.infer<typeof inventorySheetPrepareInput>;
  snapshot: ReturnType<typeof previewSheetInventory>;
  plan: ReturnType<typeof planSheetInventory>;
  digest: string;
  createdAt: string;
  expiresAt: string;
  receipt: InventorySheetReceipt | null;
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
export class InventorySheetStore {
  mode: InventoryMode = "ready";
  reads = 0;
  updatedCount = 0;
  private catalog: Item[] = [];
  private reviews = new Map<string, Entry>();
  private receipts = new Map<
    string,
    { input: string; value: InventorySheetReceipt }
  >();
  private hiddenReviews = new Set<string>();
  private hiddenReceipts = new Set<string>();
  constructor(private changed: () => void = () => {}) {
    this.seed();
  }
  private seed() {
    this.catalog = Array.from({ length: 25 }, (_, i) => ({
      id: 901 + i,
      name: `منتج محلي ${i + 1}`,
      stock: 7,
      stockValid: true,
      locked: false,
      digest: hash({ id: 901 + i, stock: 7 }),
    }));
  }
  setMode = (mode: InventoryMode) => {
    if (Object.hasOwn(inventoryModes, mode)) {
      if (mode === "nullStock" && this.mode !== mode) {
        this.catalog[0].stock = null;
        this.catalog[0].digest = hash({ id: this.catalog[0].id, stock: null });
      }
      this.mode = mode;
      this.changed();
    }
  };
  reset = () => {
    this.mode = "ready";
    this.reads = 0;
    this.updatedCount = 0;
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
      spreadsheetId: "local-inventory-prototype-107",
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
    if (this.mode === "external") catalog[0].locked = true;
    if (this.mode === "invalidCurrent") catalog[0].stockValid = false;
    if (this.mode === "long")
      catalog[0].name = (
        catalog[0].name + " تفاصيل طويلة للمراجعة".repeat(16)
      ).slice(0, 255);
    return catalog;
  }
  prepare = async (raw: unknown) => {
    this.access();
    const input = inventorySheetPrepareInput.parse(raw),
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
      throw fail("BAD_REQUEST", "inventory_sheet:empty_file");
    const values: (string | number)[][] = [
      ["id", "stock", this.mode === "ambiguous" ? "quantity" : "notes"],
    ];
    for (let i = 1; i <= 25; i++)
      values.push([
        this.mode === "unknown" && i === 3
          ? 2147483647
          : this.mode === "duplicate" && i === 3
            ? 901
            : 900 + i,
        this.mode === "invalidRows" && i === 3
          ? ""
          : i === 2
            ? 7
            : i === 4
              ? 0
              : 20,
        this.mode === "ambiguous"
          ? 5
          : this.mode === "long"
            ? "نص طويل لا يغير كمية المخزون".repeat(20)
            : "ملاحظة",
      ]);
    const snapshot = previewSheetInventory(
      readProductSheetGrid(
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
                    values: row.map((x, column) => ({
                      userEnteredValue:
                        column === 1 &&
                        row !== values[0] &&
                        this.mode === "formula"
                          ? { formulaValue: "=1+1" }
                          : column === 1 &&
                              row !== values[0] &&
                              this.mode === "boolean"
                            ? { boolValue: true }
                            : typeof x === "number"
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
          readAt: new Date().toISOString(),
        }
      ),
      input.selection.options
    );
    const plan = planSheetInventory(snapshot, this.currentCatalog()),
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
    const selection = inventorySheetReadInput.parse(raw),
      r = this.reviews.get(selection.reviewId);
    if (!r || this.mode === "missing") throw fail("NOT_FOUND");
    if (this.hiddenReviews.has(selection.reviewId))
      throw fail("INTERNAL_SERVER_ERROR");
    const { rows, ...meta } = r.snapshot;
    const connection = this.connection(),
      sourceCurrent =
        r.input.selection.expectedSourceDigest === connection.source?.digest,
      expired = this.mode === "expired";
    const pairs = r.plan.rows.map((change, i) => ({ source: rows[i], change })),
      filtered =
        selection.filter === "all"
          ? pairs
          : pairs.filter(p => p.change.action === selection.filter);
    return inventorySheetReview.parse({
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
    const input = inventorySheetCommitInput.parse(raw),
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
      planSheetInventory(r.snapshot, this.currentCatalog()).digest !==
      r.plan.digest
    )
      throw fail("CONFLICT");
    if (["notCommitted", "receiptError", "wrongReceipt"].includes(this.mode))
      throw fail("INTERNAL_SERVER_ERROR");
    const next = structuredClone(this.catalog),
      rows: InventorySheetReceipt["rows"] = [];
    for (const change of r.plan.rows) {
      if (
        change.action === "blocked" ||
        change.productId === null ||
        change.after === null
      )
        throw fail("BAD_REQUEST");
      const index = next.findIndex(p => p.id === change.productId);
      if (index < 0) throw fail("CONFLICT");
      if (change.action === "update")
        next[index] = {
          ...next[index],
          stock: change.after,
          digest: hash({ id: change.productId, stock: change.after }),
        };
      rows.push({
        number: change.number,
        action: change.action,
        productId: change.productId,
        before: change.before,
        after: change.after,
      });
    }
    const result = inventorySheetReceipt.parse({
      merchantId: importPreviewId,
      actorId: importPreviewId,
      reviewId: input.reviewId,
      requestId: input.requestId,
      kind: "sheet_inventory",
      digest: r.digest,
      sourceDigest: r.input.selection.expectedSourceDigest,
      snapshotDigest: r.snapshot.digest,
      createdAt: new Date().toISOString(),
      rows,
      counts: {
        update: r.plan.counts.update,
        unchanged: r.plan.counts.unchanged,
      },
    });
    this.catalog = next;
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
    const { requestId } = inventorySheetReceiptInput.parse(raw);
    if (this.mode === "receiptError") throw fail("INTERNAL_SERVER_ERROR");
    this.hiddenReceipts.delete(requestId);
    this.changed();
    const r = this.receipts.get(requestId)?.value;
    if (this.mode === "wrongReceipt") return { merchantId: 1 };
    return r ? structuredClone(r) : null;
  };
  discard = async (raw: unknown) => {
    this.access();
    const input = inventorySheetDiscardInput.parse(raw),
      r = this.reviews.get(input.reviewId);
    if (r && r.digest !== input.expectedDigest) throw fail("CONFLICT");
    this.reviews.delete(input.reviewId);
    this.changed();
    return { discarded: true };
  };
}
