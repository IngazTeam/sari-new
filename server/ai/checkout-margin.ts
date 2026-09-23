import { createHash } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { checkoutTransaction, loadCheckoutInvoiceReview, assertInvoiceCatalog, type Snapshot } from './checkout-agreements';
import { readLockedMarginPolicy } from './checkout-margin-policy';
import { calculateCheckoutMargin, invoiceCostsSchema, invoiceMarginProofSchema, previewMarginSchema, type InvoiceCosts, type InvoiceMarginProof } from '../../shared/checkout-margin';
import { requireMinor } from '../../shared/product-money';
import { z } from 'zod';
import { databaseTimeEpoch } from '../db/time';

type Policy = Awaited<ReturnType<typeof readLockedMarginPolicy>>;
type CostLine = { productId: number; variantId: number | null; quantity: number; name: string; unitCostMinor: number | null };
type Assessment = { status: 'pass' | 'below_floor' | 'missing_cost' | 'invalid_totals'; productCostMinor: number | null;
  calculation: ReturnType<typeof calculateCheckoutMargin> | null; lines: CostLine[]; costs: InvoiceCosts };

async function assessment(connection: PoolConnection, input: { merchantId: number; snapshot: Snapshot; costs: InvoiceCosts; policy: Policy }): Promise<Assessment> {
  const costs = invoiceCostsSchema.parse(input.costs), lines: CostLine[] = [];
  for (const item of [...input.snapshot.items].sort((a,b) => a.productId-b.productId || (a.variantId||0)-(b.variantId||0))) {
    const [products] = await connection.execute<any[]>('SELECT id,cost_price,price_unit,currency FROM products WHERE id=? AND merchantId=? FOR UPDATE', [item.productId,input.merchantId]);
    let row = products[0], unitCostMinor: number | null = null;
    if (item.variantId) {
      const [variants] = await connection.execute<any[]>('SELECT id,cost_price,price_unit FROM product_variants WHERE id=? AND product_id=? AND merchant_id=? AND is_active=1 FOR UPDATE',
        [item.variantId,item.productId,input.merchantId]);
      row = variants[0] ? { ...variants[0], currency: row?.currency } : null;
    }
    // A variant's missing cost is not the parent cost. Null/unverified is not zero.
    if (row?.price_unit === 'minor' && row.currency === 'SAR' && row.cost_price != null) {
      try { unitCostMinor = requireMinor(row.cost_price); } catch { /* unresolved cost */ }
    }
    lines.push({ productId:item.productId,variantId:item.variantId,quantity:item.quantity,name:item.name,unitCostMinor });
  }
  if (lines.some(line => line.unitCostMinor === null)) return { status:'missing_cost',productCostMinor:null,calculation:null,lines,costs };
  try {
    const productCostMinor = requireMinor(lines.reduce((sum,line) => sum + requireMinor(line.unitCostMinor! * line.quantity),0));
    const calculation = calculateCheckoutMargin(input.snapshot.totalMinor,productCostMinor,costs,input.policy.policy.minPercent);
    return { status:calculation.passes?'pass':'below_floor',productCostMinor,calculation,lines,costs };
  } catch { return { status:'invalid_totals',productCostMinor:null,calculation:null,lines,costs }; }
}
async function evaluate(connection: PoolConnection, input: { merchantId:number; orderId:number; snapshot:Snapshot; policy:Policy; costs:InvoiceCosts }) {
  const result = await assessment(connection,input);
  const evidence = createHash('sha256').update(JSON.stringify({ merchantId:input.merchantId,orderId:input.orderId,
    snapshot:input.snapshot,policy:input.policy,result })).digest('hex');
  return { ...result,evidence,policy:input.policy.policy,policyRevision:input.policy.revision,totalMinor:input.snapshot.totalMinor };
}
/** Read-only preview: does not grant authority, issue a link, consume a coupon, or change the agreed amount. */
export async function previewCheckoutMargin(input: { merchantId:number; orderId:number; costs:InvoiceCosts }) {
  previewMarginSchema.parse({orderId:input.orderId,costs:input.costs});
  return checkoutTransaction(async connection => {
    const policy = await readLockedMarginPolicy(connection,input.merchantId);
    const {order,snapshot} = await loadCheckoutInvoiceReview(connection,input.merchantId,input.orderId);
    if (!order.checkout_review_required) throw new Error('Invoice already reviewed');
    await assertInvoiceCatalog(connection,input.merchantId,snapshot,order.customerPhone);
    return evaluate(connection,{...input,snapshot,policy});
  });
}
export async function enforceCheckoutMargin(connection: PoolConnection, input: { merchantId:number; orderId:number; snapshot:Snapshot; policy:Policy;
  actorUserId:number; authorizeMarginException?:boolean; proof?:InvoiceMarginProof }) {
  if (!input.policy.policy.enabled) {
    if (input.proof?.exception) throw new Error('Margin exception does not apply to a disabled policy');
    return { enforced:false as const,policy:input.policy.policy,policyRevision:input.policy.revision,policyEvidence:input.policy.evidence };
  }
  const proof = invoiceMarginProofSchema.parse(input.proof);
  const fresh = await evaluate(connection,{...input,costs:proof.costs});
  if (fresh.evidence !== proof.evidence) throw new Error('Margin proof changed');
  if (proof.exception) {
    // Immediate authority for these exact facts only. No transferable grant or future bypass.
    if (input.authorizeMarginException !== true || fresh.status !== 'below_floor' || !fresh.calculation) throw new Error('Margin exception not authorized');
    z.number().int().positive().parse(input.actorUserId);
    const [insert] = await connection.execute<any>(`INSERT INTO checkout_margin_exceptions
      (merchant_id,order_id,actor_user_id,reason,evidence_hash,assessment) VALUES (?,?,?,?,?,?)`,
    [input.merchantId,input.orderId,input.actorUserId,proof.exception.reason,fresh.evidence,JSON.stringify(fresh)]);
    return { enforced:true as const,...fresh,reviewedCosts:true,
      exception:{id:insert.insertId as number,actorUserId:input.actorUserId,reason:proof.exception.reason,scope:'this_invoice_only' as const} };
  }
  if (fresh.status !== 'pass') throw new Error('Margin below authority');
  return { enforced:true as const,...fresh,reviewedCosts:true };
}

/** Private audit, readable even after payment; never used as a reusable authorization. */
export async function getCheckoutMarginException(merchantId:number,orderId:number) {
  z.number().int().positive().parse(merchantId);z.number().int().positive().parse(orderId);
  return checkoutTransaction(async connection => {
    const [orders]=await connection.execute<any[]>('SELECT id FROM orders WHERE id=? AND merchantId=?',[orderId,merchantId]);
    if (!orders.length) throw new Error('Invoice unavailable');
    const [rows]=await connection.execute<any[]>('SELECT id,actor_user_id,reason,assessment,created_at FROM checkout_margin_exceptions WHERE order_id=? AND merchant_id=?',[orderId,merchantId]);
    if (!rows.length) return null;
    const row=rows[0], assessment=typeof row.assessment==='string'?JSON.parse(row.assessment):row.assessment;
    const facts=z.object({totalMinor:z.number().int().nonnegative(),policyRevision:z.number().int().nonnegative(),
      policy:z.object({minPercent:z.number().int().min(0).max(100)}),
      calculation:z.object({netRevenueMinor:z.number().int().positive(),totalCostMinor:z.number().int().nonnegative(),profitMinor:z.number().int(),marginBps:z.number().int()})}).parse(assessment);
    return {id:Number(row.id),actorUserId:Number(row.actor_user_id),reason:String(row.reason),createdAt:new Date(databaseTimeEpoch(row.created_at)).toISOString(),...facts};
  });
}
