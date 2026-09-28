import { semanticAction } from './conversation-understanding-context';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import type { SendMerchantWhatsAppInput } from '../channels/whatsapp/types';
import { currentInboundExecution } from '../messaging/inbound-context';
import { databaseTimeEpoch } from '../db/time';
import { formatMinorMoney, verifiedProductMoney } from '../../shared/product-money';
import { enrollTrainee } from '../integrations/byaan';
import { byaanEnrollmentInput, byaanMerchantId, byaanSalesFailure } from '../integrations/byaan-sales-contract';
import { byaanSalesTransaction as tx, lockByaanSalesAuthority, readByaanSalesOperationResult, type ByaanSalesAuthorization } from '../integrations/byaan-sales-operations';
import { assertCheckoutAgreementSchema, assertCheckoutIdentity, type CheckoutIdentity } from './checkout-agreements';
import { hasCheckoutOfferEvidence, recordedCheckoutOfferEvidence } from './checkout-offer-evidence';
import { authorizeByaanSalesReviewer } from '../integrations/byaan-sales-review';
import { byaanEnrollmentRecoveryInput, byaanEnrollmentRecoveryOutput, byaanEnrollmentRecoveryStamp } from '../../shared/byaan-enrollment-recovery';
import { isSalesRefusal, isShortAffirmation, normalizeCustomerText } from './customer-decision';
import { policyArtifactDigest as digest } from './learning-policy-evaluation-bundle';
import { normalizeCampaignPhone } from '../automation/campaign-guard';
import { ordinaryReplyDigest, ordinaryReplyText } from './reply-reservation';
import type { ReplyPlan } from '../messaging/reply-plan';

export const BYAAN_ENROLLMENT_PROVIDER = 'byaan_enrollment';
export const BYAAN_ENROLLMENT_CLARIFY = 'حدد دورة واحدة واسم المتدرب الصحيح في المحادثة، لأعرض تفاصيل التسجيل وتراجعها قبل التأكيد.';
export const BYAAN_ENROLLMENT_UNCERTAIN = 'يحتاج تسجيل بيان إلى مراجعة من المتجر. لا أستطيع تأكيد النتيجة الآن، ولن أرسل تسجيلًا بديلًا تلقائيًا.';
export const BYAAN_ENROLLMENT_DECLINED = 'توقفت عن متابعة هذا التسجيل آليًا. إذا سبق إرساله إلى بيان، يحتاج إلغاؤه إلى مراجعة من المتجر.';
export const BYAAN_ENROLLMENT_CHANGED = 'تغيّرت تفاصيل التسجيل أو انتهت صلاحية العرض. حدد الدورة من جديد لأعرض ملخصًا تراجعه قبل التأكيد.';
const id = byaanMerchantId, hash = z.string().regex(/^[a-f0-9]{64}$/);
const label = z.string().trim().min(1).max(255)
  .refine(v => !/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\[\]<>]/.test(v));
const courseSchema = z.object({ productId: id, courseId: z.string(), name: label,
  priceMinor: z.number().int().nonnegative().max(2147483647), currency: z.literal('SAR'),
  startsAt: z.string().nullable(), endsAt: z.string().nullable(), catalogDigest: hash }).strict();
const snapshotSchema = z.object({ version: z.literal(1), merchantId: id, conversationId: id,
  sourceMessageId: id, customerPhone: z.string(), traineePhone: z.string(), traineeName: label,
  authorityHash: hash, ownershipVersion: z.number().int().nonnegative(), sourceDigest: hash,
  course: courseSchema, requestId: z.string().uuid() }).strict();
const consentSchema = z.object({ version: z.literal(1), quoteId: id, incomingMessageId: id,
  snapshotDigest: hash, contentDigest: hash, offerTextDigest: hash }).strict();
const recoverySchema = byaanEnrollmentRecoveryStamp.extend({ version: z.literal(1), quotationId: id, operationId: id,
  receiptDigest: hash, offerEvidenceDigest: hash, previousState: z.enum(['processing', 'unknown', 'succeeded']), previousProjectionDigest: hash }).strict();
type Snapshot = z.infer<typeof snapshotSchema>;
type Consent = z.infer<typeof consentSchema>;
const decode = (v: any) => typeof v === 'string' ? JSON.parse(v) : v;
export const isByaanEnrollmentConsent = (text: string) => semanticAction(text, ['confirm_offer']) ?? (!isSalesRefusal(text)
  && (isShortAffirmation(text) || /^(?:اكد التسجيل|confirm enrollment)[.!\s]*$/.test(normalizeCustomerText(text))));

export function byaanEnrollmentOfferText(quotationId: number, snapshot: Snapshot) {
  return `ملخص التسجيل [BE-${quotationId}]\n\nالدورة: ${snapshot.course.name}\nالاسم: ${snapshot.traineeName}\nالجوال: ${snapshot.traineePhone}\n`
    + (snapshot.course.startsAt ? `بداية الدورة (UTC): ${snapshot.course.startsAt}\n` : '')
    + (snapshot.course.endsAt ? `نهاية الدورة (UTC): ${snapshot.course.endsAt}\n` : '')
    + `السعر في الكتالوج: ${formatMinorMoney(snapshot.course.priceMinor)}.\n`
    + 'سأرسل طلب تسجيل واحد بهذه البيانات إلى بيان. يحتاج الإجمالي والضرائب وأي رسوم إلى مراجعة قبل الدفع. عرض الملخص لا يحجز مقعدًا ولا يثبت دفعًا.\n'
    + 'هل توافق على إرسال طلب التسجيل بهذه التفاصيل؟ رد بنعم للتأكيد، أو اذكر التعديل المطلوب.';
}

async function currentCustomer(c: PoolConnection, input: CheckoutIdentity) {
  const source = await assertCheckoutIdentity(c, input);
  const [rows] = await c.execute<any[]>(`SELECT c.customerName,c.handoff_version FROM conversations c
    JOIN messages m ON m.conversationId=c.id AND m.id=? AND m.direction='incoming'
    WHERE c.id=? AND c.merchantId=? AND m.createdAt>=TIMESTAMPADD(HOUR,-24,UTC_TIMESTAMP(3))
      AND m.createdAt<=TIMESTAMPADD(MINUTE,5,UTC_TIMESTAMP(3))`, [input.incomingMessageId, input.conversationId, input.merchantId]);
  if (rows.length !== 1) throw Error('Customer message unavailable');
  const name = label.parse(rows[0].customerName);
  const normalized = byaanEnrollmentInput.parse({ traineeName: name, traineePhone: input.customerPhone, courseId: 'identity' });
  const [profiles] = await c.execute<any[]>('SELECT memory_forget_before_message_id FROM customer_profiles WHERE merchant_id=? AND customer_phone=?', [input.merchantId, input.customerPhone]);
  const cutoff = Number(profiles[0]?.memory_forget_before_message_id || 0);
  if (input.incomingMessageId <= cutoff) throw Error('Customer history withdrawn');
  return { content: source.content, name: normalized.traineeName, phone: normalized.traineePhone, version: Number(rows[0].handoff_version), cutoff };
}

async function assertExecution(input: CheckoutIdentity) {
  const execution = currentInboundExecution();
  if (execution) {
    if (execution.merchantId !== input.merchantId) throw Error('Inbound owner mismatch');
    await execution.assertOwned();
  }
}

/** Bounded, tenant-owned identifiers for extraction. No secrets, prices or customer profile. */
export async function readByaanEnrollmentSelectionContext(input: CheckoutIdentity) {
  return tx(async c => {
    await lockByaanSalesAuthority(c, input.merchantId);
    const customer = await currentCustomer(c, input);
    const [catalog] = await c.execute<any[]>(`SELECT id AS productId,COALESCE(NULLIF(nameAr,''),name) AS name,sallaProductId AS reference FROM products
      WHERE merchantId=? AND isActive=1 AND status='active' AND product_type='service' AND has_variants=0
      AND registration_open=1 AND sallaProductId LIKE 'byaan:%' ORDER BY id LIMIT 150`, [input.merchantId]);
    return { content: customer.content, cutoff: customer.cutoff, catalog: catalog.filter(p => label.safeParse(p.name).success) as Array<{productId:number;name:string;reference:string}> };
  });
}

/** Local, explicitly priced Byaan catalog only. Fresh sync is not a live seat reservation. */
export async function currentByaanCourse(c: PoolConnection, merchantId: number, productId: number) {
  const [rows] = await c.execute<any[]>(`SELECT p.*,UTC_TIMESTAMP(3) AS checked_at,b.verified_at AS connection_verified_at
    FROM products p JOIN byaan_connections b ON b.merchant_id=p.merchantId
    WHERE p.id=? AND p.merchantId=? FOR SHARE`, [id.parse(productId), merchantId]);
  const p = rows[0];
  if (rows.length !== 1 || p.isActive !== 1 || p.status !== 'active' || p.product_type !== 'service'
    || p.has_variants !== 0 || p.registration_open !== 1 || !p.sallaProductId?.startsWith('byaan:')) throw Error('Course unavailable');
  const now = databaseTimeEpoch(p.checked_at), synced = databaseTimeEpoch(p.lastSyncedAt), verified = databaseTimeEpoch(p.connection_verified_at);
  if (![now, synced, verified].every(Number.isFinite) || synced < verified || synced < now - 86400000 || synced > now + 300000) throw Error('Catalog sync unavailable');
  const count = z.number().int().nonnegative().parse(p.enrolled_count);
  if (p.max_students !== null && count >= id.parse(p.max_students)) throw Error('Course full');
  const date = (value: unknown) => {
    if (value === null) return null;
    if (typeof value !== 'string' && !(value instanceof Date)) throw Error('Course date invalid');
    const time = databaseTimeEpoch(value); if (!Number.isFinite(time)) throw Error('Course date invalid');
    return new Date(time).toISOString();
  };
  const startsAt = date(p.course_start_date), endsAt = date(p.course_end_date);
  if (endsAt && (Date.parse(endsAt) <= now || startsAt && Date.parse(startsAt) > Date.parse(endsAt))) throw Error('Course ended');
  const price = verifiedProductMoney({ price: p.price, priceUnit: p.price_unit, currency: p.currency });
  if (price.currency !== 'SAR') throw Error('Course currency unsupported');
  const name = label.parse(p.nameAr || p.name);
  const intent = byaanEnrollmentInput.parse({ traineeName: 'catalog', traineePhone: '966500000001', courseId: p.sallaProductId.slice(6), courseTitle: name });
  return courseSchema.parse({ productId, courseId: intent.courseId, name, priceMinor: price.minor, currency: price.currency, startsAt, endsAt,
    catalogDigest: digest({ reference: p.sallaProductId, name: p.name, nameAr: p.nameAr, price: p.price, priceUnit: p.price_unit,
      currency: p.currency, synced, startsAt, endsAt, capacity: p.max_students, enrolled: count }) });
}
const currentCourse = currentByaanCourse;

async function latest(c: PoolConnection, input: CheckoutIdentity) {
  const [rows] = await c.execute<any[]>(`SELECT *,offer_expires_at>UTC_TIMESTAMP(3) AS valid FROM sales_quotations
    WHERE merchant_id=? AND conversation_id=? AND customer_phone=? ORDER BY id DESC LIMIT 1 FOR UPDATE`,
  [input.merchantId, input.conversationId, input.customerPhone]);
  return rows[0];
}
function readAgreement(q: any, allowMissingProjection = false) {
  if (q.external_provider !== BYAAN_ENROLLMENT_PROVIDER || q.currency !== 'SAR' || q.order_id !== null
    || q.checkout_snapshot !== null || q.external_order_key !== null || q.external_reconciliation !== null || q.projection_pending !== 0) throw Error('Agreement unavailable');
  const envelope = decode(q.external_snapshot), snapshot = snapshotSchema.parse(envelope?.value);
  if (digest(snapshot) !== envelope.digest || digest(envelope.value) !== envelope.digest
    || q.merchant_id !== snapshot.merchantId || q.conversation_id !== snapshot.conversationId || q.customer_phone !== snapshot.customerPhone
    || q.customer_name !== snapshot.traineeName || q.source_message_id !== snapshot.sourceMessageId || q.offer_version !== 1
    || Number(q.subtotal) !== snapshot.course.priceMinor / 100 || Number(q.total) !== snapshot.course.priceMinor / 100 || Number(q.tax_amount) !== 0
    || digest(decode(q.items)) !== digest(items(snapshot))) throw Error('Agreement changed');
  let consent: Consent | undefined;
  if (envelope.consent !== undefined) {
    consent = consentSchema.parse(envelope.consent.value);
    if (digest(consent) !== envelope.consent.digest || digest(envelope.consent.value) !== envelope.consent.digest
      || consent.quoteId !== q.id || consent.incomingMessageId !== q.consent_message_id || consent.snapshotDigest !== envelope.digest
      || consent.offerTextDigest !== digest(byaanEnrollmentOfferText(q.id, snapshot)) || q.execution_attempt_id !== snapshot.requestId
      || !q.execution_started_at || !['processing', 'succeeded', 'unknown'].includes(q.execution_state)) throw Error('Consent changed');
  } else if (q.consent_message_id !== null || q.execution_attempt_id !== null || q.execution_state !== 'ready'
    || q.external_result !== null || q.execution_started_at !== null) throw Error('Consent missing');
  if (q.external_result !== null) {
    const saved = decode(q.external_result), value = saved?.value;
    if (!consent || !value || value.version !== 1 || value.binding !== digest({ snapshot, consent }) || saved.digest !== digest(value)
      || (q.execution_state === 'succeeded') !== (value.receipt?.success === true)) throw Error('Receipt projection changed');
    if (value.recovery !== undefined) {
      const recovery = recoverySchema.parse(value.recovery);
      if (digest(recovery) !== digest(value.recovery) || recovery.quotationId !== q.id || recovery.operationId !== value.receipt?.operationId
        || recovery.receiptDigest !== digest(value.receipt) || q.execution_state !== 'succeeded' || q.status !== 'accepted') throw Error('Recovery audit changed');
    }
  } else if (q.execution_state === 'succeeded' && !allowMissingProjection) throw Error('Receipt projection missing');
  return { snapshot, consent };
}
function items(s: Snapshot) { return [{ productId: s.course.productId, name: s.course.name, quantity: 1, price: s.course.priceMinor }]; }
function intent(s: Snapshot) { return byaanEnrollmentInput.parse({ traineePhone: s.traineePhone, traineeName: s.traineeName, courseId: s.course.courseId, courseTitle: s.course.name }); }

async function verifiedClaim(c: PoolConnection, input: CheckoutIdentity, quotationId: number, requireCurrentCatalog: boolean) {
  const authority = await lockByaanSalesAuthority(c, input.merchantId), customer = await currentCustomer(c, input), q = await latest(c, input);
  if (!q || q.id !== quotationId || !['sent', 'viewed', 'accepted'].includes(q.status)) throw Error('Agreement unavailable');
  const { snapshot, consent } = readAgreement(q);
  if (snapshot.authorityHash !== authority.hash || snapshot.ownershipVersion !== customer.version || snapshot.traineeName !== customer.name
    || snapshot.traineePhone !== customer.phone || snapshot.sourceMessageId <= customer.cutoff || !isByaanEnrollmentConsent(customer.content) || snapshot.sourceMessageId >= input.incomingMessageId
    || consent && (consent.incomingMessageId !== input.incomingMessageId || consent.contentDigest !== digest(customer.content))) throw Error('Consent unavailable');
  if (requireCurrentCatalog) {
    if (!q.valid || digest(await currentCourse(c, input.merchantId, snapshot.course.productId)) !== digest(snapshot.course)) throw Error('Course changed');
  }
  const [sources] = await c.execute<any[]>('SELECT content FROM messages WHERE id=? AND conversationId=? AND direction=\'incoming\' FOR SHARE',
    [snapshot.sourceMessageId, input.conversationId]);
  if (sources.length !== 1 || digest(sources[0].content) !== snapshot.sourceDigest) throw Error('Source changed');
  if (!await hasCheckoutOfferEvidence(c, input, snapshot.sourceMessageId, byaanEnrollmentOfferText(q.id, snapshot))) throw Error('Offer delivery unavailable');
  const [inbound] = await c.execute<any[]>('SELECT content FROM messages WHERE id=? AND conversationId=? FOR SHARE', [input.incomingMessageId, input.conversationId]);
  if (inbound[0]?.content !== customer.content || (await assertCheckoutIdentity(c, input)).content !== customer.content) throw Error('Consent superseded');
  return { q, snapshot, consent, content: customer.content };
}

/** Server adapter only: neither creates a provider operation nor sends WhatsApp.
 * The caller must deliver the exact offer through the existing guarded reply path. */
export async function prepareByaanEnrollmentOffer(rawInput: CheckoutIdentity, productId: number,
  extraction?: {sourceText:string;memoryCutoff:number;product:{productId:number;name:string;reference:string}}) {
  const input = { ...rawInput };
  await assertCheckoutAgreementSchema(); id.parse(productId);
  return tx(async c => {
    const authority = await lockByaanSalesAuthority(c, input.merchantId), customer = await currentCustomer(c, input);
    if (isSalesRefusal(customer.content)) return { kind: 'declined' as const };
    const previous = await latest(c, input), course = await currentCourse(c, input.merchantId, productId);
    if (extraction && (customer.content !== extraction.sourceText || customer.cutoff !== extraction.memoryCutoff
      || course.productId !== extraction.product.productId || course.name !== extraction.product.name.trim()
      || `byaan:${course.courseId}` !== extraction.product.reference)) throw Error('Extraction source changed');
    // Block new identities over unresolved effects, including attempts from another
    // conversation for the same normalized recipient. A reported enrollment of the
    // same course also needs human review instead of accidental re-enrollment.
    const [attempted] = await c.execute<any[]>(`SELECT * FROM sales_quotations WHERE merchant_id=? AND external_provider=?
      AND consent_message_id IS NOT NULL AND JSON_UNQUOTE(JSON_EXTRACT(external_snapshot,'$.value.traineePhone'))=? FOR UPDATE`,
    [input.merchantId, BYAAN_ENROLLMENT_PROVIDER, customer.phone]);
    for (const row of attempted) {
      const old = readAgreement(row);
      if (row.execution_state !== 'succeeded' || old.snapshot.course.courseId === course.courseId) return { kind: 'review' as const };
    }
    const [unresolved] = await c.execute<any[]>(`SELECT id FROM sales_quotations WHERE merchant_id=? AND conversation_id=?
      AND execution_state IN ('processing','unknown') LIMIT 1 FOR UPDATE`, [input.merchantId, input.conversationId]);
    if (unresolved.length) return { kind: 'review' as const };
    if (previous?.source_message_id === input.incomingMessageId) {
      const saved = readAgreement(previous).snapshot;
      if (!previous.valid || previous.execution_state !== 'ready' || !['sent','viewed'].includes(previous.status)
        || saved.sourceDigest !== digest(customer.content) || saved.authorityHash !== authority.hash || saved.ownershipVersion !== customer.version
        || saved.traineeName !== customer.name || saved.traineePhone !== customer.phone || digest(saved.course) !== digest(course)) throw Error('Offer conflict');
      return { kind: 'quote' as const, quotationId: previous.id as number, text: byaanEnrollmentOfferText(previous.id, saved) };
    }
    const snapshot = snapshotSchema.parse({ version: 1, merchantId: input.merchantId, conversationId: input.conversationId,
      customerPhone: input.customerPhone, sourceMessageId: input.incomingMessageId,
      traineePhone: customer.phone, traineeName: customer.name, authorityHash: authority.hash, ownershipVersion: customer.version,
      sourceDigest: digest(customer.content), course, requestId: randomUUID() });
    await assertExecution(input);
    await c.execute(`UPDATE sales_quotations SET status='expired' WHERE merchant_id=? AND conversation_id=? AND status IN ('sent','viewed')
      AND consent_message_id IS NULL AND order_id IS NULL AND (checkout_snapshot IS NOT NULL OR external_snapshot IS NOT NULL)`, [input.merchantId, input.conversationId]);
    const [r] = await c.execute<any>(`INSERT INTO sales_quotations (merchant_id,customer_phone,customer_name,quotation_number,items,subtotal,tax_amount,total,currency,
      conversation_id,source_message_id,external_provider,external_snapshot,execution_state,offer_expires_at)
      VALUES (?,?,?,?,?,?,0,?,'SAR',?,?,?,?,'ready',TIMESTAMPADD(MINUTE,30,UTC_TIMESTAMP(3)))`,
    [input.merchantId, input.customerPhone, customer.name, `BENROLL-${input.merchantId}-${input.incomingMessageId}`, JSON.stringify(items(snapshot)), course.priceMinor / 100,
      course.priceMinor / 100, input.conversationId, input.incomingMessageId, BYAAN_ENROLLMENT_PROVIDER, JSON.stringify({ value: snapshot, digest: digest(snapshot) })]);
    if ((await assertCheckoutIdentity(c, input)).content !== customer.content) throw Error('Source superseded');
    return { kind: 'quote' as const, quotationId: Number(r.insertId), text: byaanEnrollmentOfferText(Number(r.insertId), snapshot) };
  });
}

/** Executes only the consented enrollment. Returned receipt is server evidence,
 * not permission to send a reply, take payment, or mark a paid sale. Existing
 * direct integration helpers remain server-only and require their caller's authority. */
export async function acceptByaanEnrollmentOffer(rawInput: CheckoutIdentity, quotationId: number) {
  const input = { ...rawInput }; id.parse(quotationId);
  await assertCheckoutAgreementSchema();
  const claim = await tx(async c => {
    await assertExecution(input);
    await lockByaanSalesAuthority(c, input.merchantId);
    const customer = await currentCustomer(c, input), q = await latest(c, input);
    if (!q || q.id !== quotationId) throw Error('Agreement unavailable');
    if (isSalesRefusal(customer.content)) {
      if (q.external_provider === BYAAN_ENROLLMENT_PROVIDER && q.execution_state === 'ready') await c.execute("UPDATE sales_quotations SET status='rejected' WHERE id=?", [q.id]);
      return null;
    }
    const checked = await verifiedClaim(c, input, quotationId, q.consent_message_id === null);
    const consent = checked.consent || consentSchema.parse({ version: 1, quoteId: quotationId, incomingMessageId: input.incomingMessageId,
      snapshotDigest: digest(checked.snapshot), contentDigest: digest(checked.content), offerTextDigest: digest(byaanEnrollmentOfferText(quotationId, checked.snapshot)) });
    if (!checked.consent) await c.execute(`UPDATE sales_quotations SET external_snapshot=?,consent_message_id=?,execution_attempt_id=?,
      execution_state='processing',execution_started_at=UTC_TIMESTAMP(3),status='viewed' WHERE id=?`,
    [JSON.stringify({ value: checked.snapshot, digest: digest(checked.snapshot), consent: { value: consent, digest: digest(consent) } }),
      input.incomingMessageId, checked.snapshot.requestId, quotationId]);
    return { snapshot: checked.snapshot, consent };
  });
  if (!claim) return { kind: 'declined' as const };
  const binding = digest(claim);
  const authorization: ByaanSalesAuthorization = { binding, assert: async (c, phase) => {
    const current = await verifiedClaim(c, input, quotationId, phase !== 'replay');
    if (!current.consent || digest({ snapshot: current.snapshot, consent: current.consent }) !== binding) throw Error('Agreement binding changed');
    await assertExecution(input);
  } };
  const result = await enrollTrainee(input.merchantId, intent(claim.snapshot), { requestId: claim.snapshot.requestId }, authorization);
  try {
    await tx(async c => {
      // Historical receipt recording must survive a takeover after the provider
      // accepted the request. This transaction grants no new execution authority.
      const [rows] = await c.execute<any[]>('SELECT * FROM sales_quotations WHERE id=? AND merchant_id=? FOR UPDATE', [quotationId, input.merchantId]);
      if (rows.length !== 1 || digest(readAgreement(rows[0])) !== binding) throw Error('Agreement changed after dispatch');
      const q = rows[0];
      if (q.execution_state === 'succeeded') return; // A concurrent uncertain replay cannot downgrade a receipt.
      const { replayed: _replayed, ...receipt } = result as Awaited<ReturnType<typeof enrollTrainee>> & { replayed?: boolean };
      const value = { version: 1, binding, receipt };
      await c.execute(`UPDATE sales_quotations SET execution_state=?,status=?,external_result=? WHERE id=?`,
        [result.success ? 'succeeded' : 'unknown', result.success ? 'accepted' : 'viewed', JSON.stringify({ value, digest: digest(value) }), quotationId]);
    });
  } catch { return { kind: 'review' as const, quotationId, result }; }
  return { kind: 'operation' as const, quotationId, result };
}

/** Restore a local projection from an already reported, bound operation. Never
 * call enrollment, infer provider success, recreate deleted agreements, or send.
 * Historical takeover/new messages/catalog changes do not grant new automation. */
export async function recoverByaanEnrollmentProjection(merchantId: number, actorId: number, raw: z.infer<typeof byaanEnrollmentRecoveryInput>) {
  try {
    id.parse(merchantId); id.parse(actorId); const input = byaanEnrollmentRecoveryInput.parse(raw);
    await assertCheckoutAgreementSchema();
    return await tx(async c => {
      const authority = await lockByaanSalesAuthority(c, merchantId);
      await authorizeByaanSalesReviewer(c, merchantId, actorId);
      const [operations] = await c.execute<any[]>('SELECT request_id FROM byaan_sales_operations WHERE id=? AND merchant_id=? FOR SHARE', [input.operationId, merchantId]);
      if (operations.length !== 1) throw Error('Operation unavailable');
      const requestId = operations[0].request_id;
      const [candidates] = await c.execute<any[]>(`SELECT id,conversation_id,customer_phone FROM sales_quotations
        WHERE merchant_id=? AND external_provider=? AND execution_attempt_id=? LIMIT 2`, [merchantId, BYAAN_ENROLLMENT_PROVIDER, requestId]);
      if (candidates.length !== 1) throw Error('Agreement unavailable');
      const candidate = candidates[0];
      // Use the memory writer's profile-before-conversation order. Do not create
      // a missing profile or reconstruct any forgotten source/consent.
      const [profiles] = await c.execute<any[]>('SELECT memory_forget_before_message_id FROM customer_profiles WHERE merchant_id=? AND customer_phone=? FOR SHARE', [merchantId, candidate.customer_phone]);
      const [conversations] = await c.execute<any[]>('SELECT id FROM conversations WHERE id=? AND merchantId=? AND customerPhone=? FOR UPDATE', [candidate.conversation_id, merchantId, candidate.customer_phone]);
      const [quotes] = await c.execute<any[]>('SELECT * FROM sales_quotations WHERE id=? AND merchant_id=? FOR UPDATE', [candidate.id, merchantId]);
      if (conversations.length !== 1 || quotes.length !== 1) throw Error('Agreement ownership changed');
      const q = quotes[0], agreement = readAgreement(q, true), { snapshot: s, consent } = agreement;
      const cutoff = Number(profiles[0]?.memory_forget_before_message_id || 0);
      if (!consent || s.authorityHash !== authority.hash || s.requestId !== requestId || s.conversationId !== candidate.conversation_id
        || s.customerPhone !== candidate.customer_phone || s.sourceMessageId <= cutoff || consent.incomingMessageId <= cutoff
        || s.sourceMessageId >= consent.incomingMessageId || !Number.isFinite(databaseTimeEpoch(q.execution_started_at))
        || (q.execution_state === 'succeeded' ? q.status !== 'accepted' : q.status !== 'viewed')) throw Error('Agreement binding unavailable');
      const [sources] = await c.execute<any[]>('SELECT id,content FROM messages WHERE conversationId=? AND direction=\'incoming\' AND id IN (?,?) ORDER BY id FOR SHARE', [s.conversationId, s.sourceMessageId, consent.incomingMessageId]);
      if (sources.length !== 2 || sources[0].id !== s.sourceMessageId || digest(sources[0].content) !== s.sourceDigest
        || sources[1].id !== consent.incomingMessageId || digest(sources[1].content) !== consent.contentDigest
        || !isByaanEnrollmentConsent(sources[1].content)) throw Error('Consent unavailable');
      const identity = { merchantId, conversationId: s.conversationId, customerPhone: s.customerPhone, incomingMessageId: consent.incomingMessageId };
      const offerEvidence = await recordedCheckoutOfferEvidence(c, identity, s.sourceMessageId, byaanEnrollmentOfferText(q.id, s));
      if (!offerEvidence) throw Error('Offer evidence unavailable');
      const binding = digest(agreement);
      const receipt = await readByaanSalesOperationResult(c, merchantId, 'enrollment', { requestId }, intent(s), binding);
      if (receipt.operationId !== input.operationId) throw Error('Operation identity changed');
      const prior = q.external_result === null ? null : decode(q.external_result).value;
      const output = (replayed: boolean, recovery: z.infer<typeof byaanEnrollmentRecoveryStamp> | null) => byaanEnrollmentRecoveryOutput.parse({
        merchantId, operationId: input.operationId, quotationId: q.id, requestId, outcome: 'projection_present', replayed, recovery,
        providerStatus: 'not_checked', paymentEvidence: 'not_verified', externalRequest: 'not_sent', customerMessage: 'not_sent',
      });
      if (prior?.receipt?.success === true) {
        if (digest(prior.receipt) !== digest(receipt)) throw Error('Conflicting projection');
        return output(true, prior.recovery ? { reviewerUserId: prior.recovery.reviewerUserId, restoredAt: prior.recovery.restoredAt } : null);
      }
      if (prior) {
        const failure = prior.receipt, { operationId, ...result } = failure || {};
        if (q.execution_state !== 'unknown' || prior.recovery !== undefined
          || operationId !== undefined && operationId !== receipt.operationId
          || digest(result) !== digest(byaanSalesFailure('unknown'))) throw Error('Conflicting projection');
      }
      // Verify the nonlocking transport evidence again just before the local write.
      if (await recordedCheckoutOfferEvidence(c, identity, s.sourceMessageId, byaanEnrollmentOfferText(q.id, s)) !== offerEvidence) throw Error('Offer evidence changed');
      const [[clock]] = await c.query<any[]>('SELECT UTC_TIMESTAMP(3) AS now');
      const recovery = recoverySchema.parse({ version: 1, quotationId: q.id, operationId: receipt.operationId, reviewerUserId: actorId,
        restoredAt: new Date(databaseTimeEpoch(clock.now)).toISOString(), receiptDigest: digest(receipt), offerEvidenceDigest: offerEvidence,
        previousState: q.execution_state, previousProjectionDigest: digest(q.external_result === null ? null : decode(q.external_result)) });
      const value = { version: 1, binding, receipt, recovery };
      await c.execute("UPDATE sales_quotations SET execution_state='succeeded',status='accepted',external_result=? WHERE id=? AND merchant_id=?", [JSON.stringify({ value, digest: digest(value) }), q.id, merchantId]);
      return output(false, { reviewerUserId: recovery.reviewerUserId, restoredAt: recovery.restoredAt });
    });
  } catch { throw Error('Byaan enrollment recovery unavailable'); }
}

async function currentReply(c: PoolConnection, input: CheckoutIdentity, quotationId: number, ownershipVersion?: number) {
  const authority = await lockByaanSalesAuthority(c, input.merchantId), customer = await currentCustomer(c, input), q = await latest(c, input);
  if (!q || q.id !== quotationId) throw Error('Reply agreement unavailable');
  const agreement = readAgreement(q), s = agreement.snapshot;
  if (q.external_result !== null && decode(q.external_result).value.recovery !== undefined) throw Error('Recovered enrollment requires human follow-up');
  if (s.authorityHash !== authority.hash || s.ownershipVersion !== customer.version || s.traineeName !== customer.name
    || s.traineePhone !== customer.phone || s.sourceMessageId <= customer.cutoff
    || ownershipVersion !== undefined && ownershipVersion !== customer.version) throw Error('Reply authority changed');
  if (s.sourceMessageId === input.incomingMessageId) {
    if (!q.valid || !['sent','viewed'].includes(q.status) || q.execution_state !== 'ready' || agreement.consent
      || s.sourceDigest !== digest(customer.content) || digest(await currentCourse(c,input.merchantId,s.course.productId)) !== digest(s.course)) throw Error('Offer changed');
    if ((await assertCheckoutIdentity(c,input)).content !== customer.content) throw Error('Offer source changed');
    return byaanEnrollmentOfferText(q.id,s);
  }
  const current = await verifiedClaim(c,input,quotationId,false);
  if (!current.consent || q.execution_state !== 'succeeded' || q.status !== 'accepted') throw Error('Enrollment not reported');
  const receipt = await readByaanSalesOperationResult(c,input.merchantId,'enrollment',{requestId:s.requestId},intent(s),digest(agreement));
  if (digest(receipt) !== digest(decode(q.external_result).value.receipt)) throw Error('Receipt projection mismatch');
  if ((await assertCheckoutIdentity(c,input)).content !== current.content) throw Error('Reply source superseded');
  return `ورد تأكيد التسجيل من بيان [BE-${q.id}]\nالدورة: ${s.course.name}\nرقم التسجيل: ${receipt.enrollmentId}\n`
    + 'هذا إقرار تسجيل، ولا يثبت سداد رسوم الدورة. راجع الفاتورة وطريقة الدفع مع المتجر قبل السداد.';
}

export async function readByaanEnrollmentReply(input: CheckoutIdentity, quotationId: number) {
  await assertCheckoutAgreementSchema();
  return tx(c => currentReply(c,input,quotationId));
}

/** Final transport gate. Reads the saved operation and its evidence; never calls Byaan. */
export async function canDispatchByaanEnrollmentReply(input: SendMerchantWhatsAppInput) {
  const marker = /\[BE-\d+\]/.test(input.text || ''), guard = input.replyGuard;
  if (!guard?.incomingMessageId) return !marker;
  try {
    const pool = await getPool(); if (!pool) return false;
    const [rows] = await pool.execute<any[]>(`SELECT id,customer_phone FROM sales_quotations WHERE merchant_id=? AND conversation_id=?
      AND external_provider=? AND (source_message_id=? OR consent_message_id=?) ORDER BY id DESC LIMIT 1`,
    [input.merchantId,guard.conversationId,BYAAN_ENROLLMENT_PROVIDER,guard.incomingMessageId,guard.incomingMessageId]);
    const q = rows[0]; if (!q) return !marker;
    if (input.kind !== 'text' || !normalizeCampaignPhone(input.to) || normalizeCampaignPhone(input.to) !== normalizeCampaignPhone(q.customer_phone)) return false;
    const [jobs] = await pool.execute<any[]>('SELECT * FROM ai_interaction_jobs WHERE merchant_id=? AND conversation_id=? AND incoming_message_id=?',
      [input.merchantId,guard.conversationId,guard.incomingMessageId]);
    const job=jobs[0], plan:ReplyPlan=decode(job?.reply_plan);
    const {replyGuard: _guard,...effect}=input;
    if (!job || job.reply_origin !== 'ordinary' || job.state !== 'waiting_delivery' || job.reply_digest !== guard.reservationDigest
      || ordinaryReplyDigest(plan) !== job.reply_digest || ordinaryReplyText(plan) !== job.reply_text
      || plan.conversationId !== guard.conversationId || plan.incomingMessageId !== guard.incomingMessageId || plan.ownershipVersion !== guard.version
      || plan.effects.some(e=>e.kind !== 'text') || !plan.effects.some(e=>digest(e)===digest(effect))) return false;
    const endsWith = (expected:string) => plan.effects.some((_,index)=>plan.effects.slice(index).map(e=>e.text).join('')===expected);
    if (!plan.effects.some(e=>/\[BE-\d+\]/.test(e.text||''))
      && [BYAAN_ENROLLMENT_CLARIFY,BYAAN_ENROLLMENT_UNCERTAIN,BYAAN_ENROLLMENT_DECLINED,BYAAN_ENROLLMENT_CHANGED].some(endsWith)) return true;
    const identity={merchantId:input.merchantId,conversationId:guard.conversationId,incomingMessageId:guard.incomingMessageId,customerPhone:q.customer_phone};
    return await tx(async c=>endsWith(await currentReply(c,identity,q.id,guard.version)));
  } catch { return false; }
}
