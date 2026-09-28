import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
const model = vi.hoisted(() => ({ call: vi.fn(), settings: vi.fn() }));
vi.mock("./openai", () => ({ callGPT4: model.call }));
vi.mock("../db_ai_settings", () => ({
  getTextGenerationSettings: model.settings,
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
  withConversationUnderstanding,
  type ConversationUnderstanding,
} from "./conversation-understanding-context";
import { memoryUnderstandingFixture } from "../tests/helpers/memory-understanding-fixture";
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
import { buildReplyPlan } from "../messaging/reply-plan";
import {
  stageInteraction,
  finishInteractionDelivery,
  runInteractionJob,
} from "./interaction-jobs";
import { withInboundExecution } from "../messaging/inbound-context";

describe.skipIf(!process.env.DATABASE_URL)(
  "contextual memory persistence and local penetration checks",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      users: number[],
      input: {
        merchantId: number;
        conversationId: number;
        incomingMessageId: number;
        customerPhone: string;
        message: string;
      },
      facts: Parameters<typeof memoryUnderstandingFixture>[1],
      changes: Partial<ConversationUnderstanding>;
    const q = async (sql: string, args: any[] = []): Promise<any> =>
      (await (await getPool())!.execute(sql, args))[0];
    const rows = () =>
      q(
        "SELECT * FROM customer_memory_facts WHERE merchant_id=? ORDER BY field_key",
        [owner.merchantId]
      );
    const read = () =>
      readCustomerMemory(owner.merchantId, input.customerPhone);
    const interpret = () => understandConversation(input);
    const capture = () => captureContextualCustomerMemory(input);
    const next = async (message: string) => {
      input = {
        ...input,
        message,
        incomingMessageId: (
          await q(
            "INSERT INTO messages(conversationId,direction,messageType,content) VALUES (?,'incoming','text',?)",
            [input.conversationId, message]
          )
        ).insertId,
      };
    };
    beforeEach(async () => {
      owner = await createDisposableMerchant("contextual-memory");
      users = [owner.userId];
      changes = {};
      facts = [
        { field: "preferredName", value: "أمل" },
        { field: "budget", value: { amountMinor: 50000, currency: "SAR" } },
        { field: "fastDelivery", value: false },
      ];
      const conversation = (
        await q(
          "INSERT INTO conversations(merchantId,customerPhone,status) VALUES (?,'966500000063','active')",
          [owner.merchantId]
        )
      ).insertId;
      input = {
        merchantId: owner.merchantId,
        conversationId: conversation,
        incomingMessageId: 0,
        customerPhone: "966500000063",
        message: "",
      };
      await next(
        "ناديني أمل. أقدر أخصص خمسمائة ريال، والتوصيل السريع ليس أولوية عندي."
      );
      model.settings.mockReset().mockResolvedValue({
        model: "superadmin-memory-model",
        textGenerationProvider: "openai",
        isActive: true,
      });
      model.call
        .mockReset()
        .mockImplementation(async messages =>
          JSON.stringify(
            memoryUnderstandingFixture(
              JSON.parse(messages[1].content),
              facts,
              changes
            )
          )
        );
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(users);
    });
    afterAll(closeDb);
    it.each(["openai", "zahypi"])(
      "stores compound %s interpretation once with customer evidence and fixed TTLs",
      async provider => {
        model.settings.mockResolvedValue({
          model: "superadmin-memory-model",
          textGenerationProvider: provider,
          isActive: true,
        });
        const context = await interpret();
        expect(context).not.toBeNull();
        expect(await Promise.all(Array.from({ length: 6 }, capture))).toEqual(
          expect.arrayContaining([3])
        );
        const before = await rows(),
          memory = await read();
        expect(before).toHaveLength(3);
        expect(memory.revision).toBe(1);
        expect(memory.facts).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              field: "budget",
              value: { amountMinor: 50000, currency: "SAR" },
              kind: "explicit",
              sourceMessageId: input.incomingMessageId,
            }),
            expect.objectContaining({ field: "fastDelivery", value: false }),
            expect.objectContaining({ field: "preferredName", value: "أمل" }),
          ])
        );
        for (const row of before)
          expect(
            (new Date(row.expires_at).getTime() -
              new Date(row.observed_at).getTime()) /
              86400000
          ).toBe(row.field_key === "budget" ? 90 : 180);
        expect(await capture()).toBe(0);
        expect(await rows()).toEqual(before);
        const prompt = buildProfileContext(
          groundCustomerProfile(
            await getOrCreateProfile(owner.merchantId, input.customerPhone),
            memory
          )
        );
        expect(prompt).toContain("50000");
        expect(prompt).toContain("أمل");
        expect(model.call).toHaveBeenCalledOnce();
        expect(model.call.mock.calls[0][1]).toMatchObject({
          model: "superadmin-memory-model",
          taskType: "sari.customer.intent",
          noRetry: true,
        });
        expect(
          await q("SELECT id FROM ai_purchase_outcomes WHERE merchant_id=?", [
            owner.merchantId,
          ])
        ).toHaveLength(0);
      }
    );
    it.each([
      "missing",
      "historic",
      "empty",
      "uncertain",
      "disabled",
      "outage",
      "malformed",
    ])(
      "does not fall back to phrase matching for %s understanding",
      async kind => {
        if (kind === "historic")
          model.call.mockImplementation(async messages => {
            const r = memoryUnderstandingFixture(
              JSON.parse(messages[1].content)
            );
            delete r.memoryFacts;
            return JSON.stringify(r);
          });
        if (kind === "empty" || kind === "uncertain") facts = [];
        if (kind === "uncertain") changes.confidence = 0.3;
        if (kind === "disabled")
          model.settings.mockResolvedValue({ isActive: false });
        if (kind === "outage") model.call.mockRejectedValue(Error("synthetic"));
        if (kind === "malformed") model.call.mockResolvedValue("حفظت ميزانيتك");
        if (kind !== "missing") await interpret();
        await capture();
        expect(await rows()).toHaveLength(0);
        await next("ميزانيتي 500 ريال");
        await captureDirectCustomerMemory(input);
        expect(await rows()).toHaveLength(0);
      }
    );
    it("applies a new explicit correction and preserves unrelated facts across conversation restart", async () => {
      await interpret();
      await capture();
      const name = (await rows()).find(
        (r: any) => r.field_key === "preferredName"
      );
      const conversation = (
        await q(
          "INSERT INTO conversations(merchantId,customerPhone) VALUES (?,?)",
          [owner.merchantId, input.customerPhone]
        )
      ).insertId;
      input.conversationId = conversation;
      await next("صار المتاح ثمانمائة ريال، وليس المبلغ الذي قلته أول مرة.");
      facts = [
        { field: "budget", value: { amountMinor: 80000, currency: "SAR" } },
      ];
      await interpret();
      await capture();
      await closeDb();
      expect(
        (await read()).facts.find(f => f.field === "budget")
      ).toMatchObject({
        value: { amountMinor: 80000 },
        sourceMessageId: input.incomingMessageId,
      });
      expect(
        (await rows()).find((r: any) => r.field_key === "preferredName")
      ).toEqual(name);
    });
    it("keeps a direct false preference ahead of an inferred true and records another inferred field", async () => {
      await interpret();
      await capture();
      await next("هل فيه خيار يوصل أسرع؟");
      facts = [
        { field: "fastDelivery", kind: "inferred", value: true },
        { field: "buyingStage", kind: "inferred", value: "comparing" },
      ];
      await interpret();
      expect(await capture()).toBe(1);
      expect(
        (await read()).facts.find(f => f.field === "fastDelivery")?.value
      ).toBe(false);
      const row = (await rows()).find(
        (r: any) => r.field_key === "buyingStage"
      );
      expect(row.source_kind).toBe("inferred");
      expect(
        (new Date(row.expires_at).getTime() -
          new Date(row.observed_at).getTime()) /
          86400000
      ).toBe(30);
      expect(await capture()).toBe(0);
    });
    it("allows an explicit cleared list without retaining an old pain point", async () => {
      facts = [{ field: "painPoints", value: ["موعد غير مناسب"] }];
      await interpret();
      await capture();
      await next("انحلت مشكلة الموعد ولم تعد لدي أي ملاحظة عليه.");
      facts = [{ field: "painPoints", value: [] }];
      await interpret();
      await capture();
      expect((await read()).facts).toEqual([
        expect.objectContaining({
          field: "painPoints",
          value: [],
          revision: 2,
        }),
      ]);
    });
    const mutate = async (kind: string) => {
      if (kind === "source")
        await q("UPDATE messages SET content='changed' WHERE id=?", [
          input.incomingMessageId,
        ]);
      if (kind === "timestamp")
        await q(
          "UPDATE messages SET createdAt=TIMESTAMPADD(SECOND,1,createdAt) WHERE id=?",
          [input.incomingMessageId]
        );
      if (kind === "human takeover")
        await q("UPDATE conversations SET human_takeover=1 WHERE id=?", [
          input.conversationId,
        ]);
      if (kind === "ownership version")
        await q(
          "UPDATE conversations SET handoff_version=handoff_version+1 WHERE id=?",
          [input.conversationId]
        );
      if (kind === "phone")
        await q(
          "UPDATE conversations SET customerPhone='966500000064' WHERE id=?",
          [input.conversationId]
        );
      if (kind === "seal")
        await q(
          "UPDATE ai_conversation_understanding SET result_digest=REPEAT('0',64) WHERE merchant_id=?",
          [owner.merchantId]
        );
      if (kind === "missing analysis")
        await q(
          "DELETE FROM ai_conversation_understanding WHERE merchant_id=?",
          [owner.merchantId]
        );
      if (kind === "memory version")
        await q(
          "INSERT INTO customer_profiles(merchant_id,customer_phone,memory_version) VALUES (?,?,4) ON DUPLICATE KEY UPDATE memory_version=memory_version+1",
          [owner.merchantId, input.customerPhone]
        );
      if (kind === "new customer turn")
        await q(
          "INSERT INTO messages(conversationId,direction,messageType,content) VALUES (?,'incoming','text','لا تحفظ الاقتراح السابق')",
          [input.conversationId]
        );
    };
    it.each([
      "source",
      "timestamp",
      "human takeover",
      "ownership version",
      "phone",
      "seal",
      "missing analysis",
      "memory version",
      "new customer turn",
    ])("rejects changed %s before writing any facts", async kind => {
      await interpret();
      await mutate(kind);
      await capture().catch(() => null);
      expect(await rows()).toHaveLength(0);
    });
    it("rejects a memory change made while the shared model is running", async () => {
      const original = model.call.getMockImplementation()!;
      model.call.mockImplementation(async messages => {
        const r = await original(messages);
        await mutate("memory version");
        return r;
      });
      expect(await interpret()).toBeNull();
      expect(await capture()).toBe(0);
      expect(await rows()).toHaveLength(0);
    });
    it("refuses a stale version after another conversation updates the same customer", async () => {
      await interpret();
      const old = { ...input };
      input.conversationId = (
        await q(
          "INSERT INTO conversations(merchantId,customerPhone) VALUES (?,?)",
          [owner.merchantId, input.customerPhone]
        )
      ).insertId;
      await next("الآن أستطيع تخصيص تسعمائة ريال.");
      facts = [
        { field: "budget", value: { amountMinor: 90000, currency: "SAR" } },
      ];
      await interpret();
      await capture();
      await expect(captureContextualCustomerMemory(old)).rejects.toThrow();
      expect((await read()).facts).toEqual([
        expect.objectContaining({
          field: "budget",
          value: { amountMinor: 90000, currency: "SAR" },
        }),
      ]);
    });
    it("respects offline privacy erasure and cannot resurrect old contextual facts", async () => {
      await interpret();
      await capture();
      const old = { ...input };
      await next("احذف ذاكرة المبيعات الخاصة بي");
      expect((await captureDirectCustomerMemory(input)).reply).toContain(
        "حذفت ذاكرة المبيعات"
      );
      await expect(captureContextualCustomerMemory(old)).rejects.toThrow();
      expect((await read()).facts).toHaveLength(0);
      const before = await rows();
      await captureDirectCustomerMemory(input);
      expect(await rows()).toEqual(before);
      await next("أبدأ من جديد بميزانية ثلاثمائة ريال");
      facts = [
        { field: "budget", value: { amountMinor: 30000, currency: "SAR" } },
      ];
      await interpret();
      await capture();
      expect((await read()).facts).toEqual([
        expect.objectContaining({
          field: "budget",
          value: { amountMinor: 30000, currency: "SAR" },
        }),
      ]);
    });
    it("rejects preview and a foreign in-memory identity, and ignores a forged matching interpretation", async () => {
      const stored = (await interpret())!;
      await expect(
        withConversationUnderstanding({ ...stored, mode: "preview" }, capture)
      ).rejects.toThrow("identity");
      await expect(
        withConversationUnderstanding(
          { ...stored, merchantId: owner.merchantId + 99999 },
          capture
        )
      ).rejects.toThrow("identity");
      await withConversationUnderstanding(
        { ...stored, analysis: { ...stored.analysis, memoryFacts: [] } },
        capture
      );
      expect(await rows()).toHaveLength(3);
    });
    it.each(["merchant", "conversation", "phone", "outgoing", "group"])(
      "rejects an unauthorized %s source",
      async kind => {
        await interpret();
        const overrides =
          kind === "merchant"
            ? { merchantId: owner.merchantId + 99999 }
            : kind === "conversation"
              ? { conversationId: input.conversationId + 99999 }
              : kind === "phone"
                ? { customerPhone: "966500000064" }
                : kind === "group"
                  ? { customerPhone: "123@g.us" }
                  : {};
        if (kind === "outgoing")
          await q("UPDATE messages SET direction='outgoing' WHERE id=?", [
            input.incomingMessageId,
          ]);
        await captureContextualCustomerMemory({ ...input, ...overrides }).catch(
          () => null
        );
        expect(await rows()).toHaveLength(0);
      }
    );
    const fault = async (kind: string) => {
      const pool = (await getPool())!,
        get = pool.getConnection.bind(pool);
      let inserts = 0;
      vi.spyOn(pool, "getConnection").mockImplementation(async () => {
        const c = await get();
        return new Proxy(c, {
          get(t, key) {
            if (key === "execute")
              return async (...args: any[]) => {
                const sql = String(args[0]);
                if (
                  sql.includes("INSERT INTO customer_memory_facts") &&
                  ++inserts === 2 &&
                  kind === "second insert"
                )
                  throw Error("synthetic storage failure");
                const r = await (t.execute as any)(...args);
                if (
                  sql.includes("INSERT INTO customer_memory_facts") &&
                  inserts === 1 &&
                  kind === "source changed"
                )
                  await t.execute(
                    "UPDATE messages SET content='changed in transaction' WHERE id=?",
                    [input.incomingMessageId]
                  );
                return r;
              };
            if (key === "commit" && kind === "lost acknowledgement")
              return async () => {
                await t.commit();
                throw Error("synthetic commit acknowledgement loss");
              };
            const value = (t as any)[key];
            return typeof value === "function" ? value.bind(t) : value;
          },
        }) as any;
      });
    };
    it.each(["second insert", "source changed"])(
      "rolls the full memory batch back on %s",
      async kind => {
        await interpret();
        await fault(kind);
        await expect(capture()).rejects.toThrow();
        expect(await rows()).toHaveLength(0);
        vi.restoreAllMocks();
        expect(await capture()).toBe(3);
        expect((await read()).revision).toBe(1);
      }
    );
    it("recovers a lost commit acknowledgement without renewing TTL or asking the model again", async () => {
      await interpret();
      await fault("lost acknowledgement");
      await expect(capture()).rejects.toThrow();
      vi.restoreAllMocks();
      const before = await rows();
      expect(await capture()).toBe(0);
      expect(await rows()).toEqual(before);
      expect(model.call).toHaveBeenCalledOnce();
    });
    it("rejects same-source payload conflicts instead of silently rewriting an applied fact", async () => {
      await interpret();
      await capture();
      await q(
        "UPDATE customer_memory_facts SET value_json=JSON_OBJECT('amountMinor',70000,'currency','SAR') WHERE merchant_id=? AND field_key='budget'",
        [owner.merchantId]
      );
      await expect(capture()).rejects.toThrow("conflict");
      expect((await read()).revision).toBe(1);
    });
    it("keeps source-time expiry and does not renew an old explicit memory on replay", async () => {
      await q(
        "UPDATE messages SET createdAt=TIMESTAMPADD(DAY,-91,UTC_TIMESTAMP()) WHERE id=?",
        [input.incomingMessageId]
      );
      await interpret();
      await capture();
      expect((await read()).facts.map(f => f.field).sort()).toEqual([
        "fastDelivery",
        "preferredName",
      ]);
      const before = await rows();
      await capture();
      expect(await rows()).toEqual(before);
    });
    it("uses current-turn memory on the fifth interaction without a second model interpretation", async () => {
      for (let i = 0; i < 4; i++)
        await next("هذه تفاصيل إضافية، ناديني أمل والميزانية خمسمائة ريال.");
      await interpret();
      await capture();
      const plan = buildReplyPlan({
        merchantId: owner.merchantId,
        conversationId: input.conversationId,
        incomingMessageId: input.incomingMessageId,
        instanceId: 1,
        providerAccount: "synthetic",
        eventId: "context-memory-" + input.incomingMessageId,
        to: input.customerPhone,
        text: "هذه الخيارات المناسبة.",
      });
      await stageInteraction(plan);
      await finishInteractionDelivery(plan, true);
      await runInteractionJob();
      expect(
        (
          await q("SELECT state FROM ai_interaction_jobs WHERE merchant_id=?", [
            owner.merchantId,
          ])
        )[0].state
      ).toBe("completed");
      expect(model.call).toHaveBeenCalledOnce();
      expect((await read()).revision).toBe(1);
      expect(
        (await readStoredUnderstanding((await getPool())!, input))?.analysis
          .memoryFacts
      ).toHaveLength(3);
    });
    it.each(["empty", "historic", "failed"])(
      "does not reinterpret a %s primary decision in the fifth-turn worker",
      async kind => {
        for (let i = 0; i < 4; i++) await next("تفاصيل اختبار إضافية");
        facts = [];
        if (kind === "historic")
          model.call.mockImplementation(async messages => {
            const value = memoryUnderstandingFixture(
              JSON.parse(messages[1].content)
            );
            delete value.memoryFacts;
            return JSON.stringify(value);
          });
        if (kind === "failed") model.call.mockResolvedValue("unusable output");
        await interpret();
        const plan = buildReplyPlan({
          merchantId: owner.merchantId,
          conversationId: input.conversationId,
          incomingMessageId: input.incomingMessageId,
          instanceId: 1,
          providerAccount: "synthetic",
          eventId: "no-memory-retry-" + input.incomingMessageId,
          to: input.customerPhone,
          text: "رد اصطناعي",
        });
        await stageInteraction(plan);
        await finishInteractionDelivery(plan, true);
        await runInteractionJob();
        expect(
          (
            await q(
              "SELECT state FROM ai_interaction_jobs WHERE merchant_id=?",
              [owner.merchantId]
            )
          )[0].state
        ).toBe("completed");
        expect(model.call).toHaveBeenCalledOnce();
        expect(await rows()).toHaveLength(0);
      }
    );
    it.each([1, 2])(
      "rolls memory back when inbound ownership fails at check %s",
      async at => {
        await interpret();
        let checks = 0;
        await expect(
          withInboundExecution(
            {
              id: 1,
              merchantId: owner.merchantId,
              instanceId: 1,
              token: "synthetic",
              eventKey: "memory-test",
              partitionKey: "synthetic",
              sendOrdinal: 0,
              assertOwned: async () => {
                if (++checks === at) throw Error("Ownership lost");
              },
            },
            capture
          )
        ).rejects.toThrow("Ownership lost");
        expect(await rows()).toHaveLength(0);
        expect(await capture()).toBe(3);
      }
    );
  }
);
