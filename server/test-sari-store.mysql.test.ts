import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { closeDb, getPool } from "./db/connection";
import {
  createTestSession,
  readTestSession,
  saveOwnedTestDeal,
  saveOwnedTestMessage,
} from "./test-sari-store";
import {
  cleanupDisposableMerchants,
  createDisposableMerchant,
} from "./tests/helpers/disposable-merchant";
import { calculateAllMetrics } from "./metrics";
describe.skipIf(!process.env.DATABASE_URL)(
  "test workspace real MySQL transactions",
  () => {
    let first: { merchantId: number; userId: number }, second: typeof first;
    beforeEach(async () => {
      first = await createDisposableMerchant("test-work-a");
      second = await createDisposableMerchant("test-work-b");
    });
    afterEach(async () =>
      cleanupDisposableMerchants(
        [first?.userId, second?.userId].filter(Boolean)
      )
    );
    afterAll(closeDb);
    it("migrates historical integer amounts and safely resumes/repeats the DDL", async () => {
      const pool = (await getPool())!;
      const connection = await pool.getConnection();
      const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
      const names = {
        testConversations: `test_conv_${suffix}`,
        testMessages: `test_msg_${suffix}`,
        testDeals: `test_deal_${suffix}`,
      };
      try {
        await connection.query(
          `CREATE TABLE ${names.testConversations}(id INT PRIMARY KEY AUTO_INCREMENT, merchantId INT NOT NULL, dealValue INT NULL)`
        );
        await connection.query(
          `CREATE TABLE ${names.testMessages}(id INT PRIMARY KEY AUTO_INCREMENT, conversationId INT NOT NULL)`
        );
        await connection.query(
          `CREATE TABLE ${names.testDeals}(id INT PRIMARY KEY AUTO_INCREMENT, dealValue INT NOT NULL)`
        );
        await connection.query(
          `INSERT INTO ${names.testConversations}(merchantId,dealValue) VALUES (1,149),(1,NULL)`
        );
        await connection.query(
          `INSERT INTO ${names.testDeals}(dealValue) VALUES (149)`
        );
        let sql = readFileSync(
          "drizzle/0149_test_workspace_integrity.sql",
          "utf8"
        );
        for (const [table, replacement] of Object.entries(names))
          sql = sql.replaceAll(table, replacement);
        const statements = sql
          .split("--> statement-breakpoint")
          .filter(s => s.trim());
        // Simulate interruption after the first column was added, before the index.
        for (const statement of statements.slice(0, 4))
          await connection.query(statement);
        for (let run = 0; run < 2; run++)
          for (const statement of statements) await connection.query(statement);
        const [rows] = await connection.query<any>(
          `SELECT dealValue FROM ${names.testConversations} ORDER BY id`
        );
        expect(rows).toEqual([{ dealValue: "149.00" }, { dealValue: null }]);
        await connection.query(
          `INSERT INTO ${names.testConversations}(merchantId,requestId) VALUES (1,'${randomUUID()}')`
        );
        const [deals] = await connection.query<any>(
          `SELECT dealValue FROM ${names.testDeals}`
        );
        expect(deals).toEqual([{ dealValue: "149.00" }]);
      } finally {
        for (const name of Object.values(names)) {
          if (!/^test_(conv|msg|deal)_[0-9a-f]{12}$/.test(name))
            throw new Error("Unexpected disposable table");
          await connection.query(`DROP TABLE IF EXISTS ${name}`);
        }
        connection.release();
      }
    });
    it("converges racing session creates and scopes identical request IDs by tenant", async () => {
      const requestId = randomUUID();
      const sessions = await Promise.all(
        Array.from({ length: 8 }, () =>
          createTestSession(first.merchantId, { requestId })
        )
      );
      expect(new Set(sessions.map(s => s.conversationId)).size).toBe(1);
      const foreign = await createTestSession(second.merchantId, { requestId });
      expect(foreign.conversationId).not.toBe(sessions[0].conversationId);
    });
    it("rejects missing and foreign sessions for reads, message saves and deals", async () => {
      const { conversationId } = await createTestSession(first.merchantId, {
        requestId: randomUUID(),
      });
      for (const id of [conversationId, 2147483647]) {
        await expect(
          readTestSession(second.merchantId, id)
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(
          saveOwnedTestMessage(second.merchantId, {
            conversationId: id,
            clientMessageId: randomUUID(),
            sender: "user",
            content: "foreign",
          })
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(
          saveOwnedTestDeal(second.merchantId, {
            conversationId: id,
            dealValue: 5,
          })
        ).rejects.toMatchObject({ code: "NOT_FOUND" });
      }
      expect(
        await readTestSession(first.merchantId, conversationId)
      ).toMatchObject({ messageCount: 0, deal: null });
    });
    it("saves an idempotent message once under concurrency, preserves zero timing and rejects key reuse", async () => {
      const { conversationId } = await createTestSession(first.merchantId, {
        requestId: randomUUID(),
      });
      const input = {
        conversationId,
        clientMessageId: randomUUID(),
        sender: "sari" as const,
        content: "رسالة <script> غير منفذة",
        responseTime: 0,
      };
      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          saveOwnedTestMessage(first.merchantId, input)
        )
      );
      expect(new Set(results.map(r => r.messageId)).size).toBe(1);
      expect(
        (await readTestSession(first.merchantId, conversationId)).messageCount
      ).toBe(1);
      await expect(
        saveOwnedTestMessage(first.merchantId, { ...input, content: "changed" })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      const [rows] = await (await getPool())!.execute<any>(
        "SELECT responseTime FROM testMessages WHERE id=?",
        [results[0].messageId]
      );
      expect(rows[0].responseTime).toBe(0);
      const [counts] = await (await getPool())!.execute<any>(
        "SELECT messageCount FROM testConversations WHERE id=?",
        [conversationId]
      );
      expect(counts[0].messageCount).toBe(1);
    });
    it("records one decimal deal under a race and derives count and elapsed time from storage", async () => {
      const { conversationId } = await createTestSession(first.merchantId, {
        requestId: randomUUID(),
      });
      await saveOwnedTestMessage(first.merchantId, {
        conversationId,
        clientMessageId: randomUUID(),
        sender: "user",
        content: "hello",
      });
      await (await getPool())!.execute(
        "UPDATE testConversations SET startedAt=DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 SECOND) WHERE id=?",
        [conversationId]
      );
      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          saveOwnedTestDeal(first.merchantId, {
            conversationId,
            dealValue: 149.5,
          })
        )
      );
      expect(new Set(results.map(r => r.dealId)).size).toBe(1);
      expect(results[0].dealValue).toBe(149.5);
      const [rows] = await (await getPool())!.execute<any>(
        "SELECT dealValue,messageCount,timeToConversion FROM testDeals WHERE conversationId=?",
        [conversationId]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ dealValue: "149.50", messageCount: 1 });
      expect(rows[0].timeToConversion).toBeGreaterThanOrEqual(30);
      const [parents] = await (await getPool())!.execute<any>(
        "SELECT dealValue,hasDeal FROM testConversations WHERE id=?",
        [conversationId]
      );
      expect(parents[0]).toMatchObject({ dealValue: "149.50", hasDeal: 1 });
      await expect(
        saveOwnedTestDeal(first.merchantId, { conversationId, dealValue: 150 })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      const metrics = await calculateAllMetrics(first.merchantId, "day");
      expect(metrics.conversion).toMatchObject({
        avgDealValue: 149.5,
        totalRevenue: 149.5,
      });
    });
    it("preserves historical null request IDs and does not duplicate a historical deal", async () => {
      const pool = (await getPool())!;
      const [old] = await pool.execute<any>(
        "INSERT INTO testConversations(merchantId,dealValue) VALUES (?,25)",
        [first.merchantId]
      );
      await pool.execute(
        "INSERT INTO testConversations(merchantId) VALUES (?)",
        [first.merchantId]
      );
      await pool.execute(
        "INSERT INTO testDeals(merchantId,conversationId,dealValue,messageCount) VALUES (?,?,25,2)",
        [first.merchantId, old.insertId]
      );
      await saveOwnedTestDeal(first.merchantId, {
        conversationId: old.insertId,
        dealValue: 25,
      });
      const [rows] = await pool.execute<any>(
        "SELECT COUNT(*) AS total FROM testDeals WHERE conversationId=?",
        [old.insertId]
      );
      expect(rows[0].total).toBe(1);
    });
  }
);
