/**
 * Sales Quotation Engine — Database & Logic
 * 
 * Manages quotation generation, sales targets, and template management.
 * Tables already created in knowledge.ts:
 *   - sales_quotations
 *   - sales_targets
 *   - quotation_templates
 */

import * as db from '../db';
import { ensureKnowledgeTables } from './knowledge';

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

export interface SalesQuotation {
  id: number;
  merchantId: number;
  customerPhone: string | null;
  customerName: string | null;
  quotationNumber: string;
  items: QuotationItem[];
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: string;
  status: 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired';
  validUntil: string | null;
  pdfUrl: string | null;
  conversationId: number | null;
  createdAt: Date;
}

export interface SalesTarget {
  id: number;
  merchantId: number;
  periodType: 'monthly' | 'quarterly' | 'yearly';
  periodStart: string;
  periodEnd: string;
  targetAmount: number;
  achievedAmount: number;
  quotationsSent: number;
  quotationsWon: number;
  createdAt: Date;
}

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

/** Generate a unique quotation number */
function generateQuotationNumber(merchantId: number): string {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const r = String(Math.floor(Math.random() * 9000 + 1000));
  return `Q-${y}${m}${d}-${merchantId}-${r}`;
}

/** Create a quotation */
export async function createQuotation(data: {
  merchantId: number;
  customerPhone?: string | null;
  customerName?: string | null;
  items: QuotationItem[];
  taxRate?: number;  // 0.15 for 15% VAT
  currency?: string;
  validDays?: number;
  conversationId?: number | null;
}): Promise<SalesQuotation> {
  await ensureKnowledgeTables();
  const pool = await db.getPool();
  if (!pool) throw new Error('DB unavailable');

  const subtotal = data.items.reduce((sum, item) => sum + item.total, 0);
  const taxRate = data.taxRate ?? 0.15;
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;
  const currency = data.currency || 'SAR';
  const quotationNumber = generateQuotationNumber(data.merchantId);

  let validUntil: string | null = null;
  if (data.validDays) {
    const d = new Date();
    d.setDate(d.getDate() + data.validDays);
    validUntil = d.toISOString().split('T')[0];
  }

  const [result] = await pool.execute(
    `INSERT INTO sales_quotations 
     (merchant_id, customer_phone, customer_name, quotation_number, 
      items, subtotal, tax_amount, total, currency, status, valid_until, conversation_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?)`,
    [
      data.merchantId,
      data.customerPhone ?? null,
      data.customerName ?? null,
      quotationNumber,
      JSON.stringify(data.items),
      subtotal,
      taxAmount,
      total,
      currency,
      validUntil,
      data.conversationId ?? null,
    ]
  );

  const id = (result as any).insertId;

  // Update sales targets
  try {
    await incrementTargetQuotationsSent(data.merchantId);
  } catch { /* non-blocking */ }

  return {
    id,
    merchantId: data.merchantId,
    customerPhone: data.customerPhone ?? null,
    customerName: data.customerName ?? null,
    quotationNumber,
    items: data.items,
    subtotal,
    taxAmount,
    total,
    currency,
    status: 'sent',
    validUntil,
    pdfUrl: null,
    conversationId: data.conversationId ?? null,
    createdAt: new Date(),
  };
}

/** Get quotations for a merchant */
export async function getQuotations(merchantId: number, limit: number = 50): Promise<SalesQuotation[]> {
  await ensureKnowledgeTables();
  const pool = await db.getPool();
  if (!pool) return [];

  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const [rows] = await pool.execute(
    `SELECT * FROM sales_quotations WHERE merchant_id = ? ORDER BY created_at DESC LIMIT ?`,
    [merchantId, safeLimit]
  );

  return (rows as any[]).map(row => ({
    ...row,
    items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
  }));
}

/** Get quotation by ID (with ownership check) */
export async function getQuotationById(id: number, merchantId: number): Promise<SalesQuotation | null> {
  await ensureKnowledgeTables();
  const pool = await db.getPool();
  if (!pool) return null;

  const [rows] = await pool.execute(
    `SELECT * FROM sales_quotations WHERE id = ? AND merchant_id = ? LIMIT 1`,
    [id, merchantId]
  );
  const results = rows as any[];
  if (results.length === 0) return null;
  return {
    ...results[0],
    items: typeof results[0].items === 'string' ? JSON.parse(results[0].items) : results[0].items,
  };
}

/** Update quotation status */
export async function updateQuotationStatus(
  id: number, merchantId: number, status: SalesQuotation['status'], achievedAmount?: number
): Promise<void> {
  await ensureKnowledgeTables();
  const pool = await db.getPool();
  if (!pool) return;

  await pool.execute(
    `UPDATE sales_quotations SET status = ? WHERE id = ? AND merchant_id = ?`,
    [status, id, merchantId]
  );

  // If accepted, update target achieved amount
  if (status === 'accepted') {
    try {
      const quotation = await getQuotationById(id, merchantId);
      if (quotation) {
        await incrementTargetAchieved(merchantId, achievedAmount ?? quotation.total);
      }
    } catch { /* non-blocking */ }
  }
}

/** Get quotation stats for a merchant */
export async function getQuotationStats(merchantId: number): Promise<{
  total: number;
  sent: number;
  accepted: number;
  rejected: number;
  totalRevenue: number;
  conversionRate: number;
}> {
  await ensureKnowledgeTables();
  const pool = await db.getPool();
  if (!pool) return { total: 0, sent: 0, accepted: 0, rejected: 0, totalRevenue: 0, conversionRate: 0 };

  const [rows] = await pool.execute(
    `SELECT 
       COUNT(*) as total,
       SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
       SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted,
       SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
       SUM(CASE WHEN status = 'accepted' THEN total ELSE 0 END) as revenue
     FROM sales_quotations WHERE merchant_id = ?`,
    [merchantId]
  );

  const stats = (rows as any[])[0] || {};
  const total = Number(stats.total) || 0;
  const accepted = Number(stats.accepted) || 0;

  return {
    total,
    sent: Number(stats.sent) || 0,
    accepted,
    rejected: Number(stats.rejected) || 0,
    totalRevenue: Number(stats.revenue) || 0,
    conversionRate: total > 0 ? Math.round((accepted / total) * 100) : 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// Sales Targets
// ═══════════════════════════════════════════════════════════════

/** Get or create current monthly target */
export async function getCurrentTarget(merchantId: number): Promise<SalesTarget | null> {
  await ensureKnowledgeTables();
  const pool = await db.getPool();
  if (!pool) return null;

  const now = new Date();
  const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const [rows] = await pool.execute(
    `SELECT * FROM sales_targets WHERE merchant_id = ? AND period_type = 'monthly' AND period_start = ? LIMIT 1`,
    [merchantId, periodStart]
  );
  const results = rows as SalesTarget[];
  return results.length > 0 ? results[0] : null;
}

/** Set monthly sales target */
export async function setMonthlyTarget(merchantId: number, targetAmount: number): Promise<SalesTarget> {
  await ensureKnowledgeTables();
  const pool = await db.getPool();
  if (!pool) throw new Error('DB unavailable');

  const now = new Date();
  const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const periodEnd = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;

  await pool.execute(
    `INSERT INTO sales_targets (merchant_id, period_type, period_start, period_end, target_amount)
     VALUES (?, 'monthly', ?, ?, ?)
     ON DUPLICATE KEY UPDATE target_amount = ?`,
    [merchantId, periodStart, periodEnd, targetAmount, targetAmount]
  );

  return (await getCurrentTarget(merchantId))!;
}

/** Increment quotations_sent for current month */
async function incrementTargetQuotationsSent(merchantId: number): Promise<void> {
  const pool = await db.getPool();
  if (!pool) return;

  const now = new Date();
  const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  await pool.execute(
    `UPDATE sales_targets SET quotations_sent = quotations_sent + 1 
     WHERE merchant_id = ? AND period_type = 'monthly' AND period_start = ?`,
    [merchantId, periodStart]
  );
}

/** Increment achieved_amount + quotations_won for current month */
async function incrementTargetAchieved(merchantId: number, amount: number): Promise<void> {
  const pool = await db.getPool();
  if (!pool) return;

  const now = new Date();
  const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  await pool.execute(
    `UPDATE sales_targets 
     SET achieved_amount = achieved_amount + ?, quotations_won = quotations_won + 1 
     WHERE merchant_id = ? AND period_type = 'monthly' AND period_start = ?`,
    [amount, merchantId, periodStart]
  );
}

/** Get target history */
export async function getTargetHistory(merchantId: number, limit: number = 12): Promise<SalesTarget[]> {
  await ensureKnowledgeTables();
  const pool = await db.getPool();
  if (!pool) return [];

  const safeLimit = Math.min(Math.max(limit, 1), 24);
  const [rows] = await pool.execute(
    `SELECT * FROM sales_targets WHERE merchant_id = ? ORDER BY period_start DESC LIMIT ?`,
    [merchantId, safeLimit]
  );
  return rows as SalesTarget[];
}

// ═══════════════════════════════════════════════════════════════
// Quotation Templates
// ═══════════════════════════════════════════════════════════════

/** Get templates for a merchant */
export async function getTemplates(merchantId: number): Promise<QuotationTemplate[]> {
  await ensureKnowledgeTables();
  const pool = await db.getPool();
  if (!pool) return [];

  const [rows] = await pool.execute(
    `SELECT * FROM quotation_templates WHERE merchant_id = ? ORDER BY is_default DESC, created_at`,
    [merchantId]
  );
  return rows as QuotationTemplate[];
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
  const pool = await db.getPool();
  if (!pool) throw new Error('DB unavailable');

  if (data.isDefault) {
    // Unset other defaults
    await pool.execute(
      `UPDATE quotation_templates SET is_default = 0 WHERE merchant_id = ?`,
      [data.merchantId]
    );
  }

  const [result] = await pool.execute(
    `INSERT INTO quotation_templates (merchant_id, name, header_image_url, footer_text, terms_text, is_default)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.merchantId,
      data.name.substring(0, 255),
      data.headerImageUrl ?? null,
      data.footerText ?? null,
      data.termsText ?? null,
      data.isDefault ? 1 : 0,
    ]
  );
  return (result as any).insertId;
}

/** Delete a template */
export async function deleteTemplate(id: number, merchantId: number): Promise<void> {
  const pool = await db.getPool();
  if (!pool) return;

  await pool.execute(
    `DELETE FROM quotation_templates WHERE id = ? AND merchant_id = ?`,
    [id, merchantId]
  );
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
    msg += `الضريبة (15%): ${quotation.taxAmount.toFixed(2)} ${quotation.currency}\n`;
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
