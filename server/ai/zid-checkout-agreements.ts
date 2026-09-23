import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { saveZidOrder } from '../db';
import dbZid from '../db_zid';
import { ZidClient } from '../integrations/zid/zidClient';
import { majorToMinor, requireMinor, formatMinorMoney } from '../../shared/product-money';
import { isExplicitPurchaseInstruction, isSalesRefusal } from './customer-decision';
import { isOrderConfirmation, isOrderRejection, parseZidOrderMessage } from '../automation/zid-order-from-chat';
import { matchZidSelection, zidSelectionSchema, type ParsedZidOrder } from '../automation/zid-order-contract';
import { assertCheckoutIdentity, checkoutTransaction, wasCheckoutOfferDelivered, type CheckoutIdentity } from './checkout-agreements';
import { currentInboundExecution } from '../messaging/inbound-context';

const optionSchema = z.object({ id: z.number().int().positive(), name: z.string().min(1), feesMinor: z.number().int().nonnegative() });
type Options = { storeId: string; payment: z.infer<typeof optionSchema>; shipping: z.infer<typeof optionSchema> };
type Item = { zidProductId: string; sku: string; name: string; quantity: number; priceMinor: number; version: string };
export type ZidCheckoutSnapshot = { version: 1; options: Options; selection: ParsedZidOrder; items: Item[]; subtotalMinor: number; digest: string };
type Snapshot = ZidCheckoutSnapshot;
const decode = <T>(value: unknown): T => typeof value === 'string' ? JSON.parse(value) : value as T;
const marker = (id: number) => `[ZQ-${id}]`;
const uncertain = 'طلب زد قيد التحقق من نتيجة التنفيذ. لن أعيد إنشاءه حتى تُراجع حالته في المتجر، لتجنب تكراره.';
const changed = 'تغيرت تفاصيل الطلب أو انتهت صلاحية العرض. لم أنفذ هذا التأكيد؛ نحتاج ملخصاً محدثاً وموافقتك عليه.';

export async function zidCheckoutProvider(merchantId: number) {
  const settings = await dbZid.getZidSettings(merchantId);
  if (!settings?.isActive || !settings.accessToken || !settings.managerToken || !settings.storeId) throw new Error('Zid identity unavailable');
  return { storeId: String(settings.storeId), client: new ZidClient({ clientId: '', clientSecret: '', redirectUri: '',
    accessToken: settings.accessToken, managerToken: settings.managerToken }) };
}

async function optionsFor(client: ZidClient, storeId: string, shippingName?: string): Promise<Options> {
  const [{ payment_methods }, { shipping_methods }] = await Promise.all([client.getPaymentMethods(), client.getShippingMethods()]);
  const payment = payment_methods.filter(p => p.enabled === true && p.code === 'payment_link.zidpay');
  const shipping = shipping_methods.filter(s => s.enabled === true && (!shippingName || s.name === shippingName));
  // Never substitute COD or silently select the first of multiple delivery choices.
  if (payment.length !== 1 || shipping.length !== 1) throw new Error('Zid delivery/payment selection required');
  const convert = (v: { id: number; name: string; fees: number }) => optionSchema.parse({ id: v.id, name: v.name, feesMinor: majorToMinor(v.fees) });
  return { storeId, payment: convert(payment[0]), shipping: convert(shipping[0]) };
}

async function snapshotFor(connection: PoolConnection, merchantId: number, raw: ParsedZidOrder, options: Options): Promise<Snapshot> {
  const parsed = zidSelectionSchema.parse(raw);
  if (!parsed.address || !parsed.customerName || parsed.isGift || parsed.giftRecipientName || parsed.giftMessage) throw new Error('Zid recipient details require clarification');
  const catalog: any[] = [];
  for (const p of [...parsed.products].sort((a, b) => String(a.zidProductId).localeCompare(String(b.zidProductId)))) {
    if (!p.zidProductId || !p.sku) throw new Error('Zid item identity missing');
    const [rows] = await connection.execute<any[]>(`SELECT zid_product_id AS zidProductId, zid_sku AS zidSku,
      name_ar AS nameAr, name_en AS nameEn, quantity, is_active AS isActive, is_published AS isPublished,
      is_in_stock AS isInStock, price, sale_price, currency, updated_at FROM zid_products
      WHERE merchant_id = ? AND zid_product_id = ? FOR UPDATE`, [merchantId, p.zidProductId]);
    if (rows.length !== 1) throw new Error('Zid product ownership mismatch');
    catalog.push(rows[0]);
  }
  const selection = matchZidSelection(parsed, catalog);
  const items = selection.products.map(p => {
    const product = catalog.find(c => c.zidProductId === p.zidProductId);
    if (product.currency !== 'SAR') throw new Error('Zid currency unsupported');
    return { zidProductId: p.zidProductId!, sku: p.sku!, name: p.name, quantity: p.quantity,
      priceMinor: majorToMinor(product.sale_price ?? product.price), version: String(product.updated_at) };
  });
  const subtotalMinor = requireMinor(items.reduce((sum, p) => sum + requireMinor(p.quantity * p.priceMinor), 0));
  const body = { version: 1 as const, options, selection, items, subtotalMinor };
  return { ...body, digest: createHash('sha256').update(JSON.stringify(body)).digest('hex') };
}

function quoteText(id: number, s: Snapshot) {
  const address = s.selection.address!;
  return `ملخص طلب زد ${marker(id)}\n\n${s.items.map(p => `• ${p.name} × ${p.quantity} = ${formatMinorMoney(p.priceMinor * p.quantity)}`).join('\n')}`
    + `\nقيمة المنتجات حسب الكتالوج: ${formatMinorMoney(s.subtotalMinor)}.\nالمستلم: ${s.selection.customerName}`
    + `\nالعنوان: ${[address.line1, address.line2, address.city, address.countryCode].filter(Boolean).join('، ')}`
    + `\nالشحن: ${s.options.shipping.name}؛ الرسوم المعروضة للطريقة: ${formatMinorMoney(s.options.shipping.feesMinor)}.`
    + `\nالدفع: ${s.options.payment.name}؛ رسوم الطريقة: ${formatMinorMoney(s.options.payment.feesMinor)}.`
    + '\nهذا ملخص لإعداد طلب غير مدفوع؛ الفاتورة النهائية والضريبة والتوصيل تُراجع في زد قبل الدفع. لا يُثبت هذا الملخص دفعاً أو حجز مخزون.'
    + '\nهل توافق على إنشاء الطلب بهذه التفاصيل لمراجعة فاتورته قبل الدفع؟ رد بنعم، أو اذكر التعديل المطلوب.';
}

export const zidCheckoutResultSchema = z.object({ id: z.number().int().positive().safe(), code: z.string().min(1).max(100),
  store_id: z.union([z.number().int().positive(), z.string().min(1)]), order_url: z.string().url(),
  order_total: z.union([z.string(), z.number()]), currency_code: z.literal('SAR'),
  customer: z.object({ mobile: z.string() }),
});
export type ZidCheckoutResult = { id: number; code: string; url: string; totalMinor: number };
type Result = ZidCheckoutResult;
export function validateZidCheckoutResult(raw: unknown, storeId: string, customerPhone: string): Result {
  const order = zidCheckoutResultSchema.parse(raw), url = new URL(order.order_url);
  const digits = (value: string) => value.replace(/\D/g, '').replace(/^00/, '');
  if (String(order.store_id) !== storeId || !/^\+?\d[\d\s-]{7,20}$/.test(order.customer.mobile)
    || digits(order.customer.mobile) !== digits(customerPhone) || url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Zid result identity mismatch');
  }
  return { id: order.id, code: order.code, url: url.href, totalMinor: majorToMinor(order.order_total) };
}
function resultText(result: Result) {
  return `تم إنشاء طلب زد #${result.code}.\nقيمة فاتورة زد: ${formatMinorMoney(result.totalMinor)}.`
    + `\nراجع المنتجات والضريبة والتوصيل قبل إتمام الدفع:\n${result.url}\nإنشاء الطلب لا يعني نجاح الدفع.`;
}

export async function prepareZidCheckout(input: CheckoutIdentity, raw: ParsedZidOrder): Promise<string> {
  const providerContext = await zidCheckoutProvider(input.merchantId);
  const options = await optionsFor(providerContext.client, providerContext.storeId, raw.shippingMethodName);
  return checkoutTransaction(async connection => {
    const source = await assertCheckoutIdentity(connection, input);
    if (isSalesRefusal(source.content)) return 'لن أنشئ طلباً بناءً على هذا العرض.';
    const [busy] = await connection.execute<any[]>(`SELECT id FROM sales_quotations WHERE merchant_id = ? AND customer_phone = ?
      AND external_provider = 'zid' AND execution_state IN ('processing', 'unknown') LIMIT 1`, [input.merchantId, input.customerPhone]);
    if (busy.length) return uncertain;
    const [existing] = await connection.execute<any[]>(`SELECT * FROM sales_quotations WHERE merchant_id = ? AND source_message_id = ?`, [input.merchantId, input.incomingMessageId]);
    if (existing.length) {
      if (existing[0].external_provider !== 'zid') return changed;
      if (existing[0].execution_state === 'succeeded') return resultText(decode<Result>(existing[0].external_result));
      if (existing[0].status !== 'sent') return changed;
      return quoteText(existing[0].id, decode<Snapshot>(existing[0].external_snapshot));
    }
    const snapshot = await snapshotFor(connection, input.merchantId, raw, options);
    await connection.execute(`UPDATE sales_quotations SET status = 'expired' WHERE merchant_id = ? AND conversation_id = ?
      AND status IN ('sent', 'viewed') AND external_provider = 'zid'`, [input.merchantId, input.conversationId]);
    const [insert] = await connection.execute<any>(`INSERT INTO sales_quotations
      (merchant_id, customer_phone, customer_name, quotation_number, items, subtotal, total, currency, conversation_id,
       source_message_id, external_provider, external_snapshot, execution_state, offer_expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'SAR', ?, ?, 'zid', ?, 'ready', TIMESTAMPADD(HOUR, 24, UTC_TIMESTAMP(3)))`,
    [input.merchantId, input.customerPhone, snapshot.selection.customerName!, `ZCHAT-${input.merchantId}-${input.incomingMessageId}`,
      JSON.stringify(snapshot.items), snapshot.subtotalMinor / 100, snapshot.subtotalMinor / 100,
      input.conversationId, input.incomingMessageId, JSON.stringify(snapshot)]);
    return quoteText(insert.insertId, snapshot);
  });
}

export async function acceptZidCheckout(input: CheckoutIdentity, quoteId: number): Promise<string> {
  // Read and validate authority BEFORE any provider call; retries use persisted results.
  const initial = await checkoutTransaction(async connection => {
    const source = await assertCheckoutIdentity(connection, input);
    const [rows] = await connection.execute<any[]>(`SELECT *, offer_expires_at > UTC_TIMESTAMP(3) AS valid FROM sales_quotations
      WHERE id = ? AND merchant_id = ? AND conversation_id = ? AND customer_phone = ? AND external_provider = 'zid' FOR UPDATE`,
    [quoteId, input.merchantId, input.conversationId, input.customerPhone]);
    const quote = rows[0]; if (!quote) throw new Error('Zid quotation ownership mismatch');
    if (quote.execution_state === 'succeeded') return { text: resultText(decode<Result>(quote.external_result)) };
    if (['processing', 'unknown'].includes(quote.execution_state)) return { text: uncertain };
    if (isSalesRefusal(source.content) || isOrderRejection(source.content)) {
      await connection.execute("UPDATE sales_quotations SET status = 'rejected' WHERE id = ?", [quoteId]);
      return { text: 'لن أنشئ طلباً بناءً على هذا العرض.' };
    }
    if (!isOrderConfirmation(source.content)) return { text: 'لم أعتمد هذا الرد كتأكيد. اذكر التعديل المطلوب للمنتجات أو الكمية أو العنوان.' };
    if (!quote.valid || !['sent', 'viewed'].includes(quote.status) || quote.source_message_id >= input.incomingMessageId) return { text: changed };
    if (!await wasCheckoutOfferDelivered(connection, input, quote.source_message_id, marker(quoteId))) return { text: 'أحتاج موافقتك على آخر ملخص طلب أُرسل لك، قبل إنشاء الطلب.' };
    return { snapshot: decode<Snapshot>(quote.external_snapshot), sourceMessageId: quote.source_message_id };
  });
  if ('text' in initial) return initial.text!;
  const providerContext = await zidCheckoutProvider(input.merchantId);
  const currentOptions = await optionsFor(providerContext.client, providerContext.storeId, initial.snapshot.selection.shippingMethodName);
  const claimed = await checkoutTransaction(async connection => {
    await assertCheckoutIdentity(connection, input);
    const [rows] = await connection.execute<any[]>(`SELECT *, offer_expires_at > UTC_TIMESTAMP(3) AS valid FROM sales_quotations
      WHERE id = ? AND merchant_id = ? FOR UPDATE`, [quoteId, input.merchantId]);
    const q = rows[0];
    if (q?.execution_state === 'succeeded') return { text: resultText(decode<Result>(q.external_result)) };
    if (!q || q.execution_state !== 'ready') return { text: uncertain };
    if (!q.valid || !['sent', 'viewed'].includes(q.status)) return { text: changed };
    if (!await wasCheckoutOfferDelivered(connection, input, initial.sourceMessageId!, marker(quoteId))) return { text: changed };
    let fresh: Snapshot;
    try { fresh = await snapshotFor(connection, input.merchantId, initial.snapshot.selection, currentOptions); }
    catch { await connection.execute("UPDATE sales_quotations SET status = 'expired' WHERE id = ?", [quoteId]); return { text: changed }; }
    if (fresh.digest !== initial.snapshot.digest) {
      await connection.execute("UPDATE sales_quotations SET status = 'expired' WHERE id = ?", [quoteId]); return { text: changed };
    }
    await currentInboundExecution()?.assertOwned();
    const attemptId = randomUUID();
    await connection.execute(`UPDATE sales_quotations SET status = 'accepted', consent_message_id = ?, execution_state = 'processing',
      execution_attempt_id = ?, execution_started_at = UTC_TIMESTAMP(3)
      WHERE id = ? AND execution_state = 'ready'`, [input.incomingMessageId, attemptId, quoteId]);
    return { snapshot: fresh, attemptId };
  });
  if ('text' in claimed) return claimed.text!;
  const pool = await getPool(); if (!pool) throw new Error('Zid checkout storage unavailable');
  try {
    await currentInboundExecution()?.assertOwned();
    const s = claimed.snapshot;
    const observedAt = new Date(); // Do not overwrite a newer webhook while POST is in flight.
    const response = await providerContext.client.createOrderFromWhatsApp({ customerName: s.selection.customerName!, customerPhone: input.customerPhone,
      checkoutReference: `SARY-CHECKOUT:${claimed.attemptId}`,
      address: s.selection.address!, products: s.items.map(p => ({ sku: p.sku, quantity: p.quantity })),
      paymentMethodId: s.options.payment.id, shippingMethodId: s.options.shipping.id, isPaymentLink: true });
    const result = validateZidCheckoutResult(response.order, s.options.storeId, input.customerPhone);
    const [saved] = await pool.execute<any>(`UPDATE sales_quotations SET execution_state = 'succeeded', external_result = ?,
      external_order_key = ?, projection_pending = 1 WHERE id = ? AND merchant_id = ? AND execution_state = 'processing'
      AND execution_attempt_id = ?`, [JSON.stringify(result), `${s.options.storeId}:${result.id}`, quoteId, input.merchantId, claimed.attemptId]);
    if (saved.affectedRows !== 1) return uncertain; // A concurrent reconciliation owns the durable result.
    // The provider result is durable first. Local projection failure cannot trigger a second POST.
    try { const projected = await saveZidOrder(input.merchantId, { zidOrderId: String(result.id), zidOrderNumber: result.code,
      customerName: s.selection.customerName, customerPhone: input.customerPhone, totalAmount: result.totalMinor / 100,
      currency: 'SAR', status: response.order.order_status?.code ?? 'pending',
      paymentStatus: (response.order as { payment_status?: string }).payment_status,
      items: s.items.map(item => ({ id: item.zidProductId, sku: item.sku, name: item.name, quantity: item.quantity, price: item.priceMinor / 100 })),
      orderUrl: result.url, zidData: JSON.stringify(response.order) }, observedAt);
      if (!projected) throw new Error('Projection unavailable');
      await pool.execute('UPDATE sales_quotations SET projection_pending = 0 WHERE id = ? AND merchant_id = ?', [quoteId, input.merchantId]); }
    catch { console.warn('[ZidCheckout] Order projection requires reconciliation', { merchantId: input.merchantId, quoteId }); }
    return resultText(result);
  } catch {
    const execution = currentInboundExecution(); if (execution) execution.uncertainEffect = true;
    await pool.execute("UPDATE sales_quotations SET execution_state = 'unknown' WHERE id = ? AND merchant_id = ? AND execution_state = 'processing'", [quoteId, input.merchantId]);
    return uncertain;
  }
}

export async function handleZidCheckout(input: CheckoutIdentity & { message: string }): Promise<string | null> {
  try {
    const pool = await getPool(); if (!pool) throw new Error('Zid checkout storage unavailable');
    const [quotes] = await pool.execute<any[]>(`SELECT id FROM sales_quotations WHERE merchant_id = ? AND conversation_id = ?
      AND customer_phone = ? AND external_provider = 'zid' ORDER BY id DESC LIMIT 1`, [input.merchantId, input.conversationId, input.customerPhone]);
    if (quotes[0] && (isOrderConfirmation(input.message) || isOrderRejection(input.message) || isSalesRefusal(input.message))) return await acceptZidCheckout(input, quotes[0].id);
    if (!isExplicitPurchaseInstruction(input.message)) return null;
    await checkoutTransaction(connection => assertCheckoutIdentity(connection, input));
    const parsed = await parseZidOrderMessage(input.message, input.merchantId);
    if (!parsed?.address || !parsed.customerName || parsed.isGift) return 'لإعداد طلب زد، أرسل اسم المنتج والكمية مع اسم المستلم والعنوان والمدينة والدولة. لن أختار بيانات نيابة عنك.';
    return await prepareZidCheckout(input, parsed);
  } catch {
    // A lost SQL acknowledgement might follow a successful claim or provider result. Never promise no effect or suggest a blind retry.
    return 'تعذر اعتماد تفاصيل طلب زد الآن. يلزم مراجعة تفاصيله وحالة تنفيذه وطريقة الشحن قبل تأكيد الطلب أو تكراره.';
  }
}
