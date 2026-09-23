import { createHash } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { checkoutTransaction, loadCheckoutInvoiceReview, assertInvoiceCatalog, type Snapshot } from './checkout-agreements';
import { readLockedMarginPolicy } from './checkout-margin-policy';
import { calculateCheckoutMargin, invoiceCostsSchema, invoiceMarginProofSchema, previewMarginSchema, type InvoiceCosts, type InvoiceMarginProof } from '../../shared/checkout-margin';
import { requireMinor } from '../../shared/product-money';

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
    await assertInvoiceCatalog(connection,input.merchantId,snapshot);
    return evaluate(connection,{...input,snapshot,policy});
  });
}
export async function enforceCheckoutMargin(connection: PoolConnection, input: { merchantId:number; orderId:number; snapshot:Snapshot; policy:Policy; proof?:InvoiceMarginProof }) {
  if (!input.policy.policy.enabled) return { enforced:false as const,policy:input.policy.policy,policyRevision:input.policy.revision,policyEvidence:input.policy.evidence };
  const proof = invoiceMarginProofSchema.parse(input.proof);
  const fresh = await evaluate(connection,{...input,costs:proof.costs});
  if (fresh.status !== 'pass' || fresh.evidence !== proof.evidence) throw new Error('Margin proof changed or below authority');
  return { enforced:true as const,...fresh,reviewedCosts:true };
}
