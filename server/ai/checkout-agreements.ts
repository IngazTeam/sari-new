import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { requireMinor, verifiedProductMoney, formatMinorMoney } from '../../shared/product-money';
import { isProductAvailableForSale } from './product-availability';
import { isSalesRefusal, isShortAffirmation, normalizeCustomerText } from './customer-decision';
import { invoiceApprovalSchema, type InvoiceMarginProof } from '../../shared/checkout-margin';
import { checkoutCouponCommand, calculateCheckoutDiscount, type CheckoutDiscount } from '../../shared/checkout-discount';
import { readCheckoutDiscount, sameCheckoutDiscount, consumeCheckoutDiscount } from './checkout-discount';

// The model proposes identifiers and quantities only. Prices and authority come from SQL.
export const checkoutSelectionSchema = z.array(z.object({
  productId: z.number().int().positive(), variantId: z.number().int().positive().nullable(),
  quantity: z.number().int().min(1).max(10000),
}).strict()).min(1).max(10);
export type CheckoutSelection = z.infer<typeof checkoutSelectionSchema>;
export type CheckoutIdentity = { merchantId: number; conversationId: number; incomingMessageId: number; customerPhone: string };
type Line = { productId: number; variantId: number | null; quantity: number; name: string; price: number; productVersion: string; variantVersion: string | null };
type CatalogSnapshot = { version: 1; items: Line[]; totalMinor: number; currency: 'SAR'; pricing: 'catalog_subtotal_requires_billing_review'; digest: string };
export type Snapshot = CatalogSnapshot | (Omit<CatalogSnapshot,'version'> & {version:2;catalogSubtotalMinor:number;catalogDigest:string;discount:CheckoutDiscount});
export type CheckoutResult =
  | { kind: 'quote'; quotationId: number; text: string; snapshot: Snapshot }
  | { kind: 'order'; quotationId: number; orderId: number; text: string; reused: boolean }
  | { kind: 'clarify' | 'changed' | 'declined'; text: string };

export async function assertCheckoutAgreementSchema() {
  await assertRuntimeSchema('checkout agreements', [{ table: 'sales_quotations',
    columns: ['checkout_snapshot', 'source_message_id', 'consent_message_id', 'offer_expires_at', 'order_id',
      'external_provider', 'external_snapshot', 'execution_state', 'external_result', 'execution_attempt_id',
      'execution_started_at', 'external_order_key', 'external_reconciliation', 'projection_pending'],
    uniqueIndexes: ['uq_quote_source', 'uq_quote_consent', 'uq_quote_order', 'uq_quote_external_order'] },
  { table:'orders',columns:['checkout_subtotal_minor','checkout_discount_minor'] },
  { table:'checkout_discount_redemptions',columns:['merchant_id','order_id','quotation_id','coupon_id','actor_user_id','discount_code','subtotal_minor','discount_minor','total_minor','terms'],
    uniqueIndexes:[{name:'uq_checkout_discount_order',columns:['order_id']}] }]);
}

const parseSnapshot = (value: unknown): Snapshot => {
  const snapshot:Snapshot=typeof value==='string'?JSON.parse(value):value as Snapshot;
  if(!snapshot||![1,2].includes(snapshot.version))throw Error('Unsupported checkout snapshot');
  if(snapshot.version===2) {
    const expected=calculateCheckoutDiscount(snapshot.catalogSubtotalMinor,{type:snapshot.discount.type,value:snapshot.discount.value,minOrderAmount:snapshot.discount.minOrderAmount});
    if(expected.amountMinor!==snapshot.discount.amountMinor||expected.totalMinor!==snapshot.totalMinor||expected.minimumMinor!==snapshot.discount.minimumMinor)throw Error('Discounted snapshot changed');
  }
  return snapshot;
};
const marker = (id: number) => `[Q-${id}]`;
function quotationText(id: number, snapshot: Snapshot): string {
  return `ملخص طلبك ${marker(id)}\n\n${snapshot.items.map(i => `• ${i.name} × ${i.quantity} = ${formatMinorMoney(i.price * i.quantity)}`).join('\n')}\n\n`
    + `قيمة المنتجات حسب الكتالوج: ${formatMinorMoney(snapshot.version===2?snapshot.catalogSubtotalMinor:snapshot.totalMinor)}.\n`
    + (snapshot.version===2?`خصم الكود ${snapshot.discount.code}: ${formatMinorMoney(snapshot.discount.amountMinor)}.\nقيمة المنتجات بعد الخصم: ${formatMinorMoney(snapshot.totalMinor)}.\nيُعاد التحقق من الكود عند اعتماد الفاتورة؛ لم يُحجز استخدامه بعد.\n`:'')
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
  const [conversations] = await connection.execute<any[]>(`SELECT id, customerName, automation_after_message_id,
    (human_takeover = 1) AS human_owned
    FROM conversations WHERE id = ? AND merchantId = ? AND customerPhone = ? FOR UPDATE`,
  [input.conversationId, input.merchantId, input.customerPhone]);
  if (conversations.length !== 1 || conversations[0].human_owned) throw new Error('Checkout conversation authority unavailable');
  if (input.incomingMessageId <= Number(conversations[0].automation_after_message_id || 0)) throw new Error('Checkout source predates human handoff');
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
async function readSnapshot(connection: PoolConnection, merchantId: number, selection: CheckoutSelection): Promise<CatalogSnapshot> {
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
    const [previous]=await connection.execute<any[]>(`SELECT * FROM sales_quotations WHERE merchant_id=? AND conversation_id=? AND customer_phone=?
      AND checkout_snapshot IS NOT NULL ORDER BY id DESC LIMIT 1 FOR UPDATE`,[input.merchantId,input.conversationId,input.customerPhone]);
    let snapshot:Snapshot = await readSnapshot(connection, input.merchantId, selection);
    const prior=previous[0];
    if(prior&&!prior.order_id&&!prior.external_provider&&['sent','viewed'].includes(prior.status)
      &&await wasCheckoutOfferDelivered(connection,input,prior.source_message_id,marker(prior.id))) {
      const old=parseSnapshot(prior.checkout_snapshot);
      if(old.version===2) snapshot=await discountSnapshot(connection,input,snapshot,old.discount.code);
    }
    return persistCheckoutQuote(connection,input,source.customerName,snapshot);
  });
}
async function discountSnapshot(connection:PoolConnection,input:CheckoutIdentity,catalog:CatalogSnapshot,code:string):Promise<Snapshot> {
  const discount=await readCheckoutDiscount(connection,{merchantId:input.merchantId,customerPhone:input.customerPhone,code,subtotalMinor:catalog.totalMinor});
  const body={...catalog,version:2 as const,catalogSubtotalMinor:catalog.totalMinor,catalogDigest:catalog.digest,discount,totalMinor:catalog.totalMinor-discount.amountMinor};
  return {...body,digest:createHash('sha256').update(JSON.stringify(body)).digest('hex')};
}
async function persistCheckoutQuote(connection:PoolConnection,input:CheckoutIdentity,customerName:string,snapshot:Snapshot):Promise<CheckoutResult> {
    await connection.execute(`UPDATE sales_quotations SET status = 'expired' WHERE merchant_id = ? AND conversation_id = ?
      AND checkout_snapshot IS NOT NULL AND status IN ('sent', 'viewed')`, [input.merchantId, input.conversationId]);
    const [insert] = await connection.execute<any>(`INSERT INTO sales_quotations
      (merchant_id, customer_phone, customer_name, quotation_number, items, subtotal, tax_amount, total,
       currency, conversation_id, source_message_id, checkout_snapshot, offer_expires_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'SAR', ?, ?, ?, TIMESTAMPADD(HOUR, 24, UTC_TIMESTAMP(3)))`,
    [input.merchantId, input.customerPhone, customerName, `CHAT-${input.merchantId}-${input.incomingMessageId}`,
      JSON.stringify(snapshot.items.map(i => ({ productId: i.productId, variantId: i.variantId, name: i.name,
        quantity: i.quantity, unitPrice: i.price / 100, total: i.price * i.quantity / 100 }))),
      (snapshot.version===2?snapshot.catalogSubtotalMinor:snapshot.totalMinor) / 100, snapshot.totalMinor / 100, input.conversationId, input.incomingMessageId, JSON.stringify(snapshot)]);
    return { kind: 'quote', quotationId: insert.insertId, snapshot, text: quotationText(insert.insertId, snapshot) };
}

/** Revises an unaccepted, delivered offer; the command is reread from its owned incoming row. */
export async function prepareCheckoutCouponQuote(input:CheckoutIdentity):Promise<CheckoutResult> {
  return checkoutTransaction(async connection=>{
    const source=await assertCheckoutIdentity(connection,input),command=checkoutCouponCommand(source.content);
    if(command.kind==='none')throw Error('Explicit coupon command required');
    const [quotes]=await connection.execute<any[]>(`SELECT *,offer_expires_at>UTC_TIMESTAMP(3) AS valid FROM sales_quotations
      WHERE merchant_id=? AND conversation_id=? AND customer_phone=? AND checkout_snapshot IS NOT NULL ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [input.merchantId,input.conversationId,input.customerPhone]);
    const quote=quotes[0];
    if(quote?.source_message_id===input.incomingMessageId) {
      const snapshot=parseSnapshot(quote.checkout_snapshot);return {kind:'quote',quotationId:quote.id,snapshot,text:quotationText(quote.id,snapshot)};
    }
    if(!quote||quote.order_id||quote.external_provider||!quote.valid||!['sent','viewed'].includes(quote.status)
      ||!await wasCheckoutOfferDelivered(connection,input,quote.source_message_id,marker(quote.id)))return {kind:'clarify',
        text:'أحتاج ملخص منتجات وكميات حاليًا لم يُسجل كطلب بعد. تغيير طلب مسجل يحتاج مراجعة؛ لن أعدّل مبلغه أو أكرر تسجيله.'};
    const old=parseSnapshot(quote.checkout_snapshot),catalog=await readSnapshot(connection,input.merchantId,old.items.map(i=>({productId:i.productId,variantId:i.variantId,quantity:i.quantity})));
    let snapshot:Snapshot=catalog;
    if(command.kind==='apply') snapshot=await discountSnapshot(connection,input,catalog,command.code);
    return persistCheckoutQuote(connection,input,source.customerName,snapshot);
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
    try { await assertInvoiceCatalog(connection,input.merchantId,old,input.customerPhone); }
    catch {
      await connection.execute("UPDATE sales_quotations SET status = 'expired' WHERE id = ?", [quotationId]);
      return { kind: 'changed', text: 'تغيرت تفاصيل العرض أو توفر المنتج أو صلاحية الكود. لم يُنشأ طلب؛ نحتاج ملخصاً محدثاً وموافقتك عليه.' };
    }
    const [order] = await connection.execute<any>(`INSERT INTO orders (merchantId, customerPhone, customerName, items, totalAmount, currency, status, notes, checkout_review_required,discountCode,checkout_subtotal_minor,checkout_discount_minor)
      VALUES (?, ?, ?, ?, ?, 'SAR', 'pending', ?, 1,?,?,?)`, [input.merchantId, input.customerPhone, source.customerName,
      JSON.stringify(old.items.map(i => ({ productId: i.productId, variantId: i.variantId, name: i.name, quantity: i.quantity, price: i.price }))),
      old.totalMinor, `Quotation ${marker(quotationId)}: agreed product amount; billing/tax/delivery and coupon availability require review before payment. Stock not reserved.`,
      old.version===2?old.discount.code:null,old.version===2?old.catalogSubtotalMinor:null,old.version===2?old.discount.amountMinor:null]);
    await connection.execute(`UPDATE sales_quotations SET status = 'accepted', consent_message_id = ?, order_id = ? WHERE id = ?`, [input.incomingMessageId, order.insertId, quotationId]);
    return { kind: 'order', quotationId, orderId: order.insertId, text: orderText(order.insertId), reused: false };
  });
}

/** Shared ownership and agreement checks for preview and approval; no caller-supplied prices. */
export async function loadCheckoutInvoiceReview(connection: PoolConnection, merchantId: number, orderId: number, expectedAmountMinor?: number) {
  z.number().int().positive().parse(merchantId); z.number().int().positive().parse(orderId);
  const [quotes] = await connection.execute<any[]>(`SELECT * FROM sales_quotations
    WHERE merchant_id = ? AND order_id = ? AND checkout_snapshot IS NOT NULL FOR UPDATE`, [merchantId, orderId]);
  const quote = quotes[0]; if (quotes.length !== 1 || quote.status !== 'accepted' || !quote.consent_message_id || quote.external_provider) throw new Error('Invoice agreement unavailable');
  const [orders] = await connection.execute<any[]>('SELECT * FROM orders WHERE id = ? AND merchantId = ? FOR UPDATE', [orderId, merchantId]);
  const order = orders[0], snapshot = parseSnapshot(quote.checkout_snapshot);
  if (!order || order.status !== 'pending' || order.payment_status !== 'unpaid' || order.currency !== 'SAR' || order.sallaOrderId
    || (expectedAmountMinor !== undefined && order.totalAmount !== expectedAmountMinor) || snapshot.totalMinor !== order.totalAmount
    || order.customerPhone !== quote.customer_phone) throw new Error('Invoice changed; new agreement required');
  requireMinor(order.totalAmount);
  const expectedItems = snapshot.items.map(i => ({ productId: i.productId, variantId: i.variantId, name: i.name, quantity: i.quantity, price: i.price }));
  if (JSON.stringify(JSON.parse(order.items)) !== JSON.stringify(expectedItems)) throw new Error('Invoice items changed; new agreement required');
  if(snapshot.version===2 ? order.discountCode!==snapshot.discount.code||order.checkout_subtotal_minor!==snapshot.catalogSubtotalMinor||order.checkout_discount_minor!==snapshot.discount.amountMinor
    : order.discountCode!=null||order.checkout_subtotal_minor!=null||order.checkout_discount_minor!=null)throw Error('Invoice discount changed; new agreement required');
  return { quote, order, snapshot };
}
export async function assertInvoiceCatalog(connection: PoolConnection, merchantId: number, snapshot: Snapshot,customerPhone?:string) {
  const fresh = await readSnapshot(connection, merchantId, snapshot.items.map(i => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity })));
  if (fresh.digest !== (snapshot.version===2?snapshot.catalogDigest:snapshot.digest)) throw new Error('Invoice catalogue changed; new agreement required');
  if(snapshot.version===2) {
    if(fresh.totalMinor!==snapshot.catalogSubtotalMinor)throw Error('Invoice subtotal changed');
    const discount=await readCheckoutDiscount(connection,{merchantId,customerPhone:customerPhone||'',code:snapshot.discount.code,subtotalMinor:fresh.totalMinor});
    if(!sameCheckoutDiscount(discount,snapshot.discount))throw Error('Coupon terms changed');
  }
}

/** Approve the already-consented amount. Extra charges require a new agreement. */
export async function approveCheckoutInvoice(input: {
  merchantId: number; orderId: number; actorUserId: number; expectedAmountMinor: number; totalIsFinal: true;
  margin?: InvoiceMarginProof;
  /** Server-derived authority; never accepted by invoiceApprovalSchema. */
  authorizeMarginException?: boolean;
}): Promise<{ approved: true; conversationId: number }> {
  if (input.totalIsFinal !== true || !Number.isSafeInteger(input.actorUserId) || input.actorUserId <= 0) throw new Error('Invoice attestation required');
  invoiceApprovalSchema.parse({ orderId: input.orderId, expectedAmountMinor: input.expectedAmountMinor, totalIsFinal: input.totalIsFinal, margin: input.margin });
  return checkoutTransaction(async connection => {
    const { readLockedMarginPolicy } = await import('./checkout-margin-policy');
    const policy = await readLockedMarginPolicy(connection, input.merchantId);
    const { quote, order, snapshot } = await loadCheckoutInvoiceReview(connection, input.merchantId, input.orderId, input.expectedAmountMinor);
    if (!order.checkout_review_required) return { approved: true, conversationId: quote.conversation_id };
    await assertInvoiceCatalog(connection, input.merchantId, snapshot,order.customerPhone);
    const { enforceCheckoutMargin } = await import('./checkout-margin');
    const margin = await enforceCheckoutMargin(connection, { merchantId: input.merchantId, orderId: input.orderId, snapshot, policy, proof: input.margin,
      actorUserId: input.actorUserId, authorizeMarginException: input.authorizeMarginException });
    if(snapshot.version===2)await consumeCheckoutDiscount(connection,{merchantId:input.merchantId,orderId:input.orderId,quotationId:quote.id,
      actorUserId:input.actorUserId,customerPhone:order.customerPhone,subtotalMinor:snapshot.catalogSubtotalMinor,totalMinor:snapshot.totalMinor,discount:snapshot.discount});
    const approvedSnapshot = { ...snapshot, billingApproval: { actorUserId: input.actorUserId,
      approvedAt: new Date().toISOString(), totalMinor: order.totalAmount, includesAllTaxesAndDelivery: true, margin } };
    await connection.execute('UPDATE sales_quotations SET checkout_snapshot = ? WHERE id = ?', [JSON.stringify(approvedSnapshot), quote.id]);
    await connection.execute('UPDATE orders SET checkout_review_required = 0, notes = ? WHERE id = ? AND merchantId = ?',
      [`Quotation ${marker(quote.id)}: final invoice approved at the customer-consented amount. Stock not reserved.`, order.id, input.merchantId]);
    return { approved: true, conversationId: quote.conversation_id };
  });
}
