import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import {
  bookingAgreementDigest,
  assertBookingAgreementSchema,
} from "./ai/booking-agreements";
import { isSalesRefusal, isShortAffirmation } from "./ai/customer-decision";
import {
  withBookingCapacityTransaction,
  hasBookingConflict,
  validateBookingStaff,
  BookingCapacityUnavailableError,
} from "./booking-capacity";
import { databaseTimeEpoch } from "./db/time";
import type {
  BookingConsentReview,
  BookingConsentMessage,
} from "../shared/booking-consent-review";

const positive = (value: number) =>
  z.number().int().positive().safe().parse(value);
const day = (value: unknown) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value).slice(0, 10);
const termsSchema = z.object({
  version: z.literal(1),
  serviceId: z.number().int().positive(),
  staffId: z.number().int().positive().nullable(),
  serviceName: z.string(),
  staffName: z.string().nullable(),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  durationMinutes: z.number().int().positive(),
  priceMinor: z.number().int().nonnegative(),
  currency: z.literal("SAR"),
  slotId: z.number().int().positive(),
});
const empty = (): BookingConsentReview => ({
  state: "none",
  reason: null,
  agreementId: null,
  evidence: null,
  offerText: null,
  source: null,
  consent: null,
  latest: null,
  refusal: null,
  terms: null,
});
const message = (row: any): BookingConsentMessage | null =>
  row
    ? {
        id: Number(row.id),
        text: String(row.content ?? "").slice(0, 8000),
        at: new Date(databaseTimeEpoch(row.createdAt)).toISOString(),
        truncated: String(row.content ?? "").length > 8000,
      }
    : null;
/** Caller holds the merchant capacity transaction and the booking row. Never performs network effects. */
export async function readBookingConsentReview(
  c: PoolConnection,
  merchantId: number,
  booking: any
): Promise<BookingConsentReview> {
  const [rows] = await c.execute<any[]>(
    "SELECT * FROM conversation_booking_agreements WHERE merchant_id=? AND booking_reference=? ORDER BY id LIMIT 2 FOR UPDATE",
    [merchantId, booking.id]
  );
  if (!rows.length && booking.customer_agreement_id == null) return empty();
  const result = empty(),
    row = rows[0];
  const blocked = (reason: BookingConsentReview["reason"]) => ({
    ...result,
    state: "blocked" as const,
    reason,
    evidence: null,
  });
  if (
    rows.length !== 1 ||
    row.merchant_id !== merchantId ||
    row.id !== booking.customer_agreement_id ||
    row.customer_phone !== booking.customer_phone
  )
    return blocked("missing");
  result.agreementId = row.id;
  if (row.state !== "accepted" || !row.consent_message_id)
    return blocked("integrity");
  let raw: unknown;
  try {
    raw =
      typeof row.snapshot === "string"
        ? JSON.parse(row.snapshot)
        : row.snapshot;
  } catch {
    return blocked("integrity");
  }
  const parsed = termsSchema.safeParse(raw);
  if (!parsed.success || bookingAgreementDigest(raw) !== row.snapshot_hash)
    return blocked("integrity");
  const terms = parsed.data;
  result.offerText = String(row.offer_text).slice(0, 16000);
  result.terms = {
    serviceName: terms.serviceName,
    staffName: terms.staffName,
    bookingDate: terms.bookingDate,
    startTime: terms.startTime,
    endTime: terms.endTime,
    durationMinutes: terms.durationMinutes,
    amountMinor: terms.priceMinor,
    currency: terms.currency,
  };
  const [conversations] = await c.execute<any[]>(
    "SELECT id,customerPhone FROM conversations WHERE id=? AND merchantId=? FOR UPDATE",
    [row.conversation_id, merchantId]
  );
  if (
    conversations.length !== 1 ||
    conversations[0].customerPhone !== row.customer_phone
  )
    return blocked("source");
  const [messages] = await c.execute<any[]>(
    "SELECT id,direction,content,createdAt FROM messages WHERE conversationId=? AND id IN (?,?) ORDER BY id FOR SHARE",
    [row.conversation_id, row.source_message_id, row.consent_message_id]
  );
  const source = messages.find(m => m.id === row.source_message_id),
    consent = messages.find(m => m.id === row.consent_message_id);
  const [latest] = await c.execute<any[]>(
    "SELECT id,direction,content,createdAt FROM messages WHERE conversationId=? AND direction='incoming' ORDER BY id DESC LIMIT 1 FOR SHARE",
    [row.conversation_id]
  );
  result.source = message(source);
  result.consent = message(consent);
  result.latest = message(latest[0]);
  if (
    !source ||
    !consent ||
    source.direction !== "incoming" ||
    consent.direction !== "incoming" ||
    source.id >= consent.id ||
    !isShortAffirmation(String(consent.content)) ||
    !latest.length
  )
    return blocked("source");
  const [jobs] = await c.execute<any[]>(
    "SELECT incoming_message_id,reply_text,state FROM ai_interaction_jobs WHERE merchant_id=? AND conversation_id=? AND incoming_message_id<? ORDER BY incoming_message_id DESC LIMIT 1 FOR SHARE",
    [merchantId, row.conversation_id, consent.id]
  );
  if (
    jobs.length !== 1 ||
    jobs[0].incoming_message_id !== source.id ||
    jobs[0].reply_text !== row.offer_text ||
    !["pending", "processing", "completed", "failed"].includes(jobs[0].state)
  )
    return blocked("source");
  if (
    [result.source, result.consent, result.latest].some(m => m?.truncated) ||
    String(row.offer_text).length > 16000
  )
    return blocked("truncated");
  const [subsequent] = await c.execute<any[]>(
    "SELECT id,content,createdAt FROM messages WHERE conversationId=? AND direction='incoming' AND id>? ORDER BY id DESC LIMIT 101 FOR SHARE",
    [row.conversation_id, consent.id]
  );
  if (subsequent.length > 100) return blocked("truncated");
  const refusal = subsequent.find(m => isSalesRefusal(String(m.content)));
  if (refusal) {
    result.refusal = message(refusal);
    return blocked("refused");
  }
  if (
    booking.service_id !== terms.serviceId ||
    booking.staff_id !== terms.staffId ||
    day(booking.booking_date) !== terms.bookingDate ||
    booking.start_time !== terms.startTime ||
    booking.end_time !== terms.endTime ||
    booking.duration_minutes !== terms.durationMinutes ||
    booking.base_price !== terms.priceMinor ||
    booking.final_price !== terms.priceMinor ||
    booking.discount_amount !== 0
  )
    return blocked("terms");
  const [services] = await c.execute<any[]>(
    "SELECT * FROM services WHERE id=? AND merchant_id=? FOR SHARE",
    [terms.serviceId, merchantId]
  );
  const [slots] = await c.execute<any[]>(
    "SELECT * FROM booking_time_slots WHERE id=? AND merchant_id=? FOR SHARE",
    [terms.slotId, merchantId]
  );
  const [clock] = await c.execute<any[]>("SELECT UTC_TIMESTAMP(3) AS now");
  const s = services[0],
    slot = slots[0];
  if (
    !s ||
    s.is_active !== 1 ||
    s.requires_appointment !== 1 ||
    s.buffer_time_minutes !== 0 ||
    !slot ||
    slot.is_available !== 1 ||
    slot.is_blocked !== 0 ||
    slot.max_bookings !== 1 ||
    slot.current_bookings !== 0 ||
    slot.service_id !== terms.serviceId ||
    slot.staff_id !== terms.staffId ||
    day(slot.slot_date) !== terms.bookingDate ||
    slot.start_time !== terms.startTime ||
    slot.end_time !== terms.endTime ||
    Date.parse(`${terms.bookingDate}T${terms.startTime}:00+03:00`) <=
      databaseTimeEpoch(clock[0].now)
  )
    return blocked("unavailable");
  try {
    await validateBookingStaff(c, merchantId, s, terms.staffId);
  } catch (error) {
    if (error instanceof BookingCapacityUnavailableError)
      return blocked("unavailable");
    throw error;
  }
  if (
    await hasBookingConflict(
      c,
      merchantId,
      {
        serviceId: terms.serviceId,
        staffId: terms.staffId ?? undefined,
        bookingDate: terms.bookingDate,
        startTime: terms.startTime,
        endTime: terms.endTime,
      },
      booking.id
    )
  )
    return blocked("unavailable");
  return {
    ...result,
    state: "ready",
    evidence: bookingAgreementDigest({
      booking,
      row,
      source,
      consent,
      latest: latest[0],
      subsequent,
      delivery: jobs[0],
      service: s,
      slot,
    }),
  };
}
export async function getBookingConsentReview(
  merchantId: number,
  bookingId: number
) {
  positive(merchantId);
  positive(bookingId);
  await assertBookingAgreementSchema();
  return withBookingCapacityTransaction(merchantId, async c => {
    const [rows] = await c.execute<any[]>(
      "SELECT * FROM bookings WHERE id=? AND merchant_id=? FOR UPDATE",
      [bookingId, merchantId]
    );
    if (rows.length !== 1) throw Error("Booking consent unavailable");
    return readBookingConsentReview(c, merchantId, rows[0]);
  });
}
