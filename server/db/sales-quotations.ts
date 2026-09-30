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

import type { QuotationTemplate } from '../quotation-template-reads';
export { getTemplates, getTemplateById } from '../quotation-template-reads';
export type { QuotationTemplate } from '../quotation-template-reads';

// ═══════════════════════════════════════════════════════════════
// Quotation CRUD
// ═══════════════════════════════════════════════════════════════

// Compatibility calls share the scoped readers and reviewed transaction writers.
export { createQuotation, getQuotations, getQuotationById, updateQuotationStatus, getQuotationStats,
  getCurrentTarget, setMonthlyTarget, getTargetHistory, assertQuotationDocument } from '../quotation-legacy';

// Quotation templates
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
