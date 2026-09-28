import { getPool } from "../db/connection";
import { assertRuntimeSchema } from "../db/schema-readiness";
import {
  lockReplySource,
  ordinaryReplyDigest,
  ordinaryReplyText,
} from "./reply-reservation";
import { readStoredUnderstanding } from "./conversation-understanding";
import { semanticIdentityMatches } from "./conversation-understanding-context";
import {
  contextualLearningWeights,
  resolvedLearningSignals,
  validateLearningSignals,
} from "./contextual-learning-contract";
import {
  captureLearningSignalsInTransaction,
  LearningSignalCaptureError,
} from "./learning-signal-capture";
import type { ReplyPlan } from "../messaging/reply-plan";
import { normalizeCampaignPhone } from "../automation/campaign-guard";

export type ContextualLearningInput = {
  merchantId: number;
  conversationId: number;
  incomingMessageId: number;
  jobId: number;
  leaseToken: string;
};
const unavailable = (): never => {
  throw new LearningSignalCaptureError("ownership");
};
const decode = (v: any) => (typeof v === "string" ? JSON.parse(v) : v);

/** A delivered interaction may learn about an earlier AI reply. Never interpret words here or call a provider. */
export async function captureContextualLearningSignals(
  input: ContextualLearningInput
): Promise<number> {
  if (
    !input ||
    ![
      input.merchantId,
      input.conversationId,
      input.incomingMessageId,
      input.jobId,
    ].every(v => Number.isSafeInteger(v) && v > 0) ||
    typeof input.leaseToken !== "string" ||
    !input.leaseToken ||
    input.leaseToken.length > 64
  )
    throw new LearningSignalCaptureError("invalid_input");
  if (!semanticIdentityMatches(input)) return unavailable();
  await assertRuntimeSchema("contextual learning", [
    {
      table: "ai_interaction_jobs",
      columns: [
        "reply_origin",
        "reply_plan",
        "reply_digest",
        "lease_token",
        "lease_until",
      ],
    },
    {
      table: "ai_conversation_understanding",
      columns: ["result_json", "result_digest", "message_evidence"],
    },
    {
      table: "sari_learning_signals",
      columns: ["source_key"],
      uniqueIndexes: [
        {
          name: "uq_learning_source",
          columns: ["merchant_id", "source_key", "signal_type"],
        },
      ],
    },
  ]);
  const pool = await getPool();
  if (!pool) throw new LearningSignalCaptureError("storage_unavailable");
  const c = await pool.getConnection();
  try {
    await c.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await c.beginTransaction();
    await lockReplySource(
      c,
      input.merchantId,
      input.conversationId,
      input.incomingMessageId
    );
    const [jobs] = await c.execute<any[]>(
      `SELECT * FROM ai_interaction_jobs WHERE id=? AND merchant_id=? AND conversation_id=? AND incoming_message_id=?
      AND state='processing' AND lease_token=? AND lease_until>UTC_TIMESTAMP(3) FOR UPDATE`,
      [
        input.jobId,
        input.merchantId,
        input.conversationId,
        input.incomingMessageId,
        input.leaseToken,
      ]
    );
    const job = jobs[0];
    if (!job) return unavailable();
    // Reviewed replies have their own non-learning reservation lifecycle. Legacy unsealed jobs are not training authority.
    if (job.reply_origin !== "ordinary") return 0;
    const plan: ReplyPlan = decode(job.reply_plan);
    if (
      !plan ||
      plan.conversationId !== input.conversationId ||
      plan.incomingMessageId !== input.incomingMessageId ||
      !plan.effects?.length ||
      plan.effects.some(e => e.merchantId !== input.merchantId) ||
      ordinaryReplyDigest(plan) !== job.reply_digest ||
      ordinaryReplyText(plan) !== job.reply_text
    )
      return unavailable();
    const [conversations] = await c.execute<any[]>(
      "SELECT customerPhone FROM conversations WHERE id=? AND merchantId=?",
      [input.conversationId, input.merchantId]
    );
    const identity = {
      ...input,
      customerPhone: String(conversations[0]?.customerPhone || ""),
    };
    const phone = normalizeCampaignPhone(identity.customerPhone);
    if (
      !phone ||
      identity.customerPhone.startsWith("group_") ||
      identity.customerPhone.includes("@g.us")
    )
      return 0;
    if (plan.effects.some(e => normalizeCampaignPhone(e.to) !== phone))
      return unavailable();
    const stored = await readStoredUnderstanding(c, identity, true);
    const signals = resolvedLearningSignals(stored?.analysis);
    if (!signals.length) return 0;
    const [legacy] = await c.execute<any[]>(
      "SELECT id FROM sari_learning_signals WHERE merchant_id=? AND conversation_id=? AND source_key=? LIMIT 1",
      [
        input.merchantId,
        input.conversationId,
        `message:${input.incomingMessageId}`,
      ]
    );
    if (legacy.length) return 0; // Rolling upgrade: do not count a legacy event again under a new interpretation.
    const evidenceIds = Array.from(
      new Set(signals.flatMap(s => s.evidence.map(e => e.messageId)))
    );
    const [messages] = await c.execute<any[]>(
      `SELECT id,direction,content,sender_type,isProcessed,aiResponse FROM messages
      WHERE conversationId=? AND id IN (${evidenceIds.map(() => "?").join(",")})`,
      [input.conversationId, ...evidenceIds]
    );
    validateLearningSignals(stored!.analysis, {
      currentMessageId: input.incomingMessageId,
      catalog: [],
      targets: [],
      messages: messages.map(m => ({
        id: m.id,
        role: m.direction === "incoming" ? "user" : "assistant",
        content: String(m.content || ""),
        isAiReply:
          m.direction === "outgoing" &&
          m.sender_type === "assistant" &&
          Number(m.isProcessed) === 1 &&
          m.aiResponse != null &&
          m.aiResponse === m.content,
      })),
    });
    const [understandings] = await c.execute<any[]>(
      "SELECT result_digest FROM ai_conversation_understanding WHERE merchant_id=? AND conversation_id=? AND incoming_message_id=?",
      [input.merchantId, input.conversationId, input.incomingMessageId]
    );
    const sourceKey = `contextual_learning:${input.conversationId}:${input.incomingMessageId}`;
    const [prior] = await c.execute<any[]>(
      "SELECT signal_type FROM sari_learning_signals WHERE merchant_id=? AND source_key=?",
      [input.merchantId, sourceKey]
    );
    await captureLearningSignalsInTransaction(
      c,
      signals.map(signal => ({
        merchantId: input.merchantId,
        conversationId: input.conversationId,
        signalType: signal.type,
        signalWeight: contextualLearningWeights[signal.type],
        sourceKey,
        strict: true,
        customerMessage: stored!.message,
        botMessage:
          signal.aboutAssistantMessageId === null
            ? undefined
            : String(
                messages.find(m => m.id === signal.aboutAssistantMessageId)!
                  .content
              ),
        contextSummary: JSON.stringify({
          version: 1,
          basis: "interpreted_conversation",
          sourceMessageId: input.incomingMessageId,
          interpretationDigest: understandings[0].result_digest,
          aboutAssistantMessageId: signal.aboutAssistantMessageId,
          objection: ["sales_objection", "price_objection"].includes(
            signal.type
          )
            ? stored!.analysis.objection
            : null,
          financialOutcome: "unmeasured",
          causality: "unmeasured",
        }),
      }))
    );
    const final = await readStoredUnderstanding(c, identity, true);
    if (JSON.stringify(final?.analysis) !== JSON.stringify(stored!.analysis))
      return unavailable();
    const [live] = await c.execute<any[]>(
      "SELECT id FROM ai_interaction_jobs WHERE id=? AND state='processing' AND lease_token=? AND lease_until>UTC_TIMESTAMP(3)",
      [input.jobId, input.leaseToken]
    );
    if (live.length !== 1) return unavailable();
    await c.commit();
    return signals.filter(s => !prior.some(p => p.signal_type === s.type))
      .length;
  } finally {
    try {
      await c.rollback();
    } finally {
      c.release();
    }
  }
}
