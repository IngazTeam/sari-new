import { randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { getPool } from "./db/connection";
import { databaseTimeEpoch } from "./db/time";
import { assertRuntimeSchema } from "./db/schema-readiness";
import { withBookingCapacityTransaction } from "./booking-capacity";
import { bookingAgreementDigest as hash } from "./ai/booking-agreements";
import { privateSalesPhone } from "./ai/sales-offer-authority";
import { followupPhoneForms } from "./ai/followup-send-guard";
import { sendMerchantWhatsApp } from "./channels/whatsapp/service";
import type {
  SendMerchantWhatsAppInput,
  WhatsAppProviderConfig,
} from "./channels/whatsapp/types";

const parse = (v: any) => {
  try {
    return typeof v === "string" ? JSON.parse(v) : v;
  } catch {
    return null;
  }
};
const positive = (v: number) => {
  if (!Number.isSafeInteger(v) || v <= 0)
    throw Error("Invalid notification identity");
};
export const bookingNoticeKey = (merchantId: number, id: number) =>
  `booking_notice:${merchantId}:${id}`;
export type BookingNoticeGuard = { id: number; token: string };

export async function assertBookingNotificationSchema() {
  await assertRuntimeSchema(
    "Booking result notifications",
    [
      {
        table: "booking_notification_reviews",
        columns: [
          "notification_id",
          "booking_reference",
          "actor_user_id",
          "request_id",
          "request_hash",
          "evidence_hash",
          "outcome",
          "delivery_state",
          "projected",
          "reason",
          "created_at",
        ],
        uniqueIndexes: [
          {
            name: "uq_booking_notice_review_request",
            columns: ["merchant_id", "request_id"],
          },
        ],
      },
      {
        table: "booking_reschedule_notifications",
        columns: [
          "kind",
          "cancellation_id",
          "confirmation_id",
          "reschedule_id",
          "snapshot",
          "snapshot_hash",
          "dispatch_text",
          "claim_token",
          "dispatch_started_at",
          "delivery_state",
          "projection_message_id",
          "next_check_at",
        ],
        uniqueIndexes: [
          {
            name: "uq_booking_notice_move",
            columns: ["merchant_id", "reschedule_id"],
          },
          {
            name: "uq_booking_notice_cancel",
            columns: ["merchant_id", "cancellation_id"],
          },
          {
            name: "uq_booking_notice_confirm",
            columns: ["merchant_id", "confirmation_id"],
          },
        ],
        checkConstraints: [
          {
            name: "chk_booking_notice_kind",
            expression:
              "(kind='reschedule' AND reschedule_id IS NOT NULL AND cancellation_id IS NULL AND confirmation_id IS NULL) OR (kind='cancellation' AND cancellation_id IS NOT NULL AND reschedule_id IS NULL AND confirmation_id IS NULL) OR (kind='confirmation' AND confirmation_id IS NOT NULL AND reschedule_id IS NULL AND cancellation_id IS NULL)",
          },
        ],
      },
    ],
    { cacheSuccess: false }
  );
}
const message = (s: any) =>
  s.version === 3
    ? `تم تأكيد حجزك #${s.bookingId} وتسجيل الموعد لدى النشاط.\nالموعد: ${s.payload.date}، من ${s.payload.startTime} إلى ${s.payload.endTime} بتوقيت الرياض.\nهذا تأكيد للموعد، وليس إيصال دفع. احتفظ برقم الحجز عند التواصل معنا.`
    : s.version === 2
      ? `تم إلغاء حجزك #${s.bookingId} لدى النشاط بناءً على طلبك.\nالموعد الملغى: ${s.commitment.payload.date}، من ${s.commitment.payload.startTime} إلى ${s.commitment.payload.endTime} بتوقيت الرياض.\nهذا الموعد لم يعد قائمًا. احتفظ برقم الحجز عند التواصل معنا.`
      : `تم نقل حجزك #${s.bookingId} وتأكيد الموعد الجديد لدى النشاط.\nالموعد الجديد: ${s.after.bookingDate}، من ${s.after.startTime} إلى ${s.after.endTime} بتوقيت الرياض.\nالموعد السابق ${s.before.booking_date}، من ${s.before.start_time} إلى ${s.before.end_time} لم يعد موعد هذا الحجز.\nاحتفظ برقم الحجز عند التواصل معنا.`;
function intact(r: any, s: any): boolean {
  try {
    return (
      ((s?.version === 1 &&
        r.kind === "reschedule" &&
        r.confirmation_id === null &&
        r.cancellation_id === null &&
        s.moveId === r.reschedule_id) ||
        (s?.version === 2 &&
          r.kind === "cancellation" &&
          r.confirmation_id === null &&
          r.reschedule_id === null &&
          s.cancellationId === r.cancellation_id) ||
        (s?.version === 3 &&
          r.kind === "confirmation" &&
          r.reschedule_id === null &&
          r.cancellation_id === null &&
          s.confirmationId === r.confirmation_id)) &&
      hash(s) === r.snapshot_hash &&
      s.merchantId === r.merchant_id &&
      s.bookingId === r.booking_reference &&
      privateSalesPhone(s.phone) === s.phone &&
      r.dispatch_text === message(s)
    );
  } catch {
    return false;
  }
}

async function sourceChannel(
  c: PoolConnection,
  merchantId: number,
  externalId: string | null,
  phone: string | null
) {
  const [accounts] = await c.execute<any[]>(
    `SELECT j.id AS source_job_id,j.payload_json,i.id,i.provider,i.instance_id,i.phone_number_id,i.provider_account_id
    FROM whatsapp_inbound_jobs j JOIN whatsapp_instances i ON i.id=j.instance_id AND i.merchant_id=j.merchant_id
    WHERE j.merchant_id=? AND CONCAT('inbound:v1:',j.event_key)=? LIMIT 2`,
    [merchantId, externalId]
  );
  const account = accounts.length === 1 ? accounts[0] : null,
    envelope = parse(account?.payload_json);
  const channel =
    account &&
    envelope?.sourceProvider === account.provider &&
    String(envelope?.instanceData?.idInstance) === account.instance_id &&
    /@(?:c\.us|s\.whatsapp\.net)$/.test(envelope?.senderData?.chatId || "") &&
    privateSalesPhone(
      String(envelope.senderData.chatId).replace("@s.whatsapp.net", "@c.us")
    ) === phone
      ? {
          id: account.id,
          sourceJobId: account.source_job_id,
          provider: account.provider,
          account: account.instance_id,
          phoneNumberId: account.phone_number_id,
          providerAccountId: account.provider_account_id,
        }
      : null;
  return channel;
}

/** Caller owns the successful move transaction. No send or best-effort enqueue here. */
export async function enqueueBookingRescheduleNotice(
  c: PoolConnection,
  merchantId: number,
  moveId: number
) {
  const [rows] = await c.execute<any[]>(
    `SELECT r.*,a.conversation_id,a.consent_message_id,a.customer_phone,m.content,m.externalId,c.handoff_version
    FROM booking_calendar_reschedules r JOIN conversation_booking_agreements a ON a.id=r.agreement_id AND a.merchant_id=r.merchant_id
    JOIN conversations c ON c.id=a.conversation_id AND c.merchantId=r.merchant_id
    JOIN messages m ON m.id=a.consent_message_id AND m.conversationId=c.id AND m.direction='incoming'
    WHERE r.merchant_id=? AND r.id=? AND r.state='applied'`,
    [merchantId, moveId]
  );
  const r = rows[0],
    saved = parse(r?.snapshot);
  if (!r || hash(saved) !== r.snapshot_hash)
    throw Error("Notification commitment unavailable");
  const phone = privateSalesPhone(r.customer_phone);
  const channel = await sourceChannel(c, merchantId, r.externalId, phone);
  const snapshot = {
    version: 1,
    merchantId,
    moveId,
    bookingId: r.booking_reference,
    agreementId: r.agreement_id,
    conversationId: r.conversation_id,
    sourceId: r.consent_message_id,
    sourceHash: hash(r.content),
    phone,
    handoffVersion: r.handoff_version,
    channel,
    before: saved.before,
    after: saved.after,
  };
  await storeNotice(c, snapshot);
}

async function storeNotice(c: PoolConnection, s: any) {
  const kind =
    s.version === 1
      ? "reschedule"
      : s.version === 2
        ? "cancellation"
        : "confirmation";
  await c.execute(
    `INSERT INTO booking_reschedule_notifications (merchant_id,kind,reschedule_id,cancellation_id,confirmation_id,booking_reference,snapshot,snapshot_hash,dispatch_text,state,last_error,next_check_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,IF(?=1,UTC_TIMESTAMP(3),NULL))`,
    [
      s.merchantId,
      kind,
      s.moveId ?? null,
      s.cancellationId ?? null,
      s.confirmationId ?? null,
      s.bookingId,
      JSON.stringify(s),
      hash(s),
      message(s),
      s.channel && s.phone ? "pending" : "manual_review",
      s.channel && s.phone ? null : "source_channel_missing",
      s.channel && s.phone ? 1 : 0,
    ]
  );
}

/** Enqueue only within the verified cancellation's local completion transaction. */
export async function enqueueBookingCancellationNotice(
  c: PoolConnection,
  merchantId: number,
  cancellationId: number
) {
  const [rows] = await c.execute<any[]>(
    `SELECT r.*,a.id AS agreement_id,a.conversation_id,a.customer_phone,a.snapshot_hash AS agreement_hash,c.handoff_version
    FROM booking_calendar_cancellations r JOIN bookings b ON b.id=r.booking_reference AND b.merchant_id=r.merchant_id AND b.status='cancelled'
    JOIN conversation_booking_agreements a ON a.id=b.customer_agreement_id AND a.merchant_id=b.merchant_id AND a.booking_reference=b.id AND a.state='accepted'
    JOIN conversations c ON c.id=a.conversation_id AND c.merchantId=a.merchant_id AND c.customerPhone=b.customer_phone
    WHERE r.id=? AND r.merchant_id=? AND r.state='cancelled'`,
    [cancellationId, merchantId]
  );
  const r = rows[0],
    saved = parse(r?.snapshot);
  if (
    !r ||
    hash(saved) !== r.snapshot_hash ||
    saved?.commitment?.booking?.id !== r.booking_reference ||
    saved.commitment.booking.merchantId !== merchantId
  )
    throw Error("Cancellation notification commitment unavailable");
  const [messages] = await c.execute<any[]>(
    "SELECT content,externalId FROM messages WHERE id=? AND conversationId=? AND direction='incoming'",
    [saved.request.id, r.conversation_id]
  );
  if (messages.length !== 1 || messages[0].content !== saved.request.text)
    throw Error("Cancellation source unavailable");
  const phone = privateSalesPhone(r.customer_phone),
    channel = await sourceChannel(c, merchantId, messages[0].externalId, phone);
  await storeNotice(c, {
    version: 2,
    merchantId,
    cancellationId,
    bookingId: r.booking_reference,
    agreementId: r.agreement_id,
    agreementHash: r.agreement_hash,
    conversationId: r.conversation_id,
    sourceId: saved.request.id,
    sourceHash: hash(saved.request.text),
    phone,
    handoffVersion: r.handoff_version,
    channel,
    cancellationHash: r.snapshot_hash,
    commitment: saved.commitment,
  });
}

/** The first verified calendar synchronization owns this atomic enqueue. */
export async function enqueueBookingConfirmationNotice(
  c: PoolConnection,
  merchantId: number,
  confirmationId: number
) {
  const [existing] = await c.execute<any[]>(
    "SELECT id FROM booking_reschedule_notifications WHERE merchant_id=? AND confirmation_id=? FOR UPDATE",
    [merchantId, confirmationId]
  );
  // A later verification must never replace or requeue the original notification.
  if (existing.length) return;
  const [previous] = await c.execute<any[]>(
    `SELECT r.id FROM booking_calendar_reviews r JOIN booking_calendar_links l
      ON l.merchant_id=r.merchant_id AND l.booking_reference=r.booking_reference
      WHERE l.merchant_id=? AND l.id=? AND r.outcome='synced' LIMIT 1`,
    [merchantId, confirmationId]
  );
  // Preserve historical confirmations: verifying an older booking is not a new send request.
  if (previous.length) return;
  const [rows] = await c.execute<any[]>(
    `SELECT l.*,b.base_price,b.final_price,b.discount_amount,a.snapshot_hash AS agreement_hash,
      a.conversation_id,a.consent_message_id,a.customer_phone,m.content,m.externalId,c.handoff_version
    FROM booking_calendar_links l JOIN bookings b ON b.id=l.booking_reference AND b.merchant_id=l.merchant_id AND b.status='confirmed' AND b.google_event_id=l.event_reference
    JOIN conversation_booking_agreements a ON a.id=l.agreement_id AND a.id=b.customer_agreement_id AND a.merchant_id=b.merchant_id AND a.booking_reference=b.id AND a.state='accepted'
    JOIN conversations c ON c.id=a.conversation_id AND c.merchantId=a.merchant_id AND c.customerPhone=b.customer_phone
    JOIN messages m ON m.id=a.consent_message_id AND m.conversationId=c.id AND m.direction='incoming'
    WHERE l.id=? AND l.merchant_id=? AND l.state='synced'`,
    [confirmationId, merchantId]
  );
  const r = rows[0],
    saved = parse(r?.payload);
  if (
    !r ||
    hash(saved) !== r.payload_hash ||
    saved?.bookingId !== r.booking_reference ||
    saved.agreementId !== r.agreement_id
  )
    throw Error("Confirmation notification commitment unavailable");
  const phone = privateSalesPhone(r.customer_phone),
    channel = await sourceChannel(c, merchantId, r.externalId, phone);
  await storeNotice(c, {
    version: 3,
    merchantId,
    confirmationId,
    bookingId: r.booking_reference,
    agreementId: r.agreement_id,
    agreementHash: r.agreement_hash,
    conversationId: r.conversation_id,
    sourceId: r.consent_message_id,
    sourceHash: hash(r.content),
    phone,
    handoffVersion: r.handoff_version,
    channel,
    payload: saved,
    payloadHash: r.payload_hash,
    link: {
      integrationId: r.integration_id,
      calendarId: r.calendar_id,
      identity: r.identity_hash,
      event: r.event_reference,
    },
    price: {
      base: r.base_price,
      final: r.final_price,
      discount: r.discount_amount,
    },
  });
}

async function read(c: PoolConnection, merchantId: number, id: number) {
  const [rows] = await c.execute<any[]>(
    "SELECT * FROM booking_reschedule_notifications WHERE merchant_id=? AND id=? FOR UPDATE",
    [merchantId, id]
  );
  return rows[0];
}
/** Let the consent reply finish before sending its later outcome; never race a persisted old reply plan. */
async function sourceState(
  c: PoolConnection,
  s: any
): Promise<"ready" | "waiting" | "blocked"> {
  if (!s?.channel?.sourceJobId) return "blocked";
  const [rows] = await c.execute<any[]>(
    `SELECT j.status,m.createdAt,UTC_TIMESTAMP(3) AS now FROM whatsapp_inbound_jobs j
    JOIN messages m ON m.externalId=CONCAT('inbound:v1:',j.event_key) AND m.id=? AND m.conversationId=? AND m.direction='incoming'
    WHERE j.id=? AND j.merchant_id=? AND j.instance_id=?`,
    [
      s.sourceId,
      s.conversationId,
      s.channel.sourceJobId,
      s.merchantId,
      s.channel.id,
    ]
  );
  const v = rows[0],
    age = databaseTimeEpoch(v?.now) - databaseTimeEpoch(v?.createdAt);
  if (!v || !Number.isFinite(age) || age < 0 || age >= 24 * 3600000)
    return "blocked";
  return v.status === "completed"
    ? "ready"
    : ["pending", "running"].includes(v.status)
      ? "waiting"
      : "blocked";
}
/** Current authority is checked again inside the transport, after its delivery reservation. */
async function eligible(c: PoolConnection, r: any, s: any): Promise<boolean> {
  if (
    !intact(r, s) ||
    !s.channel ||
    !["green_api", "meta_cloud"].includes(s.channel.provider)
  )
    return false;
  if ((await sourceState(c, s)) !== "ready") return false;
  const [rows] = await c.execute<any[]>(
    `SELECT c.customerPhone,c.human_takeover,c.handoff_version,c.automation_after_message_id,
    m.content,m.createdAt,UTC_TIMESTAMP(3) AS now,b.customer_phone,b.customer_agreement_id,b.booking_date,b.start_time,b.end_time,b.status,b.payment_status,b.cancelled_by,b.base_price,b.final_price,b.discount_amount,b.google_event_id,
    r.state AS move_state,l.state AS calendar_state,l.agreement_id,a.consent_message_id,a.snapshot_hash AS agreement_hash,a.snapshot AS agreement_snapshot,
    k.state AS cancellation_state,k.snapshot AS cancellation_snapshot,k.snapshot_hash AS cancellation_hash,
    l.id AS link_id,l.integration_id,l.calendar_id,l.identity_hash,l.event_reference,l.payload_hash,l.payload,
    b.service_id,b.staff_id,b.customer_name
    FROM merchants merchant JOIN conversations c ON c.merchantId=merchant.id
    JOIN messages m ON m.conversationId=c.id AND m.id=? AND m.direction='incoming'
    JOIN bookings b ON b.merchant_id=merchant.id AND b.id=?
    LEFT JOIN booking_calendar_reschedules r ON r.merchant_id=merchant.id AND r.id=? AND r.booking_reference=b.id
    LEFT JOIN booking_calendar_cancellations k ON k.merchant_id=merchant.id AND k.id=? AND k.booking_reference=b.id
    JOIN booking_calendar_links l ON l.merchant_id=merchant.id AND l.booking_reference=b.id
    JOIN conversation_booking_agreements a ON a.id=b.customer_agreement_id AND a.merchant_id=merchant.id
      AND a.conversation_id=c.id AND a.state='accepted'
    WHERE merchant.id=? AND merchant.status='active' AND c.id=?`,
    [
      s.sourceId,
      s.bookingId,
      s.moveId ?? null,
      s.cancellationId ?? null,
      r.merchant_id,
      s.conversationId,
    ]
  );
  const v = rows[0],
    now = databaseTimeEpoch(v?.now),
    age = now - databaseTimeEpoch(v?.createdAt);
  if (
    !v ||
    privateSalesPhone(v.customerPhone) !== s.phone ||
    privateSalesPhone(v.customer_phone) !== s.phone ||
    v.human_takeover ||
    v.handoff_version !== s.handoffVersion ||
    Number(v.automation_after_message_id || 0) >= s.sourceId ||
    hash(v.content) !== s.sourceHash ||
    !Number.isFinite(age) ||
    age < 0 ||
    age >= 24 * 3600000 ||
    v.customer_agreement_id !== s.agreementId ||
    v.agreement_id !== s.agreementId
  )
    return false;
  if (
    s.version === 1 &&
    (v.consent_message_id !== s.sourceId ||
      v.move_state !== "applied" ||
      v.calendar_state !== "synced" ||
      v.status !== "confirmed" ||
      v.agreement_hash !== hash(s.after) ||
      String(
        v.booking_date instanceof Date
          ? v.booking_date.toISOString()
          : v.booking_date
      ).slice(0, 10) !== s.after.bookingDate ||
      v.start_time !== s.after.startTime ||
      v.end_time !== s.after.endTime ||
      Date.parse(`${s.after.bookingDate}T${s.after.startTime}:00+03:00`) <= now)
  )
    return false;
  if (s.version === 2 && !(await cancellationMatches(c, v, s))) return false;
  if (s.version === 3 && !confirmationMatches(v, s, now)) return false;

  const [later] = await c.execute<any[]>(
    "SELECT id FROM messages WHERE conversationId=? AND direction='incoming' AND id>? LIMIT 1",
    [s.conversationId, s.sourceId]
  );
  if (later.length) return false;
  const forms = followupPhoneForms(s.phone);
  const [withdrawn] = await c.execute<any[]>(
    `SELECT customer_phone FROM campaign_consent_state WHERE merchant_id=? AND customer_phone IN (${forms.map(() => "?").join(",")})
    AND status='withdrawn' AND last_decided_at>=? LIMIT 1`,
    [r.merchant_id, ...forms, v.createdAt]
  );
  if (withdrawn.length) return false;
  const [accounts] = await c.execute<any[]>(
    `SELECT id FROM whatsapp_instances WHERE id=? AND merchant_id=? AND provider=? AND instance_id=?
    AND phone_number_id<=>? AND provider_account_id<=>? AND status='active'`,
    [
      s.channel.id,
      r.merchant_id,
      s.channel.provider,
      s.channel.account,
      s.channel.phoneNumberId,
      s.channel.providerAccountId,
    ]
  );
  const [clock] = await c.execute<any[]>("SELECT UTC_TIMESTAMP(3) AS now");
  const checked = databaseTimeEpoch(clock[0].now),
    checkedAge = checked - databaseTimeEpoch(v.createdAt);
  return (
    accounts.length === 1 &&
    checkedAge >= 0 &&
    checkedAge < 24 * 3600000 &&
    (s.version === 2 ||
      Date.parse(
        s.version === 3
          ? `${s.payload.date}T${s.payload.startTime}:00+03:00`
          : `${s.after.bookingDate}T${s.after.startTime}:00+03:00`
      ) > checked)
  );
}

function confirmationMatches(v: any, s: any, now: number) {
  const p = s.payload,
    l = s.link,
    price = s.price;
  return (
    !!p &&
    !!l &&
    !!price &&
    v.consent_message_id === s.sourceId &&
    v.calendar_state === "synced" &&
    v.status === "confirmed" &&
    v.agreement_hash === s.agreementHash &&
    hash(parse(v.agreement_snapshot)) === s.agreementHash &&
    v.link_id === s.confirmationId &&
    v.payload_hash === s.payloadHash &&
    hash(parse(v.payload)) === s.payloadHash &&
    hash(p) === s.payloadHash &&
    v.integration_id === l.integrationId &&
    v.calendar_id === l.calendarId &&
    v.identity_hash === l.identity &&
    v.event_reference === l.event &&
    v.google_event_id === l.event &&
    v.service_id === p.serviceId &&
    v.staff_id === p.staffId &&
    (v.customer_name || "") === p.customerName &&
    v.base_price === price.base &&
    v.final_price === price.final &&
    v.discount_amount === price.discount &&
    ["unpaid", "paid"].includes(v.payment_status) &&
    String(
      v.booking_date instanceof Date
        ? v.booking_date.toISOString()
        : v.booking_date
    ).slice(0, 10) === p.date &&
    v.start_time === p.startTime &&
    v.end_time === p.endTime &&
    Date.parse(`${p.date}T${p.startTime}:00+03:00`) > now
  );
}

async function cancellationMatches(c: PoolConnection, v: any, s: any) {
  const saved = parse(v.cancellation_snapshot),
    p = s.commitment?.payload,
    l = s.commitment?.link,
    b = s.commitment?.booking;
  if (
    !p ||
    !l ||
    !b ||
    v.cancellation_state !== "cancelled" ||
    v.calendar_state !== "cancelled" ||
    v.status !== "cancelled" ||
    v.cancelled_by !== "customer" ||
    v.payment_status !== "unpaid" ||
    v.agreement_hash !== s.agreementHash ||
    v.cancellation_hash !== s.cancellationHash ||
    hash(saved) !== s.cancellationHash ||
    hash(saved?.commitment) !== hash(s.commitment) ||
    saved?.request?.id !== s.sourceId ||
    hash(saved?.request?.text) !== s.sourceHash ||
    v.link_id !== l.id ||
    v.integration_id !== l.integrationId ||
    v.calendar_id !== l.calendarId ||
    v.identity_hash !== l.identity ||
    v.event_reference !== l.reference ||
    v.payload_hash !== l.payloadHash ||
    v.base_price !== b.basePrice ||
    v.final_price !== b.finalPrice ||
    v.discount_amount !== b.discount ||
    v.google_event_id !== b.googleEventId ||
    String(
      v.booking_date instanceof Date
        ? v.booking_date.toISOString()
        : v.booking_date
    ).slice(0, 10) !== p.date ||
    v.start_time !== p.startTime ||
    v.end_time !== p.endTime
  )
    return false;
  for (const table of [
    "payment_links",
    "booking_checkout_attempts",
    "order_payments",
  ]) {
    const [rows] = await c.execute<any[]>(
      `SELECT id FROM ${table} WHERE booking_id=? LIMIT 1`,
      [s.bookingId]
    );
    if (rows.length) return false;
  }
  return true;
}

export async function canDispatchBookingNotice(
  input: SendMerchantWhatsAppInput,
  config: WhatsAppProviderConfig
): Promise<boolean> {
  const g = input.bookingNoticeGuard;
  if (
    !g ||
    !Number.isSafeInteger(g.id) ||
    g.id <= 0 ||
    !/^[a-f0-9-]{36}$/.test(g.token) ||
    input.kind !== "text" ||
    input.retryFailed ||
    input.idempotencyKey !== bookingNoticeKey(input.merchantId, g.id)
  )
    return false;
  try {
    return await withBookingCapacityTransaction(input.merchantId, async c => {
      const r = await read(c, input.merchantId, g.id),
        s = parse(r?.snapshot);
      if (
        !r ||
        r.state !== "dispatching" ||
        r.claim_token !== g.token ||
        !(await eligible(c, r, s))
      )
        return false;
      const [clock] = await c.execute<any[]>("SELECT UTC_TIMESTAMP(3) AS now");
      const age =
        databaseTimeEpoch(clock[0].now) -
        databaseTimeEpoch(r.dispatch_started_at);
      return (
        age >= 0 &&
        age < 120000 &&
        input.instanceRecordId === s.channel.id &&
        config.provider === s.channel.provider &&
        config.instanceId === s.channel.account &&
        (config.phoneNumberId ?? null) === s.channel.phoneNumberId &&
        (config.providerAccountId ?? null) === s.channel.providerAccountId &&
        input.to === s.phone &&
        input.text === r.dispatch_text
      );
    });
  } catch {
    return false;
  }
}

/** Lock the exact saved receipt and projection; never contact the provider. */
export async function inspectBookingNotice(c: PoolConnection, r: any) {
  const merchantId = r.merchant_id,
    id = r.id;
  const s = parse(r.snapshot);
  const [deliveries] = await c.execute<any[]>(
    `SELECT d.*,i.instance_id AS account,i.provider AS account_provider,i.merchant_id AS account_merchant,
      i.phone_number_id,i.provider_account_id FROM whatsapp_message_deliveries d LEFT JOIN whatsapp_instances i ON i.id=d.instance_id
      WHERE d.merchant_id=? AND d.idempotency_key=? FOR UPDATE`,
    [merchantId, bookingNoticeKey(merchantId, id)]
  );
  const d = deliveries[0],
    request = parse(d?.request_json),
    g = request?.bookingNoticeGuard;
  const valid =
    intact(r, s) &&
    !!r.dispatch_started_at &&
    typeof r.claim_token === "string" &&
    /^[a-f0-9-]{36}$/i.test(r.claim_token) &&
    s.channel &&
    deliveries.length === 1 &&
    d.direction === "outgoing" &&
    d.instance_id === s.channel.id &&
    d.provider === s.channel.provider &&
    d.account === s.channel.account &&
    d.account_provider === s.channel.provider &&
    d.account_merchant === merchantId &&
    d.phone_number_id === s.channel.phoneNumberId &&
    d.provider_account_id === s.channel.providerAccountId &&
    (!r.provider_message_id ||
      r.provider_message_id === d.provider_message_id) &&
    request?.kind === "text" &&
    request.to === s.phone &&
    request.text === r.dispatch_text &&
    g?.id === id &&
    g?.token === r.claim_token;
  const receipt =
    valid &&
    typeof d.provider_message_id === "string" &&
    /^[^\s<>\x00-\x1f]{1,255}$/.test(d.provider_message_id)
      ? d.provider_message_id
      : null;
  const accepted =
    receipt &&
    (["sent", "delivered", "read"].includes(d.status) ||
      (r.accepted_at && r.provider_message_id === receipt));
  const [conversations] = await c.execute<any[]>(
    "SELECT customerPhone FROM conversations WHERE id=? AND merchantId=? FOR UPDATE",
    [s?.conversationId ?? 0, merchantId]
  );
  const [messages] = await c.execute<any[]>(
    "SELECT id,conversationId,direction,content,sender_type FROM messages WHERE externalId=? FOR UPDATE",
    [`booking-notice:v1:${merchantId}:${id}`]
  );
  const conversationMatches =
    !!s?.phone &&
    privateSalesPhone(conversations[0]?.customerPhone) === s.phone;
  const conflict =
    messages.length > 1 ||
    messages.some(
      m =>
        m.conversationId !== s?.conversationId ||
        m.direction !== "outgoing" ||
        m.content !== r.dispatch_text ||
        m.sender_type !== "assistant"
    );
  return {
    s,
    d,
    valid: !!valid,
    delivery:
      valid &&
      (["queued", "failed"].includes(d.status) ||
        (accepted && ["sent", "delivered", "read"].includes(d.status)))
        ? (d.status as string)
        : "unverified",
    receipt: accepted ? receipt : null,
    accepted: !!accepted,
    conversationMatches,
    messages,
    conflict,
    conversationPhone: conversations[0]?.customerPhone ?? null,
  };
}

/** Receipt recovery never calls a provider. Accepted is distinct from delivered/read. */
export async function reconcileBookingNotice(merchantId: number, id: number) {
  positive(merchantId);
  positive(id);
  await assertBookingNotificationSchema();
  return withBookingCapacityTransaction(merchantId, c =>
    reconcileBookingNoticeInTransaction(c, merchantId, id)
  );
}
export async function reconcileBookingNoticeInTransaction(
  c: PoolConnection,
  merchantId: number,
  id: number
) {
  const r = await read(c, merchantId, id);
  if (!r) throw Error("Notification unavailable");
  if (!r.dispatch_started_at || ["pending", "suppressed"].includes(r.state))
    return;
  const {
    s,
    d,
    valid,
    receipt,
    accepted,
    conversationMatches,
    messages,
    conflict,
    delivery,
  } = await inspectBookingNotice(c, r);
  let state = accepted
      ? "accepted"
      : valid && d.status === "failed"
        ? "failed"
        : "unknown",
    error: string | null = accepted
      ? null
      : valid
        ? "provider_unconfirmed"
        : "receipt_unverified";
  let projected: number | null = null;
  if (accepted) {
    if (!conversationMatches) {
      error = "conversation_unavailable";
      projected = null;
    } else {
      const external = `booking-notice:v1:${merchantId}:${id}`;
      if (conflict) {
        error = "projection_conflict";
        projected = null;
      } else if (messages.length) projected = messages[0].id;
      else {
        const [inserted] = await c.execute<any>(
          `INSERT INTO messages (conversationId,direction,messageType,content,externalId,isProcessed,aiResponse,sender_type,createdAt)
          VALUES (?,'outgoing','text',?,?,1,?,'assistant',?)`,
          [
            s.conversationId,
            r.dispatch_text,
            external,
            r.dispatch_text,
            r.dispatch_started_at,
          ]
        );
        projected = inserted.insertId;
        await c.execute(
          "UPDATE conversations SET lastMessageAt=GREATEST(COALESCE(lastMessageAt,?),?) WHERE id=? AND merchantId=?",
          [
            r.dispatch_started_at,
            r.dispatch_started_at,
            s.conversationId,
            merchantId,
          ]
        );
      }
    }
  }
  // A later failed receipt doesn't erase historical acceptance. Nor does corrupt evidence erase it.
  if (r.accepted_at && !accepted) {
    state = "accepted";
    error = "receipt_unverified";
  }
  await c.execute(
    `UPDATE booking_reschedule_notifications SET state=?,delivery_state=?,provider_message_id=COALESCE(?,provider_message_id),
      accepted_at=IF(?=1,COALESCE(accepted_at,UTC_TIMESTAMP(3)),accepted_at),projection_message_id=?,last_error=?,
      next_check_at=IF(?=1 AND created_at>TIMESTAMPADD(DAY,-7,UTC_TIMESTAMP(3)),TIMESTAMPADD(MINUTE,5,UTC_TIMESTAMP(3)),NULL) WHERE id=? AND merchant_id=?`,
    [
      state,
      delivery,
      accepted ? receipt : null,
      accepted ? 1 : 0,
      projected,
      error,
      state === "unknown" ||
      (state === "accepted" && (delivery !== "read" || !!error))
        ? 1
        : 0,
      id,
      merchantId,
    ]
  );
}

export async function dispatchBookingNotice(merchantId: number, id: number) {
  positive(merchantId);
  positive(id);
  await assertBookingNotificationSchema();
  const claimed = await withBookingCapacityTransaction(merchantId, async c => {
    const r = await read(c, merchantId, id);
    if (!r || r.state !== "pending") return null;
    const s = parse(r.snapshot);
    if (intact(r, s) && (await sourceState(c, s)) === "waiting") {
      await c.execute(
        "UPDATE booking_reschedule_notifications SET next_check_at=TIMESTAMPADD(SECOND,20,UTC_TIMESTAMP(3)) WHERE id=?",
        [id]
      );
      return null;
    }
    if (!(await eligible(c, r, s))) {
      await c.execute(
        "UPDATE booking_reschedule_notifications SET state='suppressed',last_error='context_changed',next_check_at=NULL WHERE id=?",
        [id]
      );
      return null;
    }
    const token = randomUUID();
    await c.execute(
      "UPDATE booking_reschedule_notifications SET state='dispatching',claim_token=?,dispatch_started_at=UTC_TIMESTAMP(3),next_check_at=TIMESTAMPADD(MINUTE,2,UTC_TIMESTAMP(3)) WHERE id=?",
      [token, id]
    );
    return { r, s, token };
  });
  if (!claimed) return;
  const { r, s, token } = claimed;
  try {
    await sendMerchantWhatsApp({
      merchantId,
      instanceRecordId: s.channel.id,
      idempotencyKey: bookingNoticeKey(merchantId, id),
      kind: "text",
      to: s.phone,
      text: r.dispatch_text,
      bookingNoticeGuard: { id, token },
    });
  } catch {
    /* Durable attempt remains; response or exception alone is not acceptance evidence. */
  }
  await reconcileBookingNotice(merchantId, id);
}

export async function runBookingNotificationBatch() {
  await assertBookingNotificationSchema();
  const pool = await getPool();
  if (!pool) throw Error("Notification storage unavailable");
  const [rows] = await pool.execute<
    any[]
  >(`SELECT id,merchant_id,state FROM booking_reschedule_notifications
    WHERE next_check_at<=UTC_TIMESTAMP(3) AND state IN ('pending','dispatching','unknown','accepted') ORDER BY next_check_at,id LIMIT 20`);
  for (const r of rows)
    try {
      if (r.state === "pending")
        await dispatchBookingNotice(r.merchant_id, r.id);
      else await reconcileBookingNotice(r.merchant_id, r.id);
    } catch {
      await pool
        .execute(
          "UPDATE booking_reschedule_notifications SET next_check_at=TIMESTAMPADD(MINUTE,5,UTC_TIMESTAMP(3)) WHERE id=? AND merchant_id=?",
          [r.id, r.merchant_id]
        )
        .catch(() => {});
    }
  return rows.length;
}
export async function startBookingNotificationWorker() {
  await assertBookingNotificationSchema();
  let active: Promise<unknown> | undefined,
    stopped = false;
  const tick = () => {
    if (stopped || active) return;
    active = runBookingNotificationBatch()
      .catch(() =>
        console.error("[BookingNotice] Durable notification requires review")
      )
      .finally(() => {
        active = undefined;
      });
  };
  const timer = setInterval(tick, 20_000);
  timer.unref();
  tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await active;
  };
}
