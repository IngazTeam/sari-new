import type {
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { getPool } from "./db/connection";
import {
  assertRuntimeSchema,
  DatabaseSchemaOutdatedError,
} from "./db/schema-readiness";
import {
  testConversationId,
  testChatInput,
  testDealInput,
  testMessageInput,
  testSessionInput,
} from "../shared/test-sari-workspace";
import type { z } from "zod";

export class TestWorkspaceError extends Error {
  constructor(readonly code: "NOT_FOUND" | "CONFLICT" | "PRECONDITION_FAILED") {
    super(
      code === "NOT_FOUND"
        ? "Test conversation not available"
        : code === "CONFLICT"
          ? "A different result is already saved"
          : "Test workspace requires a database update"
    );
  }
}
async function poolReady() {
  const pool = await getPool();
  if (!pool) throw new Error("Test workspace database unavailable");
  await assertRuntimeSchema("test-workspace", [
    {
      table: "testConversations",
      columns: ["requestId"],
      uniqueIndexes: [
        { name: "test_session_request", columns: ["merchantId", "requestId"] },
      ],
    },
    {
      table: "testMessages",
      columns: ["clientMessageId"],
      uniqueIndexes: [
        {
          name: "test_message_request",
          columns: ["conversationId", "clientMessageId"],
        },
      ],
    },
  ]).catch(error => {
    if (error instanceof DatabaseSchemaOutdatedError)
      throw new TestWorkspaceError("PRECONDITION_FAILED");
    throw error;
  });
  const [columns] = await pool.execute<
    RowDataPacket[]
  >(`SELECT TABLE_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('testConversations','testDeals')
      AND COLUMN_NAME='dealValue' AND DATA_TYPE='decimal' AND NUMERIC_SCALE=2 AND NUMERIC_PRECISION=12`);
  if (columns.length !== 2) throw new TestWorkspaceError("PRECONDITION_FAILED");
  return pool;
}
async function owned<T>(
  merchantId: number,
  conversationId: number,
  work: (connection: PoolConnection, row: RowDataPacket) => Promise<T>
) {
  testConversationId.parse(merchantId);
  testConversationId.parse(conversationId);
  const connection = await (await poolReady()).getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT id,startedAt FROM testConversations
      WHERE id=? AND merchantId=? FOR UPDATE`,
      [conversationId, merchantId]
    );
    if (!rows[0]) throw new TestWorkspaceError("NOT_FOUND");
    const result = await work(connection, rows[0]);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
export async function createTestSession(
  merchantId: number,
  input: z.infer<typeof testSessionInput>
) {
  testConversationId.parse(merchantId);
  const { requestId } = testSessionInput.parse(input);
  const pool = await poolReady();
  await pool.execute(
    `INSERT INTO testConversations(merchantId,requestId,startedAt) VALUES (?,?,UTC_TIMESTAMP())
    ON DUPLICATE KEY UPDATE id=id`,
    [merchantId, requestId]
  );
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT id FROM testConversations WHERE merchantId=? AND requestId=?",
    [merchantId, requestId]
  );
  if (!rows[0]) throw new Error("Test session creation was not confirmed");
  return { conversationId: Number(rows[0].id) };
}
export async function readTestSession(
  merchantId: number,
  conversationId: number
) {
  return owned(merchantId, conversationId, async connection => {
    const [deals] = await connection.execute<RowDataPacket[]>(
      "SELECT id,dealValue FROM testDeals WHERE merchantId=? AND conversationId=? ORDER BY id LIMIT 1",
      [merchantId, conversationId]
    );
    const [count] = await connection.execute<RowDataPacket[]>(
      "SELECT COUNT(*) AS total FROM testMessages WHERE conversationId=?",
      [conversationId]
    );
    return {
      conversationId,
      messageCount: Number(count[0].total),
      deal: deals[0]
        ? { id: Number(deals[0].id), value: Number(deals[0].dealValue) }
        : null,
    };
  });
}
/** Snapshot before this exact saved question; never read live conversations. */
export async function readTestTurn(
  merchantId: number,
  raw: z.infer<typeof testChatInput>
) {
  const input = testChatInput.parse(raw);
  return owned(merchantId, input.conversationId, async connection => {
    const [current] = await connection.execute<RowDataPacket[]>(
      "SELECT id,sender,content FROM testMessages WHERE conversationId=? AND clientMessageId=?",
      [input.conversationId, input.clientMessageId]
    );
    if (!current[0]) throw new TestWorkspaceError("NOT_FOUND");
    if (current[0].sender !== "user" || current[0].content !== input.message)
      throw new TestWorkspaceError("CONFLICT");
    const [rows] = await connection.execute<RowDataPacket[]>(
      "SELECT sender,content FROM testMessages WHERE conversationId=? AND id<? ORDER BY id DESC LIMIT 21",
      [input.conversationId, current[0].id]
    );
    const history: { role: "user" | "assistant"; content: string }[] = [];
    let length = 0;
    for (const row of rows) {
      if (history.length === 20 || length + row.content.length > 16000) break;
      history.push({
        role: row.sender === "user" ? "user" : "assistant",
        content: row.content,
      });
      length += row.content.length;
    }
    return {
      history: history.reverse(),
      historyTruncated: history.length < rows.length,
    };
  });
}
export async function saveOwnedTestMessage(
  merchantId: number,
  raw: z.infer<typeof testMessageInput>
) {
  const input = testMessageInput.parse(raw);
  return owned(merchantId, input.conversationId, async connection => {
    const [prior] = await connection.execute<RowDataPacket[]>(
      "SELECT id,sender,content FROM testMessages WHERE conversationId=? AND clientMessageId=?",
      [input.conversationId, input.clientMessageId]
    );
    if (prior[0]) {
      if (
        prior[0].sender !== input.sender ||
        prior[0].content !== input.content
      )
        throw new TestWorkspaceError("CONFLICT");
      return { messageId: Number(prior[0].id) };
    }
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO testMessages(conversationId,clientMessageId,sender,content,responseTime,sentAt)
      VALUES (?,?,?,?,?,UTC_TIMESTAMP())`,
      [
        input.conversationId,
        input.clientMessageId,
        input.sender,
        input.content,
        input.responseTime ?? null,
      ]
    );
    await connection.execute(
      "UPDATE testConversations SET messageCount=messageCount+1 WHERE id=? AND merchantId=?",
      [input.conversationId, merchantId]
    );
    return { messageId: Number(result.insertId) };
  });
}
export async function saveOwnedTestDeal(
  merchantId: number,
  raw: z.infer<typeof testDealInput>
) {
  const input = testDealInput.parse(raw),
    value = input.dealValue.toFixed(2);
  return owned(merchantId, input.conversationId, async connection => {
    const [prior] = await connection.execute<RowDataPacket[]>(
      "SELECT id,dealValue FROM testDeals WHERE merchantId=? AND conversationId=? ORDER BY id LIMIT 1",
      [merchantId, input.conversationId]
    );
    if (prior[0]) {
      if (Number(prior[0].dealValue).toFixed(2) !== value)
        throw new TestWorkspaceError("CONFLICT");
      return {
        dealId: Number(prior[0].id),
        dealValue: Number(prior[0].dealValue),
      };
    }
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO testDeals(merchantId,conversationId,dealValue,messageCount,timeToConversion,markedAt)
      SELECT merchantId,id,?,(SELECT COUNT(*) FROM testMessages WHERE conversationId=?),GREATEST(0,TIMESTAMPDIFF(SECOND,startedAt,UTC_TIMESTAMP())),UTC_TIMESTAMP()
      FROM testConversations WHERE id=? AND merchantId=?`,
      [value, input.conversationId, input.conversationId, merchantId]
    );
    if (result.affectedRows !== 1) throw new TestWorkspaceError("NOT_FOUND");
    await connection.execute(
      "UPDATE testConversations SET hasDeal=1,dealValue=?,dealMarkedAt=UTC_TIMESTAMP() WHERE id=? AND merchantId=?",
      [value, input.conversationId, merchantId]
    );
    return { dealId: Number(result.insertId), dealValue: Number(value) };
  });
}
