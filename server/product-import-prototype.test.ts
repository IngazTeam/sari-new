import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runInContext } from "node:vm";
import { webcrypto } from "node:crypto";
import { MessageChannel } from "node:worker_threads";
import { JSDOM, VirtualConsole } from "jsdom";
import ExcelJS from "exceljs";
import {
  ImportPreviewStore,
  importModes,
  importSampleId,
  importPreviewId,
} from "../prototypes/tenant-dashboard/src/import-model";
import { productImportReviewSchema } from "../shared/product-import";
const requestId = "11111111-1111-4111-8111-111111111111";
const reviewId = "22222222-2222-4222-8222-222222222222";
const input = (s: ImportPreviewStore) => ({
  reviewId: importSampleId,
  requestId,
  expectedDigest: s.sample().digest,
  reviewed: true,
});
describe("import prototype contracts", () => {
  it.each(Object.keys(importModes) as (keyof typeof importModes)[])(
    "validates %s without creating products",
    mode => {
      const s = new ImportPreviewStore();
      s.setMode(mode);
      if (["forbidden", "session", "missing"].includes(mode))
        expect(() => s.read({ reviewId: importSampleId })).toThrow();
      else
        expect(
          productImportReviewSchema.safeParse(
            s.read({ reviewId: importSampleId })
          ).success
        ).toBe(true);
      expect(s.createdCount).toBe(0);
    }
  );
  it("pages all rows and preserves zero versus unknown values", () => {
    const s = new ImportPreviewStore();
    const first = s.read({ reviewId: importSampleId });
    expect(first.preview.rows).toHaveLength(20);
    expect(first.preview.rows[0].fields).toMatchObject({
      price: "0",
      stock: null,
    });
    expect(
      s.read({ reviewId: importSampleId, page: 2 }).preview.rows
    ).toHaveLength(5);
    s.setMode("errors");
    expect(
      s.read({ reviewId: importSampleId, filter: "errors" }).preview.rows
    ).toHaveLength(1);
  });
  it("replays the same request once and rejects a second operation", async () => {
    const s = new ImportPreviewStore(),
      write = input(s),
      receipt = await s.commit(write);
    expect(await s.commit(write)).toEqual(receipt);
    expect(s.createdCount).toBe(25);
    await expect(
      s.commit({ ...write, requestId: reviewId })
    ).rejects.toMatchObject({ data: { code: "CONFLICT" } });
  });
  it.each(["uncertain", "wrongReceipt"] as const)(
    "recovers %s with the same receipt",
    async mode => {
      const s = new ImportPreviewStore(),
        write = input(s);
      s.setMode(mode);
      if (mode === "uncertain") await expect(s.commit(write)).rejects.toThrow();
      else expect((await s.commit(write)).merchantId).toBe(1);
      expect(s.read({ reviewId: importSampleId }).receipt).toBeNull();
      const receipt = await s.receipt({ requestId });
      expect(receipt?.merchantId).toBe(importPreviewId);
      expect(await s.commit(write)).toEqual(receipt);
      expect(s.createdCount).toBe(25);
    }
  );
  it.each([
    "viewer",
    "source",
    "expired",
    "errors",
    "conflict",
    "notCommitted",
  ] as const)("blocks %s", async mode => {
    const s = new ImportPreviewStore();
    s.setMode(mode);
    await expect(s.commit(input(s))).rejects.toThrow();
    expect(s.createdCount).toBe(0);
  });
  it("uses the actual CSV parser and rejects changed input under the same ID", async () => {
    const s = new ImportPreviewStore(),
      file = {
        format: "csv",
        fileName: "test.csv",
        currency: "USD",
        csvData: "الاسم,السعر,الكمية\nمنتج,12.30,\nناقص,,0",
      };
    const r = await s.prepare({ reviewId, file });
    expect(r.preview.valid).toBe(1);
    expect(r.preview.invalid).toBe(1);
    expect(r.preview.rows[0].fields).toMatchObject({
      price: "12.30",
      currency: "USD",
      stock: null,
    });
    expect((await s.prepare({ reviewId, file })).preview.digest).toBe(
      r.preview.digest
    );
    await expect(
      s.prepare({ reviewId, file: { ...file, currency: "SAR" } })
    ).rejects.toThrow();
  });
  it("parses a selected Excel sheet and rejects formulas including cached results", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Summary").addRow(["Summary"]);
    const sheet = wb.addWorksheet("Products");
    sheet.addRows([
      ["name", "price"],
      ["Valid", 12.34],
      ["Formula", { formula: "1+1", result: 2 }],
    ]);
    const s = new ImportPreviewStore();
    const r = await s.prepare({
      reviewId,
      file: {
        format: "xlsx",
        fileName: "test.xlsx",
        currency: "SAR",
        sheet: 1,
        fileBase64: Buffer.from(await wb.xlsx.writeBuffer()).toString("base64"),
      },
    });
    expect(r.preview.valid).toBe(1);
    expect(r.preview.invalid).toBe(1);
    expect(r.preview.rows[1].issues.some(i => i.code === "formula")).toBe(true);
  });
  it("recovers lost preview response and retains receipts after discarding a review", async () => {
    const s = new ImportPreviewStore();
    s.setMode("prepareUncertain");
    await expect(
      s.prepare({
        reviewId,
        file: {
          format: "csv",
          fileName: "test.csv",
          currency: "SAR",
          csvData: "name,price\nNew,0",
        },
      })
    ).rejects.toThrow();
    const r = s.read({ reviewId });
    s.setMode("data");
    const receipt = await s.commit({
      reviewId,
      requestId,
      expectedDigest: r.preview.digest,
      reviewed: true,
    });
    await s.discard({ reviewId, expectedDigest: r.preview.digest });
    expect(await s.receipt({ requestId })).toEqual(receipt);
    expect(s.createdCount).toBe(1);
  });
});
let dom: JSDOM, w: any, errors: Error[];
const text = () => w.document.getElementById("main").textContent as string;
const button = (name: string) =>
  Array.from(w.document.querySelectorAll("#main button")).find(
    (b: any) => b.textContent.trim() === name
  ) as any;
async function click(name: string) {
  const b = button(name);
  expect(b, name).toBeTruthy();
  expect(b.disabled, name).not.toBe(true);
  b.click();
  await new Promise(r => setTimeout(r, 20));
}
async function choose(selector: string, value: string) {
  const el = w.document.querySelector(selector);
  el.value = value;
  el.dispatchEvent(new w.Event("change", { bubbles: true }));
  await new Promise(r => setTimeout(r, 20));
}
describe("built import prototype with actual workspace", () => {
  beforeEach(async () => {
    errors = [];
    const vc = new VirtualConsole();
    vc.on("jsdomError", e => errors.push(e));
    const base = "prototypes/tenant-dashboard/site/";
    dom = new JSDOM(readFileSync(base + "index.html", "utf8"), {
      url: "http://127.0.0.1:4329/#/page/merchant/products/upload",
      runScripts: "outside-only",
      pretendToBeVisual: true,
      virtualConsole: vc,
    });
    w = dom.window;
    w.structuredClone = structuredClone;
    w.TextEncoder = TextEncoder;
    w.TextDecoder = TextDecoder;
    w.scrollTo = () => {};
    Object.defineProperty(w, "crypto", { value: webcrypto });
    w.MessageChannel = class extends MessageChannel {
      constructor() {
        super();
        this.port1.unref();
        this.port2.unref();
      }
    };
    w.fetch = vi.fn(() => {
      throw Error("Prototype must not fetch");
    });
    for (const script of Array.from(
      w.document.querySelectorAll("script[src]")
    ) as any[])
      runInContext(
        readFileSync(base + script.getAttribute("src"), "utf8"),
        dom.getInternalVMContext()
      );
    await vi.waitFor(() => expect(text()).toContain("راجع الملف قبل الإضافة"));
  });
  afterEach(() => {
    w.ImportPreview?.unmount();
    w.ProductPreview?.unmount();
    w.CustomerPreview?.unmount();
    w.ReportPreview?.unmount();
    w.OrderPreview?.unmount();
    w.QuotationPreview?.unmount();
    dom.window.close();
    expect(errors).toEqual([]);
    expect(w.fetch).not.toHaveBeenCalled();
  });
  it("paginates and changes language without untranslated keys or duplicate headings", async () => {
    expect(w.document.querySelectorAll(".pi-rows > li")).toHaveLength(20);
    await click("التالي");
    expect(w.document.querySelectorAll(".pi-rows > li")).toHaveLength(5);
    await choose(".pp-controls label:nth-of-type(2) select", "en");
    expect(text()).toContain("Review before importing");
    expect(text()).not.toMatch(/product(?:Import|Workspace)Ux\./);
    expect(w.document.querySelectorAll("#main h1")).toHaveLength(1);
  });
  it("recovers a lost commit response without creating the file twice", async () => {
    await choose(".pp-controls select", "uncertain");
    w.document.querySelector(".pi-approval input").click();
    await new Promise(r => setTimeout(r, 20));
    await click("اعتماد 25 عنصرًا");
    await vi.waitFor(() =>
      expect(text()).toContain("نحتاج تأكيد نتيجة العملية")
    );
    await click("فحص النتيجة");
    await vi.waitFor(() => expect(text()).toContain("تمت إضافة 25 عنصرًا"));
    expect(text()).toContain("عدد العناصر المنشأة في المحاكاة: 25");
  });
  it("blocks invalid rows and resets to the empty file workflow", async () => {
    await choose(".pp-controls select", "errors");
    expect(button("اعتماد 25 عنصرًا").disabled).toBe(true);
    await choose(".pp-controls select", "empty");
    await click("نعم، إعادة المثال");
    expect(w.document.querySelectorAll(".pi-rows > li")).toHaveLength(0);
    expect(w.document.querySelector("input[type=file]")).not.toBeNull();
    expect(text()).not.toContain("راجع الملف قبل الإضافة");
  });
});
