import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
const model = vi.hoisted(() => vi.fn());
vi.mock("./openai", () => ({ callGPT4: model }));
vi.mock("../db_ai_settings", () => ({
  getTextGenerationSettings: async () => ({
    model: "superadmin-memory-reader-test",
    isActive: true,
  }),
}));
import { getPool, closeDb } from "../db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import {
  understandConversation,
  readStoredUnderstanding,
} from "./conversation-understanding";
import {
  captureContextualCustomerMemory,
  captureDirectCustomerMemory,
  readCustomerMemory,
  groundCustomerProfile,
} from "./customer-memory";
import {
  getOrCreateProfile,
  buildProfileContext,
} from "../db/customer-intelligence";
import { memoryUnderstandingFixture } from "../tests/helpers/memory-understanding-fixture";
import {
  understandingDigest,
  verifyUnderstandingEvidence,
} from "./understanding-evidence";

describe.skipIf(!process.env.DATABASE_URL)(
  "memory read provenance and local penetration checks",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      users: number[];
    let input: {
      merchantId: number;
      customerPhone: string;
      conversationId: number;
      incomingMessageId: number;
      message: string;
    };
    let facts: Parameters<typeof memoryUnderstandingFixture>[1];
    const q = async (sql: string, args: any[] = []): Promise<any> =>
      (await (await getPool())!.execute(sql, args))[0];
    const read = () =>
      readCustomerMemory(input.merchantId, input.customerPhone);
    const raw = () =>
      q(
        "SELECT * FROM customer_memory_facts WHERE merchant_id=? ORDER BY field_key",
        [owner.merchantId]
      );
    const next = async (message: string, direction = "incoming") => {
      const result = await q(
        "INSERT INTO messages(conversationId,direction,messageType,content) VALUES (?,?,'text',?)",
        [input.conversationId, direction, message]
      );
      input = { ...input, message, incomingMessageId: result.insertId };
      return result.insertId as number;
    };
    const capture = async () => {
      expect(await understandConversation(input)).not.toBeNull();
      return captureContextualCustomerMemory(input);
    };
    beforeEach(async () => {
      owner = await createDisposableMerchant("memory-read-proof");
      users = [owner.userId];
      const conversation = await q(
        "INSERT INTO conversations(merchantId,customerPhone,status) VALUES (?,'966500000062','active')",
        [owner.merchantId]
      );
      input = {
        merchantId: owner.merchantId,
        customerPhone: "966500000062",
        conversationId: conversation.insertId,
        incomingMessageId: 0,
        message: "",
      };
      facts = [
        { field: "preferredName", value: "أمل" },
        { field: "budget", value: { amountMinor: 50000, currency: "SAR" } },
        { field: "fastDelivery", value: false },
      ];
      model.mockReset().mockImplementation(async messages => {
        const parts = messages.slice(1).map((m: any) => JSON.parse(m.content));
        const context = parts[0].contextPart
          ? JSON.parse(
              parts
                .filter((p: any) => p.contextPart)
                .map((p: any) => p.data)
                .join("")
            )
          : parts[0];
        return JSON.stringify(memoryUnderstandingFixture(context, facts));
      });
      await next(
        "ناديني أمل. ميزانيتي خمسمائة ريال، والتوصيل السريع ليس أولوية عندي."
      );
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(users);
    });
    afterAll(closeDb);

    it("reads canonical compound facts repeatedly across a connection restart without model calls or writes", async () => {
      await capture();
      const before = await raw(),
        memory = await read();
      expect(memory.facts).toHaveLength(3);
      expect(model).toHaveBeenCalledTimes(1);
      await closeDb();
      expect(await read()).toEqual(memory);
      expect(await raw()).toEqual(before);
      expect(model).toHaveBeenCalledTimes(1);
    });
    it.each(["content", "clock", "direction", "removed", "phone", "tenant"])(
      "quarantines facts whose incoming source changed: %s",
      async attack => {
        await capture();
        if (attack === "content")
          await q("UPDATE messages SET content='تم تعديل المصدر' WHERE id=?", [
            input.incomingMessageId,
          ]);
        if (attack === "clock")
          await q(
            "UPDATE messages SET createdAt=TIMESTAMPADD(SECOND,1,createdAt) WHERE id=?",
            [input.incomingMessageId]
          );
        if (attack === "direction")
          await q("UPDATE messages SET direction='outgoing' WHERE id=?", [
            input.incomingMessageId,
          ]);
        if (attack === "removed")
          await q("DELETE FROM messages WHERE id=?", [input.incomingMessageId]);
        if (attack === "phone")
          await q(
            "UPDATE conversations SET customerPhone='966500000099' WHERE id=?",
            [input.conversationId]
          );
        if (attack === "tenant") {
          const other = await createDisposableMerchant("foreign-memory-proof");
          users.push(other.userId);
          await q("UPDATE conversations SET merchantId=? WHERE id=?", [
            other.merchantId,
            input.conversationId,
          ]);
        }
        expect((await read()).facts).toEqual([]);
        expect(await raw()).toHaveLength(3); // Quarantine is not destructive erasure.
        expect(model).toHaveBeenCalledTimes(1);
      }
    );
    it.each(["text", "time", "role", "authorship", "removed", "conversation"])(
      "rechecks historical conversation evidence, including assistant attribution: %s",
      async attack => {
        const earlier = input.incomingMessageId;
        await q(
          "UPDATE messages SET direction='outgoing',sender_type='assistant',isProcessed=1,aiResponse=content WHERE id=?",
          [earlier]
        );
        await next("اسمي أمل، نعم هذه الميزانية تناسبني.");
        await capture();
        expect((await read()).facts).toHaveLength(3);
        if (attack === "text")
          await q("UPDATE messages SET content='changed offer' WHERE id=?", [
            earlier,
          ]);
        if (attack === "time")
          await q(
            "UPDATE messages SET createdAt=TIMESTAMPADD(SECOND,1,createdAt) WHERE id=?",
            [earlier]
          );
        if (attack === "role")
          await q("UPDATE messages SET direction='incoming' WHERE id=?", [
            earlier,
          ]);
        if (attack === "authorship")
          await q("UPDATE messages SET aiResponse=NULL WHERE id=?", [earlier]);
        if (attack === "removed")
          await q("DELETE FROM messages WHERE id=?", [earlier]);
        if (attack === "conversation") {
          const other = await q(
            "INSERT INTO conversations(merchantId,customerPhone,status) VALUES (?,'966500000062','active')",
            [owner.merchantId]
          );
          await q("UPDATE messages SET conversationId=? WHERE id=?", [
            other.insertId,
            earlier,
          ]);
        }
        expect((await read()).facts).toEqual([]);
      }
    );
    it.each([
      "missing",
      "failed",
      "analyzing",
      "result",
      "digest",
      "evidence",
      "source",
      "context",
      "cutoff",
    ])(
      "never trusts a missing, malformed or changed interpretation: %s",
      async attack => {
        await capture();
        const key = [owner.merchantId, input.incomingMessageId];
        if (attack === "missing")
          await q(
            "DELETE FROM ai_conversation_understanding WHERE merchant_id=? AND incoming_message_id=?",
            key
          );
        else {
          const updates: Record<string, string> = {
            failed: "state='failed',result_json=NULL,result_digest=NULL",
            analyzing: "state='analyzing',result_json=NULL,result_digest=NULL",
            result: "result_json=JSON_OBJECT()",
            digest: "result_digest=REPEAT('0',64)",
            evidence: "message_evidence=JSON_ARRAY()",
            source: "source_digest=REPEAT('1',64)",
            context: "context_digest=REPEAT('2',64)",
            cutoff: "memory_cutoff=incoming_message_id",
          };
          await q(
            `UPDATE ai_conversation_understanding SET ${updates[attack]} WHERE merchant_id=? AND incoming_message_id=?`,
            key
          );
        }
        expect((await read()).facts).toEqual([]);
        expect(model).toHaveBeenCalledTimes(1);
      }
    );
    it.each([
      "value",
      "kind",
      "observed",
      "extended",
      "shortened",
      "revision",
      "field",
    ])(
      "rejects a valid-looking fact row that disagrees with its sealed interpretation: %s",
      async attack => {
        await capture();
        const changes: Record<string, string> = {
          value: "value_json=JSON_OBJECT('amountMinor',90000,'currency','SAR')",
          kind: "source_kind='inferred'",
          observed: "observed_at=TIMESTAMPADD(SECOND,1,observed_at)",
          extended: "expires_at=TIMESTAMPADD(DAY,1,expires_at)",
          shortened: "expires_at=TIMESTAMPADD(DAY,-1,expires_at)",
          revision: "revision=9999",
          field: "field_key='qualityFocused',value_json=CAST('true' AS JSON)",
        };
        await q(
          `UPDATE customer_memory_facts SET ${changes[attack]} WHERE merchant_id=? AND field_key='budget'`,
          [owner.merchantId]
        );
        expect((await read()).facts.map(f => f.field).sort()).toEqual([
          "fastDelivery",
          "preferredName",
        ]);
      }
    );
    it("requires full current-turn content as well as the bounded evidence digest", async () => {
      // Source digest includes the whole message, not just its 16,000-character evidence prefix.
      input.message += " ".repeat(16000 - input.message.length);
      await q("UPDATE messages SET content=? WHERE id=?", [
        input.message,
        input.incomingMessageId,
      ]);
      await capture();
      await q("UPDATE messages SET content=CONCAT(content,?) WHERE id=?", [
        "changed suffix",
        input.incomingMessageId,
      ]);
      expect((await read()).facts).toEqual([]);
    });
    it("preserves proven memory through later turns and human takeover, without granting old action authority", async () => {
      await capture();
      const original = { ...input },
        memory = await read();
      await next("عندي سؤال جديد");
      await q(
        "UPDATE conversations SET handoff_version=handoff_version+1,human_takeover=1,automation_after_message_id=? WHERE id=?",
        [input.incomingMessageId, input.conversationId]
      );
      expect(await read()).toEqual(memory);
      await expect(
        readStoredUnderstanding((await getPool())!, original, true)
      ).rejects.toThrow("authority");
    });
    it("preserves unrelated facts after partial deletion and never resurrects them after full erasure", async () => {
      await capture();
      await next("انس ميزانيتي");
      await captureDirectCustomerMemory(input);
      expect((await read()).facts.map(f => f.field).sort()).toEqual([
        "fastDelivery",
        "preferredName",
      ]);
      facts = [];
      await next("ما الخيارات المناسبة لي؟");
      expect(await understandConversation(input)).not.toBeNull();
      const context = JSON.parse(model.mock.calls.at(-1)![0][1].content);
      expect(context.memory.map((f: any) => f.field).sort()).toEqual([
        "fastDelivery",
        "preferredName",
      ]);
      expect(context.messages).toHaveLength(1); // Forgotten raw history is still excluded.
      await next("احذف ذاكرة المبيعات الخاصة بي");
      await captureDirectCustomerMemory(input);
      expect((await read()).facts).toEqual([]);
      expect(
        (await raw()).every(
          (r: any) => r.deleted === 1 && r.value_json === null
        )
      ).toBe(true);
    });
    it("keeps source-independent facts when a different conversation loses its evidence", async () => {
      facts = [{ field: "preferredName", value: "أمل" }];
      await capture();
      const old = input.incomingMessageId;
      const conversation = await q(
        "INSERT INTO conversations(merchantId,customerPhone,status) VALUES (?,'966500000062','active')",
        [owner.merchantId]
      );
      input.conversationId = conversation.insertId;
      await next("ميزانيتي ٨٠٠ ريال");
      facts = [
        { field: "budget", value: { amountMinor: 80000, currency: "SAR" } },
      ];
      await capture();
      await q("UPDATE messages SET content='changed name source' WHERE id=?", [
        old,
      ]);
      expect((await read()).facts).toEqual([
        expect.objectContaining({
          field: "budget",
          value: { amountMinor: 80000, currency: "SAR" },
        }),
      ]);
    });
    it("does not pass unproven memory or legacy aliases into the next interpreter or sales prompt", async () => {
      await capture();
      await q(
        "UPDATE customer_memory_facts SET value_json=JSON_OBJECT('amountMinor',123400,'currency','SAR') WHERE merchant_id=? AND field_key='budget'",
        [owner.merchantId]
      );
      await q(
        "UPDATE customer_profiles SET preferences=?,display_name='legacy-name',pain_points=? WHERE merchant_id=?",
        [JSON.stringify({ budget: 9999 }), '["legacy worry"]', owner.merchantId]
      );
      const grounded = groundCustomerProfile(
        await getOrCreateProfile(owner.merchantId, input.customerPhone),
        await read()
      );
      expect(buildProfileContext(grounded)).not.toMatch(/123400|9999|legacy/);
      facts = [];
      await next("هل عندكم مقاسات أخرى؟");
      expect(await understandConversation(input)).not.toBeNull();
      const context = JSON.parse(model.mock.calls.at(-1)![0][1].content);
      expect(context.memory.map((f: any) => f.field).sort()).toEqual([
        "fastDelivery",
        "preferredName",
      ]);
    });
    it("quarantines legacy rows without rewriting them or reinterpreting the conversation", async () => {
      await capture();
      await q("DELETE FROM ai_conversation_understanding WHERE merchant_id=?", [
        owner.merchantId,
      ]);
      const before = await raw();
      expect((await read()).facts).toEqual([]);
      expect(await raw()).toEqual(before);
      expect(model).toHaveBeenCalledTimes(1);
      facts = [
        { field: "budget", value: { amountMinor: 80000, currency: "SAR" } },
      ];
      await next("أخصص ثمانمائة ريال الآن");
      await capture();
      expect((await read()).facts).toEqual([
        expect.objectContaining({
          field: "budget",
          value: { amountMinor: 80000, currency: "SAR" },
        }),
      ]);
    });
    it("expires inferred fields after 30 days and explicit fields according to their own source clock", async () => {
      await q(
        "UPDATE messages SET createdAt=TIMESTAMPADD(DAY,-31,UTC_TIMESTAMP()) WHERE id=?",
        [input.incomingMessageId]
      );
      facts.push({ field: "priceConscious", value: true, kind: "inferred" });
      await capture();
      expect(
        (await raw()).find((r: any) => r.field_key === "priceConscious")
      ).toBeDefined();
      expect((await read()).facts.map(f => f.field).sort()).toEqual([
        "budget",
        "fastDelivery",
        "preferredName",
      ]);
    });
    it("reads all fields with four bounded data queries and no per-fact model calls", async () => {
      facts.push(
        { field: "priceConscious", value: true, kind: "inferred" },
        { field: "qualityFocused", value: true },
        { field: "urgentBuyer", value: false },
        { field: "brandConscious", value: false },
        { field: "painPoints", value: ["تأخر التوصيل"] },
        { field: "interestTags", value: ["سماعات"] },
        { field: "buyingStage", value: "comparing" },
        { field: "sentiment", value: "neutral" },
        { field: "lastObjection", value: null }
      );
      await capture();
      const pool = (await getPool())!,
        getConnection = pool.getConnection.bind(pool),
        queries: string[] = [];
      vi.spyOn(pool, "getConnection").mockImplementation(async () => {
        const connection = await getConnection();
        return new Proxy(connection, {
          get(target, key) {
            if (key === "execute")
              return async (sql: string, args: any[]) => {
                queries.push(sql);
                const result = await target.execute<any[]>(sql, args);
                if (sql.includes("SELECT f.*")) result[0].reverse();
                return result;
              };
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      });
      const memory = await read();
      expect(memory.facts).toHaveLength(12);
      expect(memory.facts.map(f => f.field)).toEqual(
        memory.facts.map(f => f.field).sort()
      );
      expect(queries).toHaveLength(4);
      expect(model).toHaveBeenCalledTimes(1);
    });
    it("does not mix profile and fact revisions during a concurrent write", async () => {
      await capture();
      const expected = await read();
      const pool = (await getPool())!,
        getConnection = pool.getConnection.bind(pool);
      let injected = false;
      vi.spyOn(pool, "getConnection").mockImplementation(async () => {
        const connection = await getConnection();
        return new Proxy(connection, {
          get(target, key) {
            if (key === "execute")
              return async (sql: string, args: any[]) => {
                const result = await target.execute(sql, args);
                if (!injected && sql.includes("FROM customer_profiles")) {
                  injected = true;
                  await next("احذف ذاكرة المبيعات الخاصة بي");
                  await captureDirectCustomerMemory(input);
                }
                return result;
              };
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      });
      expect(await read()).toEqual(expected);
      const after = await read();
      expect(after.revision).toBeGreaterThan(expected.revision);
      expect(after.facts).toEqual([]);
    });
    it("propagates storage errors and releases the connection instead of claiming empty memory", async () => {
      await capture();
      const pool = (await getPool())!,
        getConnection = pool.getConnection.bind(pool);
      const released = vi.fn();
      vi.spyOn(pool, "getConnection").mockImplementation(async () => {
        const connection = await getConnection();
        return new Proxy(connection, {
          get(target, key) {
            if (key === "execute")
              return async (sql: string, args: any[]) => {
                if (sql.includes("FROM ai_conversation_understanding"))
                  throw Error("synthetic database outage");
                return target.execute(sql, args);
              };
            if (key === "release")
              return () => {
                released();
                target.release();
              };
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      });
      await expect(read()).rejects.toThrow("synthetic database outage");
      expect(released).toHaveBeenCalledOnce();
    });
    it("rejects legacy timestamp-free memory proofs even when their old seal is internally consistent", async () => {
      await capture();
      const [record] = await q(
        "SELECT * FROM ai_conversation_understanding WHERE merchant_id=?",
        [owner.merchantId]
      );
      const messages = await q(
        "SELECT * FROM messages WHERE conversationId=?",
        [input.conversationId]
      );
      const { analysis, evidence } = verifyUnderstandingEvidence(
        record,
        messages
      );
      const legacy = evidence.map(({ createdAt, isAiReply, ...e }) => e);
      const digest = understandingDigest({
        source: record.source_digest,
        context: record.context_digest,
        evidence: legacy,
        analysis,
      });
      await q(
        "UPDATE ai_conversation_understanding SET message_evidence=?,result_digest=? WHERE merchant_id=?",
        [JSON.stringify(legacy), digest, owner.merchantId]
      );
      expect((await read()).facts).toEqual([]);
      // Historical contracts remain readable by their original live-authority reader.
      expect(
        (await readStoredUnderstanding((await getPool())!, input))?.analysis
          .memoryFacts
      ).toHaveLength(3);
    });
  }
);
