import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { requireMinor, verifiedProductMoney, formatMinorMoney } from '../../shared/product-money';
import { isProductAvailableForSale } from './product-availability';
import { isSalesRefusal, isShortAffirmation, normalizeCustomerText } from './customer-decision';

// The model proposes identifiers and quantities only. Prices and authority come from SQL.
export const checkoutSelectionSchema = z.array(z.object({
  productId: z.number().int().positive(), variantId: z.number().int().positive().nullable(),
  quantity: z.number().int().min(1).max(10000),
}).strict()).min(1).max(10);
export type CheckoutSelection = z.infer<typeof checkoutSelectionSchema>;
export type CheckoutIdentity = { merchantId: number; conversationId: number; incomingMessageId: number; customerPhone: string };
type Line = { productId: number; variantId: number | null; quantity: number; name: string; price: number; productVersion: string; variantVersion: string | null };
type Snapshot = { version: 1; items: Line[]; totalMinor: number; currency: 'SAR'; pricing: 'catalog_subtotal_requires_billing_review'; digest: string };
export type CheckoutResult =
  | { kind: 'quote'; quotationId: number; text: string; snapshot: Snapshot }
  | { kind: 'order'; quotationId: number; orderId: number; text: string; reused: boolean }
  | { kind: 'clarify' | 'changed' | 'declined'; text: string };

export async function assertCheckoutAgreementSchema() {
  await assertRuntimeSchema('checkout agreements', [{ table: 'sales_quotations',
    columns: ['checkout_snapshot', 'source_message_id', 'consent_message_id', 'offer_expires_at', 'order_id',
      'external_provider', 'external_snapshot', 'execution_state', 'external_result'],
    uniqueIndexes: ['uq_quote_source', 'uq_quote_consent', 'uq_quote_order'] }]);
}

const parseSnapshot = (value: unknown): Snapshot => typeof value === 'string' ? JSON.parse(value) : value as Snapshot;
const marker = (id: number) => `[Q-${id}]`;
function quotationText(id: number, snapshot: Snapshot): string {
  return `ملخص طلبك ${marker(id)}\n\n${snapshot.items.map(i => `• ${i.name} × ${i.quantity} = ${formatMinorMoney(i.price * i.quantity)}`).join('\n')}\n\n`
    + `قيمة المنتجات حسب الكتالوج: ${formatMinorMoney(snapshot.totalMinor)}.\n`
    + 'تحتاج الضرائب وأي رسوم توصيل إلى مراجعة قبل الدفع. هذا الملخص لا يحجز المخزون ولا يُثبت الدفع.\n'
    + 'هل توافق على تسجيل طلب بهذه المنتجات والكميات لمراجعة الفاتورة؟ رد بنعم للتأكيد، أو اذكر التعديل المطلوب.';
}
function orderText(id: number) {
  return `تم تسجيل طلبك برقم #${id} بالمنتجات والكميات التي وافقت عليها. الطلب غير مدفوع؛ يلزم اعتماد الفاتورة والرسوم قبل إصدار رابط الدفع. لم يُحجز مخزون بهذا التسجيل.`;
}
export async function checkoutTransaction<T>(run: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const pool = await getPool(); if (!pool) throw new Error('Checkout storage unavailable');
  const connection = await pool.getConnection();
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await connection.beginTransaction(); const result = await run(connection); await connection.commit(); return result;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
export async function assertCheckoutIdentity(connection: PoolConnection, input: CheckoutIdentity) {
  if (![input.merchantId, input.conversationId, input.incomingMessageId].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('Checkout identity invalid');
  const [conversations] = await connection.execute<any[]>(`SELECT id, customerName,
    (human_takeover = 1 AND (human_expires_at IS NULL OR human_expires_at > UTC_TIMESTAMP())) AS human_owned
    FROM conversations WHERE id = ? AND merchantId = ? AND customerPhone = ? FOR UPDATE`,
  [input.conversationId, input.merchantId, input.customerPhone]);
  if (conversations.length !== 1 || conversations[0].human_owned) throw new Error('Checkout conversation authority unavailable');
  const [messages] = await connection.execute<any[]>(`SELECT id, content FROM messages
    WHERE id = ? AND conversationId = ? AND direction = 'incoming'`, [input.incomingMessageId, input.conversationId]);
  if (messages.length !== 1) throw new Error('Checkout source ownership mismatch');
  const [later] = await connection.execute<any[]>(`SELECT id FROM messages WHERE conversationId = ?
    AND direction = 'incoming' AND id > ? LIMIT 1`, [input.conversationId, input.incomingMessageId]);
  if (later.length) throw new Error('Checkout source superseded');
  return { customerName: conversations[0].customerName || input.customerPhone, content: String(messages[0].content || '') };
}

export async function wasCheckoutOfferDelivered(connection: PoolConnection, input: CheckoutIdentity, sourceMessageId: number, offerMarker: string) {
  const [prior] = await connection.execute<any[]>(`SELECT incoming_message_id, reply_text FROM ai_interaction_jobs
    WHERE merchant_id = ? AND conversation_id = ? AND incoming_message_id < ?
      AND state IN ('pending', 'processing', 'completed', 'failed') ORDER BY incoming_message_id DESC LIMIT 1`,
  [input.merchantId, input.conversationId, input.incomingMessageId]);
  if (prior[0]?.incoming_message_id !== sourceMessageId || !String(prior[0]?.reply_text).includes(offerMarker)) return false;
  const [outgoing] = await connection.execute<any[]>(`SELECT id, content, aiResponse FROM messages
    WHERE conversationId = ? AND direction = 'outgoing' AND id < ? ORDER BY id DESC LIMIT 1`, [input.conversationId, input.incomingMessageId]);
  return !(outgoing[0]?.id > sourceMessageId && (!outgoing[0].aiResponse || !String(outgoing[0].content).includes(offerMarker)));
}
async function readSnapshot(connection: PoolConnection, merchantId: number, selection: CheckoutSelection): Promise<Snapshot> {
  const validated = checkoutSelectionSchema.parse(selection);
  const keys = validated.map(i => `${i.productId}:${i.variantId || 0}`);
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate checkout item');
  const items: Line[] = [];
  // Stable lock order for overlapping carts.
  for (const item of [...validated].sort((a, b) => a.productId - b.productId || (a.variantId || 0) - (b.variantId || 0))) {
    const [products] = await connection.execute<any[]>('SELECT * FROM products WHERE id = ? AND merchantId = ? FOR UPDATE', [item.productId, merchantId]);
    const p = products[0];
    if (!p || p.sallaProductId || !isProductAvailableForSale({ ...p, priceUnit: p.price_unit, trackInventory: p.has_variants ? 0 : p.track_inventory, productType: p.product_type, registrationOpen: p.registration_open })) throw new Error('Checkout product unavailable');
    const productMoney = verifiedProductMoney({ ...p, priceUnit: p.price_unit });
    if (productMoney.currency !== 'SAR') throw new Error('Unsupported checkout currency');
    let v: any;
    if (p.has_variants) {
      if (!item.variantId) throw new Error('Checkout option required');
      const [variants] = await connection.execute<any[]>(`SELECT * FROM product_variants
        WHERE id = ? AND product_id = ? AND merchant_id = ? AND is_active = 1 FOR UPDATE`, [item.variantId, p.id, merchantId]);
      v = variants[0]; if (!v) throw new Error('Checkout option unavailable');
    } else if (item.variantId) throw new Error('Unexpected checkout option');
    if (p.track_inventory && p.product_type === 'physical' && Number(v ? v.stock : p.stock) < item.quantity) throw new Error('Checkout quantity unavailable');
    if (p.max_students != null && p.registration_open && Number(p.max_students) - Number(p.enrolled_count || 0) < item.quantity) throw new Error('Checkout seats unavailable');
    const price = v?.price == null ? productMoney.minor : verifiedProductMoney({ ...v, priceUnit: v.price_unit, currency: p.currency }).minor;
    items.push({ ...item, name: v ? `${p.name} — ${v.name}` : p.name, price,
      productVersion: String(p.updatedAt), variantVersion: v ? String(v.updatedAt) : null });
  }
  const totalMinor = requireMinor(items.reduce((sum, i) => sum + requireMinor(i.quantity * i.price), 0));
  const body = { version: 1 as const, items, totalMinor, currency: 'SAR' as const, pricing: 'catalog_subtotal_requires_billing_review' as const };
  return { ...body, digest: createHash('sha256').update(JSON.stringify(body)).digest('hex') };
}

/** Extends existing quotations; legacy amounts remain major units, snapshot money is explicitly minor. */
export async function prepareCheckoutQuote(input: CheckoutIdentity, selection: CheckoutSelection): Promise<CheckoutResult> {
  return checkoutTransaction(async connection => {
    const source = await assertCheckoutIdentity(connection, input);
    if (isSalesRefusal(source.content)) return { kind: 'declined', text: 'لن أسجل طلباً بناءً على هذا العرض. يمكنك العودة إليه متى رغبت.' };
    const [existing] = await connection.execute<any[]>(`SELECT * FROM sales_quotations WHERE merchant_id = ? AND source_message_id = ? AND checkout_snapshot IS NOT NULL`, [input.merchantId, input.incomingMessageId]);
    if (existing[0]) {
      const row = existing[0], snapshot = parseSnapshot(row.checkout_snapshot);
      return { kind: 'quote', quotationId: row.id, snapshot, text: quotationText(row.id, snapshot) };
    }
    const snapshot = await readSnapshot(connection, input.merchantId, selection);
    await connection.execute(`UPDATE sales_quotations SET status = 'expired' WHERE merchant_id = ? AND conversation_id = ?
      AND checkout_snapshot IS NOT NULL AND status IN ('sent', 'viewed')`, [input.merchantId, input.conversationId]);
    const [insert] = await connection.execute<any>(`INSERT INTO sales_quotations
      (merchant_id, customer_phone, customer_name, quotation_number, items, subtotal, tax_amount, total,
       currency, conversation_id, source_message_id, checkout_snapshot, offer_expires_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'SAR', ?, ?, ?, TIMESTAMPADD(HOUR, 24, UTC_TIMESTAMP(3)))`,
    [input.merchantId, input.customerPhone, source.customerName, `CHAT-${input.merchantId}-${input.incomingMessageId}`,
      JSON.stringify(snapshot.items.map(i => ({ productId: i.productId, variantId: i.variantId, name: i.name,
        quantity: i.quantity, unitPrice: i.price / 100, total: i.price * i.quantity / 100 }))),
      snapshot.totalMinor / 100, snapshot.totalMinor / 100, input.conversationId, input.incomingMessageId, JSON.stringify(snapshot)]);
    return { kind: 'quote', quotationId: insert.insertId, snapshot, text: quotationText(insert.insertId, snapshot) };
  });
}

export async function acceptCheckoutQuote(input: CheckoutIdentity, quotationId: number): Promise<CheckoutResult> {
  return checkoutTransaction(async connection => {
    const source = await assertCheckoutIdentity(connection, input);
    const [quotes] = await connection.execute<any[]>(`SELECT *, offer_expires_at > UTC_TIMESTAMP(3) AS valid
      FROM sales_quotations WHERE id = ? AND merchant_id = ? AND conversation_id = ? AND customer_phone = ? FOR UPDATE`,
    [quotationId, input.merchantId, input.conversationId, input.customerPhone]);
    const quote = quotes[0]; if (!quote?.checkout_snapshot) throw new Error('Checkout quotation ownership mismatch');
    if (quote.order_id && quote.consent_message_id === input.incomingMessageId) return {
      kind: 'order', quotationId, orderId: quote.order_id, text: `الطلب #${quote.order_id} مسجل بالفعل بهذه الموافقة. يمكنك الاستعلام عن حالته الحالية.`, reused: true,
    };
    if (isSalesRefusal(source.content)) {
      if (quote.order_id) return { kind: 'clarify', text: `الطلب #${quote.order_id} مسجل بالفعل. يلزم مراجعة حالته قبل تأكيد إلغائه.` };
      await connection.execute("UPDATE sales_quotations SET status = 'rejected' WHERE id = ?", [quotationId]);
      return { kind: 'declined', text: 'لن أسجل طلباً بناءً على هذا العرض. يمكنك العودة إليه متى رغبت.' };
    }
    if (!isShortAffirmation(source.content) && !/^(?:اكمل الطلب|كمل الطلب|complete my order)[.!\s]*$/.test(normalizeCustomerText(source.content))) return { kind: 'clarify', text: 'اذكر المنتجات والكميات أو التعديل المطلوب لأعرض لك ملخصاً جديداً قبل التسجيل.' };
    if (!quote.valid || !['sent', 'viewed'].includes(quote.status) || quote.source_message_id >= input.incomingMessageId) return { kind: 'changed', text: 'هذا العرض لم يعد متاحاً للتأكيد. أرسل المنتجات والكميات لأجهز ملخصاً محدثاً.' };
    if (!await wasCheckoutOfferDelivered(connection, input, quote.source_message_id, marker(quotationId))) return {
      kind: 'clarify', text: 'أحتاج موافقتك على آخر ملخص منتجات وكميات أُرسل لك قبل تسجيل الطلب.',
    };
    const old = parseSnapshot(quote.checkout_snapshot);
    let fresh: Snapshot;
    try { fresh = await readSnapshot(connection, input.merchantId, old.items.map(i => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity }))); }
    catch {
      await connection.execute("UPDATE sales_quotations SET status = 'expired' WHERE id = ?", [quotationId]);
      return { kind: 'changed', text: 'تغير توفر أحد المنتجات أو خياراته. لم يُنشأ طلب؛ نحتاج ملخصاً محدثاً وموافقتك عليه.' };
    }
    if (fresh.digest !== old.digest) {
      await connection.execute("UPDATE sales_quotations SET status = 'expired' WHERE id = ?", [quotationId]);
      return { kind: 'changed', text: 'تغيرت تفاصيل العرض منذ إرساله. لم يُنشأ طلب؛ سأحتاج موافقتك على ملخص محدث بالسعر الحالي.' };
    }
    const [order] = await connection.execute<any>(`INSERT INTO orders (merchantId, customerPhone, customerName, items, totalAmount, currency, status, notes, checkout_review_required)
      VALUES (?, ?, ?, ?, ?, 'SAR', 'pending', ?, 1)`, [input.merchantId, input.customerPhone, source.customerName,
      JSON.stringify(old.items.map(i => ({ productId: i.productId, variantId: i.variantId, name: i.name, quantity: i.quantity, price: i.price }))),
      old.totalMinor, `Quotation ${marker(quotationId)}: catalog subtotal only; billing/tax/delivery review required before payment. Stock not reserved.`]);
    await connection.execute(`UPDATE sales_quotations SET status = 'accepted', consent_message_id = ?, order_id = ? WHERE id = ?`, [input.incomingMessageId, order.insertId, quotationId]);
    return { kind: 'order', quotationId, orderId: order.insertId, text: orderText(order.insertId), reused: false };
  });
}

/** Approve the already-consented amount. Extra charges require a new agreement. */
export async function approveCheckoutInvoice(input: {
  merchantId: number; orderId: number; actorUserId: number; expectedAmountMinor: number; totalIsFinal: true;
}): Promise<{ approved: true; conversationId: number }> {
  if (input.totalIsFinal !== true || !Number.isSafeInteger(input.actorUserId) || input.actorUserId <= 0) throw new Error('Invoice attestation required');
  requireMinor(input.expectedAmountMinor);
  return checkoutTransaction(async connection => {
    const [quotes] = await connection.execute<any[]>(`SELECT * FROM sales_quotations
      WHERE merchant_id = ? AND order_id = ? AND checkout_snapshot IS NOT NULL FOR UPDATE`, [input.merchantId, input.orderId]);
    const quote = quotes[0]; if (!quote || quote.status !== 'accepted' || !quote.consent_message_id) throw new Error('Invoice agreement unavailable');
    const [orders] = await connection.execute<any[]>('SELECT * FROM orders WHERE id = ? AND merchantId = ? FOR UPDATE', [input.orderId, input.merchantId]);
    const order = orders[0]; const snapshot = parseSnapshot(quote.checkout_snapshot);
    if (!order || order.status !== 'pending' || order.payment_status !== 'unpaid' || order.currency !== 'SAR'
      || order.totalAmount !== input.expectedAmountMinor || snapshot.totalMinor !== order.totalAmount
      || order.customerPhone !== quote.customer_phone) throw new Error('Invoice changed; new agreement required');
    const expectedItems = snapshot.items.map(i => ({ productId: i.productId, variantId: i.variantId, name: i.name, quantity: i.quantity, price: i.price }));
    if (JSON.stringify(JSON.parse(order.items)) !== JSON.stringify(expectedItems)) throw new Error('Invoice items changed; new agreement required');
    if (!order.checkout_review_required) return { approved: true, conversationId: quote.conversation_id };
    const fresh = await readSnapshot(connection, input.merchantId, snapshot.items.map(i => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity })));
    if (fresh.digest !== snapshot.digest) throw new Error('Invoice catalogue changed; new agreement required');
    const approvedSnapshot = { ...snapshot, billingApproval: { actorUserId: input.actorUserId,
      approvedAt: new Date().toISOString(), totalMinor: order.totalAmount, includesAllTaxesAndDelivery: true } };
    await connection.execute('UPDATE sales_quotations SET checkout_snapshot = ? WHERE id = ?', [JSON.stringify(approvedSnapshot), quote.id]);
    await connection.execute('UPDATE orders SET checkout_review_required = 0, notes = ? WHERE id = ? AND merchantId = ?',
      [`Quotation ${marker(quote.id)}: final invoice approved at the customer-consented amount. Stock not reserved.`, order.id, input.merchantId]);
    return { approved: true, conversationId: quote.conversation_id };
  });
}
