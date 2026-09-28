import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
const mocks = vi.hoisted(() => ({ call: vi.fn(), context: vi.fn() }));
vi.mock("./openai", () => ({ callGPT4: mocks.call }));
vi.mock("./budget-ledger", () => ({
  getAiBudgetStatus: async () => ({ exceeded: false }),
}));
// Knowledge rendering is orthogonal here; catalog, settings and test-history reads are real SQL.
vi.mock("./sari-personality", async original => ({
  ...(await original<typeof import("./sari-personality")>()),
  buildEnhancedContextPrompt: mocks.context,
}));
import { closeDb, getPool } from "../db/connection";
import {
  assertDisposableDatabase,
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import {
  createTestSession,
  saveOwnedTestMessage,
  readTestTurn,
} from "../test-sari-store";
import { previewSari } from "./sari-preview";
import {
  currentConversationUnderstanding,
  conversationUnderstandingIdentity,
} from "./conversation-understanding-context";

describe.skipIf(!process.env.DATABASE_URL)(
  "contextual preview through owned test history and scoped SQL catalog",
  () => {
    const query = async (sql: string, args: unknown[] = []): Promise<any> =>
      (await (await getPool())!.execute(sql, args))[0];
    let owner: { merchantId: number; userId: number },
      other: typeof owner,
      productId: number,
      users: number[];
    async function session(
      merchantId: number,
      assistant = "أشرح لك الخيار المناسب؟"
    ) {
      const { conversationId } = await createTestSession(merchantId, {
        requestId: randomUUID(),
      });
      await saveOwnedTestMessage(merchantId, {
        conversationId,
        clientMessageId: randomUUID(),
        sender: "user",
        content: "أريد ساعة تناسب الرياضة",
      });
      await saveOwnedTestMessage(merchantId, {
        conversationId,
        clientMessageId: randomUUID(),
        sender: "sari",
        content: assistant,
      });
      const source = {
        conversationId,
        clientMessageId: randomUUID(),
        message: "نعم",
      };
      await saveOwnedTestMessage(merchantId, {
        conversationId,
        clientMessageId: source.clientMessageId,
        sender: "user",
        content: source.message,
      });
      return source;
    }
    async function businessState(merchantId: number) {
      const result: Record<string, number> = {};
      for (const [table, column] of [
        ["conversations", "merchantId"],
        ["orders", "merchantId"],
        ["customer_profiles", "merchant_id"],
        ["sales_quotations", "merchant_id"],
        ["ai_conversation_understanding", "merchant_id"],
        ["sales_followups", "merchant_id"],
      ] as const) {
        result[table] = Number(
          (
            await query(
              `SELECT COUNT(*) AS total FROM ${table} WHERE ${column}=?`,
              [merchantId]
            )
          )[0].total
        );
      }
      return result;
    }
    beforeEach(async () => {
      assertDisposableDatabase();
      vi.clearAllMocks();
      users = [];
      owner = await createDisposableMerchant("preview-context-a");
      users.push(owner.userId);
      other = await createDisposableMerchant("preview-context-b");
      users.push(other.userId);
      productId = Number(
        (
          await query(
            "INSERT INTO products(merchantId,name,price,price_unit,currency,stock,isActive,status) VALUES (?,'ساعة رياضية',12500,'minor','SAR',4,1,'active')",
            [owner.merchantId]
          )
        ).insertId
      );
      await query(
        "INSERT INTO products(merchantId,name,price,price_unit,currency,stock,isActive,status) VALUES (?,'منتج التيننت الآخر',9900,'minor','SAR',4,1,'active')",
        [other.merchantId]
      );
      mocks.context.mockImplementation(async ({ availableProducts }) =>
        JSON.stringify(
          availableProducts.map((p: any) => ({
            id: p.id,
            name: p.name,
            price: p.price,
          }))
        )
      );
      mocks.call.mockImplementation(async (messages, options) => {
        if (options.taskType === "sari.reply") {
          expect(conversationUnderstandingIdentity()?.mode).toBe("preview");
          expect(currentConversationUnderstanding()?.intent).toBe("inquiring");
          return "هذه الساعة مناسبة للمقارنة حسب احتياجك.";
        }
        const context =
          messages.length === 2
            ? JSON.parse(messages[1].content)
            : JSON.parse(
                messages
                  .slice(1, -1)
                  .map((m: any) => JSON.parse(m.content).data)
                  .join("")
              );
        const last = context.messages.at(-1);
        expect(context.mode).toBe("preview");
        expect(context.targets).toEqual([]);
        return JSON.stringify({
          version: 1,
          intent: "inquiring",
          goal: "explain_requested_information",
          action: "respond",
          confidence: 0.97,
          conditional: false,
          ambiguous: false,
          targetQuoteId: null,
          targetProvider: "none",
          productIds: context.catalog.slice(0, 1).map((p: any) => p.id),
          sessionIndex: null,
          requestKind: "ordinary",
          sentiment: "neutral",
          topicChanged: false,
          objection: "none",
          needs: ["ساعة للرياضة"],
          unresolvedQuestions: [],
          summary: "يريد شرح المنتج المقصود.",
          nextStep: "answer",
          evidence: [{ messageId: last.id, excerpt: last.content }],
        });
      });
    });
    afterEach(async () => {
      await cleanupDisposableMerchants(users);
    });
    afterAll(closeDb);
    it("reads the saved speakers and owner catalog, excluding later messages and all live customer state", async () => {
      const source = await session(owner.merchantId);
      await saveOwnedTestMessage(owner.merchantId, {
        conversationId: source.conversationId,
        clientMessageId: randomUUID(),
        sender: "sari",
        content: "LATER_MESSAGE_NOT_CONTEXT",
      });
      const turn = await readTestTurn(owner.merchantId, source),
        before = await businessState(owner.merchantId);
      expect(
        await previewSari({
          merchantId: owner.merchantId,
          userId: owner.userId,
          message: source.message,
          ...turn,
        })
      ).toMatchObject({
        source: "model",
        historyMessageCount: 2,
        historyTruncated: false,
      });
      const context = JSON.parse(mocks.call.mock.calls[0][0][1].content);
      expect(context.messages.map((m: any) => m.role)).toEqual([
        "user",
        "assistant",
        "user",
      ]);
      expect(context.currentMessageId).toBe(3);
      expect(context.catalog.map((p: any) => p.id)).toEqual([productId]);
      expect(JSON.stringify(mocks.call.mock.calls)).not.toContain(
        "LATER_MESSAGE_NOT_CONTEXT"
      );
      expect(JSON.stringify(mocks.call.mock.calls)).not.toContain(
        "منتج التيننت الآخر"
      );
      expect(await businessState(owner.merchantId)).toEqual(before);
      expect(
        mocks.call.mock.calls.every(
          ([, options]) => options.conversationId === undefined
        )
      ).toBe(true);
    });
    it("keeps simultaneous tenant previews separate and filters stock changes before interpretation", async () => {
      await query("UPDATE products SET stock=0 WHERE id=?", [productId]);
      await Promise.all(
        [owner, other].map(async account => {
          const source = await session(account.merchantId),
            turn = await readTestTurn(account.merchantId, source);
          await previewSari({
            merchantId: account.merchantId,
            userId: account.userId,
            message: source.message,
            ...turn,
          });
        })
      );
      const requests = mocks.call.mock.calls.filter(
        ([, options]) => options.taskType === "sari.customer.intent"
      );
      const first = JSON.parse(
        requests.find(
          ([, options]) => options.merchantId === owner.merchantId
        )![0][1].content
      );
      const second = JSON.parse(
        requests.find(
          ([, options]) => options.merchantId === other.merchantId
        )![0][1].content
      );
      expect(first.catalog).toEqual([]);
      expect(second.catalog).toHaveLength(1);
      expect(second.catalog[0].name).toBe("منتج التيننت الآخر");
    });
    it("rejects another tenant or a forged current turn before a model can inspect the test history", async () => {
      const source = await session(owner.merchantId);
      await expect(
        readTestTurn(other.merchantId, source)
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        readTestTurn(owner.merchantId, { ...source, message: "forged" })
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(mocks.call).not.toHaveBeenCalled();
    });
    it("selects only the owned available SQL persona without changing a live conversation or business state", async () => {
      const createAgent = async (merchantId: number, name: string) =>
        Number(
          (
            await query(
              "INSERT INTO virtual_agents(merchant_id,name,role,personality_prompt) VALUES (?,?,'مبيعات','شرح مناسب للاحتياج')",
              [merchantId, name]
            )
          ).insertId
        );
      const ownId = await createAgent(owner.merchantId, "نورة"),
        foreignId = await createAgent(other.merchantId, "خاصة بتيننت آخر");
      const conv = await query(
        "INSERT INTO conversations(merchantId,customerPhone,status,current_agent_id) VALUES (?,'966500000077','active',NULL)",
        [owner.merchantId]
      );
      const before = await businessState(owner.merchantId),
        generate = mocks.call.getMockImplementation()!;
      mocks.call.mockImplementation(async (messages, options) => {
        const raw = await generate(messages, options);
        return options.taskType === "sari.customer.intent"
          ? JSON.stringify({ ...JSON.parse(raw), virtualAgentId: ownId })
          : raw;
      });
      const result = await previewSari({
        merchantId: owner.merchantId,
        userId: owner.userId,
        message: "اشرح الخيارات",
        history: [],
        historyTruncated: false,
        automaticPersona: { time: "10:00", currentAgentId: foreignId },
      });
      expect(result.persona).toMatchObject({ id: ownId, reason: "context" });
      const context = JSON.parse(mocks.call.mock.calls[0][0][1].content);
      expect(context.agents.map((a: any) => a.id)).toEqual([ownId]);
      expect(context.currentAgentId).toBeNull();
      expect(JSON.stringify(mocks.call.mock.calls)).not.toContain(
        "خاصة بتيننت آخر"
      );
      expect(await businessState(owner.merchantId)).toEqual(before);
      expect(
        (
          await query("SELECT current_agent_id FROM conversations WHERE id=?", [
            conv.insertId,
          ])
        )[0].current_agent_id
      ).toBeNull();
    });
    it("rejects a real saved specialty change during analysis before issuing a generated reply", async () => {
      const id = Number(
        (
          await query(
            "INSERT INTO virtual_agents(merchant_id,name,role,personality_prompt) VALUES (?,'نورة','تدريب','مقارنة الدورات')",
            [owner.merchantId]
          )
        ).insertId
      );
      const generate = mocks.call.getMockImplementation()!;
      mocks.call.mockImplementation(async (messages, options) => {
        const raw = await generate(messages, options);
        if (options.taskType === "sari.customer.intent") {
          await query("UPDATE virtual_agents SET role='تخصص جديد' WHERE id=?", [
            id,
          ]);
          return JSON.stringify({ ...JSON.parse(raw), virtualAgentId: id });
        }
        return raw;
      });
      await expect(
        previewSari({
          merchantId: owner.merchantId,
          userId: owner.userId,
          message: "اشرح الخيارات",
          history: [],
          historyTruncated: false,
          automaticPersona: { time: "10:00" },
        })
      ).rejects.toThrow("personas changed");
      expect(mocks.call).toHaveBeenCalledOnce();
      expect(
        (await businessState(owner.merchantId)).ai_conversation_understanding
      ).toBe(0);
    });
  }
);
