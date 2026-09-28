import type { PoolConnection } from 'mysql2/promise';
import { z } from 'zod';
import { getPool } from '../db/connection';
import { hasPermission } from '../_core/permissions';
import { decryptSecret } from '../security/secrets';
import { policyArtifactDigest as digest } from '../ai/learning-policy-evaluation-bundle';
import { assertSallaCheckoutCartSchema } from './salla-checkout-carts';
import { cartContext, readCheckoutCart } from './salla-checkout-transport';
import { sallaProductSelectionSchema } from './salla-catalog';
import { sallaCheckoutCartInput } from '../../shared/salla-checkout-cart';
import { sallaCheckoutEvidenceInput, sallaCheckoutEvidenceOutput, sallaEvidenceComparison, type SallaCheckoutEvidenceInput } from '../../shared/salla-checkout-evidence';
import { fetchSallaOrderEvidence, fetchSallaTransactionEvidence } from './salla-checkout-evidence-transport';

const id = z.number().int().positive().max(2147483647);
const savedSnapshot = z.object({ version: z.literal(1), context: cartContext, connectionId: id,
  items: z.array(sallaProductSelectionSchema).min(1).max(20) }).strict();
const decode = (v: unknown) => typeof v === 'string' ? JSON.parse(v) : v;
const unavailable = (): never => { throw Error('Salla checkout evidence unavailable'); };

/** Read committed transactions only; no lock or snapshot spans a provider call. */
async function read<T>(work: (c: PoolConnection) => Promise<T>) {
  const pool = await getPool(); if (!pool) return unavailable();
  const c = await pool.getConnection(); let reusable = true;
  try {
    await c.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await c.beginTransaction(); const result = await work(c); await c.rollback(); return result;
  } catch {
    try { await c.rollback(); } catch { reusable = false; c.destroy(); }
    return unavailable();
  } finally { if (reusable) c.release(); }
}
async function context(merchantId: number, actorId: number, input: SallaCheckoutEvidenceInput) {
  return read(async c => {
    const [merchants] = await c.execute<any[]>('SELECT userId,status FROM merchants WHERE id=? FOR SHARE', [merchantId]);
    const [actors] = await c.execute<any[]>('SELECT account_status FROM users WHERE id=? FOR SHARE', [actorId]);
    const [members] = await c.execute<any[]>('SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE', [merchantId,actorId]);
    if (merchants.length !== 1 || merchants[0].status !== 'active' || actors[0]?.account_status !== 'active' || members.length > 1
      || (members.length ? !members[0].is_active || !hasPermission(members[0].role, 'orders.manage') : merchants[0].userId !== actorId)) return unavailable();
    const [connections] = await c.execute<any[]>('SELECT id,salla_store_id,storeUrl,accessToken,syncStatus FROM salla_connections WHERE merchantId=? FOR SHARE', [merchantId]);
    const [rows] = await c.execute<any[]>('SELECT * FROM salla_checkout_carts WHERE merchant_id=? AND request_id=? FOR SHARE', [merchantId,input.requestId]);
    const active = connections[0], row = rows[0];
    if (connections.length !== 1 || active.syncStatus !== 'active' || rows.length !== 1 || row.state !== 'ready') return unavailable();
    const rawSnapshot = decode(row.snapshot), snapshot = savedSnapshot.parse(rawSnapshot?.value), result = decode(row.result_json);
    const selection = sallaCheckoutCartInput.parse({ requestId: input.requestId, items: snapshot.items.map(p => ({productId:p.productId,quantity:p.quantity})) });
    if (rawSnapshot.digest !== digest(snapshot) || digest(rawSnapshot.value) !== digest(snapshot)
      || row.request_hash !== digest(selection.items) || result?.digest !== digest(result?.value)
      || snapshot.connectionId !== active.id || snapshot.context.storeId !== active.salla_store_id || snapshot.context.storeUrl !== active.storeUrl) return unavailable();
    // Validate the saved cart as strictly as the original provider read. This is
    // historical evidence, so later stock/price changes must not erase it.
    const v = result.value;
    const normalized = readCheckoutCart({success:true,status:200,data:{id:v.cartId,store_id:snapshot.context.storeId,
      checkout_url:v.checkoutUrl,currency:{code:v.currency},amounts:{total:{amount:{value:v.observedTotalMinor / 100,currency:v.currency}}},
      items:v.items.map((p:any) => ({id:p.cartItemId,product_id:p.productId,sku:p.sku,quantity:p.quantity,options:[]})),
    }}, snapshot.context, snapshot.items.map(p => ({externalId:p.externalId,sku:p.sku,quantity:p.quantity})), v.cartId);
    if (digest(normalized) !== result.digest) return unavailable();
    const token = decryptSecret(active.accessToken); if (!token) return unavailable();
    return { token, fingerprint: digest({row,connectionId:active.id,storeId:active.salla_store_id,storeUrl:active.storeUrl,
      owner:merchants[0].userId,members}), cart: {cartId:normalized.cartId,preparedTotalMinor:normalized.observedTotalMinor,currency:normalized.currency} };
  });
}

/** Inspection only. Reference equality does not establish a provider mapping,
 * causal sales attribution, a paid order, settlement, or a learning outcome. */
export async function inspectSallaCheckoutEvidence(merchant: number, actor: number, raw: SallaCheckoutEvidenceInput) {
  try {
    const merchantId = id.parse(merchant), actorId = id.parse(actor), input = sallaCheckoutEvidenceInput.parse(raw);
    await assertSallaCheckoutCartSchema();
    const initial = await context(merchantId, actorId, input);
    const verify = async () => {
      const current = await context(merchantId, actorId, input);
      if (initial.fingerprint !== current.fingerprint || initial.token !== current.token) return unavailable();
    };
    const order = await fetchSallaOrderEvidence(initial.token, input.orderId);
    await verify();
    const transaction = input.transactionId ? await fetchSallaTransactionEvidence(initial.token, input.transactionId) : null;
    if (transaction) await verify();
    return sallaCheckoutEvidenceOutput.parse({ requestId:input.requestId, observedAt:new Date().toISOString(),cart:initial.cart,
      order,transaction,comparison:sallaEvidenceComparison(initial.cart.cartId,order,transaction),
      providerLinkContract:'not_verified',attribution:'not_recorded',paymentFact:'not_recorded' });
  } catch { return unavailable(); }
}
