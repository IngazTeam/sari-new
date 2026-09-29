import { and, eq, sql } from "drizzle-orm";
import { getDb, type SariDb } from "../db/connection";
import {
  merchants,
  knowledgeSections,
  knowledgeChangelog,
} from "../../drizzle/schema";
import {
  withKnowledgeTransaction,
  type KnowledgeTransaction,
} from "../knowledge/transaction";
import {
  readTeachingSource,
  type TeachingSource,
} from "../knowledge/whatsapp-teaching-source";
import { normalizeCampaignPhone } from "../automation/campaign-guard";
import { recordedAiReply } from "./understanding-evidence";
import {
  coachingContextSchema,
  coachingHash,
  validateCoachingDecision,
  type CoachingContext,
  type CoachingDecision,
} from "./coaching-understanding";
import { assertRuntimeSchema } from "../db/schema-readiness";

type Executor = SariDb | KnowledgeTransaction;
const decode = (value: any) =>
  typeof value === "string" ? JSON.parse(value) : value;
export async function assertCoachingSchema() {
  await assertRuntimeSchema("contextual merchant coaching", [
    {
      table: "sari_coaching_questions",
      columns: [
        "context_json",
        "context_digest",
        "delivery_key",
        "review_event_key",
        "review_source_digest",
        "review_analysis",
      ],
      uniqueIndexes: [
        { name: "uq_coaching_delivery", columns: ["delivery_key"] },
        {
          name: "uq_coaching_review_event",
          columns: ["merchant_id", "review_event_key"],
        },
      ],
    },
  ]);
}
async function database() {
  const db = await getDb();
  if (!db) throw Error("Coaching storage unavailable");
  return db;
}
export async function coachingRows(
  db: Executor,
  statement: ReturnType<typeof sql>
): Promise<any[]> {
  const [rows] = await db.execute(statement);
  return rows as unknown as any[];
}
export const coachingDeliveryKey = (merchantId: number, questionId: number) =>
  `coaching_question:${merchantId}:${questionId}`;
function displayText(text: string): string {
  return text
    .replace(
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b/gi,
      "[بريد محذوف]"
    )
    .replace(/\b(?:SA)?\d{2}(?:\s?\d{4}){5}\b/gi, "[حساب محذوف]")
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "[رقم محذوف]");
}
export function coachingPrompt(
  question: string,
  answer: string,
  index: number,
  total: number
): string {
  const prompt = `🧠 مراجعة رد ساري — سؤال ${index} من ${total}\n\n👤 سؤال العميل:\n${displayText(question)}\n\n🤖 رد ساري:\n${displayText(answer)}\n\nاستخدم «رد / Reply» على هذه الرسالة، ثم وضّح هل الرد صحيح، أو اكتب التصحيح كاملًا، أو اطلب تجاوز السؤال. التصحيح يُحفظ للمراجعة قبل اعتماده في المعرفة.`;
  if (
    !question.trim() ||
    !answer.trim() ||
    question.length + answer.length > 3000 ||
    prompt.length > 4096
  )
    throw Error("Coaching question cannot be shown completely");
  return prompt;
}
async function channel(
  db: Executor,
  merchantId: number,
  instanceId?: number,
  lock = false
) {
  const rows = await coachingRows(
    db,
    sql`SELECT m.phone,m.emergency_phone,m.escalation_phones,i.id AS instance_id,i.instance_id AS account_id,i.provider,i.phone_number
    FROM merchants m JOIN users u ON u.id=m.userId JOIN whatsapp_instances i ON i.merchant_id=m.id
    WHERE m.id=${merchantId} AND m.status<>'suspended' AND u.account_status='active' AND i.status='active'
      AND i.provider IN ('green_api','meta_cloud') ${instanceId ? sql`AND i.id=${instanceId}` : sql``}
    ORDER BY i.is_primary DESC,i.id LIMIT 1 ${lock ? sql`FOR UPDATE` : sql``}`
  );
  if (!rows[0]) throw Error("Coaching channel unavailable");
  const row = rows[0];
  let chain: any[] = [];
  try {
    const raw = decode(row.escalation_phones);
    if (Array.isArray(raw)) chain = raw;
  } catch {}
  const phones = [
    ...chain
      .sort((a, b) => Number(a?.order || 0) - Number(b?.order || 0))
      .map(item => item?.phone),
    row.emergency_phone,
    row.phone,
  ]
    .map(value => normalizeCampaignPhone(value))
    .filter((value): value is string => !!value);
  if (!phones.length) throw Error("Coaching recipient unavailable");
  return {
    ...row,
    recipient: phones[0],
    authorized: [...phones, normalizeCampaignPhone(row.phone_number)].filter(
      Boolean
    ),
  };
}
async function history(
  db: Executor,
  merchantId: number,
  conversationId: number,
  outgoingId: number,
  lock = false
) {
  const [conversation] = await coachingRows(
    db,
    sql`SELECT c.customerPhone,COALESCE(p.memory_forget_before_message_id,0) AS cutoff
    FROM conversations c LEFT JOIN customer_profiles p ON p.merchant_id=c.merchantId AND p.customer_phone=c.customerPhone
    WHERE c.id=${conversationId} AND c.merchantId=${merchantId} ${lock ? sql`FOR UPDATE` : sql``}`
  );
  if (
    !conversation ||
    !normalizeCampaignPhone(conversation.customerPhone) ||
    !/^\d{8,15}$/.test(conversation.customerPhone)
  )
    throw Error("Coaching conversation unavailable");
  const rows = await coachingRows(
    db,
    sql`SELECT id,direction,messageType,content,sender_type,isProcessed,aiResponse,createdAt
    FROM messages WHERE conversationId=${conversationId} AND id<=${outgoingId} AND id>${Number(conversation.cutoff)}
    ORDER BY id DESC LIMIT 21 ${lock ? sql`FOR UPDATE` : sql``}`
  );
  return {
    customerPhone: conversation.customerPhone,
    messages: rows
      .reverse()
      .map(m => ({
        id: Number(m.id),
        direction: m.direction,
        messageType: String(m.messageType),
        content: String(m.content ?? ""),
        senderType: m.sender_type ?? null,
        isAiReply: recordedAiReply(m),
        createdAt: new Date(m.createdAt).toISOString(),
      })),
  };
}
export async function verifyCoachingContext(
  db: Executor,
  row: any,
  lock = false
): Promise<CoachingContext> {
  const context = coachingContextSchema.parse(decode(row.context_json));
  if (
    context.merchantId !== Number(row.merchant_id) ||
    context.conversationId !== Number(row.conversation_id) ||
    coachingHash(context) !== row.context_digest ||
    row.delivery_key !== coachingDeliveryKey(context.merchantId, Number(row.id))
  )
    throw Error("Coaching basis mismatch");
  const current = await channel(
    db,
    context.merchantId,
    context.instanceId,
    lock
  );
  if (
    current.provider !== context.provider ||
    current.account_id !== context.accountId ||
    !current.authorized.includes(context.recipient)
  )
    throw Error("Coaching recipient changed");
  const live = await history(
    db,
    context.merchantId,
    context.conversationId,
    context.outgoingId,
    lock
  );
  if (
    live.customerPhone !== context.customerPhone ||
    coachingHash(live.messages) !== coachingHash(context.messages)
  )
    throw Error("Coaching conversation changed");
  const outgoing = context.messages.at(-1),
    incoming = context.messages.filter(m => m.direction === "incoming").at(-1);
  if (
    !outgoing ||
    !incoming ||
    outgoing.id !== context.outgoingId ||
    !outgoing.isAiReply ||
    outgoing.direction !== "outgoing" ||
    incoming.id !== context.incomingId ||
    incoming.content !== row.customer_question ||
    outgoing.content !== row.bot_response ||
    incoming.messageType !== "text" ||
    outgoing.messageType !== "text" ||
    context.prompt !==
      coachingPrompt(
        incoming.content,
        outgoing.content,
        Number(row.question_order),
        Number(row.total_questions)
      )
  )
    throw Error("Coaching question changed");
  return context;
}
export type CoachingCandidate = {
  conversationId: number;
  incomingId: number;
  outgoingId: number;
  customerQuestion: string;
  botResponse: string;
};
export async function createContextualCoachingSession(
  merchantId: number,
  candidates: CoachingCandidate[]
): Promise<number | null> {
  if (
    !Number.isSafeInteger(merchantId) ||
    merchantId < 1 ||
    !candidates.length ||
    candidates.length > 2
  )
    throw Error("Invalid coaching session");
  await assertCoachingSchema();
  const db = await database();
  return db.transaction(async tx => {
    const [merchant] = await tx
      .select({ id: merchants.id })
      .from(merchants)
      .where(eq(merchants.id, merchantId))
      .for("update");
    if (!merchant) throw Error("Unknown merchant");
    const [active] = await coachingRows(
      tx,
      sql`SELECT id FROM sari_coaching_sessions WHERE merchant_id=${merchantId} AND status='active' AND started_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 8 HOUR) ORDER BY id DESC LIMIT 1 FOR UPDATE`
    );
    if (active) return Number(active.id);
    const [recent] = await coachingRows(
      tx,
      sql`SELECT id FROM sari_coaching_sessions WHERE merchant_id=${merchantId} AND created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 24 HOUR) LIMIT 1 FOR UPDATE`
    );
    if (recent) return null;
    const account = await channel(tx, merchantId, undefined, true),
      contexts: CoachingContext[] = [];
    for (const [index, candidate] of Array.from(candidates.entries())) {
      if (
        ![
          candidate.conversationId,
          candidate.incomingId,
          candidate.outgoingId,
        ].every(id => Number.isSafeInteger(id) && id > 0)
      )
        throw Error("Invalid coaching candidate");
      const live = await history(
          tx,
          merchantId,
          candidate.conversationId,
          candidate.outgoingId,
          true
        ),
        out = live.messages.at(-1),
        incoming = live.messages.filter(m => m.direction === "incoming").at(-1);
      if (
        !out ||
        !incoming ||
        !out.isAiReply ||
        out.id !== candidate.outgoingId ||
        incoming.id !== candidate.incomingId ||
        out.messageType !== "text" ||
        incoming.messageType !== "text" ||
        out.content !== candidate.botResponse ||
        incoming.content !== candidate.customerQuestion
      )
        throw Error("Coaching candidate changed");
      contexts.push(
        coachingContextSchema.parse({
          version: 1,
          merchantId,
          conversationId: candidate.conversationId,
          customerPhone: live.customerPhone,
          incomingId: incoming.id,
          outgoingId: out.id,
          instanceId: account.instance_id,
          provider: account.provider,
          accountId: account.account_id,
          recipient: account.recipient,
          messages: live.messages,
          prompt: coachingPrompt(
            incoming.content,
            out.content,
            index + 1,
            candidates.length
          ),
        })
      );
    }
    const [inserted] = await tx.execute(
      sql`INSERT INTO sari_coaching_sessions (merchant_id,total_questions,status,started_at) VALUES (${merchantId},${contexts.length},'active',UTC_TIMESTAMP())`
    );
    const sessionId = Number((inserted as any).insertId);
    for (const [index, context] of Array.from(contexts.entries())) {
      const [saved] =
        await tx.execute(sql`INSERT INTO sari_coaching_questions (session_id,merchant_id,conversation_id,customer_question,bot_response,question_order,context_json,context_digest)
        VALUES (${sessionId},${merchantId},${context.conversationId},${candidates[index].customerQuestion},${candidates[index].botResponse},${index + 1},${JSON.stringify(context)},${coachingHash(context)})`);
      const id = Number((saved as any).insertId);
      await tx.execute(
        sql`UPDATE sari_coaching_questions SET delivery_key=${coachingDeliveryKey(merchantId, id)} WHERE id=${id} AND merchant_id=${merchantId}`
      );
    }
    return sessionId;
  });
}
export type CoachingReview = {
  source: TeachingSource;
  question: any;
  context: CoachingContext;
  basisHash: string;
};
const questionQuery = (
  merchantId: number,
  id: number,
  lock = false
) => sql`SELECT q.*,s.total_questions,s.current_question_index,s.status AS session_status,s.created_at AS session_created_at,
  (s.created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 24 HOUR)) AS recent_session
  FROM sari_coaching_questions q JOIN sari_coaching_sessions s ON s.id=q.session_id AND s.merchant_id=q.merchant_id
  WHERE q.id=${id} AND q.merchant_id=${merchantId} ${lock ? sql`FOR UPDATE` : sql``}`;
export async function readCoachingQuestion(merchantId: number, id: number) {
  return (
    (await coachingRows(await database(), questionQuery(merchantId, id)))[0] ??
    null
  );
}
export async function currentCoachingQuestion(
  merchantId: number,
  sessionId: number
) {
  const db = await database();
  const [row] = await coachingRows(
    db,
    sql`SELECT q.id FROM sari_coaching_sessions s JOIN sari_coaching_questions q ON q.session_id=s.id AND q.merchant_id=s.merchant_id
    AND q.question_order=s.current_question_index+1 WHERE s.id=${sessionId} AND s.merchant_id=${merchantId} AND s.status='active' AND s.created_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 24 HOUR)`
  );
  return row ? readCoachingQuestion(merchantId, Number(row.id)) : null;
}
async function assertReceipt(
  db: Executor,
  row: any,
  context: CoachingContext,
  source: TeachingSource,
  lock = false
) {
  if (
    !source.quotedMessageId ||
    source.instanceId !== context.instanceId ||
    source.authorPhone !== context.recipient
  )
    throw Error("Coaching reply recipient mismatch");
  const [delivery] = await coachingRows(
    db,
    sql`SELECT d.* FROM whatsapp_message_deliveries d JOIN whatsapp_inbound_jobs j ON j.id=${source.inboundId} AND j.merchant_id=d.merchant_id
    WHERE d.idempotency_key=${row.delivery_key} AND d.merchant_id=${source.merchantId} AND d.instance_id=${source.instanceId}
      AND d.provider=${context.provider} AND d.provider_message_id=${source.quotedMessageId} AND d.direction='outgoing' AND d.status IN ('sent','delivered','read')
      AND d.created_at<=j.created_at ${lock ? sql`FOR UPDATE` : sql``}`
  );
  const request = decode(delivery?.request_json);
  if (
    !delivery ||
    request?.to !== context.recipient ||
    request?.text !== context.prompt ||
    request?.kind !== "text" ||
    request?.coachingGuard?.questionId !== Number(row.id)
  )
    throw Error("Coaching question delivery unverified");
}
export async function findCoachingReview(
  merchantId: number,
  text: string,
  quote: string
): Promise<CoachingReview | null> {
  await assertCoachingSchema();
  const db = await database();
  const source = await readTeachingSource(merchantId, text, db, false, quote);
  const matches = await coachingRows(
    db,
    sql`SELECT q.id FROM sari_coaching_questions q JOIN whatsapp_message_deliveries d ON d.idempotency_key=q.delivery_key AND d.merchant_id=q.merchant_id
    WHERE q.merchant_id=${merchantId} AND d.instance_id=${source.instanceId} AND d.provider_message_id=${quote} LIMIT 2`
  );
  if (!matches.length) return null;
  if (matches.length !== 1) throw Error("Ambiguous coaching quote");
  const question = (
    await coachingRows(db, questionQuery(merchantId, Number(matches[0].id)))
  )[0];
  const context = await verifyCoachingContext(db, question);
  await assertReceipt(db, question, context, source);
  if (
    question.review_event_key === source.eventKey &&
    question.review_source_digest !== source.digest
  )
    throw Error("Reviewed source changed");
  return {
    source,
    question,
    context,
    basisHash: coachingHash({
      questionId: Number(question.id),
      contextDigest: question.context_digest,
      sourceDigest: source.digest,
    }),
  };
}
export type CoachingCommit = {
  sessionId: number;
  completed: boolean;
  replayed: boolean;
  verdict: string;
  sectionId: number | null;
};
export async function commitCoachingReview(
  review: CoachingReview,
  decision: CoachingDecision
): Promise<CoachingCommit> {
  const { source } = review;
  const verified = validateCoachingDecision(JSON.stringify(decision), {
    basisHash: review.basisHash,
    context: review.context,
    reply: source.text,
  });
  if (!["confirm", "correct", "skip"].includes(verified.verdict))
    throw Error("Coaching decision is not actionable");
  return withKnowledgeTransaction(source.merchantId, async tx => {
    const fresh = await readTeachingSource(
      source.merchantId,
      source.text,
      tx,
      true,
      source.quotedMessageId
    );
    if (fresh.digest !== source.digest) throw Error("Coaching source changed");
    const [question] = await coachingRows(
      tx,
      questionQuery(source.merchantId, Number(review.question.id), true)
    );
    if (!question) throw Error("Coaching question unavailable");
    const context = await verifyCoachingContext(tx, question, true);
    await assertReceipt(tx, question, context, source, true);
    const basisHash = coachingHash({
      questionId: Number(question.id),
      contextDigest: question.context_digest,
      sourceDigest: source.digest,
    });
    if (
      basisHash !== review.basisHash ||
      coachingHash(coachingContextSchema.parse(review.context)) !==
        question.context_digest
    )
      throw Error("Coaching basis changed");
    if (question.merchant_verdict) {
      if (
        question.review_event_key !== source.eventKey ||
        question.review_source_digest !== source.digest
      )
        throw Error("Question already reviewed");
      return {
        sessionId: Number(question.session_id),
        completed: question.session_status === "completed",
        replayed: true,
        verdict: question.merchant_verdict,
        sectionId: null,
      };
    }
    if (
      !["active", "expired"].includes(question.session_status) ||
      !Number(question.recent_session) ||
      Number(question.current_question_index) + 1 !==
        Number(question.question_order)
    )
      throw Error("Coaching session superseded");
    const verdict =
      verified.verdict === "confirm"
        ? "correct"
        : verified.verdict === "correct"
          ? "corrected"
          : "skipped";
    let sectionId: number | null = null;
    if (verdict === "corrected") {
      const content = `سؤال العميل:\n${question.customer_question}\n\nرد ساري السابق:\n${question.bot_response}\n\nتصحيح التاجر (للمراجعة قبل التعميم):\n${source.text.trim()}`;
      const [saved] = await tx
        .insert(knowledgeSections)
        .values({
          merchantId: source.merchantId,
          title: `مراجعة رد ساري ${question.id}`,
          content,
          source: "manual",
          sectionType: "faq",
          sourceUrl: `coaching-review://${source.eventKey}`,
          status: "pending_review",
          useInBot: 0,
          injectAs: "fact",
          merchantEdited: 1,
          provenance: {
            origin: "contextual_coaching",
            questionId: Number(question.id),
            inboundId: source.inboundId,
            contextDigest: question.context_digest,
            sourceDigest: source.digest,
            analysis: verified,
            approval: "required",
          },
        });
      sectionId = Number(saved.insertId);
      await tx
        .insert(knowledgeChangelog)
        .values({
          merchantId: source.merchantId,
          sectionId,
          action: "conflict",
          source: "contextual_coaching",
          reason:
            "تصحيح رد مرتبط بسؤاله؛ يلزم تنقيحه واعتماده قبل استخدامه مع العملاء",
          oldContent: null,
          newContent: content,
        });
    }
    const [changed] =
      await tx.execute(sql`UPDATE sari_coaching_questions SET merchant_verdict=${verdict},merchant_correction=${verdict === "corrected" ? source.text.trim() : null},
      reviewed_at=UTC_TIMESTAMP(),review_event_key=${source.eventKey},review_source_digest=${source.digest},review_analysis=${JSON.stringify(verified)}
      WHERE id=${question.id} AND merchant_id=${source.merchantId} AND merchant_verdict IS NULL`);
    if (Number((changed as any).affectedRows) !== 1)
      throw Error("Coaching verdict conflict");
    const completed =
      Number(question.question_order) >= Number(question.total_questions);
    await tx.execute(sql`UPDATE sari_coaching_sessions SET current_question_index=current_question_index+1,
      correct_count=correct_count+${verdict === "correct" ? 1 : 0},corrected_count=corrected_count+${verdict === "corrected" ? 1 : 0},skipped_count=skipped_count+${verdict === "skipped" ? 1 : 0},
      status=${completed ? "completed" : "active"},completed_at=${completed ? sql`UTC_TIMESTAMP()` : sql`NULL`},started_at=UTC_TIMESTAMP()
      WHERE id=${question.session_id} AND merchant_id=${source.merchantId}`);
    return {
      sessionId: Number(question.session_id),
      completed,
      replayed: false,
      verdict,
      sectionId,
    };
  });
}
