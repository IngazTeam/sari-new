/**
 * Sales Quotation Engine — Database & Logic
 * 
 * Manages quotation generation, sales targets, and template management.
 * Tables already created in knowledge.ts:
 *   - sales_quotations
 *   - sales_targets
 *   - quotation_templates
 */

import { getPool } from '../db';
import { ensureKnowledgeTables } from './knowledge';
import { assertQuotationDocument } from '../quotation-legacy';

// ═══════════════════════════════════════════════════════════════
// PEN-TMPL-03 FIX: URL Sanitization for header images
// ═══════════════════════════════════════════════════════════════

function sanitizeHeaderUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return url.substring(0, 500);
    }
    console.warn(`[QuotationTemplates] Blocked non-HTTP header URL: ${parsed.protocol}`);
    return null;
  } catch {
    console.warn('[QuotationTemplates] Invalid header URL rejected');
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface QuotationItem {
  name: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export type SalesQuotation = import('../quotation-legacy').LegacyQuotation;
export type SalesTarget = NonNullable<Awaited<ReturnType<typeof import('../quotation-legacy').getCurrentTarget>>>;

export interface QuotationTemplate {
  id: number;
  merchantId: number;
  name: string;
  headerImageUrl: string | null;
  footerText: string | null;
  termsText: string | null;
  isDefault: boolean;
  createdAt: Date;
}

// ═══════════════════════════════════════════════════════════════
// Quotation CRUD
// ═══════════════════════════════════════════════════════════════

// Compatibility calls share the scoped readers and reviewed transaction writers.
export { createQuotation, getQuotations, getQuotationById, updateQuotationStatus, getQuotationStats,
  getCurrentTarget, setMonthlyTarget, getTargetHistory, assertQuotationDocument } from '../quotation-legacy';

// Quotation templates
/** Ready-made templates — seeded automatically on first access */
const DEFAULT_TEMPLATES: Array<{
  name: string;
  footerText: string;
  termsText: string;
  isDefault: boolean;
}> = [
  {
    name: '📋 عرض سعر رسمي',
    footerText: 'شكراً لثقتكم بنا! نسعد بخدمتكم دائماً 🙏\nللتواصل والاستفسار: واتساب أو اتصال',
    termsText: '• الأسعار شاملة ضريبة القيمة المضافة 15%\n• عرض السعر صالح لمدة 7 أيام من تاريخ الإصدار\n• الدفع مطلوب قبل التسليم\n• التوصيل خلال 3-5 أيام عمل\n• يمكن إلغاء الطلب قبل الشحن',
    isDefault: true,
  },
  {
    name: '🏢 عرض سعر احترافي',
    footerText: 'نقدر نلبي طلبات الجملة بأسعار خاصة!\nتواصل معنا لعرض سعر مخصص للكميات الكبيرة 📦',
    termsText: '• الأسعار المذكورة بالريال السعودي شاملة الضريبة\n• صلاحية العرض: 14 يوم\n• طريقة الدفع: تحويل بنكي أو نقداً عند الاستلام\n• ضمان الجودة: استبدال خلال 7 أيام\n• أسعار خاصة للكميات أكثر من 10 قطع\n• التوصيل مجاني للطلبات فوق 500 ريال',
    isDefault: false,
  },
  {
    name: '⚡ عرض سعر سريع',
    footerText: '✅ اطلب الآن وتوصلك بأسرع وقت!',
    termsText: '• الأسعار شاملة الضريبة\n• عرض صالح لمدة 3 أيام\n• الدفع عند الاستلام متاح',
    isDefault: false,
  },
];

/** Seed default templates for a merchant (idempotent) */
async function seedDefaultTemplates(merchantId: number): Promise<void> {
  const pool = await getPool();
  if (!pool) return;

  for (const tmpl of DEFAULT_TEMPLATES) {
    try {
      // Use transaction for atomic default flag handling
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        if (tmpl.isDefault) {
          await conn.execute(
            `UPDATE quotation_templates SET is_default = 0 WHERE merchant_id = ?`,
            [merchantId]
          );
        }

        await conn.execute(
          `INSERT INTO quotation_templates (merchant_id, name, header_image_url, footer_text, terms_text, is_default)
           VALUES (?, ?, NULL, ?, ?, ?)`,
          [merchantId, tmpl.name, tmpl.footerText, tmpl.termsText, tmpl.isDefault ? 1 : 0]
        );

        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    } catch (err: any) {
      console.warn(`[QuotationTemplates] Failed to seed "${tmpl.name}":`, err.message);
    }
  }

  console.log(`[QuotationTemplates] ✅ Seeded ${DEFAULT_TEMPLATES.length} default templates for merchant ${merchantId}`);
}

/** Get templates for a merchant (auto-seeds defaults on first access) */
export async function getTemplates(merchantId: number): Promise<QuotationTemplate[]> {
  await ensureKnowledgeTables();
  const pool = await getPool();
  if (!pool) return [];

  const [rows] = await pool.execute(
    `SELECT * FROM quotation_templates WHERE merchant_id = ? ORDER BY is_default DESC, created_at`,
    [merchantId]
  );
  
  const mapTemplate = (row: any): QuotationTemplate => ({ id: Number(row.id), merchantId: Number(row.merchant_id), name: row.name,
    headerImageUrl: row.header_image_url, footerText: row.footer_text, termsText: row.terms_text, isDefault: Boolean(Number(row.is_default)), createdAt: new Date(row.created_at) });
  const templates = (rows as any[]).map(mapTemplate);
  
  // Auto-seed default templates on first access
  if (templates.length === 0) {
    await seedDefaultTemplates(merchantId);
    // Re-fetch after seeding
    const [seeded] = await pool.execute(
      `SELECT * FROM quotation_templates WHERE merchant_id = ? ORDER BY is_default DESC, created_at`,
      [merchantId]
    );
    return (seeded as any[]).map(mapTemplate);
  }
  
  return templates;
}

/** Create a template */
export async function createTemplate(data: {
  merchantId: number;
  name: string;
  headerImageUrl?: string | null;
  footerText?: string | null;
  termsText?: string | null;
  isDefault?: boolean;
}): Promise<number> {
  await ensureKnowledgeTables();
  const pool = await getPool();
  if (!pool) throw new Error('DB unavailable');

  // PEN-TMPL-03 FIX: Validate headerImageUrl protocol
  const safeHeaderUrl = sanitizeHeaderUrl(data.headerImageUrl);

  // PEN-TMPL-04 FIX: Use transaction for atomic default flag handling
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (data.isDefault) {
      await conn.execute(
        `UPDATE quotation_templates SET is_default = 0 WHERE merchant_id = ?`,
        [data.merchantId]
      );
    }

    const [result] = await conn.execute(
      `INSERT INTO quotation_templates (merchant_id, name, header_image_url, footer_text, terms_text, is_default)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.merchantId,
        data.name.substring(0, 255),
        safeHeaderUrl,
        data.footerText?.substring(0, 5000) ?? null,
        data.termsText?.substring(0, 5000) ?? null,
        data.isDefault ? 1 : 0,
      ]
    );

    await conn.commit();
    return (result as any).insertId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Delete a template */
export async function deleteTemplate(id: number, merchantId: number): Promise<void> {
  const pool = await getPool();
  if (!pool) return;

  await pool.execute(
    `DELETE FROM quotation_templates WHERE id = ? AND merchant_id = ?`,
    [id, merchantId]
  );
}

/** Update a template */
export async function updateTemplate(id: number, merchantId: number, data: {
  name?: string;
  headerImageUrl?: string | null;
  footerText?: string | null;
  termsText?: string | null;
  isDefault?: boolean;
}): Promise<void> {
  const pool = await getPool();
  if (!pool) return;

  // PEN-TMPL-03 FIX: Validate headerImageUrl protocol
  const safeHeaderUrl = data.headerImageUrl !== undefined
    ? sanitizeHeaderUrl(data.headerImageUrl)
    : undefined;

  // PEN-TMPL-04 FIX: Use transaction for atomic default flag handling
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (data.isDefault) {
      await conn.execute(
        `UPDATE quotation_templates SET is_default = 0 WHERE merchant_id = ?`,
        [merchantId]
      );
    }

    const setClauses: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) { setClauses.push('name = ?'); params.push(data.name.substring(0, 255)); }
    if (safeHeaderUrl !== undefined) { setClauses.push('header_image_url = ?'); params.push(safeHeaderUrl); }
    if (data.footerText !== undefined) { setClauses.push('footer_text = ?'); params.push(data.footerText?.substring(0, 5000) ?? null); }
    if (data.termsText !== undefined) { setClauses.push('terms_text = ?'); params.push(data.termsText?.substring(0, 5000) ?? null); }
    if (data.isDefault !== undefined) { setClauses.push('is_default = ?'); params.push(data.isDefault ? 1 : 0); }

    if (setClauses.length > 0) {
      params.push(id, merchantId);
      await conn.execute(
        `UPDATE quotation_templates SET ${setClauses.join(', ')} WHERE id = ? AND merchant_id = ?`,
        params
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// ═══════════════════════════════════════════════════════════════
// Format Quotation as WhatsApp Message
// ═══════════════════════════════════════════════════════════════

/** Format quotation for WhatsApp delivery */
export function formatQuotationMessage(
  quotation: SalesQuotation,
  merchantName: string,
  template?: QuotationTemplate | null
): string {
  assertQuotationDocument(quotation);
  let msg = `📋 *عرض سعر رقم: ${quotation.quotationNumber}*\n`;
  msg += `من: *${merchantName}*\n`;
  if (quotation.customerName) msg += `إلى: ${quotation.customerName}\n`;
  msg += `\n━━━━━━━━━━━━━━━━\n`;

  for (let i = 0; i < quotation.items.length; i++) {
    const item = quotation.items[i];
    msg += `${i + 1}. *${item.name}*\n`;
    if (item.description) msg += `   ${item.description}\n`;
    msg += `   الكمية: ${item.quantity} × ${item.unitPrice.toFixed(2)} = ${item.total.toFixed(2)} ${quotation.currency}\n`;
  }

  msg += `\n━━━━━━━━━━━━━━━━\n`;
  msg += `المجموع: ${quotation.subtotal.toFixed(2)} ${quotation.currency}\n`;
  if (quotation.taxAmount > 0) {
    msg += `الضريبة${quotation.taxRate === null ? "" : ` (${Number((quotation.taxRate * 100).toFixed(2))}%)`}: ${quotation.taxAmount.toFixed(2)} ${quotation.currency}\n`;
  }
  msg += `*الإجمالي: ${quotation.total.toFixed(2)} ${quotation.currency}*\n`;

  if (quotation.validUntil) {
    msg += `\n⏰ صالح حتى: ${quotation.validUntil}\n`;
  }

  if (template?.termsText) {
    msg += `\n📌 الشروط:\n${template.termsText}\n`;
  }

  if (template?.footerText) {
    msg += `\n${template.footerText}`;
  }

  return msg;
}
