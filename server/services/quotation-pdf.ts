/**
 * Quotation PDF Generator — Phase 3
 *
 * Generates professional quotation PDFs using puppeteer-core.
 * Supports: merchant logo, RTL Arabic layout, branded design, tax calculations.
 *
 * The generated PDF is uploaded to storage and returns a public URL
 * that can be sent via WhatsApp.
 *
 * AR-01: Fonts are embedded as base64 from local files for offline reliability.
 */

import * as fs from "fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  quotationDocumentInput,
  prepareQuotationDocument,
  safeQuotationLogoDataUrl,
  type QuotationData,
  type PreparedQuotationDocument,
} from "./quotation-document";
export type {
  QuotationData,
  PreparedQuotationDocument,
} from "./quotation-document";
import * as path from "path";
import {
  chromiumLaunchArgs,
  resolveChromiumExecutable,
} from "../browser/chromium-runtime";

/**
 * Generate a professional quotation PDF and upload to storage.
 * Returns the public URL of the uploaded PDF.
 */
export async function generateQuotationPDF(
  data: QuotationData
): Promise<string> {
  return renderPreparedQuotationPDF(await prepareQuotationDocument(data));
}

export async function renderPreparedQuotationPDF(
  prepared: PreparedQuotationDocument,
  expectedHtmlDigest?: string
): Promise<string> {
  const html = buildQuotationHTML(prepared.data, prepared.logoDataUrl);
  if (
    expectedHtmlDigest &&
    createHash("sha256").update(JSON.stringify(html)).digest("hex") !==
      expectedHtmlDigest
  )
    throw new Error("[QuotationPDF] Reviewed document layout changed");

  // Generate PDF using puppeteer-core
  const pdfBuffer = await renderHTMLtoPDF(html);

  // STR-02: Cap PDF size to prevent memory abuse
  const MAX_PDF_SIZE = 5 * 1024 * 1024; // 5MB
  if (pdfBuffer.length > MAX_PDF_SIZE) {
    throw new Error(
      `[QuotationPDF] PDF too large: ${(pdfBuffer.length / 1024 / 1024).toFixed(1)}MB exceeds 5MB limit`
    );
  }

  // Upload to storage
  // A changed document gets a different object; an earlier customer's URL stays intact.
  const { storagePut } = await import("../storage");
  const documentHash = createHash("sha256").update(html).digest("hex");
  const fileName = `quotations/quote-${documentHash}.pdf`;

  const { url } = await storagePut(fileName, pdfBuffer, "application/pdf");
  console.log(
    `[QuotationPDF] ✅ Generated and uploaded: ${fileName} (${(pdfBuffer.length / 1024).toFixed(0)}KB)`
  );

  return url;
}

/**
 * Render HTML string to PDF buffer using puppeteer-core.
 */
async function renderHTMLtoPDF(html: string): Promise<Buffer> {
  const puppeteerCore = await import("puppeteer-core");

  const chromiumPath = resolveChromiumExecutable();

  if (!chromiumPath) {
    throw new Error(
      "[QuotationPDF] Chromium not found. Set CHROMIUM_EXECUTABLE_PATH or install a supported system Chrome/Chromium."
    );
  }

  const browser = await puppeteerCore.launch({
    headless: true,
    executablePath: chromiumPath,
    args: chromiumLaunchArgs(),
    timeout: 15000,
  });

  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setOfflineMode(true);
    await page.setRequestInterception(true);
    page.on("request", request => {
      const url = request.url();
      const embedded =
        /^data:(?:image\/(?:png|jpeg)|font\/woff2);base64,[A-Za-z0-9+/]+={0,2}$/.test(
          url
        );
      void (
        embedded ? request.continue() : request.abort("blockedbyclient")
      ).catch(() => {});
    });
    // AR-01: Use 'domcontentloaded' since fonts are now embedded (no external requests needed)
    await page.setContent(html, {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });

    let fontTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        page.evaluate(() => document.fonts.ready.then(() => undefined)),
        new Promise<never>((_, reject) => {
          fontTimer = setTimeout(
            () =>
              reject(new Error("[QuotationPDF] Font preparation timed out")),
            5000
          );
        }),
      ]);
    } finally {
      clearTimeout(fontTimer);
    }
    const pdfUint8Array = await page.pdf({
      timeout: 15000,
      format: "A4",
      printBackground: true,
      margin: { top: "15mm", bottom: "15mm", left: "12mm", right: "12mm" },
    });

    return Buffer.from(pdfUint8Array);
  } finally {
    await browser.close();
  }
}

/**
 * Build professional RTL Arabic quotation HTML with Sari branding.
 */
export function buildQuotationHTML(
  raw: QuotationData,
  embeddedLogo: string | null = null
): string {
  const data = quotationDocumentInput.parse(raw);
  const itemRows = data.items
    .map(
      (item, i) => `
    <tr>
      <td style="text-align:center; padding:10px 8px; border-bottom:1px solid #f0f0f0;">${i + 1}</td>
      <td style="padding:10px 8px; border-bottom:1px solid #f0f0f0;">
        <strong>${escapeHtml(item.name)}</strong>
        ${item.description ? `<br><span style="color:#888; font-size:12px;">${escapeHtml(item.description)}</span>` : ""}
      </td>
      <td style="text-align:center; padding:10px 8px; border-bottom:1px solid #f0f0f0;">${escapeHtml(String(item.quantity))}</td>
      <td style="text-align:center; padding:10px 8px; border-bottom:1px solid #f0f0f0;">${formatPrice(item.unitPrice)} ${escapeHtml(data.currency)}</td>
      <td style="text-align:center; padding:10px 8px; border-bottom:1px solid #f0f0f0; font-weight:600;">${formatPrice(item.total)} ${escapeHtml(data.currency)}</td>
    </tr>
  `
    )
    .join("");

  const initialFallback = `<div class="brand-mark">${escapeHtml(data.merchantName.charAt(0))}</div>`;
  const logo = safeQuotationLogoDataUrl(embeddedLogo);
  const logoSection = logo
    ? `<img src="${logo}" alt="Logo" style="max-height:60px; max-width:180px; object-fit:contain;" />`
    : initialFallback;

  const taxSection =
    data.taxAmount > 0
      ? `
    <tr>
      <td style="padding:8px 16px; color:#666;">الضريبة${data.taxRate == null ? "" : ` (${Number((data.taxRate * 100).toFixed(2))}%)`}</td>
      <td style="padding:8px 16px; text-align:left; color:#666;">${formatPrice(data.taxAmount)} ${escapeHtml(data.currency)}</td>
    </tr>
  `
      : "";

  const validUntilSection = data.validUntil
    ? `
    <div style="background:#fef3c7; border:1px solid #f59e0b; border-radius:8px; padding:10px 16px; margin-top:16px; font-size:13px; color:#92400e;">
      ⏰ هذا العرض صالح حتى: <strong>${escapeHtml(data.validUntil)}</strong>
    </div>
  `
    : "";

  const termsSection = data.termsText
    ? `
    <div style="margin-top:24px; padding:16px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0;">
      <div style="font-weight:600; margin-bottom:8px; color:#475569;">📋 الشروط والأحكام</div>
      <div style="color:#64748b; font-size:13px; line-height:1.8; white-space:pre-line;">${escapeHtml(data.termsText)}</div>
    </div>
  `
    : "";

  const footerSection = data.footerText
    ? `
    <div style="text-align:center; margin-top:16px; color:#94a3b8; font-size:12px;">${escapeHtml(data.footerText)}</div>
  `
    : "";

  let fontFaceCSS = "";
  const fontRoots = [
    path.join(path.dirname(fileURLToPath(import.meta.url)), "fonts"),
    path.resolve(process.cwd(), "server/services/fonts"),
  ];
  for (const [name, weight] of [
    ["Tajawal-Regular.woff2", 400],
    ["Tajawal-Bold.woff2", 700],
  ] as const) {
    for (const root of fontRoots) {
      try {
        const font = fs.readFileSync(path.join(root, name));
        if (font.length > 512 * 1024 || font.toString("ascii", 0, 4) !== "wOF2")
          continue;
        fontFaceCSS += `@font-face { font-family: 'Tajawal'; src: url(data:font/woff2;base64,${font.toString("base64")}) format('woff2'); font-weight: ${weight}; font-style: normal; }\n`;
        break;
      } catch {
        /* Offline system fonts remain available when bundled fonts are missing. */
      }
    }
  }

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-src 'none'" />
  <style>
    ${fontFaceCSS}
    * { margin:0; padding:0; box-sizing:border-box; }
    td, th, div { overflow-wrap:anywhere; }
    tr { break-inside:avoid; }
    thead { display:table-header-group; }
    .brand-mark { width:60px; height:60px; border-radius:12px; background:#244238; color:#dce7c7; display:flex; align-items:center; justify-content:center; font-size:24px; font-weight:700; }
    body {
      font-family: 'Tajawal', 'Segoe UI', sans-serif;
      color: #1e293b;
      background: white;
      direction: rtl;
      font-size: 14px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div style="max-width:800px; margin:0 auto; padding:20px;">
    
    <!-- Header -->
    <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:20px; border-bottom:3px solid #244238; margin-bottom:24px;">
      <div style="display:flex; align-items:center; gap:12px;">
        ${logoSection}
        <div>
          <div style="font-size:20px; font-weight:700; color:#1e293b;">${escapeHtml(data.merchantName)}</div>
          ${data.merchantPhone ? `<div style="color:#64748b; font-size:13px;">📞 ${escapeHtml(data.merchantPhone)}</div>` : ""}
        </div>
      </div>
      <div style="text-align:left;">
        <div style="font-size:11px; color:#94a3b8; text-transform:uppercase; letter-spacing:1px;">عرض سعر</div>
        <div style="font-size:20px; font-weight:700; color:#244238;">#${escapeHtml(data.quotationNumber)}</div>
        <div style="color:#94a3b8; font-size:12px;">${escapeHtml(data.createdAt)}</div>
      </div>
    </div>
    
    <!-- Customer Info -->
    ${
      data.customerName || data.customerPhone
        ? `
    <div style="background:#f8fafc; border-radius:10px; padding:14px 18px; margin-bottom:20px; border:1px solid #e2e8f0;">
      <div style="font-weight:600; color:#475569; margin-bottom:4px;">معلومات العميل</div>
      ${data.customerName ? `<div>الاسم: <strong>${escapeHtml(data.customerName)}</strong></div>` : ""}
      ${data.customerPhone ? `<div>الهاتف: ${escapeHtml(data.customerPhone)}</div>` : ""}
    </div>
    `
        : ""
    }
    
    <!-- Items Table -->
    <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
      <thead>
        <tr style="background:linear-gradient(135deg, #244238, #244238); color:white;">
          <th style="padding:12px 8px; text-align:center; border-radius:0 8px 0 0; width:50px;">#</th>
          <th style="padding:12px 8px; text-align:right;">المنتج / الخدمة</th>
          <th style="padding:12px 8px; text-align:center; width:70px;">الكمية</th>
          <th style="padding:12px 8px; text-align:center; width:120px;">سعر الوحدة</th>
          <th style="padding:12px 8px; text-align:center; border-radius:8px 0 0 0; width:120px;">الإجمالي</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>
    
    <!-- Totals -->
    <div style="display:flex; justify-content:flex-start; margin-bottom:16px;">
      <table style="min-width:280px; border-collapse:collapse;">
        <tr>
          <td style="padding:8px 16px; color:#666;">المجموع الفرعي</td>
          <td style="padding:8px 16px; text-align:left;">${formatPrice(data.subtotal)} ${escapeHtml(data.currency)}</td>
        </tr>
        ${taxSection}
        <tr style="background:linear-gradient(135deg, #244238, #244238); color:white; font-size:16px;">
          <td style="padding:12px 16px; font-weight:700; border-radius:0 8px 8px 0;">الإجمالي النهائي</td>
          <td style="padding:12px 16px; text-align:left; font-weight:700; border-radius:8px 0 0 8px;">${formatPrice(data.total)} ${escapeHtml(data.currency)}</td>
        </tr>
      </table>
    </div>
    
    ${validUntilSection}
    ${termsSection}
    ${footerSection}
    
    <!-- Powered by -->
    <div style="text-align:center; margin-top:30px; padding-top:16px; border-top:1px solid #e2e8f0; color:#cbd5e1; font-size:11px;">
      مُنشأ بواسطة ساري — مساعد المبيعات الذكي 🤖
    </div>
    
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPrice(amount: number): string {
  return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
