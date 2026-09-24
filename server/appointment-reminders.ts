import { randomUUID, createHash } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { getPool } from "./db/connection";
import { databaseTimeEpoch } from "./db/time";
import { assertRuntimeSchema } from "./db/schema-readiness";
import { withBookingCapacityTransaction } from "./booking-capacity";
import { bookingAgreementDigest as hash } from "./ai/booking-agreements";
import { privateSalesPhone } from "./ai/sales-offer-authority";
import { followupPhoneForms } from "./ai/followup-send-guard";
import {
  assertCheckoutIdentity,
  type CheckoutIdentity,
} from "./ai/checkout-agreements";
import { sendMerchantWhatsApp } from "./channels/whatsapp/service";
import type {
  SendMerchantWhatsAppInput,
  WhatsAppProviderConfig,
} from "./channels/whatsapp/types";
import {
  parseAppointmentReminderIntent,
  appointmentReminderDue,
} from "./appointment-reminder-intent";

const parse = (value: any) => {
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return null;
  }
};
const positive = (value: number) => {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw Error("Invalid reminder identity");
};
const sqlDate = (epoch: number) =>
  new Date(epoch).toISOString().slice(0, 23).replace("T", " ");
const day = (value: any) =>
  String(value instanceof Date ? value.toISOString() : value).slice(0, 10);
export const appointmentReminderKey = (merchantId: number, id: number) =>
  `appointment_reminder:${merchantId}:${id}`;
export type AppointmentReminderGuard = { id: number; token: string };
const clarify =
  "لطلب تذكير، اكتب رقم الموعد مثل: ذكرني بالموعد A123 قبل ساعة، أو قبل 24 ساعة. للإلغاء: ألغ تذكير الموعد A123. لا يُسجل تذكير قبل التحقق من الطلب والموعد.";
const unavailable =
  "تعذر اعتماد تذكير لهذا الموعد. تحقق من رقم الموعد وأنه مؤكد، واختر تذكيرًا يقع خلال 24 ساعة من رسالتك الحالية. لم أضف تذكيرًا جديدًا.";

export async function assertAppointmentReminderSchema() {
  await assertRuntimeSchema(
    "Customer requested appointment reminders",
    [
      {
        table: "appointment_reminders",
        columns: [
          "appointment_reference",
          "source_message_id",
          "hours_before",
          "terms_hash",
          "snapshot",
          "snapshot_hash",
          "dispatch_text",
          "due_at",
          "expires_at",
          "cancelled_at",
          "cancellation_source_id",
          "state",
          "claim_token",
          "dispatch_started_at",
          "accepted_at",
          "provider_message_id",
          "delivery_state",
          "projection_message_id",
          "last_error",
          "next_check_at",
        ],
        uniqueIndexes: [
          {
            name: "uq_appointment_reminder_source",
            columns: ["merchant_id", "source_message_id"],
          },
          {
            name: "uq_appointment_reminder_terms",
            columns: [
              "merchant_id",
              "appointment_reference",
              "hours_before",
              "terms_hash",
            ],
          },
        ],
        checkConstraints: [
          {
            name: "chk_appointment_reminder_hours",
            expression: "hours_before IN (1,24)",
            enforced: true,
          },
          {
            name: "chk_appointment_reminder_window",
            expression: "expires_at>due_at",
            enforced: true,
          },
        ],
      },
    ],
    { cacheSuccess: false }
  );
}

async function sourceChannel(
  c: PoolConnection,
  merchantId: number,
  externalId: string | null,
  phone: string,
  text: string
) {
  const [accounts] = await c.execute<any[]>(
    `SELECT j.id AS source_job_id,j.payload_json,i.id,i.provider,i.instance_id,i.phone_number_id,i.provider_account_id
    FROM whatsapp_inbound_jobs j JOIN whatsapp_instances i ON i.id=j.instance_id AND i.merchant_id=j.merchant_id
    WHERE j.merchant_id=? AND CONCAT('inbound:v1:',j.event_key)=? AND i.status='active' LIMIT 2`,
    [merchantId, externalId]
  );
  const account = accounts.length === 1 ? accounts[0] : null,
    envelope = parse(account?.payload_json);
  return account &&
    ["green_api", "meta_cloud"].includes(account.provider) &&
    envelope?.sourceProvider === account.provider &&
    String(envelope?.instanceData?.idInstance) === account.instance_id &&
    /@(?:c\.us|s\.whatsapp\.net)$/.test(envelope?.senderData?.chatId || "") &&
    privateSalesPhone(
      String(envelope.senderData.chatId).replace("@s.whatsapp.net", "@c.us")
    ) === phone &&
    envelope.messageData?.typeMessage === "textMessage" &&
    envelope.messageData.textMessageData?.textMessage === text
    ? {
        id: account.id,
        sourceJobId: account.source_job_id,
        provider: account.provider,
        account: account.instance_id,
        phoneNumberId: account.phone_number_id,
        providerAccountId: account.provider_account_id,
      }
    : null;
}

async function appointmentTerms(
  c: PoolConnection,
  merchantId: number,
  appointmentId: number,
  phone: string
) {
  const [rows] = await c.execute<any[]>(
    `SELECT a.*,s.name AS service_name,s.is_active AS service_active,
      f.name AS staff_name,f.is_active AS staff_active
    FROM appointments a JOIN services s ON s.id=a.service_id AND s.merchant_id=a.merchant_id
    LEFT JOIN staff_members f ON f.id=a.staff_id AND f.merchant_id=a.merchant_id
    WHERE a.id=? AND a.merchant_id=? FOR UPDATE`,
    [appointmentId, merchantId]
  );
  const a = rows[0];
  if (
    !a ||
    a.status !== "confirmed" ||
    privateSalesPhone(a.customer_phone) !== phone ||
    !a.service_active ||
    (a.staff_id != null && !a.staff_active)
  )
    return null;
  if (
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(a.end_time) ||
    a.end_time <= a.start_time
  )
    return null;
  const calendar = {
    state: a.calendar_sync_state,
    integration: a.calendar_integration_id,
    target: a.calendar_target_id,
    identity: a.calendar_identity_hash,
    reference: a.calendar_event_reference,
    event: a.google_event_id,
  };
  if (calendar.state === "none") {
    if (
      [
        calendar.integration,
        calendar.target,
        calendar.identity,
        calendar.reference,
        calendar.event,
      ].some(v => v != null)
    )
      return null;
  } else if (
    calendar.state === "synced" &&
    calendar.reference &&
    calendar.event === calendar.reference
  ) {
    const [integrations] = await c.execute<any[]>(
      `SELECT credentials,calendar_id FROM google_integrations
      WHERE id=? AND merchant_id=? AND integration_type='calendar' AND is_active=1 FOR SHARE`,
      [calendar.integration, merchantId]
    );
    const integration = integrations[0],
      credentials = parse(integration?.credentials),
      identity = credentials?.refresh_token || credentials?.access_token;
    if (
      typeof identity !== "string" ||
      !identity ||
      (integration?.calendar_id || "primary") !== calendar.target ||
      createHash("sha256").update(identity).digest("hex") !== calendar.identity
    )
      return null;
  } else return null;
  return {
    date: day(a.appointment_date),
    startTime: a.start_time,
    endTime: a.end_time,
    serviceId: a.service_id,
    serviceName: a.service_name,
    staffId: a.staff_id,
    staffName: a.staff_name,
    calendar,
  };
}
const message = (s: any) =>
  `تذكير بالموعد A${s.appointmentId}\nالخدمة: ${s.terms.serviceName}\nالموعد: ${s.terms.date}، من ${s.terms.startTime} إلى ${s.terms.endTime} بتوقيت الرياض.\n${s.terms.staffName ? `الموظف: ${s.terms.staffName}\n` : ""}إذا احتجت تعديل الموعد تواصل مع الفريق واذكر رقم الموعد.`;
function intact(r: any, s: any): boolean {
  try {
    const intent = parseAppointmentReminderIntent(s.sourceText);
    const due = appointmentReminderDue(
      s.terms.date,
      s.terms.startTime,
      s.hours
    );
    return (
      s.version === 1 &&
      s.merchantId === r.merchant_id &&
      s.appointmentId === r.appointment_reference &&
      s.sourceId === r.source_message_id &&
      s.hours === r.hours_before &&
      privateSalesPhone(s.phone) === s.phone &&
      intent?.kind === "schedule" &&
      intent.appointmentId === s.appointmentId &&
      intent.hours === s.hours &&
      hash(s.sourceText) === s.sourceHash &&
      hash(s.terms) === r.terms_hash &&
      hash(s) === r.snapshot_hash &&
      due === s.due &&
      databaseTimeEpoch(r.due_at) === due &&
      databaseTimeEpoch(r.expires_at) === s.expires &&
      Number.isFinite(due) &&
      s.expires > due &&
      s.expires <= due + 15 * 60000 &&
      r.dispatch_text === message(s) &&
      r.dispatch_text.length <= 4096
    );
  } catch {
    return false;
  }
}
async function read(c: PoolConnection, merchantId: number, id: number) {
  const [rows] = await c.execute<any[]>(
    "SELECT * FROM appointment_reminders WHERE merchant_id=? AND id=? FOR UPDATE",
    [merchantId, id]
  );
  return rows[0];
}
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

/** Exact customer message is the authority; no staff action, flag or LLM output can enroll an appointment. */
export async function handleAppointmentReminder(
  input: CheckoutIdentity,
  raw: string
): Promise<string | null> {
  if (!parseAppointmentReminderIntent(raw)) return null;
  try {
    await assertAppointmentReminderSchema();
    return await withBookingCapacityTransaction(input.merchantId, async c => {
      const identity = await assertCheckoutIdentity(c, input),
        intent = parseAppointmentReminderIntent(identity.content);
      if (identity.content !== raw || !intent || intent.kind === "clarify")
        return clarify;
      const phone = privateSalesPhone(input.customerPhone);
      if (!phone) return unavailable;
      const [sources] = await c.execute<any[]>(
        `SELECT m.content,m.createdAt,m.externalId,c.handoff_version,UTC_TIMESTAMP(3) AS now
        FROM messages m JOIN conversations c ON c.id=m.conversationId JOIN merchants merchant ON merchant.id=c.merchantId
        WHERE m.id=? AND c.id=? AND c.merchantId=? AND merchant.status='active'`,
        [input.incomingMessageId, input.conversationId, input.merchantId]
      );
      const source = sources[0];
      if (!source) return unavailable;
      const channel = await sourceChannel(
        c,
        input.merchantId,
        source.externalId,
        phone,
        source.content
      );
      if (!channel) return unavailable;
      const context = {
        merchantId: input.merchantId,
        conversationId: input.conversationId,
        sourceId: input.incomingMessageId,
        channel,
      };
      if ((await sourceState(c, context)) === "blocked") return unavailable;
      if (intent.kind === "cancel") {
        const [rows] = await c.execute<any[]>(
          "SELECT * FROM appointment_reminders WHERE merchant_id=? AND appointment_reference=? FOR UPDATE",
          [input.merchantId, intent.appointmentId]
        );
        for (const row of rows) {
          const saved = parse(row.snapshot);
          if (
            !intact(row, saved) ||
            saved.phone !== phone ||
            saved.conversationId !== input.conversationId ||
            saved.sourceId >= input.incomingMessageId
          )
            continue;
          await c.execute(
            `UPDATE appointment_reminders SET cancelled_at=COALESCE(cancelled_at,UTC_TIMESTAMP(3)),cancellation_source_id=COALESCE(cancellation_source_id,?),
            last_error=IF(state='pending','customer_cancelled',last_error),next_check_at=IF(state='pending',NULL,next_check_at),state=IF(state='pending','suppressed',state)
            WHERE id=? AND merchant_id=?`,
            [input.incomingMessageId, row.id, input.merchantId]
          );
        }
        return `أوقفت التذكيرات المعلقة التي تخص محادثتك للموعد A${intent.appointmentId}. لم ألغ الموعد نفسه. لا يمكن سحب رسالة بدأ إرسالها بالفعل.`;
      }
      const [prior] = await c.execute<any[]>(
        "SELECT * FROM appointment_reminders WHERE merchant_id=? AND source_message_id=? FOR UPDATE",
        [input.merchantId, input.incomingMessageId]
      );
      if (prior.length)
        return intact(prior[0], parse(prior[0].snapshot))
          ? savedReply(prior[0])
          : unavailable;
      const terms = await appointmentTerms(
        c,
        input.merchantId,
        intent.appointmentId,
        phone
      );
      if (!terms) return unavailable;
      const now = databaseTimeEpoch(source.now),
        due = appointmentReminderDue(terms.date, terms.startTime, intent.hours);
      const windowEnd = databaseTimeEpoch(source.createdAt) + 24 * 3600000;
      if (!Number.isFinite(due) || due <= now || due >= windowEnd)
        return unavailable;
      const snapshot = {
        version: 1,
        ...context,
        appointmentId: intent.appointmentId,
        sourceText: source.content,
        sourceHash: hash(source.content),
        phone,
        handoffVersion: source.handoff_version,
        hours: intent.hours,
        terms,
        due,
        expires: Math.min(due + 15 * 60000, windowEnd),
      };
      const text = message(snapshot);
      if (text.length > 4096) return unavailable;
      const [existing] = await c.execute<any[]>(
        `SELECT * FROM appointment_reminders WHERE merchant_id=? AND appointment_reference=? AND hours_before=? AND terms_hash=? FOR UPDATE`,
        [input.merchantId, intent.appointmentId, intent.hours, hash(terms)]
      );
      if (existing.length)
        return "يوجد طلب سابق للتذكير بهذا الموعد والتوقيت؛ لم أنشئ إرسالًا آخر. إذا كانت المحادثة أو حالة الموعد تغيرت، راجع الفريق للتحقق من التذكير.";
      await c.execute(
        `INSERT INTO appointment_reminders (merchant_id,appointment_reference,source_message_id,hours_before,terms_hash,snapshot,snapshot_hash,dispatch_text,due_at,expires_at,next_check_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          input.merchantId,
          intent.appointmentId,
          input.incomingMessageId,
          intent.hours,
          hash(terms),
          JSON.stringify(snapshot),
          hash(snapshot),
          text,
          sqlDate(due),
          sqlDate(snapshot.expires),
          sqlDate(due),
        ]
      );
      return savedReply({ snapshot, state: "pending" });
    });
  } catch {
    return "تعذر التحقق من نتيجة طلب التذكير الآن. لا تعتمد على إرسال التذكير قبل التحقق من حالته مع الفريق.";
  }
}
function savedReply(row: any) {
  if (row.state !== "pending" || row.cancelled_at)
    return "طلب التذكير محفوظ سابقًا، ولم أعد تفعيله أو إرسال رسالة أخرى. راجع الفريق للتحقق من حالته.";
  const s = parse(row.snapshot);
  if (!s || !Number.isFinite(s.due)) return unavailable;
  const label = new Intl.DateTimeFormat("ar-SA", {
    timeZone: "Asia/Riyadh",
    calendar: "gregory",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(s.due));
  return `سجلت طلب تذكير واحد للموعد A${s.appointmentId} في ${label} بتوقيت الرياض. الإرسال يتوقف إذا أرسلت رسالة جديدة أو تغير الموعد أو تدخل الفريق أو انتهت نافذة الإرسال. للإلغاء اكتب: ألغ تذكير الموعد A${s.appointmentId}.`;
}

async function eligible(c: PoolConnection, r: any, s: any): Promise<boolean> {
  if (
    !intact(r, s) ||
    r.cancelled_at ||
    !s.channel ||
    (await sourceState(c, s)) !== "ready"
  )
    return false;
  // Do not take an exclusive parent-merchant lock after the capacity lock: another
  // capacity claimant may hold the parent's FK share lock while waiting for us.
  const [merchants] = await c.execute<any[]>(
    "SELECT id FROM merchants WHERE id=? AND status='active'",
    [s.merchantId]
  );
  if (merchants.length !== 1) return false;
  const [rows] = await c.execute<any[]>(
    `SELECT c.customerPhone,c.human_takeover,c.handoff_version,c.automation_after_message_id,m.content,m.createdAt,m.externalId
    FROM conversations c JOIN messages m ON m.conversationId=c.id AND m.direction='incoming'
    WHERE c.id=? AND c.merchantId=? AND m.id=? FOR UPDATE`,
    [s.conversationId, s.merchantId, s.sourceId]
  );
  const v = rows[0];
  if (
    !v ||
    privateSalesPhone(v.customerPhone) !== s.phone ||
    v.human_takeover ||
    v.handoff_version !== s.handoffVersion ||
    Number(v.automation_after_message_id || 0) >= s.sourceId ||
    hash(v.content) !== s.sourceHash
  )
    return false;
  const [later] = await c.execute<any[]>(
    "SELECT id FROM messages WHERE conversationId=? AND direction='incoming' AND id>? LIMIT 1",
    [s.conversationId, s.sourceId]
  );
  if (later.length) return false;
  const forms = followupPhoneForms(s.phone);
  if (!forms.length) return false;
  const [withdrawals] = await c.execute<any[]>(
    `SELECT merchant_id FROM campaign_consent_state WHERE merchant_id=? AND customer_phone IN (${forms.map(() => "?").join(",")})
    AND status='withdrawn' AND last_decided_at>=? LIMIT 1`,
    [s.merchantId, ...forms, v.createdAt]
  );
  if (withdrawals.length) return false;
  if (
    hash(
      await sourceChannel(c, s.merchantId, v.externalId, s.phone, v.content)
    ) !== hash(s.channel) ||
    hash(await appointmentTerms(c, s.merchantId, s.appointmentId, s.phone)) !==
      r.terms_hash
  )
    return false;
  const [clock] = await c.execute<any[]>("SELECT UTC_TIMESTAMP(3) AS now");
  const now = databaseTimeEpoch(clock[0].now),
    age = now - databaseTimeEpoch(v.createdAt);
  return age >= 0 && age < 24 * 3600000 && now >= s.due && now < s.expires;
}

export async function canDispatchAppointmentReminder(
  input: SendMerchantWhatsAppInput,
  config: WhatsAppProviderConfig
): Promise<boolean> {
  const g = input.appointmentReminderGuard;
  if (
    !g ||
    !Number.isSafeInteger(g.id) ||
    g.id <= 0 ||
    !/^[a-f0-9-]{36}$/.test(g.token) ||
    input.kind !== "text" ||
    input.retryFailed ||
    input.idempotencyKey !== appointmentReminderKey(input.merchantId, g.id)
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
export async function inspectAppointmentReminder(c: PoolConnection, r: any) {
  const merchantId = r.merchant_id,
    id = r.id;
  const s = parse(r.snapshot);
  const [deliveries] = await c.execute<any[]>(
    `SELECT d.*,i.instance_id AS account,i.provider AS account_provider,i.merchant_id AS account_merchant,
      i.phone_number_id,i.provider_account_id FROM whatsapp_message_deliveries d LEFT JOIN whatsapp_instances i ON i.id=d.instance_id
      WHERE d.merchant_id=? AND d.idempotency_key=? FOR UPDATE`,
    [merchantId, appointmentReminderKey(merchantId, id)]
  );
  const d = deliveries[0],
    request = parse(d?.request_json),
    g = request?.appointmentReminderGuard;
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
    [`appointment-reminder:v1:${merchantId}:${id}`]
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
export async function reconcileAppointmentReminder(
  merchantId: number,
  id: number
) {
  positive(merchantId);
  positive(id);
  await assertAppointmentReminderSchema();
  return withBookingCapacityTransaction(merchantId, c =>
    reconcileAppointmentReminderInTransaction(c, merchantId, id)
  );
}
export async function reconcileAppointmentReminderInTransaction(
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
  } = await inspectAppointmentReminder(c, r);
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
      const external = `appointment-reminder:v1:${merchantId}:${id}`;
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
    `UPDATE appointment_reminders SET state=?,delivery_state=?,provider_message_id=COALESCE(?,provider_message_id),
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

export async function dispatchAppointmentReminder(
  merchantId: number,
  id: number
) {
  positive(merchantId);
  positive(id);
  await assertAppointmentReminderSchema();
  const claimed = await withBookingCapacityTransaction(merchantId, async c => {
    const r = await read(c, merchantId, id);
    if (!r || r.state !== "pending") return null;
    const s = parse(r.snapshot);
    const [clock] = await c.execute<any[]>("SELECT UTC_TIMESTAMP(3) AS now");
    const now = databaseTimeEpoch(clock[0].now);
    if (intact(r, s) && now < s.due) return null;
    if (
      intact(r, s) &&
      !r.cancelled_at &&
      now < s.expires &&
      (await sourceState(c, s)) === "waiting"
    ) {
      await c.execute(
        "UPDATE appointment_reminders SET next_check_at=TIMESTAMPADD(SECOND,20,UTC_TIMESTAMP(3)) WHERE id=?",
        [id]
      );
      return null;
    }
    if (!(await eligible(c, r, s))) {
      await c.execute(
        "UPDATE appointment_reminders SET state='suppressed',last_error='context_changed',next_check_at=NULL WHERE id=?",
        [id]
      );
      return null;
    }
    const token = randomUUID();
    await c.execute(
      "UPDATE appointment_reminders SET state='dispatching',claim_token=?,dispatch_started_at=UTC_TIMESTAMP(3),next_check_at=TIMESTAMPADD(MINUTE,2,UTC_TIMESTAMP(3)) WHERE id=?",
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
      idempotencyKey: appointmentReminderKey(merchantId, id),
      kind: "text",
      to: s.phone,
      text: r.dispatch_text,
      appointmentReminderGuard: { id, token },
    });
  } catch {
    /* Durable attempt remains; response or exception alone is not acceptance evidence. */
  }
  await reconcileAppointmentReminder(merchantId, id);
}

export async function runAppointmentReminderBatch(merchantId?: number) {
  if (merchantId !== undefined) positive(merchantId);
  await assertAppointmentReminderSchema();
  const pool = await getPool();
  if (!pool) throw Error("Notification storage unavailable");
  const [rows] = await pool.execute<any[]>(
    `SELECT id,merchant_id,state FROM appointment_reminders
    WHERE next_check_at<=UTC_TIMESTAMP(3) AND state IN ('pending','dispatching','unknown','accepted') AND (? IS NULL OR merchant_id=?) ORDER BY next_check_at,id LIMIT 20`,
    [merchantId ?? null, merchantId ?? null]
  );
  for (const r of rows)
    try {
      if (r.state === "pending")
        await dispatchAppointmentReminder(r.merchant_id, r.id);
      else await reconcileAppointmentReminder(r.merchant_id, r.id);
    } catch {
      await pool
        .execute(
          "UPDATE appointment_reminders SET next_check_at=TIMESTAMPADD(MINUTE,5,UTC_TIMESTAMP(3)) WHERE id=? AND merchant_id=?",
          [r.id, r.merchant_id]
        )
        .catch(() => {});
    }
  return rows.length;
}
export async function startAppointmentReminderWorker() {
  await assertAppointmentReminderSchema();
  let active: Promise<unknown> | undefined,
    stopped = false;
  const tick = () => {
    if (stopped || active) return;
    active = runAppointmentReminderBatch()
      .catch(() =>
        console.error(
          "[AppointmentReminder] Durable notification requires review"
        )
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

/** Read only. The UI never grants consent, dispatches, or retries a reminder. */
export async function readAppointmentReminders(
  merchantId: number,
  appointmentId: number
) {
  positive(merchantId);
  positive(appointmentId);
  await assertAppointmentReminderSchema();
  const pool = await getPool();
  if (!pool) throw Error("Reminder storage unavailable");
  const [owned] = await pool.execute<any[]>(
    "SELECT id FROM appointments WHERE merchant_id=? AND id=?",
    [merchantId, appointmentId]
  );
  if (owned.length !== 1) throw Error("Appointment unavailable");
  const [rows] = await pool.execute<any[]>(
    "SELECT * FROM appointment_reminders WHERE merchant_id=? AND appointment_reference=? ORDER BY id DESC LIMIT 20",
    [merchantId, appointmentId]
  );
  return {
    appointmentId,
    reminders: rows.map(r => {
      const s = parse(r.snapshot),
        verified = intact(r, s);
      const iso = (date: string | Date | null) =>
        Number.isFinite(databaseTimeEpoch(date))
          ? new Date(databaseTimeEpoch(date)).toISOString()
          : null;
      return {
        id: r.id,
        hours: r.hours_before,
        requestedAt: iso(r.created_at),
        dueAt: iso(r.due_at),
        expiresAt: iso(r.expires_at),
        state:
          verified &&
          [
            "pending",
            "dispatching",
            "unknown",
            "accepted",
            "failed",
            "suppressed",
          ].includes(r.state)
            ? (r.state as string)
            : "unknown",
        delivery:
          verified &&
          ["none", "queued", "sent", "delivered", "read", "failed"].includes(
            r.delivery_state
          )
            ? (r.delivery_state as string)
            : "unverified",
        cancelled: !!r.cancelled_at,
        attention: !verified || !!r.last_error,
        sourceText: verified ? (s.sourceText as string) : null,
        sourceId: verified ? (s.sourceId as number) : null,
        conversationId: verified ? (s.conversationId as number) : null,
      };
    }),
  };
}
