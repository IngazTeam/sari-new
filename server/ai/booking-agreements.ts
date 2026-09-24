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
  Array.isArray(value)
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
class BookingAgreementUnavailableError extends Error {
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
  await assertRuntimeSchema(
    "conversation booking agreements",
    [
      {
        table: "conversation_booking_agreements",
        columns: [
          "conversation_id",
          "customer_phone",
          "source_message_id",
          "consent_message_id",
          "booking_reference",
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
          {
            name: "uq_conversation_booking_result",
            columns: ["merchant_id", "booking_reference"],
          },
        ],
      },
    ],
    { cacheSuccess: false }
  );
}
/** Only explicitly configured, single-capacity, fixed-price appointments enter this automatic path. */
async function readSnapshot(
  c: PoolConnection,
  merchantId: number,
  raw: Selection
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
      (SELECT COUNT(*) FROM bookings WHERE merchant_id=? AND service_id=? AND booking_date=? AND status IN ('pending','confirmed','in_progress'))+
      (SELECT COUNT(*) FROM appointments WHERE merchant_id=? AND service_id=? AND appointment_date>=? AND appointment_date<DATE_ADD(?,INTERVAL 1 DAY) AND status IN ('pending','confirmed')) AS used`,
      [
        merchantId,
        input.serviceId,
        input.bookingDate,
        merchantId,
        input.serviceId,
        input.bookingDate,
        input.bookingDate,
      ]
    );
    if (Number(counts[0].used) >= s.max_bookings_per_day) throw unavailable();
  }
  if (
    await hasBookingConflict(c, merchantId, {
      ...input,
      staffId: input.staffId ?? undefined,
      endTime,
    })
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
type Snapshot = Awaited<ReturnType<typeof readSnapshot>>;
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
  identity(input);
  const selection = bookingSelectionSchema.parse(raw);
  await assertBookingAgreementSchema();
  await currentInboundExecution()?.assertOwned();
  return withBookingCapacityTransaction(input.merchantId, async c => {
    const source = await assertCheckoutIdentity(c, input);
    if (isSalesRefusal(source.content))
      return { kind: "declined", text: "لن أسجل طلب حجز دون موافقتك." };
    const [existing] = await c.execute<any[]>(
      "SELECT id,state,offer_text,conversation_id,customer_phone FROM conversation_booking_agreements WHERE merchant_id=? AND source_message_id=?",
      [input.merchantId, input.incomingMessageId]
    );
    if (existing.length) {
      const row = existing[0];
      if (
        row.conversation_id !== input.conversationId ||
        row.customer_phone !== input.customerPhone ||
        row.state !== "proposed"
      )
        throw unavailable();
      return {
        kind: "offer",
        agreementId: row.id,
        text: String(row.offer_text),
      };
    }
    const snapshot = await readSnapshot(c, input.merchantId, selection);
    await c.execute(
      "UPDATE conversation_booking_agreements SET state='superseded' WHERE merchant_id=? AND conversation_id=? AND state='proposed'",
      [input.merchantId, input.conversationId]
    );
    const [saved] = await c.execute<any>(
      `INSERT INTO conversation_booking_agreements (merchant_id,conversation_id,customer_phone,source_message_id,snapshot,snapshot_hash,offer_text,expires_at)
      VALUES (?,?,?,?,?,?,'',TIMESTAMPADD(MINUTE,15,UTC_TIMESTAMP(3)))`,
      [
        input.merchantId,
        input.conversationId,
        input.customerPhone,
        input.incomingMessageId,
        JSON.stringify(snapshot),
        digest(snapshot),
      ]
    );
    const id = positive(Number(saved.insertId)),
      text = offerText(id, snapshot);
    await c.execute(
      "UPDATE conversation_booking_agreements SET offer_text=? WHERE id=?",
      [text, id]
    );
    return { kind: "offer", agreementId: id, text };
  });
}
async function recorded(c: PoolConnection, input: CheckoutIdentity, row: any) {
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
        text: "لن أسجل طلبًا بناءً على هذا الملخص. يمكنك طلب موعد جديد متى رغبت.",
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
      fresh = await readSnapshot(c, input.merchantId, {
        serviceId: old.serviceId,
        staffId: old.staffId,
        bookingDate: old.bookingDate,
        startTime: old.startTime,
      });
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
        text: "تغير توفر الموعد أو شروط الخدمة. نحتاج ملخصًا محدثًا وموافقة جديدة قبل تسجيل الحجز.",
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
    const bookingId = await createBookingInCapacityTransaction(c, {
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
    });
    await c.execute(
      "UPDATE conversation_booking_agreements SET state='accepted',consent_message_id=?,booking_reference=? WHERE id=?",
      [input.incomingMessageId, bookingId, agreementId]
    );
    return {
      kind: "booking",
      agreementId,
      bookingId,
      text: `تم تسجيل طلب حجزك #${bookingId} ${marker(agreementId)} بالتفاصيل التي وافقت عليها. الطلب بانتظار تأكيد النشاط ومراجعة الرسوم والتقويم الخارجي، ولم يُسجل أي دفع.`,
    };
  });
}
