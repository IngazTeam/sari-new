import type { Pool, PoolConnection } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { getPool } from "../db/connection";
import { assertRuntimeSchema } from "../db/schema-readiness";
import { checkoutTransaction } from "../ai/checkout-agreements";
import { quotedEscalationMessageId } from "../ai/escalation-relay";
import {
  readTeachingSource,
  type TeachingSource,
} from "../knowledge/whatsapp-teaching-source";
import {
  FIELD_LABELS,
  nextOnboardingQuestion,
  onboardingPrompt,
} from "./onboarding-questions";
import {
  onboardingHash,
  onboardingDecisionSchema,
  validateOnboardingDecision,
  type OnboardingInput,
  type OnboardingDecision,
} from "./onboarding-understanding";

type Executor = Pick<Pool | PoolConnection, "execute">;
const decode = (value: any) =>
  typeof value === "string" ? JSON.parse(value) : value;
export async function onboardingRows(
  db: Executor,
  query: string,
  args: any[] = []
): Promise<any[]> {
  return (await db.execute(query, args))[0] as any[];
}
export async function assertOnboardingSchema() {
  await assertRuntimeSchema("Contextual onboarding", [
    { table: "merchant_onboarding_sessions" },
    { table: "merchant_onboarding_events" },
    {
      table: "merchant_onboarding_answers",
      columns: ["verified_event_key", "answer_digest"],
    },
  ]);
}
function phone(value: unknown) {
  if (typeof value !== "string") return null;
  let digits = value
    .replace(/@(c\.us|s\.whatsapp\.net)$/, "")
    .replace(/[+\s()\-]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^05\d{8}$/.test(digits)) digits = "966" + digits.slice(1);
  if (/^5\d{8}$/.test(digits)) digits = "966" + digits;
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}
export async function verifyOnboardingRecipient(
  db: Executor,
  merchantId: number,
  instanceId: number,
  recipient: string
) {
  const [r] = await onboardingRows(
    db,
    `SELECT m.phone,m.emergency_phone,m.escalation_phones,i.phone_number,i.provider,i.instance_id AS account
    FROM merchants m JOIN users u ON u.id=m.userId JOIN whatsapp_instances i ON i.merchant_id=m.id
    WHERE m.id=? AND i.id=? AND m.status<>'suspended' AND u.account_status='active' AND i.status='active'`,
    [merchantId, instanceId]
  );
  if (!r) throw Error("Onboarding recipient unavailable");
  let chain: any[] = [];
  try {
    const c = decode(r.escalation_phones);
    if (Array.isArray(c)) chain = c;
  } catch {}
  const normalized = phone(recipient);
  if (
    !normalized ||
    ![r.phone, r.emergency_phone, r.phone_number, ...chain.map(e => e?.phone)]
      .map(phone)
      .includes(normalized)
  )
    throw Error("Onboarding recipient unauthorized");
  return { recipient: normalized, provider: r.provider, account: r.account };
}
export async function readVerifiedOnboardingAnswers(
  merchantId: number,
  executor?: Executor
): Promise<Record<string, string>> {
  await assertOnboardingSchema();
  const db = executor || (await getPool());
  if (!db) throw Error("Onboarding storage unavailable");
  const rows = await onboardingRows(
    db,
    `SELECT a.*,e.source_json,e.source_digest,e.basis_hash,e.decision_json,j.payload_json,j.event_key AS inbound_event,j.instance_id AS inbound_instance
    FROM merchant_onboarding_answers a JOIN merchant_onboarding_events e ON e.merchant_id=a.merchant_id AND e.event_key=a.verified_event_key
    JOIN whatsapp_inbound_jobs j ON j.id=CAST(JSON_UNQUOTE(JSON_EXTRACT(e.source_json,'$.inboundId')) AS UNSIGNED) AND j.merchant_id=a.merchant_id
    WHERE a.merchant_id=? ORDER BY a.field_key`,
    [merchantId]
  );
  const answers: Record<string, string> = {};
  for (const row of rows) {
    try {
      const source = decode(row.source_json),
        d = onboardingDecisionSchema.parse(decode(row.decision_json)),
        payload = decode(row.payload_json);
      const { digest } = source;
      const body = {
        merchantId: source.merchantId,
        inboundId: source.inboundId,
        instanceId: source.instanceId,
        eventKey: source.eventKey,
        authorPhone: source.authorPhone,
        text: source.text,
        ...(source.quotedMessageId
          ? { quotedMessageId: source.quotedMessageId }
          : {}),
      };
      const original =
        payload?.messageData?.extendedTextMessageData?.text ??
        payload?.messageData?.textMessageData?.textMessage;
      const eventHash = onboardingHash([
        merchantId,
        payload?.sourceProvider,
        String(payload?.instanceData?.idInstance || ""),
        String(payload?.idMessage || ""),
      ]);
      if (
        !Object.hasOwn(FIELD_LABELS, row.field_key) ||
        source.merchantId !== merchantId ||
        digest !== onboardingHash(body) ||
        digest !== row.source_digest ||
        d.basisHash !== row.basis_hash ||
        d.confidence < 0.9 ||
        !d.explicit ||
        d.ambiguous ||
        d.conditional ||
        source.text !== original ||
        (quotedEscalationMessageId(payload) || undefined) !==
          source.quotedMessageId ||
        payload?.typeWebhook !== "incomingMessageReceived" ||
        phone(payload?.senderData?.sender ?? payload?.senderData?.chatId) !==
          source.authorPhone ||
        phone(payload?.senderData?.chatId) !== source.authorPhone ||
        eventHash !== source.eventKey ||
        source.eventKey !== row.inbound_event ||
        source.instanceId !== row.inbound_instance ||
        source.eventKey !== row.verified_event_key ||
        !["answer", "update"].includes(d.intent) ||
        d.fieldKey !== row.field_key ||
        row.answer_text !==
          (row.field_key === "businessType"
            ? d.businessType
            : source.text.trim()) ||
        row.answer_digest !==
          onboardingHash([
            row.field_key,
            row.answer_text,
            row.verified_event_key,
          ])
      )
        continue;
      answers[row.field_key] = row.answer_text;
    } catch {
      /* Old or changed evidence is retained in storage but never promoted to current knowledge. */
    }
  }
  return answers;
}
export async function onboardingSession(
  merchantId: number,
  executor?: Executor
) {
  const db = executor || (await getPool());
  if (!db) throw Error("Onboarding storage unavailable");
  return (
    (
      await onboardingRows(
        db,
        "SELECT * FROM merchant_onboarding_sessions WHERE merchant_id=?",
        [merchantId]
      )
    )[0] || null
  );
}
export type OnboardingContext = {
  source: TeachingSource;
  session: any;
  input: OnboardingInput;
  ownedQuote: boolean;
};
export async function readOnboardingContext(
  merchantId: number,
  text: string,
  quote?: string,
  executor?: PoolConnection
): Promise<OnboardingContext> {
  await assertOnboardingSchema();
  const db = executor || (await getPool());
  if (!db) throw Error("Onboarding storage unavailable");
  const source = await readTeachingSource(
    merchantId,
    text,
    executor ? drizzle(executor) : undefined,
    !!executor,
    quote
  );
  const session = await onboardingSession(merchantId, db),
    answers = await readVerifiedOnboardingAnswers(merchantId, db);
  const [receipt] = quote
    ? await onboardingRows(
        db,
        `SELECT idempotency_key,request_json,status FROM whatsapp_message_deliveries
    WHERE merchant_id=? AND instance_id=? AND direction='outgoing' AND provider_message_id=? AND idempotency_key LIKE 'onboarding_question:%'`,
        [merchantId, source.instanceId, quote]
      )
    : [];
  const request = receipt ? decode(receipt.request_json) : null;
  const ownedQuote = !!receipt && request?.to === source.authorPhone;
  const canAnswer = !!(
    session &&
    session.status === "active" &&
    ownedQuote &&
    ["sent", "delivered", "read"].includes(receipt.status) &&
    receipt.idempotency_key === session.delivery_key &&
    session.recipient === source.authorPhone &&
    session.instance_id === source.instanceId &&
    request.kind === "text" &&
    request.text === session.prompt_text &&
    request.onboardingGuard?.version === session.version
  );
  const next = nextOnboardingQuestion(answers);
  const input: OnboardingInput = {
    basisHash: "",
    reply: text,
    status: session?.status || "not_started",
    question:
      session?.status === "active" &&
      next &&
      next.question.key === session.field_key
        ? next.question
        : null,
    answers,
    canAnswer,
  };
  input.canAnswer = canAnswer && !!input.question;
  input.basisHash = onboardingHash({
    sourceDigest: source.digest,
    session,
    input: { ...input, basisHash: undefined },
    ownedQuote,
  });
  return { source, session, input, ownedQuote };
}
export type OnboardingResult = {
  handled: boolean;
  response: string;
  nextVersion?: number;
  replayed?: boolean;
};
async function writeSession(
  db: Executor,
  merchantId: number,
  instanceId: number,
  recipient: string,
  version: number,
  status: string,
  answers: Record<string, string>
) {
  const next = nextOnboardingQuestion(answers),
    finalStatus = next
      ? status === "completed"
        ? "paused"
        : status
      : "completed";
  await db.execute(
    `INSERT INTO merchant_onboarding_sessions (merchant_id,version,status,field_key,instance_id,recipient,delivery_key,prompt_text)
    VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE version=VALUES(version),status=VALUES(status),field_key=VALUES(field_key),instance_id=VALUES(instance_id),recipient=VALUES(recipient),delivery_key=VALUES(delivery_key),prompt_text=VALUES(prompt_text)`,
    [
      merchantId,
      version,
      finalStatus,
      next?.question.key || null,
      instanceId,
      recipient,
      `onboarding_question:${merchantId}:${version}`,
      finalStatus === "active" ? onboardingPrompt(answers) : "",
    ]
  );
  // The account setup wizard owns merchants.onboardingStep/Completed. This
  // interview has its own state and must never reset account readiness.
  return finalStatus;
}
export async function beginOnboarding(
  merchantId: number,
  instanceId: number,
  recipient: string
) {
  await assertOnboardingSchema();
  return checkoutTransaction(async db => {
    await db.execute("SELECT id FROM merchants WHERE id=? FOR UPDATE", [
      merchantId,
    ]);
    const target = await verifyOnboardingRecipient(
      db,
      merchantId,
      instanceId,
      recipient
    );
    const current = await onboardingSession(merchantId, db);
    if (current) return current.status === "active" ? current.version : null;
    const answers = await readVerifiedOnboardingAnswers(merchantId, db);
    return (await writeSession(
      db,
      merchantId,
      instanceId,
      target.recipient,
      1,
      "active",
      answers
    )) === "active"
      ? 1
      : null;
  });
}
export async function findOnboardingReceipt(
  context: OnboardingContext,
  executor?: Executor
): Promise<OnboardingResult | null> {
  const db = executor || (await getPool());
  if (!db) throw Error("Onboarding storage unavailable");
  const [prior] = await onboardingRows(
    db,
    "SELECT source_digest,result_json FROM merchant_onboarding_events WHERE merchant_id=? AND event_key=?",
    [context.source.merchantId, context.source.eventKey]
  );
  if (!prior) return null;
  if (prior.source_digest !== context.source.digest)
    throw Error("Onboarding replay source changed");
  const result = decode(prior.result_json) as OnboardingResult;
  const session = await onboardingSession(context.source.merchantId, db);
  return {
    ...result,
    replayed: true,
    ...(result.handled
      ? {
          response: "سبق أن عالجت هذه الرسالة؛ لم أغيّر معلومات النشاط مجددًا.",
        }
      : {}),
    nextVersion:
      session?.status === "active" && session.version === result.nextVersion
        ? result.nextVersion
        : undefined,
  };
}
export async function commitOnboarding(
  context: OnboardingContext,
  decision: OnboardingDecision
): Promise<OnboardingResult> {
  validateOnboardingDecision(JSON.stringify(decision), context.input);
  return checkoutTransaction(async db => {
    const merchantId = context.source.merchantId;
    await db.execute("SELECT id FROM merchants WHERE id=? FOR UPDATE", [
      merchantId,
    ]);
    const fresh = await readOnboardingContext(
      merchantId,
      context.source.text,
      context.source.quotedMessageId,
      db
    );
    const prior = await findOnboardingReceipt(fresh, db);
    if (prior) return prior;
    if (
      fresh.source.digest !== context.source.digest ||
      fresh.input.basisHash !== context.input.basisHash
    )
      throw Error("Onboarding context changed");
    validateOnboardingDecision(JSON.stringify(decision), fresh.input);
    let result: OnboardingResult = { handled: false, response: "" };
    const { intent } = decision;
    if (intent === "clarify")
      result = {
        handled: true,
        response:
          "لم أحفظ تعديلًا. إن كنت تجيب عن المقابلة فاستخدم «الرد» على السؤال الحالي. ولتصحيح معلومة، حدّد الحقل والقيمة النهائية في رسالة واحدة.",
      };
    if (["answer", "update", "pause", "resume"].includes(intent)) {
      const [count] = await onboardingRows(
        db,
        "SELECT COUNT(*) AS n FROM merchant_onboarding_events WHERE merchant_id=? AND created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY) AND JSON_UNQUOTE(JSON_EXTRACT(decision_json,'$.intent')) IN ('answer','update','pause','resume')",
        [merchantId]
      );
      if (Number(count.n) >= 100) throw Error("Onboarding daily write limit");
      let answers = { ...fresh.input.answers };
      if (intent === "answer" || intent === "update") {
        const field = decision.fieldKey!,
          value =
            field === "businessType"
              ? decision.businessType!
              : context.source.text.trim();
        const [newer] = await onboardingRows(
          db,
          `SELECT a.id FROM merchant_onboarding_answers a
          JOIN merchant_onboarding_events e ON e.merchant_id=a.merchant_id AND e.event_key=a.verified_event_key
          WHERE a.merchant_id=? AND a.field_key=? AND CAST(JSON_UNQUOTE(JSON_EXTRACT(e.source_json,'$.inboundId')) AS UNSIGNED)>?`,
          [merchantId, field, context.source.inboundId]
        );
        if (newer) throw Error("Onboarding update predates current field");
        // Keep the complete original statement, including negation, conditions and exceptions.
        answers[field] = value;
        await db.execute(
          `INSERT INTO merchant_onboarding_answers (merchant_id,field_key,question_text,answer_text,phase,verified_event_key,answer_digest)
          VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE question_text=VALUES(question_text),answer_text=VALUES(answer_text),phase=VALUES(phase),verified_event_key=VALUES(verified_event_key),answer_digest=VALUES(answer_digest),updated_at=NOW()`,
          [
            merchantId,
            field,
            FIELD_LABELS[field],
            value,
            fresh.input.question?.key === field
              ? nextOnboardingQuestion(fresh.input.answers)?.phase || 0
              : 0,
            context.source.eventKey,
            onboardingHash([field, value, context.source.eventKey]),
          ]
        );
        result = {
          handled: true,
          response: `تم حفظ ${FIELD_LABELS[field]} من رسالتك. سأستخدمها كمعلومة عن النشاط، مع بقاء الأسعار والتوفر والدفع مرتبطة بسجلاتها الحالية.`,
        };
      } else
        result = {
          handled: true,
          response:
            intent === "pause"
              ? "أوقفت المقابلة مؤقتًا. يمكنك طلب استئنافها في أي وقت."
              : "نستأنف إعداد معلومات نشاطك.",
        };
      // An explicit update outside an interview must not silently start one.
      if (fresh.session || intent === "resume") {
        const version = (fresh.session?.version || 0) + 1;
        const status = await writeSession(
          db,
          merchantId,
          fresh.source.instanceId,
          fresh.source.authorPhone,
          version,
          intent === "pause"
            ? "paused"
            : intent === "resume"
              ? "active"
              : fresh.session.status,
          answers
        );
        if (status === "active") result.nextVersion = version;
        if (status === "completed")
          result.response +=
            " اكتملت أسئلة الإعداد. يمكنك تصحيح أي معلومة لاحقًا.";
      }
    }
    await db.execute(
      `INSERT INTO merchant_onboarding_events (merchant_id,event_key,source_digest,basis_hash,source_json,decision_json,result_json) VALUES (?,?,?,?,?,?,?)`,
      [
        merchantId,
        context.source.eventKey,
        context.source.digest,
        context.input.basisHash,
        JSON.stringify(context.source),
        JSON.stringify(decision),
        JSON.stringify(result),
      ]
    );
    return result;
  });
}
