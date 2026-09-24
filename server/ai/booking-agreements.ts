import { createHash } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import { appointmentCreationSchema } from "../../shared/appointment-creation";
import { assertRuntimeSchema } from "../db/schema-readiness";
import { databaseTimeEpoch } from "../db/time";
import {
  calculateAppointmentEndTime,
  formatServicePrice,
} from "../appointment-booking";
import {
  BookingCapacityUnavailableError,
  createBookingInCapacityTransaction,
  hasBookingConflict,
  validateBookingStaff,
  withBookingCapacityTransaction,
} from "../booking-capacity";
import {
  assertCheckoutIdentity,
  type CheckoutIdentity,
} from "./checkout-agreements";
import { isSalesRefusal, isShortAffirmation } from "./customer-decision";
import { currentInboundExecution } from "../messaging/inbound-context";
import { resolveBookingAmendment } from "./booking-amendment-context";
import {
  bookingCalendarProof,
  readActiveBookingReschedule,
  rescheduleDailyHolds,
  assertCalendarRescheduleCapacity,
} from "../booking-reschedule-state";
import {
  assertBookingCalendarSchema,
  readBookingCalendarLink,
} from "../booking-calendar-state";

export const bookingSelectionSchema = z
  .object({
    serviceId: z.number().int().positive().safe(),
    staffId: z.number().int().positive().safe().nullable(),
    bookingDate: appointmentCreationSchema.shape.appointmentDate,
    startTime: appointmentCreationSchema.shape.startTime,
  })
  .strict();
type Selection = z.infer<typeof bookingSelectionSchema>;
// MySQL normalizes JSON object key order. Hash semantic content, not insertion order.
const canonical = (value: unknown): unknown =>
  value instanceof Date
    ? value.toISOString()
    : Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([key, item]) => [key, canonical(item)])
          )
        : value;
const digest = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
const marker = (id: number) => `[BA-${id}]`;
export { digest as bookingAgreementDigest };
/** Catalogue labels are display data, never commands for the downstream rich-reply parser. */
export const bookingDisplayLabel = (value: unknown) =>
  String(value)
    .replace(
      /[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,
      " "
    )
    .replace(/\[/g, "［")
    .replace(/\]/g, "］")
    .replace(/\s+/g, " ")
    .trim();
export class BookingAgreementUnavailableError extends Error {
  constructor() {
    super("Booking agreement unavailable");
  }
}
const unavailable = () => new BookingAgreementUnavailableError();
const positive = (value: number) =>
  z.number().int().positive().safe().parse(value);
function identity(input: CheckoutIdentity) {
  positive(input.merchantId);
  positive(input.conversationId);
  positive(input.incomingMessageId);
  appointmentCreationSchema.shape.customerPhone.parse(input.customerPhone);
}
export async function assertBookingAgreementSchema() {
  await assertBookingCalendarSchema();
  await assertRuntimeSchema(
    "conversation booking agreements",
    [
      { table: "bookings", columns: ["customer_agreement_id"] },
      {
        table: "conversation_booking_agreements",
        columns: [
          "conversation_id",
          "customer_phone",
          "source_message_id",
          "consent_message_id",
          "booking_reference",
          "target_booking_id",
          "prior_agreement_id",
          "before_snapshot",
          "before_hash",
          "state",
          "snapshot",
          "snapshot_hash",
          "offer_text",
          "expires_at",
        ],
        uniqueIndexes: [
          {
            name: "uq_conversation_booking_source",
            columns: ["merchant_id", "source_message_id"],
          },
          {
            name: "uq_conversation_booking_consent",
            columns: ["merchant_id", "consent_message_id"],
          },
        ],
      },
    ],
    { cacheSuccess: false }
  );
}
/** Only explicitly configured, single-capacity, fixed-price appointments enter this automatic path. */
export async function readBookingSelectionSnapshot(
  c: PoolConnection,
  merchantId: number,
  raw: Selection,
  excludeBookingId?: number
) {
  const input = bookingSelectionSchema.parse(raw);
  const [services] = await c.execute<any[]>(
    "SELECT * FROM services WHERE id=? AND merchant_id=? AND is_active=1 FOR UPDATE",
    [input.serviceId, merchantId]
  );
  const s = services[0];
  if (
    !s ||
    s.requires_appointment !== 1 ||
    s.price_type !== "fixed" ||
    !Number.isSafeInteger(s.base_price) ||
    s.base_price < 0 ||
    s.buffer_time_minutes !== 0
  )
    throw unavailable();
  await validateBookingStaff(c, merchantId, s, input.staffId);
  let staffName: string | null = null;
  if (input.staffId) {
    const [staff] = await c.execute<any[]>(
      "SELECT name FROM staff_members WHERE id=? AND merchant_id=? FOR SHARE",
      [input.staffId, merchantId]
    );
    if (staff.length !== 1) throw unavailable();
    staffName = String(staff[0].name);
  }
  let endTime: string;
  try {
    endTime = calculateAppointmentEndTime(
      input.startTime,
      Number(s.duration_minutes)
    );
  } catch {
    throw unavailable();
  }
  const [clock] = await c.execute<any[]>("SELECT UTC_TIMESTAMP(3) AS now");
  const now = databaseTimeEpoch(clock[0].now),
    when = Date.parse(`${input.bookingDate}T${input.startTime}:00+03:00`);
  const today = new Date(now + 3 * 3600000).toISOString().slice(0, 10);
  const days = (Date.parse(input.bookingDate) - Date.parse(today)) / 86400000;
  if (
    !Number.isFinite(now) ||
    when <= now ||
    !Number.isSafeInteger(s.advance_booking_days) ||
    s.advance_booking_days < 0 ||
    days > s.advance_booking_days
  )
    throw unavailable();
  const [slots] = await c.execute<any[]>(
    `SELECT * FROM booking_time_slots WHERE merchant_id=? AND service_id=? AND staff_id<=>?
    AND slot_date=? AND start_time=? AND end_time=? AND is_available=1 AND is_blocked=0 AND max_bookings=1 AND current_bookings=0 ORDER BY id LIMIT 2 FOR UPDATE`,
    [
      merchantId,
      input.serviceId,
      input.staffId,
      input.bookingDate,
      input.startTime,
      endTime,
    ]
  );
  if (slots.length !== 1) throw unavailable();
  if (s.max_bookings_per_day != null) {
    if (
      !Number.isSafeInteger(s.max_bookings_per_day) ||
      s.max_bookings_per_day < 1
    )
      throw unavailable();
    const [counts] = await c.execute<any[]>(
      `SELECT
      (SELECT COUNT(*) FROM bookings WHERE merchant_id=? AND service_id=? AND booking_date=? AND status IN ('pending','confirmed','in_progress') AND (? IS NULL OR id<>?))+
      (SELECT COUNT(*) FROM appointments WHERE merchant_id=? AND service_id=? AND appointment_date>=? AND appointment_date<DATE_ADD(?,INTERVAL 1 DAY) AND status IN ('pending','confirmed')) AS used`,
      [
        merchantId,
        input.serviceId,
        input.bookingDate,
        excludeBookingId ?? null,
        excludeBookingId ?? null,
        merchantId,
        input.serviceId,
        input.bookingDate,
        input.bookingDate,
      ]
    );
    if (
      Number(counts[0].used) +
        (await rescheduleDailyHolds(
          c,
          merchantId,
          input.serviceId,
          input.bookingDate,
          excludeBookingId
        )) >=
      s.max_bookings_per_day
    )
      throw unavailable();
  }
  if (
    await hasBookingConflict(
      c,
      merchantId,
      {
        ...input,
        staffId: input.staffId ?? undefined,
        endTime,
      },
      excludeBookingId
    )
  )
    throw unavailable();
  return {
    version: 1 as const,
    ...input,
    endTime,
    serviceName: String(s.name),
    staffName,
    durationMinutes: Number(s.duration_minutes),
    priceMinor: Number(s.base_price),
    currency: "SAR" as const,
    serviceVersion: String(s.updated_at),
    advanceDays: s.advance_booking_days,
    maxPerDay: s.max_bookings_per_day,
    slotId: Number(slots[0].id),
    slotVersion: String(slots[0].updated_at),
  };
}
const readSnapshot = readBookingSelectionSnapshot;
type Snapshot = Awaited<ReturnType<typeof readSnapshot>>;
const day = (value: unknown) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
const json = (value: any) =>
  typeof value === "string" ? JSON.parse(value) : value;
/** Lock and fingerprint the old commitment. Financial or calendar effects require assisted changes. */
async function readAmendmentTarget(
  c: PoolConnection,
  input: CheckoutIdentity,
  bookingId: number
) {
  const [bookings] = await c.execute<any[]>(
    "SELECT * FROM bookings WHERE id=? AND merchant_id=? AND customer_phone=? FOR UPDATE",
    [bookingId, input.merchantId, input.customerPhone]
  );
  const b = bookings[0];
  const link = await readBookingCalendarLink(c, input.merchantId, bookingId);
  if (await readActiveBookingReschedule(c, input.merchantId, bookingId))
    throw unavailable();
  let calendar: ReturnType<typeof bookingCalendarProof> | undefined;
  if (link) {
    if (
      !b ||
      b.status !== "confirmed" ||
      link.state !== "synced" ||
      b.google_event_id !== link.event_reference
    )
      throw unavailable();
    const { readBookingCalendarGraph } = await import("../booking-calendar");
    const g = await readBookingCalendarGraph(c, input.merchantId, bookingId);
    if (!g.binding || g.consent.state !== "ready") throw unavailable();
    calendar = bookingCalendarProof(link);
  }
  if (
    !b ||
    !["pending", "confirmed"].includes(b.status) ||
    b.payment_status !== "unpaid" ||
    (b.google_event_id && !calendar) ||
    !b.customer_agreement_id ||
    b.cancelled_at ||
    b.completed_at
  )
    throw unavailable();
  for (const table of [
    "payment_links",
    "booking_checkout_attempts",
    "order_payments",
  ]) {
    const [effects] = await c.execute<any[]>(
      `SELECT id FROM ${table} WHERE booking_id=? LIMIT 1 FOR UPDATE`,
      [bookingId]
    );
    if (effects.length) throw unavailable();
  }
  const [agreements] = await c.execute<any[]>(
    "SELECT * FROM conversation_booking_agreements WHERE id=? AND merchant_id=? AND conversation_id=? AND customer_phone=? AND booking_reference=? AND state='accepted' FOR UPDATE",
    [
      b.customer_agreement_id,
      input.merchantId,
      input.conversationId,
      input.customerPhone,
      bookingId,
    ]
  );
  const a = agreements[0];
  if (!a || !a.consent_message_id) throw unavailable();
  const s = json(a.snapshot);
  if (
    !s ||
    digest(s) !== a.snapshot_hash ||
    s.version !== 1 ||
    s.currency !== "SAR" ||
    s.serviceId !== b.service_id ||
    s.staffId !== b.staff_id ||
    s.bookingDate !== day(b.booking_date) ||
    s.startTime !== b.start_time ||
    s.endTime !== b.end_time ||
    s.durationMinutes !== b.duration_minutes ||
    s.priceMinor !== b.base_price ||
    s.priceMinor !== b.final_price ||
    b.discount_amount !== 0
  )
    throw unavailable();
  const [messages] = await c.execute<any[]>(
    "SELECT id,content FROM messages WHERE conversationId=? AND direction='incoming' AND id IN (?,?) ORDER BY id FOR SHARE",
    [input.conversationId, a.source_message_id, a.consent_message_id]
  );
  if (
    messages.length !== 2 ||
    a.source_message_id >= a.consent_message_id ||
    !isShortAffirmation(String(messages[1].content)) ||
    !(await wasBookingOfferDelivered(
      c,
      { ...input, incomingMessageId: a.consent_message_id },
      a
    ))
  )
    throw unavailable();
  const [clock] = await c.execute<any[]>("SELECT UTC_TIMESTAMP(3) AS now");
  if (
    Date.parse(`${day(b.booking_date)}T${b.start_time}:00+03:00`) <=
    databaseTimeEpoch(clock[0].now)
  )
    throw unavailable();
  return bookingAmendmentFingerprint(b, a.snapshot_hash, calendar);
}
export function bookingAmendmentFingerprint(
  b: any,
  agreementHash: string,
  calendar?: ReturnType<typeof bookingCalendarProof>
) {
  return {
    id: b.id,
    service_id: b.service_id,
    staff_id: b.staff_id,
    booking_date: day(b.booking_date),
    start_time: b.start_time,
    end_time: b.end_time,
    duration_minutes: b.duration_minutes,
    base_price: b.base_price,
    final_price: b.final_price,
    discount_amount: b.discount_amount,
    status: b.status,
    payment_status: b.payment_status,
    customer_agreement_id: b.customer_agreement_id,
    agreement_hash: agreementHash,
    confirmed_at: b.confirmed_at,
    updated_at: b.updated_at,
    notes_hash: digest(b.notes),
    ...(calendar ? { calendar } : {}),
  };
}
function amendmentOfferText(
  id: number,
  s: Snapshot,
  before: Awaited<ReturnType<typeof readAmendmentTarget>>
) {
  return (
    `ملخص تعديل الحجز #${before.id} ${marker(id)}\n\n` +
    `الموعد الحالي: ${before.booking_date}، ${before.start_time}–${before.end_time} بتوقيت الرياض.\n` +
    `التفاصيل الجديدة:\n• الخدمة: ${bookingDisplayLabel(s.serviceName)}\n• التاريخ: ${s.bookingDate}\n• الوقت: ${s.startTime}–${s.endTime} بتوقيت الرياض\n` +
    `• الموظف: ${s.staffName ? bookingDisplayLabel(s.staffName) : "دون موظف محدد"}\n• المدة: ${s.durationMinutes} دقيقة\n• سعر الخدمة: ${formatServicePrice(s.priceMinor)}\n\n` +
    (before.calendar
      ? "يبقى موعدك الحالي مؤكدًا حتى اكتمال النقل. الملخص صالح لمدة 15 دقيقة؛ موافقتك تسجل طلب نقل وتحفظ الفترة الجديدة بانتظار مراجعة النشاط وتحديث التقويم. لن أؤكد الموعد الجديد قبل اكتمال النقل، ولا تُسجل هذه الموافقة دفعًا.\nهل توافق على طلب النقل بهذه التفاصيل؟ رد بنعم، أو اذكر التعديل المطلوب."
      : "يبقى موعدك الحالي محفوظًا حتى موافقتك. الملخص صالح لمدة 15 دقيقة؛ الموافقة تعدّل الحجز نفسه وتعيده لانتظار تأكيد النشاط ومراجعة الرسوم والتقويم الخارجي، ولا تثبت دفعًا.\nهل توافق على تعديل الحجز بهذه التفاصيل؟ رد بنعم، أو اذكر التعديل المطلوب.")
  );
}
function offerText(id: number, s: Snapshot) {
  return (
    `ملخص طلب حجزك ${marker(id)}\n\n• الخدمة: ${bookingDisplayLabel(s.serviceName)}\n• التاريخ: ${s.bookingDate}\n• الوقت: ${s.startTime}–${s.endTime} بتوقيت الرياض\n` +
    (s.staffName ? `• الموظف: ${bookingDisplayLabel(s.staffName)}\n` : "") +
    `• المدة: ${s.durationMinutes} دقيقة\n• سعر الخدمة: ${formatServicePrice(s.priceMinor)}\n\n` +
    "هذا الملخص صالح لمدة 15 دقيقة، ولا يحجز الموعد أو يثبت الدفع. موافقتك تسجل طلبًا بانتظار تأكيد النشاط ومراجعة الرسوم والتقويم الخارجي.\nهل توافق على تسجيل طلب الحجز بهذه التفاصيل؟ رد بنعم، أو اذكر التعديل المطلوب."
  );
}
export async function wasBookingOfferDelivered(
  c: PoolConnection,
  input: CheckoutIdentity,
  row: any
) {
  const [jobs] = await c.execute<any[]>(
    `SELECT incoming_message_id,reply_text,state FROM ai_interaction_jobs WHERE merchant_id=? AND conversation_id=?
    AND incoming_message_id<? ORDER BY incoming_message_id DESC LIMIT 1`,
    [input.merchantId, input.conversationId, input.incomingMessageId]
  );
  const job = jobs[0];
  if (
    !job ||
    job.incoming_message_id !== row.source_message_id ||
    !["pending", "processing", "completed", "failed"].includes(job.state) ||
    job.reply_text !== row.offer_text
  )
    return false;
  const [out] = await c.execute<any[]>(
    "SELECT id,content,aiResponse FROM messages WHERE conversationId=? AND direction='outgoing' AND id<? ORDER BY id DESC LIMIT 1",
    [input.conversationId, input.incomingMessageId]
  );
  return (
    !out[0] ||
    out[0].id < row.source_message_id ||
    (!!out[0].aiResponse && out[0].content === row.offer_text)
  );
}
export async function prepareBookingAgreement(
  input: CheckoutIdentity,
  raw: Selection
) {
  return prepare(input, raw);
}
export async function prepareBookingAmendment(
  input: CheckoutIdentity,
  raw: Selection,
  targetBookingId: number
) {
  return prepare(input, raw, positive(targetBookingId));
}
async function prepare(
  input: CheckoutIdentity,
  raw: Selection,
  targetBookingId?: number
) {
  identity(input);
  const selection = bookingSelectionSchema.parse(raw);
  await assertBookingAgreementSchema();
  await currentInboundExecution()?.assertOwned();
  return withBookingCapacityTransaction(input.merchantId, async c => {
    const source = await assertCheckoutIdentity(c, input);
    if (isSalesRefusal(source.content))
      return { kind: "declined", text: "لن أسجل طلب حجز دون موافقتك." };
    const [existing] = await c.execute<any[]>(
      "SELECT id,state,offer_text,conversation_id,customer_phone,target_booking_id FROM conversation_booking_agreements WHERE merchant_id=? AND source_message_id=?",
      [input.merchantId, input.incomingMessageId]
    );
    if (existing.length) {
      const row = existing[0];
      if (
        row.conversation_id !== input.conversationId ||
        row.customer_phone !== input.customerPhone ||
        row.state !== "proposed" ||
        row.target_booking_id !== (targetBookingId ?? null)
      )
        throw unavailable();
      return {
        kind: "offer",
        agreementId: row.id,
        text: String(row.offer_text),
      };
    }
    const context = await resolveBookingAmendment(
      c,
      input,
      String(source.content)
    );
    // A rescheduling request must never silently create an additional booking.
    if (
      context.requested !== !!targetBookingId ||
      (targetBookingId && context.target?.id !== targetBookingId)
    )
      throw unavailable();
    const before = targetBookingId
      ? await readAmendmentTarget(c, input, targetBookingId)
      : null;
    if (before && selection.serviceId !== before.service_id)
      throw unavailable();
    const snapshot = await readSnapshot(
      c,
      input.merchantId,
      selection,
      targetBookingId
    );
    if (
      before?.calendar &&
      (snapshot.staffId !== before.staff_id ||
        snapshot.priceMinor !== before.final_price ||
        snapshot.durationMinutes !== before.duration_minutes ||
        (snapshot.bookingDate === before.booking_date &&
          snapshot.startTime < before.end_time &&
          snapshot.endTime > before.start_time))
    )
      throw unavailable();
    if (
      before &&
      before.booking_date === snapshot.bookingDate &&
      before.start_time === snapshot.startTime &&
      before.staff_id === snapshot.staffId &&
      before.duration_minutes === snapshot.durationMinutes &&
      before.final_price === snapshot.priceMinor
    )
      throw unavailable();
    await c.execute(
      "UPDATE conversation_booking_agreements SET state='superseded' WHERE merchant_id=? AND conversation_id=? AND state='proposed'",
      [input.merchantId, input.conversationId]
    );
    const [saved] = await c.execute<any>(
      `INSERT INTO conversation_booking_agreements (merchant_id,conversation_id,customer_phone,source_message_id,snapshot,snapshot_hash,target_booking_id,prior_agreement_id,before_snapshot,before_hash,offer_text,expires_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,'',TIMESTAMPADD(MINUTE,15,UTC_TIMESTAMP(3)))`,
      [
        input.merchantId,
        input.conversationId,
        input.customerPhone,
        input.incomingMessageId,
        JSON.stringify(snapshot),
        digest(snapshot),
        targetBookingId ?? null,
        before?.customer_agreement_id ?? null,
        before ? JSON.stringify(before) : null,
        before ? digest(before) : null,
      ]
    );
    const id = positive(Number(saved.insertId)),
      text = before
        ? amendmentOfferText(id, snapshot, before)
        : offerText(id, snapshot);
    await c.execute(
      "UPDATE conversation_booking_agreements SET offer_text=? WHERE id=?",
      [text, id]
    );
    return { kind: "offer", agreementId: id, text };
  });
}
async function recorded(c: PoolConnection, input: CheckoutIdentity, row: any) {
  const [moves] = await c.execute<any[]>(
    "SELECT state FROM booking_calendar_reschedules WHERE merchant_id=? AND agreement_id=?",
    [input.merchantId, row.id]
  );
  if (moves.length && moves[0].state !== "applied")
    return {
      kind: "booking",
      agreementId: row.id,
      bookingId: Number(row.booking_reference),
      text:
        moves[0].state === "abandoned"
          ? `طلب نقل الحجز #${row.booking_reference} ${marker(row.id)} أُغلق دون إرسال النقل. الموعد السابق بقي محفوظًا؛ أي تغيير لاحق يُراجع مع النشاط.`
          : `طلب نقل الحجز #${row.booking_reference} ${marker(row.id)} محفوظ ويحتاج مراجعة نتيجة التقويم من النشاط. لم يثبت نقل الموعد؛ لا تعتمد الموعد الجديد حتى تأكيده.`,
    };
  const [rows] = await c.execute<any[]>(
    "SELECT status,payment_status FROM bookings WHERE id=? AND merchant_id=? AND customer_phone=? FOR UPDATE",
    [row.booking_reference, input.merchantId, input.customerPhone]
  );
  const b = rows[0];
  const state = b
    ? (
        {
          pending: "بانتظار تأكيد النشاط",
          confirmed: "مؤكد لدى النشاط",
          in_progress: "قيد التنفيذ",
          completed: "مكتمل",
          cancelled: "ملغى",
          no_show: "مسجل كعدم حضور",
        } as Record<string, string>
      )[b.status]
    : null;
  return {
    kind: "booking",
    agreementId: row.id,
    bookingId: Number(row.booking_reference),
    text: state
      ? `طلب الحجز #${row.booking_reference} ${marker(row.id)} مسجل بالفعل، وحالته الحالية: ${state}. حالة الدفع تُراجع من سجل الدفع؛ هذه الرسالة لا تؤكد التحصيل.`
      : `مرجع طلب الحجز #${row.booking_reference} ${marker(row.id)} محفوظ، لكن تفاصيله تحتاج مراجعة النشاط. لن أنشئ طلبًا مكررًا.`,
  };
}
export async function acceptBookingAgreement(
  input: CheckoutIdentity,
  agreementId: number
) {
  identity(input);
  positive(agreementId);
  await assertBookingAgreementSchema();
  await currentInboundExecution()?.assertOwned();
  return withBookingCapacityTransaction(input.merchantId, async c => {
    const source = await assertCheckoutIdentity(c, input);
    const [rows] = await c.execute<any[]>(
      `SELECT *,expires_at>UTC_TIMESTAMP(3) AS valid FROM conversation_booking_agreements
      WHERE id=? AND merchant_id=? AND conversation_id=? AND customer_phone=? FOR UPDATE`,
      [agreementId, input.merchantId, input.conversationId, input.customerPhone]
    );
    const row = rows[0];
    if (!row) throw unavailable();
    if (row.booking_reference) {
      if (isSalesRefusal(source.content))
        return {
          kind: "clarify",
          text: `طلب الحجز #${row.booking_reference} مسجل. يلزم مراجعة النشاط قبل تأكيد إلغائه.`,
        };
      return recorded(c, input, row);
    }
    if (isSalesRefusal(source.content)) {
      if (row.state === "proposed")
        await c.execute(
          "UPDATE conversation_booking_agreements SET state='declined' WHERE id=?",
          [agreementId]
        );
      return {
        kind: "declined",
        text: row.target_booking_id
          ? "لم أطبّق هذا التعديل؛ بقي حجزك الحالي كما هو."
          : "لن أسجل طلبًا بناءً على هذا الملخص. يمكنك طلب موعد جديد متى رغبت.",
      };
    }
    if (!isShortAffirmation(source.content))
      return {
        kind: "clarify",
        text: "لن أسجل الحجز بعد تعديل أو سؤال. اذكر التفاصيل المطلوبة لأعرض ملخصًا جديدًا، ثم وافق عليه صراحة.",
      };
    const [latest] = await c.execute<any[]>(
      "SELECT id FROM conversation_booking_agreements WHERE merchant_id=? AND conversation_id=? ORDER BY id DESC LIMIT 1",
      [input.merchantId, input.conversationId]
    );
    if (
      !row.valid ||
      row.state !== "proposed" ||
      latest[0]?.id !== agreementId ||
      row.source_message_id >= input.incomingMessageId ||
      !(await wasBookingOfferDelivered(c, input, row))
    )
      return {
        kind: "clarify",
        text: "أحتاج موافقتك على آخر ملخص حجز أُرسل لك وما زال صالحًا. اطلب ملخصًا جديدًا للمراجعة.",
      };
    const old =
      typeof row.snapshot === "string"
        ? JSON.parse(row.snapshot)
        : row.snapshot;
    if (digest(old) !== row.snapshot_hash) throw unavailable();
    let fresh: Snapshot;
    try {
      if (row.target_booking_id) {
        const before = json(row.before_snapshot);
        if (
          !before ||
          digest(before) !== row.before_hash ||
          before.id !== row.target_booking_id ||
          before.customer_agreement_id !== row.prior_agreement_id
        )
          throw unavailable();
        const current = await readAmendmentTarget(
          c,
          input,
          row.target_booking_id
        );
        if (
          digest(current) !== row.before_hash ||
          old.serviceId !== current.service_id
        )
          throw unavailable();
      } else if (
        row.prior_agreement_id ||
        row.before_snapshot ||
        row.before_hash
      )
        throw unavailable();
      fresh = await readSnapshot(
        c,
        input.merchantId,
        {
          serviceId: old.serviceId,
          staffId: old.staffId,
          bookingDate: old.bookingDate,
          startTime: old.startTime,
        },
        row.target_booking_id ?? undefined
      );
    } catch (error) {
      // A storage failure must roll back, never masquerade as changed availability.
      if (
        !(error instanceof BookingAgreementUnavailableError) &&
        !(error instanceof BookingCapacityUnavailableError)
      )
        throw error;
      await c.execute(
        "UPDATE conversation_booking_agreements SET state='expired' WHERE id=?",
        [agreementId]
      );
      return {
        kind: "changed",
        text: row.target_booking_id
          ? "تغيرت حالة الحجز أو توفر الموعد أو شروط الخدمة. لم أطبّق التعديل؛ نحتاج مراجعة وملخصًا جديدًا بموافقتك."
          : "تغير توفر الموعد أو شروط الخدمة. نحتاج ملخصًا محدثًا وموافقة جديدة قبل تسجيل الحجز.",
      };
    }
    if (digest(fresh) !== row.snapshot_hash) {
      await c.execute(
        "UPDATE conversation_booking_agreements SET state='expired' WHERE id=?",
        [agreementId]
      );
      return {
        kind: "changed",
        text: "تغيرت تفاصيل الخدمة أو سعرها. سأحتاج موافقتك على ملخص جديد؛ لم أسجل طلبًا بالتفاصيل المعدلة.",
      };
    }
    await currentInboundExecution()?.assertOwned();
    if (row.target_booking_id && json(row.before_snapshot).calendar) {
      const snapshot = {
        before: json(row.before_snapshot),
        after: fresh,
        agreementId,
        consentId: input.incomingMessageId,
      };
      const calendar = snapshot.before.calendar;
      await assertCalendarRescheduleCapacity(
        c,
        input.merchantId,
        {
          id: calendar.integrationId,
          calendarId: calendar.calendarId,
          identity: calendar.identityHash,
        },
        fresh.bookingDate,
        fresh.startTime,
        fresh.endTime,
        row.target_booking_id
      );
      await c.execute(
        `INSERT INTO booking_calendar_reschedules (merchant_id,booking_reference,agreement_id,service_id,staff_id,booking_date,start_time,end_time,snapshot,snapshot_hash) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          input.merchantId,
          row.target_booking_id,
          agreementId,
          fresh.serviceId,
          fresh.staffId,
          fresh.bookingDate,
          fresh.startTime,
          fresh.endTime,
          JSON.stringify(snapshot),
          digest(snapshot),
        ]
      );
      await c.execute(
        "UPDATE conversation_booking_agreements SET state='accepted',consent_message_id=?,booking_reference=? WHERE id=?",
        [input.incomingMessageId, row.target_booking_id, agreementId]
      );
      await c.execute(
        "UPDATE booking_calendar_links SET state='reschedule_pending',revision=revision+1 WHERE merchant_id=? AND booking_reference=?",
        [input.merchantId, row.target_booking_id]
      );
      return {
        kind: "booking",
        agreementId,
        bookingId: Number(row.target_booking_id),
        text: `تم تسجيل طلب نقل الحجز #${row.target_booking_id} ${marker(agreementId)} بالتفاصيل التي وافقت عليها. الموعد الحالي ما زال مؤكدًا، والفترة الجديدة محفوظة بانتظار مراجعة النشاط وتحديث التقويم؛ لم يثبت النقل أو الدفع بعد.`,
      };
    }
    const bookingId =
      row.target_booking_id ??
      (await createBookingInCapacityTransaction(c, {
        merchantId: input.merchantId,
        serviceId: fresh.serviceId,
        staffId: fresh.staffId ?? undefined,
        customerPhone: input.customerPhone,
        customerName: source.customerName,
        bookingDate: fresh.bookingDate,
        startTime: fresh.startTime,
        endTime: fresh.endTime,
        durationMinutes: fresh.durationMinutes,
        basePrice: fresh.priceMinor,
        finalPrice: fresh.priceMinor,
        bookingSource: "whatsapp",
        notes: `Customer booking agreement ${marker(agreementId)}; final confirmation and billing review required.`,
      }));
    if (row.target_booking_id) {
      const [updated] = await c.execute<any>(
        `UPDATE bookings SET staff_id=?,booking_date=?,start_time=?,end_time=?,duration_minutes=?,base_price=?,final_price=?,
        status='pending',confirmed_at=NULL WHERE id=? AND merchant_id=? AND customer_agreement_id=?`,
        [
          fresh.staffId,
          fresh.bookingDate,
          fresh.startTime,
          fresh.endTime,
          fresh.durationMinutes,
          fresh.priceMinor,
          fresh.priceMinor,
          bookingId,
          input.merchantId,
          row.prior_agreement_id,
        ]
      );
      if (updated.affectedRows !== 1) throw unavailable();
    }
    await c.execute(
      "UPDATE bookings SET customer_agreement_id=? WHERE id=? AND merchant_id=?",
      [agreementId, bookingId, input.merchantId]
    );
    await c.execute(
      "UPDATE conversation_booking_agreements SET state='accepted',consent_message_id=?,booking_reference=? WHERE id=?",
      [input.incomingMessageId, bookingId, agreementId]
    );
    return {
      kind: "booking",
      agreementId,
      bookingId,
      text: row.target_booking_id
        ? `تم تعديل الحجز #${bookingId} ${marker(agreementId)} بالتفاصيل التي وافقت عليها، دون إنشاء حجز إضافي. الموعد الجديد بانتظار تأكيد النشاط ومراجعة الرسوم والتقويم الخارجي، ولم يُسجل أي دفع.`
        : `تم تسجيل طلب حجزك #${bookingId} ${marker(agreementId)} بالتفاصيل التي وافقت عليها. الطلب بانتظار تأكيد النشاط ومراجعة الرسوم والتقويم الخارجي، ولم يُسجل أي دفع.`,
    };
  });
}
