import { randomUUID } from "node:crypto";
import { getPool } from "../../db/connection";
import { conversationUnderstandingSchema } from "../../ai/conversation-understanding-context";
import {
  contextualLearningWeights,
  validateLearningSignals,
  type ContextualLearningSignal,
} from "../../ai/contextual-learning-contract";
import {
  understandingDigest,
  verifyUnderstandingEvidence,
} from "../../ai/understanding-evidence";
import { learningUnderstandingFixture } from "./learning-understanding-fixture";

/** Explicit synthetic transcripts/model output for downstream lifecycle fixtures.
 * This is not a production migration or a linguistic oracle. It neither mocks
 * the evidence reader nor calls a model. Real capture is tested separately. */
export async function seedSealedLearningFixture(signalIds: number[]) {
  const pool = await getPool();
  if (!pool) throw Error("Fixture database unavailable");
  for (const id of signalIds) {
    const c = await pool.getConnection();
    try {
      await c.beginTransaction();
      const [rows] = await c.execute<any[]>(
        `SELECT s.*,v.handoff_version FROM sari_learning_signals s
        JOIN conversations v ON v.id=s.conversation_id AND v.merchantId=s.merchant_id WHERE s.id=?`,
        [id]
      );
      if (rows.length !== 1) throw Error("Fixture source unavailable");
      const row = rows[0],
        type = row.signal_type as ContextualLearningSignal["type"];
      if (
        !(type in contextualLearningWeights) ||
        String(row.source_key || "").startsWith("contextual_learning:")
      )
        throw Error(
          "Fixture must explicitly seed a new unsealed contextual source"
        );
      const customer = row.customer_message || "Synthetic customer reaction",
        bot = row.bot_message || "Synthetic assistant offer";
      const [assistant] = await c.execute<any>(
        `INSERT INTO messages(conversationId,direction,messageType,content,aiResponse,isProcessed,sender_type)
        VALUES (?,'outgoing','text',?,?,1,'assistant')`,
        [row.conversation_id, bot, bot]
      );
      const [source] = await c.execute<any>(
        `INSERT INTO messages(conversationId,direction,messageType,content,isProcessed,sender_type)
        VALUES (?,'incoming','text',?,1,'customer')`,
        [row.conversation_id, customer]
      );
      const [messages] = await c.execute<any[]>(
        "SELECT * FROM messages WHERE id IN (?,?) ORDER BY id",
        [assistant.insertId, source.insertId]
      );
      const input = {
        currentMessageId: source.insertId,
        catalog: [],
        targets: [],
        messages: messages.map(m => ({
          id: m.id,
          role:
            m.direction === "incoming"
              ? ("user" as const)
              : ("assistant" as const),
          content: String(m.content),
          isAiReply: m.direction === "outgoing",
        })),
      };
      const analysis = conversationUnderstandingSchema.parse(
        learningUnderstandingFixture(input, [type])
      );
      validateLearningSignals(analysis, input);
      const evidence = messages.map(m => ({
        id: m.id,
        role: m.direction === "incoming" ? "user" : "assistant",
        digest: understandingDigest(String(m.content).slice(0, 16000)),
        createdAt: new Date(m.createdAt).toISOString(),
        isAiReply: m.direction === "outgoing",
      }));
      const sourceDigest = understandingDigest(customer),
        contextDigest = understandingDigest(input);
      const resultDigest = understandingDigest({
        source: sourceDigest,
        context: contextDigest,
        evidence,
        analysis,
      });
      const record = {
        conversation_id: row.conversation_id,
        memory_cutoff: 0,
        source_digest: sourceDigest,
        context_digest: contextDigest,
        message_evidence: evidence,
        result_json: analysis,
        result_digest: resultDigest,
      };
      verifyUnderstandingEvidence(record, messages);
      await c.execute(
        `INSERT INTO ai_conversation_understanding
        (merchant_id,conversation_id,incoming_message_id,ownership_version,memory_cutoff,source_digest,context_digest,message_evidence,state,attempt_token,result_json,result_digest)
        VALUES (?,?,?,?,0,?,?,?,'ready',?,?,?)`,
        [
          row.merchant_id,
          row.conversation_id,
          source.insertId,
          row.handoff_version,
          sourceDigest,
          contextDigest,
          JSON.stringify(evidence),
          randomUUID(),
          JSON.stringify(analysis),
          resultDigest,
        ]
      );
      await c.execute(
        `UPDATE sari_learning_signals SET signal_weight=?,customer_message=?,bot_message=?,merchant_correction=NULL,source_key=?,context_summary=? WHERE id=?`,
        [
          contextualLearningWeights[type],
          customer.slice(0, 2000),
          bot.slice(0, 2000),
          `contextual_learning:${row.conversation_id}:${source.insertId}`,
          JSON.stringify({
            version: 1,
            basis: "interpreted_conversation",
            sourceMessageId: source.insertId,
            interpretationDigest: resultDigest,
            aboutAssistantMessageId: assistant.insertId,
            objection: ["price_objection", "sales_objection"].includes(type)
              ? analysis.objection
              : null,
            financialOutcome: "unmeasured",
            causality: "unmeasured",
          }),
          id,
        ]
      );
      await c.commit();
    } catch (error) {
      await c.rollback();
      throw error;
    } finally {
      c.release();
    }
  }
}
