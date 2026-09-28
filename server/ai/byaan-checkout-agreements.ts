import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { currentInboundExecution } from '../messaging/inbound-context';
import { getByaanCheckoutQuote } from '../integrations/byaan';
import { byaanCheckoutReceipt, readByaanCheckoutQuote, type ByaanCheckoutQuote } from '../integrations/byaan-checkout-contract';
import { byaanSalesTransaction as tx, lockByaanSalesAuthority } from '../integrations/byaan-sales-operations';
import { normalizeByaanTenantDomain } from '../integrations/byaan-security';
import { assertCheckoutAgreementSchema, assertCheckoutIdentity, type CheckoutIdentity } from './checkout-agreements';
import { currentByaanCourse, isByaanEnrollmentConsent } from './byaan-enrollment-agreements';
import { hasCheckoutOfferEvidence } from './checkout-offer-evidence';
import { isSalesRefusal, normalizeCustomerText } from './customer-decision';
import { policyArtifactDigest as digest } from './learning-policy-evaluation-bundle';
import { ordinaryReplyDigest, ordinaryReplyText } from './reply-reservation';
import { normalizeCampaignPhone } from '../automation/campaign-guard';
import { formatMinorMoney } from '../../shared/product-money';
import type { SendMerchantWhatsAppInput } from '../channels/whatsapp/types';
import type { ReplyPlan } from '../messaging/reply-plan';

// An accepted invitation means permission to share checkout, never a paid sale.
export const BYAAN_CHECKOUT_PROVIDER = 'byaan_checkout';
export const BYAAN_CHECKOUT_CLARIFY = 'حدد الدورة التي تريد الالتحاق بها لأعرض سعرها ومواعيدها المتاحة من بيان.';
export const BYAAN_CHECKOUT_UNAVAILABLE = 'تعذر التحقق من عرض الدورة الآن. لم أنشئ تسجيلًا أو دفعة. اطلب عرض الدورة مجددًا أو تواصل مع الفريق.';
export const BYAAN_CHECKOUT_CHANGED = 'تغيّر عرض الدورة أو انتهت صلاحيته. اطلب عرض الدورة من جديد لمراجعة السعر والموعد قبل المتابعة.';
export const BYAAN_CHECKOUT_DECLINED = 'توقفت عن متابعة هذا العرض. لم يُنشأ تسجيل أو دفع من هذه المحادثة؛ إذا أتممت الشراء في بيان فراجع الفريق بشأن إلغائه.';
export const BYAAN_CHECKOUT_SESSION = 'اختر رقم الموعد من القائمة التي أرسلتها، مثل: الموعد 1. اختيار الموعد لا يحجز مقعدًا.';
export const BYAAN_CHECKOUT_REVIEW = 'يوجد طلب سابق يحتاج مراجعة الفريق قبل متابعة شراء جديد. لا أستطيع تأكيد تسجيل أو دفع من هذه المحادثة.';
const safeReplies = [BYAAN_CHECKOUT_CLARIFY, BYAAN_CHECKOUT_UNAVAILABLE, BYAAN_CHECKOUT_CHANGED, BYAAN_CHECKOUT_DECLINED, BYAAN_CHECKOUT_SESSION, BYAAN_CHECKOUT_REVIEW];
const id = z.number().int().positive().max(2147483647), hash = z.string().regex(/^[a-f0-9]{64}$/);
const courseSchema = z.object({ productId: id, courseId: z.string().regex(/^[1-9][0-9]{0,14}$/), name: z.string().min(1).max(255),
  priceMinor: z.number().int().nonnegative(), currency: z.literal('SAR'), startsAt: z.string().nullable(), endsAt: z.string().nullable(), catalogDigest: hash }).strict();
const snapshotSchema = z.object({ version: z.literal(1), merchantId: id, conversationId: id, sourceMessageId: id,
  customerPhone: z.string(), authorityHash: hash, ownershipVersion: z.number().int().nonnegative(), sourceDigest: hash,
  tenantDomain: z.string(), course: courseSchema, quote: byaanCheckoutReceipt,
  selectedFrom: z.object({ quotationId: id, snapshotDigest: hash, sessionId: z.string() }).strict().nullable() }).strict();
const consentSchema = z.object({ incomingMessageId: id, contentDigest: hash, snapshotDigest: hash, offerTextDigest: hash }).strict();
type Snapshot = z.infer<typeof snapshotSchema>;
type Extraction = { sourceText: string; memoryCutoff: number; product: { productId: number; name: string; reference: string } };
const decode = (v: any) => typeof v === 'string' ? JSON.parse(v) : v;
const quoteInput = (q: ByaanCheckoutQuote) => ({ courseId: q.course_id, ...(q.session_id ? { sessionId: q.session_id } : {}) });
const sessions = (q: ByaanCheckoutQuote) => q.sessions.filter(s => s.available).slice(0, 20);
export function byaanSessionChoice(text: string): number | null {
  const normalized = normalizeCustomerText(text).replace(/[٠-٩]/g, c => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[۰-۹]/g, c => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)));
  const match = /^(?:(?:الموعد|موعد|session)\s+)?([1-9][0-9]?)$/.exec(normalized.trim());
  return match ? Number(match[1]) : null;
}
export function byaanCheckoutOfferText(quotationId: number, s: Snapshot) {
  if (s.quote.requires_session) return `مواعيد ${s.course.name} [BC-${quotationId}]\n\n`
    + sessions(s.quote).map((v, i) => `${i + 1}. ${v.date || 'التاريخ غير محدد'}${v.time ? ` — ${v.time}` : ''}`).join('\n')
    + `\n\nتوقيت الأكاديمية: ${s.quote.schedule.timezone}.\n` + BYAAN_CHECKOUT_SESSION;
  const selected = s.quote.schedule;
  return `عرض الدورة [BC-${quotationId}]\n\nالدورة: ${s.course.name}\n`
    + (selected.date ? `الموعد: ${selected.date}${selected.time ? ` — ${selected.time}` : ''} (${selected.timezone})\n` : '')
    + `الإجمالي الحالي في بيان: ${formatMinorMoney(s.quote.amount_minor)}.\nالضريبة ضمن الإجمالي: ${formatMinorMoney(s.quote.tax_minor)}.\n`
    + 'السعر والتوفر يُراجعان عند إتمام الشراء في بيان؛ هذا العرض لا يحجز مقعدًا ولا ينشئ تسجيلًا أو دفعًا.\n'
    + 'هل تريد رابط إتمام الشراء بهذه التفاصيل؟ رد بنعم، أو اذكر الدورة التي تريدها بدلًا منها.';
}
const linkText = (q: any, s: Snapshot, receipt: ByaanCheckoutQuote) => `رابط إتمام الشراء [BC-${q.id}]\nالدورة: ${s.course.name}\n`
  + `الإجمالي وقت التحقق: ${formatMinorMoney(receipt.amount_minor)} (يتضمن ضريبة ${formatMinorMoney(receipt.tax_minor)}).\n`
  + `${receipt.checkout_url}\n\nراجع التفاصيل والسعر النهائي في بيان وأكمل الشراء بنفسك. إرسال الرابط لا يثبت الدفع أو التسجيل ولا يحجز مقعدًا.`;

async function assertExecution(input: CheckoutIdentity) {
  const execution = currentInboundExecution();
  if (execution) { if (execution.merchantId !== input.merchantId) throw Error('Inbound owner mismatch'); await execution.assertOwned(); }
}
async function customer(c: PoolConnection, input: CheckoutIdentity) {
  const source = await assertCheckoutIdentity(c, input);
  const [rows] = await c.execute<any[]>(`SELECT c.handoff_version FROM conversations c JOIN messages m ON m.conversationId=c.id AND m.id=?
    WHERE c.id=? AND c.merchantId=? AND m.createdAt>=TIMESTAMPADD(HOUR,-24,UTC_TIMESTAMP(3))
      AND m.createdAt<=TIMESTAMPADD(MINUTE,5,UTC_TIMESTAMP(3))`, [input.incomingMessageId, input.conversationId, input.merchantId]);
  const [profiles] = await c.execute<any[]>('SELECT memory_forget_before_message_id FROM customer_profiles WHERE merchant_id=? AND customer_phone=?', [input.merchantId, input.customerPhone]);
  const cutoff = Number(profiles[0]?.memory_forget_before_message_id || 0);
  if (rows.length !== 1 || input.incomingMessageId <= cutoff || !normalizeCampaignPhone(input.customerPhone)) throw Error('Customer unavailable');
  return { content: source.content, version: Number(rows[0].handoff_version), cutoff };
}
export async function readByaanCheckoutContext(input: CheckoutIdentity) {
  return tx(async c => {
    await lockByaanSalesAuthority(c, input.merchantId); const source = await customer(c, input);
    const [catalog] = await c.execute<any[]>(`SELECT id AS productId,COALESCE(NULLIF(nameAr,''),name) AS name,sallaProductId AS reference FROM products
      WHERE merchantId=? AND isActive=1 AND status='active' AND product_type='service' AND has_variants=0
      AND registration_open=1 AND sallaProductId REGEXP '^byaan:[1-9][0-9]{0,14}$' ORDER BY id LIMIT 150`, [input.merchantId]);
    return { ...source, catalog: catalog as Array<{ productId: number; name: string; reference: string }> };
  });
}
async function latest(c: PoolConnection, input: CheckoutIdentity) {
  const [rows] = await c.execute<any[]>(`SELECT *,offer_expires_at>UTC_TIMESTAMP(3) AS valid FROM sales_quotations
    WHERE merchant_id=? AND conversation_id=? AND customer_phone=? ORDER BY id DESC LIMIT 1 FOR UPDATE`, [input.merchantId, input.conversationId, input.customerPhone]);
  return rows[0];
}
const lineItems = (s: Snapshot) => [{ productId: s.course.productId, name: s.course.name, quantity: 1, price: s.quote.amount_minor }];
function readAgreement(q: any) {
  if (q.external_provider !== BYAAN_CHECKOUT_PROVIDER || q.currency !== 'SAR' || q.order_id !== null || q.checkout_snapshot !== null
    || q.external_order_key !== null || q.external_reconciliation !== null || q.projection_pending !== 0 || q.offer_version !== 1) throw Error('Wrong agreement');
  const envelope = decode(q.external_snapshot), s = snapshotSchema.parse(envelope?.value);
  readByaanCheckoutQuote(s.quote, quoteInput(s.quote), s.tenantDomain, Date.parse(s.quote.quoted_at));
  if (digest(s) !== envelope.digest || digest(envelope.value) !== envelope.digest || s.merchantId !== q.merchant_id || s.conversationId !== q.conversation_id
    || s.customerPhone !== q.customer_phone || s.sourceMessageId !== q.source_message_id || s.course.courseId !== s.quote.course_id
    || (!s.quote.available && !(s.quote.requires_session && sessions(s.quote).length))
    || Number(q.total) !== s.quote.amount_minor / 100 || Number(q.tax_amount) !== s.quote.tax_minor / 100
    || Number(q.subtotal) !== (s.quote.amount_minor - s.quote.tax_minor) / 100 || digest(decode(q.items)) !== digest(lineItems(s))) throw Error('Agreement changed');
  let consent: z.infer<typeof consentSchema> | undefined, receipt: ByaanCheckoutQuote | undefined;
  if (envelope.consent !== undefined) {
    consent = consentSchema.parse(envelope.consent.value);
    const result = decode(q.external_result);
    if (s.quote.requires_session || consent.incomingMessageId !== q.consent_message_id || consent.incomingMessageId <= s.sourceMessageId
      || consent.snapshotDigest !== envelope.digest || consent.offerTextDigest !== digest(byaanCheckoutOfferText(q.id, s))
      || digest(consent) !== envelope.consent.digest || digest(envelope.consent.value) !== envelope.consent.digest
      || q.execution_state !== 'succeeded' || q.status !== 'accepted' || !z.string().uuid().safeParse(q.execution_attempt_id).success || !q.execution_started_at
      || result?.binding !== digest({ snapshot: s, consent }) || digest(result.value) !== result.digest) throw Error('Consent changed');
    receipt = readByaanCheckoutQuote(result.value, quoteInput(s.quote), s.tenantDomain, Date.parse(result.value?.quoted_at));
    if (!sameTerms(s.quote, receipt)) throw Error('Receipt changed');
  } else if (q.consent_message_id !== null || q.external_result !== null || q.execution_attempt_id !== null || q.execution_started_at !== null || q.execution_state !== 'ready') throw Error('Unexpected effect');
  return { snapshot: s, consent, receipt };
}
function sameTerms(a: ByaanCheckoutQuote, b: ByaanCheckoutQuote) {
  const terms = (q: ByaanCheckoutQuote) => ({ course: q.course_id, session: q.session_id, amount: q.amount_minor, tax: q.tax_minor,
    currency: q.currency, url: q.checkout_url, available: q.available, requiresSession: q.requires_session, schedule: q.schedule,
    selected: q.sessions.find(v => String(v.id) === q.session_id) ?? null });
  return a.available && b.available && digest(terms(a)) === digest(terms(b));
}
async function verify(c: PoolConnection, input: CheckoutIdentity, quotationId: number, requireFresh = true) {
  const authority = await lockByaanSalesAuthority(c, input.merchantId), source = await customer(c, input), q = await latest(c, input);
  if (!q || q.id !== quotationId || !['sent', 'viewed', 'accepted'].includes(q.status)) throw Error('Agreement unavailable');
  const a = readAgreement(q), s = a.snapshot;
  if (s.authorityHash !== authority.hash || s.ownershipVersion !== source.version || s.sourceMessageId <= source.cutoff
    || (requireFresh && (!q.valid || Date.now() - Date.parse((a.receipt || s.quote).quoted_at) > 300_000))) throw Error('Authority changed');
  const [messages] = await c.execute<any[]>('SELECT content FROM messages WHERE id=? AND conversationId=? AND direction=\'incoming\' FOR SHARE', [s.sourceMessageId, input.conversationId]);
  if (messages.length !== 1 || digest(messages[0].content) !== s.sourceDigest) throw Error('Source changed');
  if (s.selectedFrom) {
    const [parents] = await c.execute<any[]>('SELECT * FROM sales_quotations WHERE id=? AND merchant_id=? AND conversation_id=? AND customer_phone=? FOR SHARE',
      [s.selectedFrom.quotationId, input.merchantId, input.conversationId, input.customerPhone]);
    if (parents.length !== 1) throw Error('Session source missing');
    const parent = readAgreement(parents[0]).snapshot, chosen = byaanSessionChoice(messages[0].content);
    if (digest(parent) !== s.selectedFrom.snapshotDigest || !parent.quote.requires_session || parent.selectedFrom || !chosen
      || parent.authorityHash !== s.authorityHash || parent.ownershipVersion !== s.ownershipVersion || parent.sourceMessageId <= source.cutoff
      || parent.sourceMessageId >= s.sourceMessageId || parent.course.productId !== s.course.productId
      || String(sessions(parent.quote)[chosen - 1]?.id) !== s.selectedFrom.sessionId || s.quote.session_id !== s.selectedFrom.sessionId
      || !await hasCheckoutOfferEvidence(c, { ...input, incomingMessageId: s.sourceMessageId }, parent.sourceMessageId,
        byaanCheckoutOfferText(parents[0].id, parent))) throw Error('Session source changed');
  }
  if (digest(await currentByaanCourse(c, input.merchantId, s.course.productId)) !== digest(s.course)) throw Error('Catalog changed');
  if (input.incomingMessageId !== s.sourceMessageId && !await hasCheckoutOfferEvidence(c, input, s.sourceMessageId, byaanCheckoutOfferText(q.id, s))) throw Error('Offer not delivered');
  await assertExecution(input);
  return { ...a, q, source };
}
async function prepareContext(c: PoolConnection, input: CheckoutIdentity, productId: number, extraction?: Extraction, choice?: { quotationId: number; index: number | null }) {
  const authority = await lockByaanSalesAuthority(c, input.merchantId), source = await customer(c, input);
  if (isSalesRefusal(source.content)) throw Error('Customer declined');
  const course = courseSchema.parse(await currentByaanCourse(c, input.merchantId, productId));
  if (extraction && (source.content !== extraction.sourceText || source.cutoff !== extraction.memoryCutoff
    || course.productId !== extraction.product.productId || course.name !== extraction.product.name.trim() || `byaan:${course.courseId}` !== extraction.product.reference)) throw Error('Extraction changed');
  const [bindings] = await c.execute<any[]>('SELECT tenant_domain FROM byaan_connections WHERE merchant_id=?', [input.merchantId]);
  let selectedFrom: Snapshot['selectedFrom'] = null;
  if (choice) {
    const previous = await verify(c, input, choice.quotationId);
    const options = sessions(previous.snapshot.quote), chosen = byaanSessionChoice(source.content);
    const selected = choice.index === null ? null : options[choice.index - 1];
    if (!previous.snapshot.quote.requires_session || previous.consent
      || (choice.index !== null && (!selected || chosen !== choice.index))
      || (choice.index === null && !isByaanEnrollmentConsent(source.content) && (chosen === null || options[chosen - 1]))
      || previous.snapshot.course.productId !== productId || previous.snapshot.sourceMessageId >= input.incomingMessageId) throw Error('Invalid session selection');
    if (selected) selectedFrom = { quotationId: choice.quotationId, snapshotDigest: digest(previous.snapshot), sessionId: String(selected.id) };
  }
  await assertExecution(input);
  return { version: 1 as const, merchantId: input.merchantId, conversationId: input.conversationId, sourceMessageId: input.incomingMessageId,
    customerPhone: input.customerPhone, authorityHash: authority.hash, ownershipVersion: source.version, sourceDigest: digest(source.content),
    tenantDomain: normalizeByaanTenantDomain(bindings[0]?.tenant_domain), course, selectedFrom };
}
export async function prepareByaanCheckoutOffer(input: CheckoutIdentity, productId: number, extraction?: Extraction, choice?: { quotationId: number; index: number | null }) {
  await assertCheckoutAgreementSchema();
  const replay = await tx(async c => {
    await lockByaanSalesAuthority(c, input.merchantId); await customer(c, input);
    const old = await latest(c, input);
    if (old?.source_message_id !== input.incomingMessageId) return null;
    const current = await verify(c, input, old.id);
    if (current.snapshot.course.productId !== productId || current.consent) throw Error('Conflicting source');
    return { quotationId: old.id as number, text: byaanCheckoutOfferText(old.id, current.snapshot) };
  });
  if (replay) return replay;
  const base = await tx(c => prepareContext(c, input, productId, extraction, choice));
  const recheck = () => tx(async c => { if (digest(await prepareContext(c, input, productId, extraction, choice)) !== digest(base)) throw Error('Selection changed'); });
  const result = await getByaanCheckoutQuote(input.merchantId, { courseId: base.course.courseId, ...(base.selectedFrom ? { sessionId: base.selectedFrom.sessionId } : {}) }, recheck);
  if (!result.success || (!result.quote.available && !(result.quote.requires_session && sessions(result.quote).length))) throw Error('Checkout unavailable');
  return tx(async c => {
    if (digest(await prepareContext(c, input, productId, extraction, choice)) !== digest(base)) throw Error('Selection superseded');
    const previous = await latest(c, input);
    if (previous?.source_message_id === input.incomingMessageId) {
      const saved = await verify(c, input, previous.id);
      if (digest({ ...saved.snapshot, quote: undefined }) !== digest({ ...base, quote: undefined })) throw Error('Concurrent offer conflict');
      return { quotationId: previous.id as number, text: byaanCheckoutOfferText(previous.id, saved.snapshot) };
    }
    const [unresolved] = await c.execute<any[]>(`SELECT id FROM sales_quotations WHERE merchant_id=? AND customer_phone=?
      AND (execution_state IN ('processing','unknown') OR (external_provider='byaan_enrollment' AND consent_message_id IS NOT NULL)) LIMIT 1 FOR UPDATE`, [input.merchantId, input.customerPhone]);
    if (unresolved.length) throw Error('Previous operation needs review');
    const s = snapshotSchema.parse({ ...base, quote: result.quote });
    await c.execute(`UPDATE sales_quotations SET status='expired' WHERE merchant_id=? AND conversation_id=? AND status IN ('sent','viewed')
      AND consent_message_id IS NULL AND order_id IS NULL AND (checkout_snapshot IS NOT NULL OR external_snapshot IS NOT NULL)`, [input.merchantId, input.conversationId]);
    const [inserted] = await c.execute<any>(`INSERT INTO sales_quotations (merchant_id,customer_phone,quotation_number,items,subtotal,tax_amount,total,currency,
      conversation_id,source_message_id,external_provider,external_snapshot,execution_state,offer_expires_at)
      VALUES (?,?,?,?,?,?,?,'SAR',?,?,?,?,'ready',TIMESTAMPADD(MINUTE,5,UTC_TIMESTAMP(3)))`,
    [input.merchantId, input.customerPhone, `BCHECK-${input.merchantId}-${input.incomingMessageId}`, JSON.stringify(lineItems(s)), (s.quote.amount_minor - s.quote.tax_minor) / 100,
      s.quote.tax_minor / 100, s.quote.amount_minor / 100, input.conversationId, input.incomingMessageId, BYAAN_CHECKOUT_PROVIDER, JSON.stringify({ value: s, digest: digest(s) })]);
    if (digest((await customer(c, input)).content) !== base.sourceDigest) throw Error('Source superseded');
    return { quotationId: Number(inserted.insertId), text: byaanCheckoutOfferText(Number(inserted.insertId), s) };
  });
}
export async function readByaanCheckoutPending(input: CheckoutIdentity) {
  return tx(async c => {
    await lockByaanSalesAuthority(c, input.merchantId); await customer(c, input); const q = await latest(c, input);
    if (q?.external_provider !== BYAAN_CHECKOUT_PROVIDER) return null;
    const { snapshot } = readAgreement(q);
    return { quotationId: q.id as number, productId: snapshot.course.productId, sourceMessageId: snapshot.sourceMessageId,
      requiresSession: snapshot.quote.requires_session, sessionCount: sessions(snapshot.quote).length };
  });
}
export async function acceptByaanCheckoutOffer(input: CheckoutIdentity, quotationId: number) {
  await assertCheckoutAgreementSchema();
  const claim = async (c: PoolConnection) => {
    const a = await verify(c, input, quotationId);
    if (input.incomingMessageId <= a.snapshot.sourceMessageId || a.snapshot.quote.requires_session || !isByaanEnrollmentConsent(a.source.content)
      || a.consent && (a.consent.incomingMessageId !== input.incomingMessageId || a.consent.contentDigest !== digest(a.source.content))) throw Error('Consent unavailable');
    return a;
  };
  const before = await tx(claim);
  if (before.receipt) return linkText(before.q, before.snapshot, before.receipt);
  const recheck = () => tx(async c => { if (digest((await claim(c)).snapshot) !== digest(before.snapshot)) throw Error('Consent changed'); });
  const result = await getByaanCheckoutQuote(input.merchantId, quoteInput(before.snapshot.quote), recheck);
  if (!result.success) throw Error('Checkout verification unavailable');
  return tx(async c => {
    const now = await claim(c); if (digest(now.snapshot) !== digest(before.snapshot)) throw Error('Offer changed');
    if (now.receipt) return linkText(now.q, now.snapshot, now.receipt);
    if (!sameTerms(now.snapshot.quote, result.quote)) {
      await c.execute("UPDATE sales_quotations SET status='expired' WHERE id=?", [quotationId]);
      return BYAAN_CHECKOUT_CHANGED;
    }
    const consent = consentSchema.parse({ incomingMessageId: input.incomingMessageId, contentDigest: digest(now.source.content),
      snapshotDigest: digest(now.snapshot), offerTextDigest: digest(byaanCheckoutOfferText(quotationId, now.snapshot)) });
    await c.execute(`UPDATE sales_quotations SET external_snapshot=?,consent_message_id=?,execution_attempt_id=?,execution_started_at=UTC_TIMESTAMP(3),
      execution_state='succeeded',status='accepted',external_result=? WHERE id=?`,
    [JSON.stringify({ value: now.snapshot, digest: digest(now.snapshot), consent: { value: consent, digest: digest(consent) } }), input.incomingMessageId, randomUUID(),
      JSON.stringify({ value: result.quote, digest: digest(result.quote), binding: digest({ snapshot: now.snapshot, consent }) }), quotationId]);
    if ((await customer(c, input)).content !== now.source.content) throw Error('Consent superseded');
    return linkText(now.q, now.snapshot, result.quote);
  });
}
export async function declineByaanCheckoutOffer(input: CheckoutIdentity, quotationId: number) {
  return tx(async c => {
    await lockByaanSalesAuthority(c, input.merchantId); const source = await customer(c, input), q = await latest(c, input);
    if (!isSalesRefusal(source.content) || q?.id !== quotationId || q.external_provider !== BYAAN_CHECKOUT_PROVIDER) throw Error('Refusal unavailable');
    readAgreement(q); await assertExecution(input);
    if (!q.consent_message_id) await c.execute("UPDATE sales_quotations SET status='rejected' WHERE id=?", [quotationId]);
    return BYAAN_CHECKOUT_DECLINED;
  });
}
async function currentReply(c: PoolConnection, input: CheckoutIdentity, quotationId: number, version: number) {
  const a = await verify(c, input, quotationId);
  if (version !== a.source.version) throw Error('Reply ownership changed');
  if (input.incomingMessageId === a.snapshot.sourceMessageId && !a.consent) {
    if ((await customer(c, input)).content !== a.source.content) throw Error('Offer superseded');
    return byaanCheckoutOfferText(quotationId, a.snapshot);
  }
  if (!a.receipt || !a.consent || a.consent.incomingMessageId !== input.incomingMessageId || a.consent.contentDigest !== digest(a.source.content)
    || !isByaanEnrollmentConsent(a.source.content)) throw Error('Reply consent unavailable');
  if ((await customer(c, input)).content !== a.source.content) throw Error('Reply superseded');
  return linkText(a.q, a.snapshot, a.receipt);
}
/** Exact reserved plan + current tenant/consent/evidence at the final WhatsApp gate. No provider write. */
export async function canDispatchByaanCheckoutReply(input: SendMerchantWhatsAppInput) {
  const marker = /\[BC-\d+\]/.test(input.text || ''), guard = input.replyGuard;
  if (!guard?.incomingMessageId) return !marker;
  try {
    const pool = await getPool(); if (!pool) return false;
    // Latest agreement also protects a refusal/error without a new consent row.
    const [rows] = await pool.execute<any[]>(`SELECT id,customer_phone,external_provider,source_message_id,consent_message_id FROM sales_quotations
      WHERE merchant_id=? AND conversation_id=? ORDER BY id DESC LIMIT 1`, [input.merchantId, guard.conversationId]);
    const q = rows[0]; if (!q || q.external_provider !== BYAAN_CHECKOUT_PROVIDER) return !marker;
    const [messages] = await pool.execute<any[]>('SELECT content FROM messages WHERE id=? AND conversationId=?', [guard.incomingMessageId, guard.conversationId]);
    if (messages.length !== 1) return false;
    if (!marker && q.source_message_id !== guard.incomingMessageId && q.consent_message_id !== guard.incomingMessageId
      && !isByaanEnrollmentConsent(messages[0].content) && !isSalesRefusal(messages[0].content) && byaanSessionChoice(messages[0].content) === null) return true;
    if (input.kind !== 'text' || !normalizeCampaignPhone(input.to) || normalizeCampaignPhone(input.to) !== normalizeCampaignPhone(q.customer_phone)) return false;
    const [jobs] = await pool.execute<any[]>('SELECT * FROM ai_interaction_jobs WHERE merchant_id=? AND conversation_id=? AND incoming_message_id=?', [input.merchantId, guard.conversationId, guard.incomingMessageId]);
    const job = jobs[0], plan: ReplyPlan = decode(job?.reply_plan), { replyGuard: _, ...effect } = input;
    if (!job || job.reply_origin !== 'ordinary' || job.state !== 'waiting_delivery' || job.reply_digest !== guard.reservationDigest
      || ordinaryReplyDigest(plan) !== job.reply_digest || ordinaryReplyText(plan) !== job.reply_text
      || plan.conversationId !== guard.conversationId || plan.incomingMessageId !== guard.incomingMessageId || plan.ownershipVersion !== guard.version
      || plan.effects.some(e => e.kind !== 'text') || !plan.effects.some(e => digest(e) === digest(effect))) return false;
    const endsWith = (expected: string) => plan.effects.some((_, i) => plan.effects.slice(i).map(e => e.text).join('') === expected);
    const identity = { merchantId: input.merchantId, conversationId: guard.conversationId, incomingMessageId: guard.incomingMessageId, customerPhone: q.customer_phone };
    if (!plan.effects.some(e => /\[BC-\d+\]/.test(e.text || '')) && safeReplies.some(endsWith)) {
      return tx(async c => { await lockByaanSalesAuthority(c, input.merchantId); const source = await customer(c, identity); return source.version === guard.version; });
    }
    return tx(async c => endsWith(await currentReply(c, identity, q.id, guard.version)));
  } catch { return false; }
}
