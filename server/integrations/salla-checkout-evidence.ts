import type { PoolConnection } from 'mysql2/promise';
import { z } from 'zod';
import { getPool } from '../db/connection';
import { databaseTimeEpoch } from '../db/time';
import { authorizeCheckoutReviewer } from './salla-checkout-authority';
export { authorizeCheckoutReviewer } from './salla-checkout-authority';
import { decryptSecret } from '../security/secrets';
import { policyArtifactDigest as digest } from '../ai/learning-policy-evaluation-bundle';
import { assertSallaCheckoutCartSchema } from './salla-checkout-carts';
import { cartContext, readCheckoutCart } from './salla-checkout-transport';
import { sallaProductSelectionSchema } from './salla-catalog';
import { sallaCheckoutCartInput } from '../../shared/salla-checkout-cart';
import { sallaCheckoutEvidenceInput, sallaCheckoutEvidenceOutput, sallaEvidenceComparison, sallaCheckoutCartListInput, sallaCheckoutCartListOutput, type SallaCheckoutEvidenceInput } from '../../shared/salla-checkout-evidence';
import { fetchSallaOrderEvidence, fetchSallaTransactionEvidence } from './salla-checkout-evidence-transport';
import { readSallaCartCheckpoint } from './salla-cart-checkpoint';

const id = z.number().int().positive().max(2147483647);
const savedSnapshot = z.object({ version: z.literal(1), context: cartContext, connectionId: id,
  items: z.array(sallaProductSelectionSchema).min(1).max(20) }).strict();
const decode = (v: unknown) => typeof v === 'string' ? JSON.parse(v) : v;
const unavailable = (): never => { throw Error('Salla checkout evidence unavailable'); };

/** Read committed transactions only; no lock or snapshot spans a provider call. */
export async function checkoutEvidenceTransaction<T>(work: (c: PoolConnection) => Promise<T>, commit = false) {
  const pool = await getPool(); if (!pool) return unavailable();
  const c = await pool.getConnection(); let reusable = true, committing = false;
  try {
    await c.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await c.beginTransaction(); const result = await work(c);
    if (commit) { committing = true; await c.commit(); committing = false; } else await c.rollback();
    return result;
  } catch {
    if (committing) { reusable = false; c.destroy(); }
    else { try { await c.rollback(); } catch { reusable = false; c.destroy(); } }
    return unavailable();
  } finally { if (reusable) c.release(); }
}
const read = checkoutEvidenceTransaction;
const authorize = authorizeCheckoutReviewer;
function savedCart(row:any,active:any) {
    if (!active || active.syncStatus !== 'active' || !row || row.state !== 'ready') return unavailable();
    const rawSnapshot = decode(row.snapshot), snapshot = savedSnapshot.parse(rawSnapshot?.value), result = decode(row.result_json);
    const selection = sallaCheckoutCartInput.parse({ requestId: row.request_id, items: snapshot.items.map(p => ({productId:p.productId,quantity:p.quantity})) });
    if (rawSnapshot.digest !== digest(snapshot) || digest(rawSnapshot.value) !== digest(snapshot)
      || row.request_hash !== digest(selection.items) || result?.digest !== digest(result?.value)
      || snapshot.connectionId !== active.id || snapshot.context.storeId !== active.salla_store_id || snapshot.context.storeUrl !== active.storeUrl) return unavailable();
    // Historical evidence stays available after a subsequent stock/price change.
    const v = result.value;
    const normalized = readCheckoutCart({success:true,status:200,data:{id:v.cartId,store_id:snapshot.context.storeId,
      checkout_url:v.checkoutUrl,currency:{code:v.currency},amounts:{total:{amount:{value:v.observedTotalMinor / 100,currency:v.currency}}},
      items:v.items.map((p:any) => ({id:p.cartItemId,product_id:p.productId,sku:p.sku,quantity:p.quantity,options:[]})),
    }}, snapshot.context, snapshot.items.map(p => ({externalId:p.externalId,sku:p.sku,quantity:p.quantity})), v.cartId);
    if (digest(normalized) !== result.digest) return unavailable();
    readSallaCartCheckpoint(row);
    const token = decryptSecret(active.accessToken); if (!token) return unavailable();
    return {token,cart:{cartId:normalized.cartId,preparedTotalMinor:normalized.observedTotalMinor,currency:normalized.currency}};
}
async function context(merchantId: number, actorId: number, input: SallaCheckoutEvidenceInput) {
  return read(c => lockedContext(c, merchantId, actorId, input));
}
async function lockedContext(c: PoolConnection, merchantId: number, actorId: number, input: SallaCheckoutEvidenceInput) {
    const authority=await authorize(c,merchantId,actorId);
    const [connections] = await c.execute<any[]>('SELECT id,salla_store_id,storeUrl,accessToken,syncStatus FROM salla_connections WHERE merchantId=? FOR SHARE', [merchantId]);
    const [rows] = await c.execute<any[]>('SELECT * FROM salla_checkout_carts WHERE merchant_id=? AND request_id=? FOR SHARE', [merchantId,input.requestId]);
    const active = connections[0], row = rows[0];
    if (connections.length !== 1 || rows.length !== 1) return unavailable();
    return {...savedCart(row,active),fingerprint:digest({row,connectionId:active.id,storeId:active.salla_store_id,storeUrl:active.storeUrl,...authority})};
}

/** Indexed, bounded local discovery. Invalid historical evidence remains visible
 * as unavailable, without publishing its contents or contacting the provider. */
export async function listSallaCheckoutCarts(merchant:number,actor:number,raw:z.infer<typeof sallaCheckoutCartListInput>) {
  try {
    const merchantId=id.parse(merchant),actorId=id.parse(actor),input=sallaCheckoutCartListInput.parse(raw);
    await assertSallaCheckoutCartSchema();
    return await read(async c=>{
      await authorize(c,merchantId,actorId);
      const [connections]=await c.execute<any[]>('SELECT id,salla_store_id,storeUrl,accessToken,syncStatus FROM salla_connections WHERE merchantId=? FOR SHARE',[merchantId]);
      const [rows]=await c.execute<any[]>(`SELECT * FROM salla_checkout_carts WHERE merchant_id=? AND state='ready'
        ${input.beforeId?'AND id<?':''} ORDER BY id DESC LIMIT 21 FOR SHARE`,input.beforeId?[merchantId,input.beforeId]:[merchantId]);
      const items=rows.slice(0,20).map(row=>{
        let cart=null;try{if(connections.length===1)cart=savedCart(row,connections[0]).cart;}catch{/* Show the operation, never its invalid evidence. */}
        const recovery=cart?readSallaCartCheckpoint(row)?.recovery:null;
        return {id:row.id,requestId:row.request_id,createdAt:new Date(databaseTimeEpoch(row.created_at)).toISOString(),cart,
          ...(recovery?{recovery:{reviewerUserId:recovery.reviewerUserId,observedAt:recovery.observedAt}}:{})};
      });
      return sallaCheckoutCartListOutput.parse({merchantId,items,nextCursor:rows.length>20?items.at(-1)!.id:null});
    });
  } catch { return unavailable(); }
}

/** Inspection only. Reference equality does not establish a provider mapping,
 * causal sales attribution, a paid order, settlement, or a learning outcome. */
export async function inspectSallaCheckoutEvidence(merchant: number, actor: number, raw: SallaCheckoutEvidenceInput) {
  return withVerifiedCheckoutEvidence(merchant, actor, raw, async (_c, value) => value, false);
}

/** The callback is server-only. Fresh authority/cart locks span the final local
 * save, never HTTP. A commit acknowledgement failure must not replay the write. */
export async function withVerifiedCheckoutEvidence<T>(merchant: number, actor: number, raw: SallaCheckoutEvidenceInput,
  accept: (c: PoolConnection, value: z.infer<typeof sallaCheckoutEvidenceOutput>) => Promise<T>, commit = true) {
  try {
    const merchantId = id.parse(merchant), actorId = id.parse(actor), input = sallaCheckoutEvidenceInput.parse(raw);
    await assertSallaCheckoutCartSchema();
    const initial = await context(merchantId, actorId, input);
    const verify = async () => {
      const current = await context(merchantId, actorId, input);
      if (initial.fingerprint !== current.fingerprint || initial.token !== current.token) return unavailable();
    };
    const order = await fetchSallaOrderEvidence(initial.token, input.orderId);
    if (input.transactionId) await verify();
    const transaction = input.transactionId ? await fetchSallaTransactionEvidence(initial.token, input.transactionId) : null;
    return await checkoutEvidenceTransaction(async c => {
      const current = await lockedContext(c, merchantId, actorId, input);
      if (initial.fingerprint !== current.fingerprint || initial.token !== current.token) return unavailable();
      const value = sallaCheckoutEvidenceOutput.parse({ requestId:input.requestId, observedAt:new Date().toISOString(),cart:initial.cart,
      order,transaction,comparison:sallaEvidenceComparison(initial.cart.cartId,order,transaction),
      providerLinkContract:'not_verified',attribution:'not_recorded',paymentFact:'not_recorded' });
      return accept(c, value);
    }, commit);
  } catch { return unavailable(); }
}
