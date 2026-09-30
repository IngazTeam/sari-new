/**
 * Sales Quotation Engine — Database & Logic
 * 
 * Manages quotation generation, sales targets, and template management.
 * Tables already created in knowledge.ts:
 *   - sales_quotations
 *   - sales_targets
 *   - quotation_templates
 */

import { assertQuotationDocument } from '../quotation-legacy';

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
