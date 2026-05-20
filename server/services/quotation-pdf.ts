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

import * as fs from 'fs';
import * as path from 'path';

interface QuotationItem {
  name: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface QuotationData {
  quotationNumber: string;
  merchantName: string;
  merchantLogo?: string | null;
  merchantPhone?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  items: QuotationItem[];
  subtotal: number;
  taxRate?: number;
  taxAmount: number;
  total: number;
  currency: string;
  validUntil?: string | null;
  termsText?: string | null;
  footerText?: string | null;
  createdAt: string;
}

/**
 * Generate a professional quotation PDF and upload to storage.
 * Returns the public URL of the uploaded PDF.
 */
export async function generateQuotationPDF(data: QuotationData): Promise<string> {
  // Render HTML template
  const html = buildQuotationHTML(data);
  
  // Generate PDF using puppeteer-core
  const pdfBuffer = await renderHTMLtoPDF(html);
  
  // STR-02: Cap PDF size to prevent memory abuse
  const MAX_PDF_SIZE = 5 * 1024 * 1024; // 5MB
  if (pdfBuffer.length > MAX_PDF_SIZE) {
    throw new Error(`[QuotationPDF] PDF too large: ${(pdfBuffer.length / 1024 / 1024).toFixed(1)}MB exceeds 5MB limit`);
  }
  
  // Upload to storage
  // STR-01: Use stable filename (no timestamp) so re-sends overwrite the same file
  // This prevents infinite PDF accumulation in storage
  const { storagePut } = await import('../storage');
  const safeNumber = data.quotationNumber.replace(/[^a-zA-Z0-9-]/g, '');
  const fileName = `quotations/quote-${safeNumber}.pdf`;
  
  const { url } = await storagePut(fileName, pdfBuffer, 'application/pdf');
  console.log(`[QuotationPDF] ✅ Generated and uploaded: ${fileName} (${(pdfBuffer.length / 1024).toFixed(0)}KB)`);
  
  return url;
}


/**
 * Render HTML string to PDF buffer using puppeteer-core.
 */
async function renderHTMLtoPDF(html: string): Promise<Buffer> {
  const puppeteerCore = await import('puppeteer-core');
  
  // Find Chromium executable
  let chromiumPath: string | null = null;
  try {
    // @ts-ignore — chromium package has no type declarations
    const chromium = await import('chromium');
    chromiumPath = (chromium as any).default?.path || (chromium as any).path || null;
  } catch { /* chromium package not available */ }
  
  // Fallback: check system-installed Chromium
  if (!chromiumPath) {
    const { existsSync } = await import('fs');
    const systemPaths = [
      '/usr/bin/chromium-browser', '/usr/bin/chromium',
      '/snap/bin/chromium', '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
    ];
    for (const p of systemPaths) {
      if (existsSync(p)) {
        chromiumPath = p;
        break;
      }
    }
  }
  
  if (!chromiumPath) {
    throw new Error('[QuotationPDF] Chromium not found. Install chromium package or set system Chromium path.');
  }
  
  const browser = await puppeteerCore.launch({
    headless: true,
    executablePath: chromiumPath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    timeout: 15000,
  });
  
  try {
    const page = await browser.newPage();
    // AR-01: Use 'domcontentloaded' since fonts are now embedded (no external requests needed)
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 10000 });
    
    const pdfUint8Array = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' },
    });
    
    return Buffer.from(pdfUint8Array);
  } finally {
    await browser.close();
  }
}


/**
 * Build professional RTL Arabic quotation HTML with Sari branding.
 */
function buildQuotationHTML(data: QuotationData): string {
  const itemRows = data.items.map((item, i) => `
    <tr>
      <td style="text-align:center; padding:10px 8px; border-bottom:1px solid #f0f0f0;">${i + 1}</td>
      <td style="padding:10px 8px; border-bottom:1px solid #f0f0f0;">
        <strong>${escapeHtml(item.name)}</strong>
        ${item.description ? `<br><span style="color:#888; font-size:12px;">${escapeHtml(item.description)}</span>` : ''}
      </td>
      <td style="text-align:center; padding:10px 8px; border-bottom:1px solid #f0f0f0;">${item.quantity}</td>
      <td style="text-align:center; padding:10px 8px; border-bottom:1px solid #f0f0f0;">${formatPrice(item.unitPrice)} ${data.currency}</td>
      <td style="text-align:center; padding:10px 8px; border-bottom:1px solid #f0f0f0; font-weight:600;">${formatPrice(item.total)} ${data.currency}</td>
    </tr>
  `).join('');
  
  // PEN-MEDIA-05: Validate logo URL protocol — block javascript:/data: to prevent XSS in Puppeteer
  const initialFallback = `<div style="width:60px; height:60px; background:linear-gradient(135deg, #7c3aed, #a855f7); border-radius:12px; display:flex; align-items:center; justify-content:center; color:white; font-size:24px; font-weight:700;">${data.merchantName.charAt(0)}</div>`;
  let logoSection = initialFallback;
  if (data.merchantLogo) {
    try {
      const logoUrl = new URL(data.merchantLogo);
      if (logoUrl.protocol === 'https:' || logoUrl.protocol === 'http:') {
        logoSection = `<img src="${escapeHtml(data.merchantLogo)}" alt="Logo" style="max-height:60px; max-width:180px; object-fit:contain;" />`;
      } else {
        console.warn(`[QuotationPDF] Blocked non-HTTP logo URL: ${logoUrl.protocol}`);
      }
    } catch {
      console.warn('[QuotationPDF] Invalid logo URL, using fallback');
    }
  }
  
  const taxSection = data.taxAmount > 0 ? `
    <tr>
      <td style="padding:8px 16px; color:#666;">الضريبة (${((data.taxRate || 0.15) * 100).toFixed(0)}%)</td>
      <td style="padding:8px 16px; text-align:left; color:#666;">${formatPrice(data.taxAmount)} ${data.currency}</td>
    </tr>
  ` : '';
  
  const validUntilSection = data.validUntil ? `
    <div style="background:#fef3c7; border:1px solid #f59e0b; border-radius:8px; padding:10px 16px; margin-top:16px; font-size:13px; color:#92400e;">
      ⏰ هذا العرض صالح حتى: <strong>${escapeHtml(data.validUntil)}</strong>
    </div>
  ` : '';
  
  const termsSection = data.termsText ? `
    <div style="margin-top:24px; padding:16px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0;">
      <div style="font-weight:600; margin-bottom:8px; color:#475569;">📋 الشروط والأحكام</div>
      <div style="color:#64748b; font-size:13px; line-height:1.8; white-space:pre-line;">${escapeHtml(data.termsText)}</div>
    </div>
  ` : '';
  
  const footerSection = data.footerText ? `
    <div style="text-align:center; margin-top:16px; color:#94a3b8; font-size:12px;">${escapeHtml(data.footerText)}</div>
  ` : '';
  
  // AR-01: Load fonts as base64 for offline PDF reliability (no Google Fonts dependency)
  let fontFaceCSS = '';
  try {
    const fontsDir = path.join(__dirname, 'fonts');
    const regularPath = path.join(fontsDir, 'Tajawal-Regular.woff2');
    const boldPath = path.join(fontsDir, 'Tajawal-Bold.woff2');
    
    if (fs.existsSync(regularPath)) {
      const regularB64 = fs.readFileSync(regularPath).toString('base64');
      fontFaceCSS += `@font-face { font-family: 'Tajawal'; src: url(data:font/woff2;base64,${regularB64}) format('woff2'); font-weight: 400; font-style: normal; }\n`;
    }
    if (fs.existsSync(boldPath)) {
      const boldB64 = fs.readFileSync(boldPath).toString('base64');
      fontFaceCSS += `@font-face { font-family: 'Tajawal'; src: url(data:font/woff2;base64,${boldB64}) format('woff2'); font-weight: 700; font-style: normal; }\n`;
    }
    
    if (!fontFaceCSS) {
      console.warn('[QuotationPDF] Local font files not found, falling back to Google Fonts');
      fontFaceCSS = `@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap');`;
    }
  } catch (fontErr) {
    console.warn('[QuotationPDF] Failed to load local fonts, using Google Fonts fallback:', fontErr);
    fontFaceCSS = `@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap');`;
  }
  
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <style>
    ${fontFaceCSS}
    * { margin:0; padding:0; box-sizing:border-box; }
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
    <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:20px; border-bottom:3px solid #7c3aed; margin-bottom:24px;">
      <div style="display:flex; align-items:center; gap:12px;">
        ${logoSection}
        <div>
          <div style="font-size:20px; font-weight:700; color:#1e293b;">${escapeHtml(data.merchantName)}</div>
          ${data.merchantPhone ? `<div style="color:#64748b; font-size:13px;">📞 ${escapeHtml(data.merchantPhone)}</div>` : ''}
        </div>
      </div>
      <div style="text-align:left;">
        <div style="font-size:11px; color:#94a3b8; text-transform:uppercase; letter-spacing:1px;">عرض سعر</div>
        <div style="font-size:20px; font-weight:700; color:#7c3aed;">#${escapeHtml(data.quotationNumber)}</div>
        <div style="color:#94a3b8; font-size:12px;">${data.createdAt}</div>
      </div>
    </div>
    
    <!-- Customer Info -->
    ${data.customerName || data.customerPhone ? `
    <div style="background:#f8fafc; border-radius:10px; padding:14px 18px; margin-bottom:20px; border:1px solid #e2e8f0;">
      <div style="font-weight:600; color:#475569; margin-bottom:4px;">معلومات العميل</div>
      ${data.customerName ? `<div>الاسم: <strong>${escapeHtml(data.customerName)}</strong></div>` : ''}
      ${data.customerPhone ? `<div>الهاتف: ${escapeHtml(data.customerPhone)}</div>` : ''}
    </div>
    ` : ''}
    
    <!-- Items Table -->
    <table style="width:100%; border-collapse:collapse; margin-bottom:20px;">
      <thead>
        <tr style="background:linear-gradient(135deg, #7c3aed, #6d28d9); color:white;">
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
          <td style="padding:8px 16px; text-align:left;">${formatPrice(data.subtotal)} ${data.currency}</td>
        </tr>
        ${taxSection}
        <tr style="background:linear-gradient(135deg, #7c3aed, #6d28d9); color:white; font-size:16px;">
          <td style="padding:12px 16px; font-weight:700; border-radius:0 8px 8px 0;">الإجمالي النهائي</td>
          <td style="padding:12px 16px; text-align:left; font-weight:700; border-radius:8px 0 0 8px;">${formatPrice(data.total)} ${data.currency}</td>
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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatPrice(amount: number): string {
  return amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
