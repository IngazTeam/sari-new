import { createHash } from "node:crypto";
import { z } from "zod";
import { conversationUnderstandingSchema } from "./conversation-understanding-context";

export const understandingDigest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const decodeUnderstandingJson = (value: any) =>
  typeof value === "string" ? JSON.parse(value) : value;
export const understandingEvidenceSchema = z
  .array(
    z
      .object({
        id: z.number().int().positive(),
        role: z.enum(["user", "assistant"]),
        digest: z.string().length(64),
        createdAt: z.string().datetime().optional(),
        isAiReply: z.boolean().optional(),
      })
      .strict()
  )
  .min(1)
  .max(21);

export function recordedAiReply(m: any): boolean {
  return (
    m.direction === "outgoing" &&
    m.sender_type === "assistant" &&
    Number(m.isProcessed) === 1 &&
    m.aiResponse != null &&
    m.aiResponse === m.content
  );
}

/** Immutable evidence only. Live action authority (handoff, newest turn, privacy cutoff) is checked by its caller. */
export function verifyUnderstandingEvidence(record: any, messages: any[]) {
  const evidence = understandingEvidenceSchema.parse(
    decodeUnderstandingJson(record.message_evidence)
  );
  if (
    evidence.some(e => {
      const m = messages.find(
        m => m.id === e.id && m.conversationId === record.conversation_id
      );
      return (
        !m ||
        m.id <= record.memory_cutoff ||
        understandingDigest(String(m.content || "").slice(0, 16000)) !==
          e.digest ||
        (m.direction === "incoming" ? "user" : "assistant") !== e.role ||
        (e.createdAt !== undefined &&
          e.createdAt !== new Date(m.createdAt).toISOString()) ||
        (e.isAiReply !== undefined && e.isAiReply !== recordedAiReply(m))
      );
    })
  )
    throw Error("Interpretation evidence changed");
  const analysis = conversationUnderstandingSchema.parse(
    decodeUnderstandingJson(record.result_json)
  );
  if (
    understandingDigest({
      source: record.source_digest,
      context: record.context_digest,
      evidence,
      analysis,
    }) !== record.result_digest
  )
    throw Error("Interpretation seal changed");
  return { analysis, evidence };
}
