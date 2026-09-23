import { z } from 'zod';
import { MAX_MONEY_MINOR, requireMinor, majorToMinor } from './product-money';

export const marginPolicySchema = z.object({ enabled: z.boolean(), minPercent: z.number().int().min(0).max(100) }).strict();
export type MarginPolicy = z.infer<typeof marginPolicySchema>;
export const defaultMarginPolicy: MarginPolicy = { enabled: false, minPercent: 0 };
export const marginPolicyUpdateSchema = z.object({ policy: marginPolicySchema, expectedRevision: z.number().int().min(0).max(2147483646),
  evidence: z.string().regex(/^[a-f0-9]{64}$/), reviewed: z.literal(true) }).strict();
const amount = z.number().int().min(0).max(MAX_MONEY_MINOR);
export const invoiceCostsSchema = z.object({ taxMinor: amount, shippingCostMinor: amount, otherCostMinor: amount }).strict();
export type InvoiceCosts = z.infer<typeof invoiceCostsSchema>;
export const marginExceptionSchema = z.object({ reason: z.string().trim().min(12).max(1000), reviewed: z.literal(true) }).strict();
export const invoiceMarginProofSchema = z.object({ costs: invoiceCostsSchema, evidence: z.string().regex(/^[a-f0-9]{64}$/),
  reviewedCosts: z.literal(true), exception: marginExceptionSchema.optional() }).strict();
export type InvoiceMarginProof = z.infer<typeof invoiceMarginProofSchema>;
export const previewMarginSchema = z.object({ orderId: z.number().int().positive(), costs: invoiceCostsSchema }).strict();
export const invoiceApprovalSchema = z.object({ orderId: z.number().int().positive(), expectedAmountMinor: amount,
  totalIsFinal: z.literal(true), margin: invoiceMarginProofSchema.optional() }).strict();

export function reviewedCostFromText(text: string): number {
  const normalized = text.trim().replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0)-0x660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0)-0x6f0)).replace(/٫/g,'.');
  if (!normalized) throw new Error('Explicit amount required');
  return majorToMinor(normalized);
}

/** Exact minor-unit arithmetic. Compare unrounded ratios, never a rounded displayed percentage. */
export function calculateCheckoutMargin(totalMinor: number, productCostMinor: number, costs: InvoiceCosts, minimumPercent: number) {
  requireMinor(totalMinor); requireMinor(productCostMinor); invoiceCostsSchema.parse(costs);
  z.number().int().min(0).max(100).parse(minimumPercent);
  const netRevenueMinor = totalMinor - costs.taxMinor;
  const totalCostMinor = requireMinor(productCostMinor + costs.shippingCostMinor + costs.otherCostMinor);
  if (netRevenueMinor <= 0) throw new Error('Positive net revenue required');
  const profitMinor = netRevenueMinor - totalCostMinor;
  return { netRevenueMinor, totalCostMinor, profitMinor, marginBps: Math.floor(profitMinor * 10000 / netRevenueMinor),
    passes: profitMinor * 100 >= netRevenueMinor * minimumPercent };
}
