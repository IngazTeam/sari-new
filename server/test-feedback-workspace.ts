import type { RowDataPacket } from "mysql2/promise";
import {
  testSessionListInput,
  testTranscriptInput,
  testFeedbackInput,
  type SavedTestMessage,
  type TestRating,
} from "../shared/test-feedback-workspace";
import { testConversationId } from "../shared/test-sari-workspace";
import type { z } from "zod";
import {
  testWorkspacePool,
  withOwnedTestSession,
  TestWorkspaceError,
} from "./test-sari-store";
import { assertRuntimeSchema } from "./db/schema-readiness";

export async function listSavedTestSessions(
  merchantId: number,
  raw: z.input<typeof testSessionListInput>
) {
  testConversationId.parse(merchantId);
  const input = testSessionListInput.parse(raw),
    pool = await testWorkspacePool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT c.id,
    DATE_FORMAT(c.startedAt,'%Y-%m-%dT%H:%i:%s.000Z') startedAt,
    (SELECT COUNT(*) FROM testMessages m WHERE m.conversationId=c.id) messageCount,
    EXISTS(SELECT 1 FROM testDeals d WHERE d.conversationId=c.id AND d.merchantId=c.merchantId AND d.dealValue>0) hasDeal
    FROM testConversations c WHERE c.merchantId=? AND c.id<? ORDER BY c.id DESC LIMIT ?`,
    [merchantId, input.beforeId ?? 2147483648, input.limit + 1]
  );
  const items = rows
    .slice(0, input.limit)
    .map(r => ({
      id: Number(r.id),
      startedAt: String(r.startedAt),
      messageCount: Number(r.messageCount),
      hasDeal: !!r.hasDeal,
    }));
  return {
    merchantId,
    items,
    nextCursor: rows.length > input.limit ? items.at(-1)!.id : null,
  };
}

export async function readSavedTestTranscript(
  merchantId: number,
  raw: z.input<typeof testTranscriptInput>
) {
  const input = testTranscriptInput.parse(raw);
  return withOwnedTestSession(merchantId, input.conversationId, async c => {
    const [rows] = await c.execute<RowDataPacket[]>(
      `SELECT id,clientMessageId,sender,content,replySource,responseTime,rating,ratingRevision,
      DATE_FORMAT(sentAt,'%Y-%m-%dT%H:%i:%s.000Z') sentAt,
      DATE_FORMAT(ratedAt,'%Y-%m-%dT%H:%i:%s.000Z') ratedAt
      FROM testMessages WHERE conversationId=? AND id<? ORDER BY id DESC LIMIT ?`,
      [input.conversationId, input.beforeId ?? 2147483648, input.limit + 1]
    );
    const [summary] = await c.execute<RowDataPacket[]>(
      `SELECT COUNT(*) total,
      COALESCE(SUM(sender='sari' AND (replySource IS NULL OR replySource!='guardrail')),0) replies,
      COALESCE(SUM(sender='sari' AND (replySource IS NULL OR replySource!='guardrail') AND rating='positive'),0) positive,
      COALESCE(SUM(sender='sari' AND (replySource IS NULL OR replySource!='guardrail') AND rating='negative'),0) negative
      FROM testMessages WHERE conversationId=?`,
      [input.conversationId]
    );
    const [deals] = await c.execute<RowDataPacket[]>(
      "SELECT id,dealValue FROM testDeals WHERE conversationId=? AND merchantId=? ORDER BY id LIMIT 1",
      [input.conversationId, merchantId]
    );
    const [session] = await c.execute<RowDataPacket[]>(
      "SELECT DATE_FORMAT(startedAt,'%Y-%m-%dT%H:%i:%s.000Z') startedAt FROM testConversations WHERE id=?",
      [input.conversationId]
    );
    const items = rows
      .slice(0, input.limit)
      .map(r => ({
        id: Number(r.id),
        clientMessageId: r.clientMessageId ?? null,
        sender: r.sender,
        content: r.content,
        sentAt: r.sentAt,
        replySource: r.replySource ?? null,
        responseTime: r.responseTime === null ? null : Number(r.responseTime),
        rating: r.rating ?? null,
        ratingRevision: Number(r.ratingRevision),
        ratedAt: r.ratedAt ?? null,
      })) as SavedTestMessage[];
    const nextCursor = rows.length > input.limit ? items.at(-1)!.id : null;
    return {
      merchantId,
      conversationId: input.conversationId,
      startedAt: String(session[0].startedAt),
      items: items.reverse(),
      nextCursor,
      totalMessages: Number(summary[0].total),
      feedback: {
        replies: Number(summary[0].replies),
        positive: Number(summary[0].positive),
        negative: Number(summary[0].negative),
      },
      deal: deals[0]
        ? { id: Number(deals[0].id), value: Number(deals[0].dealValue) }
        : null,
    };
  });
}

export async function saveTestFeedback(
  merchantId: number,
  reviewerId: number,
  raw: z.infer<typeof testFeedbackInput>
) {
  const input = testFeedbackInput.parse(raw);
  testConversationId.parse(reviewerId);
  await assertRuntimeSchema("test-feedback", [
    {
      table: "test_message_feedback",
      columns: [
        "request_id",
        "message_id",
        "expected_revision",
        "revision",
        "rating",
      ],
      uniqueIndexes: [
        {
          name: "uq_test_feedback_request",
          columns: ["merchant_id", "request_id"],
        },
      ],
    },
  ]);
  return withOwnedTestSession(merchantId, input.conversationId, async c => {
    const [messages] = await c.execute<RowDataPacket[]>(
      "SELECT id,sender,replySource,rating,ratingRevision FROM testMessages WHERE conversationId=? AND id=? FOR UPDATE",
      [input.conversationId, input.messageId]
    );
    const m = messages[0];
    if (!m) throw new TestWorkspaceError("NOT_FOUND");
    if (m.sender !== "sari" || m.replySource === "guardrail")
      throw new TestWorkspaceError(
        "PRECONDITION_FAILED",
        "Only saved test replies can be rated; guardrail notices are excluded"
      );
    const [receipts] = await c.execute<RowDataPacket[]>(
      "SELECT message_id,reviewer_id,expected_revision,revision,rating FROM test_message_feedback WHERE merchant_id=? AND request_id=?",
      [merchantId, input.requestId]
    );
    const old = receipts[0];
    if (old) {
      if (
        Number(old.message_id) !== input.messageId ||
        Number(old.reviewer_id) !== reviewerId ||
        Number(old.expected_revision) !== input.expectedRevision ||
        old.rating !== input.rating
      )
        throw new TestWorkspaceError("CONFLICT");
      return {
        messageId: input.messageId,
        rating: m.rating as TestRating,
        revision: Number(m.ratingRevision),
        replayed: true,
        superseded: Number(m.ratingRevision) !== Number(old.revision),
      };
    }
    if (Number(m.ratingRevision) !== input.expectedRevision)
      throw new TestWorkspaceError("CONFLICT");
    const revision = input.expectedRevision + 1;
    await c.execute(
      "UPDATE testMessages SET rating=?,ratingRevision=?,ratedAt=UTC_TIMESTAMP() WHERE id=?",
      [input.rating, revision, input.messageId]
    );
    await c.execute(
      "INSERT INTO test_message_feedback(merchant_id,request_id,message_id,reviewer_id,expected_revision,revision,previous_rating,rating) VALUES (?,?,?,?,?,?,?,?)",
      [
        merchantId,
        input.requestId,
        input.messageId,
        reviewerId,
        input.expectedRevision,
        revision,
        m.rating,
        input.rating,
      ]
    );
    return {
      messageId: input.messageId,
      rating: input.rating,
      revision,
      replayed: false,
      superseded: false,
    };
  });
}
