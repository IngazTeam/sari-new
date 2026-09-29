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
import { closeDb, getPool } from "../db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import { learningUnderstandingFixture } from "../tests/helpers/learning-understanding-fixture";
import { understandConversation } from "./conversation-understanding";
import { captureContextualLearningSignals } from "./contextual-learning";
import { buildReplyPlan } from "../messaging/reply-plan";
import {
  stageInteraction,
  finishInteractionDelivery,
} from "./interaction-jobs";
import {
  getPlaybook,
  runDailyAnalysis,
  runWeeklyAnalysis,
  getBestStrategy,
  isGoldenHour,
} from "./sales-conductor";
import {
  prepareObjectionWindow,
  readVerifiedObjections,
} from "./sales-objection-evidence";

describe.skipIf(!process.env.DATABASE_URL)(
  "durable descriptive sales playbook",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      conversationId: number,
      incomingId: number,
      botId: number;
    const phone = "966500000119";
    const decode = (value: any) =>
      typeof value === "string" ? JSON.parse(value) : value;
    const query = async (sql: string, args: unknown[] = []): Promise<any> =>
      (await (await getPool())!.execute(sql, args))[0];
    const newConversation = async () =>
      (
        await query(
          "INSERT INTO conversations(merchantId,customerPhone,deal_stage) VALUES (?,?,'qualified')",
          [owner.merchantId, phone]
        )
      ).insertId;
    async function observe(
      conversation: number,
      message = "أحمد يقول إن ميزانيته أقل من تكلفة الباقة"
    ) {
      const text = "هذه الفروق بين الباقات وكيف تناسب احتياجك.";
      const previous = (
        await query(
          "INSERT INTO messages(conversationId,direction,messageType,content,aiResponse,isProcessed,sender_type) VALUES (?,'outgoing','text',?,?,1,'assistant')",
          [conversation, text, text]
        )
      ).insertId;
      const incoming = (
        await query(
          "INSERT INTO messages(conversationId,direction,messageType,content) VALUES (?,'incoming','text',?)",
          [conversation, message]
        )
      ).insertId;
      const plan = buildReplyPlan({
        merchantId: owner.merchantId,
        conversationId: conversation,
        incomingMessageId: incoming,
        instanceId: 1,
        providerAccount: "synthetic",
        eventId: `objection:${incoming}`,
        to: phone,
        text: "يمكن مناقشة البدائل المناسبة لاحتياجك.",
      });
      await stageInteraction(plan);
      await finishInteractionDelivery(plan, true);
      const [job] = await query(
        "SELECT id FROM ai_interaction_jobs WHERE merchant_id=? AND incoming_message_id=?",
        [owner.merchantId, incoming]
      );
      const input = {
        merchantId: owner.merchantId,
        conversationId: conversation,
        incomingMessageId: incoming,
        customerPhone: phone,
        message,
        jobId: job.id,
        leaseToken: "synthetic-objection",
      };
      await query(
        "UPDATE ai_interaction_jobs SET state='processing',lease_token=?,lease_until=TIMESTAMPADD(MINUTE,5,UTC_TIMESTAMP(3)) WHERE id=?",
        [input.leaseToken, job.id]
      );
      await understandConversation(input);
      expect(await captureContextualLearningSignals(input)).toBe(1);
      return { incoming, previous };
    }
    const saved = async () =>
      (
        await query("SELECT * FROM ai_sales_playbooks WHERE merchant_id=?", [
          owner.merchantId,
        ])
      )[0];
    beforeEach(async () => {
      model.settings.mockReset().mockResolvedValue({
        model: "superadmin-learning-model",
        textGenerationProvider: "openai",
        isActive: true,
      });
      model.call
        .mockReset()
        .mockImplementation(async messages =>
          JSON.stringify(
            learningUnderstandingFixture(JSON.parse(messages[1].content))
          )
        );
      owner = await createDisposableMerchant("playbook");
      conversationId = await newConversation();
      const source = await observe(conversationId);
      incomingId = source.incoming;
      botId = source.previous;
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants([owner.userId]);
    });
    afterAll(closeDb);
    it("persists a source window and reads verified counts without inventing a winning strategy or exposing customer names", async () => {
      await runWeeklyAnalysis(owner.merchantId);
      const playbook = await getPlaybook(owner.merchantId);
      expect(playbook.topObjections).toEqual([
        {
          objection: "price_objection",
          frequency: 1,
          independentConversations: 1,
          bestStrategy: null,
          winRate: null,
        },
      ]);
      expect(JSON.stringify(playbook)).not.toContain("أحمد");
      expect(JSON.stringify((await saved()).weekly_analysis)).not.toContain(
        "أحمد"
      );
      expect(decode((await saved()).weekly_analysis)).not.toHaveProperty(
        "topObjections"
      );
      expect(playbook.lastWeeklyUpdate).toBeInstanceOf(Date);
      expect(getBestStrategy(owner.merchantId, "hesitating")).toBeNull();
      expect(isGoldenHour(owner.merchantId)).toBe(false);
      expect(model.call).toHaveBeenCalledTimes(1);
    });
    it("concurrent daily and weekly jobs preserve both analyses in one durable record", async () => {
      await Promise.all([
        runDailyAnalysis(owner.merchantId),
        runWeeklyAnalysis(owner.merchantId),
      ]);
      const saved = await getPlaybook(owner.merchantId);
      expect(saved.lastDailyUpdate).toBeInstanceOf(Date);
      expect(saved.lastWeeklyUpdate).toBeInstanceOf(Date);
      expect(saved.topObjections).toHaveLength(1);
      expect(
        await query(
          "SELECT revision FROM ai_sales_playbooks WHERE merchant_id=?",
          [owner.merchantId]
        )
      ).toEqual([{ revision: 2 }]);
    });
    it("ignores legacy materialized counts without rewriting their audit history", async () => {
      await runWeeklyAnalysis(owner.merchantId);
      const legacy = JSON.stringify({
        schemaVersion: 1,
        topObjections: [
          {
            objection: "price_objection",
            frequency: 999999,
            bestStrategy: "pressure",
          },
        ],
      });
      await query(
        "UPDATE ai_sales_playbooks SET weekly_analysis=? WHERE merchant_id=?",
        [legacy, owner.merchantId]
      );
      expect(await getPlaybook(owner.merchantId)).toMatchObject({
        topObjections: [],
        lastWeeklyUpdate: null,
      });
      expect(decode((await saved()).weekly_analysis)).toEqual(
        JSON.parse(legacy)
      );
    });
    it("isolates tenants and immediately drops counts when the conversation is deleted without waiting for another weekly run", async () => {
      const other = await createDisposableMerchant("other-playbook");
      try {
        await runWeeklyAnalysis(owner.merchantId);
        expect((await getPlaybook(other.merchantId)).topObjections).toEqual([]);
        await query("DELETE FROM conversations WHERE id=? AND merchantId=?", [
          conversationId,
          owner.merchantId,
        ]);
        expect((await getPlaybook(owner.merchantId)).topObjections).toEqual([]);
      } finally {
        await cleanupDisposableMerchants([other.userId]);
      }
    });
    it("does not infer objections from legacy words or expose their unverified frequency", async () => {
      await query(
        "INSERT INTO sari_learning_signals(merchant_id,conversation_id,signal_type,customer_message) VALUES (?,?,'price_objection','السعر غالي')",
        [owner.merchantId, conversationId]
      );
      await runWeeklyAnalysis(owner.merchantId);
      expect(
        (await getPlaybook(owner.merchantId)).topObjections[0]
      ).toMatchObject({ frequency: 1, independentConversations: 1 });
      expect(
        await query(
          "SELECT id FROM sari_learning_signals WHERE merchant_id=?",
          [owner.merchantId]
        )
      ).toHaveLength(2);
    });
    it.each([
      "message_deleted",
      "message_text",
      "assistant",
      "interpretation",
      "metadata",
      "weight",
      "copied_text",
      "source_case",
    ])(
      "withdraws %s on the next read without regenerating AI or changing the manifest",
      async change => {
        await runWeeklyAnalysis(owner.merchantId);
        const before = await saved();
        if (change === "message_deleted")
          await query("DELETE FROM messages WHERE id=?", [incomingId]);
        if (change === "message_text")
          await query("UPDATE messages SET content='مصدر مختلف' WHERE id=?", [
            incomingId,
          ]);
        if (change === "assistant")
          await query(
            "UPDATE messages SET sender_type='merchant',aiResponse=NULL WHERE id=?",
            [botId]
          );
        if (change === "interpretation")
          await query(
            "UPDATE ai_conversation_understanding SET result_digest=REPEAT('0',64) WHERE incoming_message_id=?",
            [incomingId]
          );
        if (change === "metadata")
          await query(
            "UPDATE sari_learning_signals SET context_summary=NULL WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (change === "weight")
          await query(
            "UPDATE sari_learning_signals SET signal_weight=8 WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (change === "copied_text")
          await query(
            "UPDATE sari_learning_signals SET customer_message='نص منسوخ مزيف' WHERE merchant_id=?",
            [owner.merchantId]
          );
        if (change === "source_case")
          await query(
            "UPDATE sari_learning_signals SET source_key=UPPER(source_key),context_summary=NULL WHERE merchant_id=?",
            [owner.merchantId]
          );
        expect((await getPlaybook(owner.merchantId)).topObjections).toEqual([]);
        expect(await saved()).toEqual(before);
        expect(
          await query(
            "SELECT id FROM sari_learning_signals WHERE merchant_id=?",
            [owner.merchantId]
          )
        ).toHaveLength(1);
        expect(model.call).toHaveBeenCalledTimes(1);
      }
    );
    it("counts independent conversations separately from repeated observations in one conversation", async () => {
      await observe(conversationId);
      await observe(await newConversation());
      await runWeeklyAnalysis(owner.merchantId);
      expect(
        (await getPlaybook(owner.merchantId)).topObjections[0]
      ).toMatchObject({ frequency: 3, independentConversations: 2 });
    });
    it("keeps later signals outside the saved sample until the next weekly run", async () => {
      await runWeeklyAnalysis(owner.merchantId);
      await observe(conversationId);
      expect(
        (await getPlaybook(owner.merchantId)).topObjections[0].frequency
      ).toBe(1);
      await runWeeklyAnalysis(owner.merchantId);
      expect(
        (await getPlaybook(owner.merchantId)).topObjections[0].frequency
      ).toBe(2);
    });
    it("uses the stated thirty-day capture window and preserves older signals", async () => {
      await query(
        "UPDATE sari_learning_signals SET created_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 31 DAY) WHERE merchant_id=?",
        [owner.merchantId]
      );
      await runWeeklyAnalysis(owner.merchantId);
      expect((await getPlaybook(owner.merchantId)).topObjections).toEqual([]);
      expect(
        await query(
          "SELECT id FROM sari_learning_signals WHERE merchant_id=?",
          [owner.merchantId]
        )
      ).toHaveLength(1);
    });
    it("keeps price and non-price interpretations separate without choosing a winning strategy", async () => {
      model.call.mockImplementation(async messages =>
        JSON.stringify(
          learningUnderstandingFixture(JSON.parse(messages[1].content), [
            "sales_objection",
          ])
        )
      );
      await observe(await newConversation(), "أحتاج ضمانا موثقا قبل القرار");
      await runWeeklyAnalysis(owner.merchantId);
      expect((await getPlaybook(owner.merchantId)).topObjections).toEqual([
        {
          objection: "price_objection",
          frequency: 1,
          independentConversations: 1,
          bestStrategy: null,
          winRate: null,
        },
        {
          objection: "sales_objection",
          frequency: 1,
          independentConversations: 1,
          bestStrategy: null,
          winRate: null,
        },
      ]);
    });
    it("does not present a publication without its update time as current evidence", async () => {
      await runWeeklyAnalysis(owner.merchantId);
      await query(
        "UPDATE ai_sales_playbooks SET weekly_updated_at=NULL WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(await getPlaybook(owner.merchantId)).toMatchObject({
        topObjections: [],
        lastWeeklyUpdate: null,
      });
    });
    it.each(["version", "future", "short_window", "invented_counts"])(
      "quarantines an invalid manifest: %s",
      async change => {
        await runWeeklyAnalysis(owner.merchantId);
        const window = decode((await saved()).weekly_analysis);
        if (change === "version") window.schemaVersion = 9;
        if (change === "future") {
          window.windowFrom = new Date(Date.now() + 86400_000).toISOString();
          window.windowUntil = new Date(
            Date.parse(window.windowFrom) + 30 * 86400_000
          ).toISOString();
        }
        if (change === "short_window") window.windowFrom = window.windowUntil;
        if (change === "invented_counts")
          window.topObjections = [{ frequency: 99999 }];
        await query(
          "UPDATE ai_sales_playbooks SET weekly_analysis=? WHERE merchant_id=?",
          [JSON.stringify(window), owner.merchantId]
        );
        expect(await getPlaybook(owner.merchantId)).toMatchObject({
          topObjections: [],
          lastWeeklyUpdate: null,
        });
      }
    );
    it("rejects an oversized sample explicitly and leaves the previous complete publication intact", async () => {
      await runWeeklyAnalysis(owner.merchantId);
      const before = await saved();
      const values = Array.from({ length: 2000 }, (_, i) => [
        owner.merchantId,
        conversationId,
        `contextual_learning:overflow:${i}`,
      ]);
      await query(
        `INSERT INTO sari_learning_signals(merchant_id,conversation_id,signal_type,source_key) VALUES ${values.map(() => "(?,?,'price_objection',?)").join(",")}`,
        values.flat()
      );
      const c = await (await getPool())!.getConnection();
      try {
        await c.beginTransaction();
        const window = await prepareObjectionWindow(c, owner.merchantId);
        await expect(
          readVerifiedObjections(c, owner.merchantId, window)
        ).rejects.toThrow("capacity exceeded");
        await c.rollback();
      } finally {
        c.release();
      }
      await runWeeklyAnalysis(owner.merchantId);
      expect(await saved()).toEqual(before);
      expect(
        (await getPlaybook(owner.merchantId)).topObjections[0].frequency
      ).toBe(1);
    });
    it("keeps the manifest and source proof in one snapshot across a concurrent source deletion", async () => {
      await runWeeklyAnalysis(owner.merchantId);
      const pool = (await getPool())!,
        c = await pool.getConnection(),
        other = await pool.getConnection();
      try {
        await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
        await c.query("START TRANSACTION READ ONLY");
        const window = await prepareObjectionWindow(c, owner.merchantId);
        await other.execute("DELETE FROM messages WHERE id=?", [incomingId]);
        expect(
          (await readVerifiedObjections(c, owner.merchantId, window))[0]
            .frequency
        ).toBe(1);
        await c.commit();
        expect((await getPlaybook(owner.merchantId)).topObjections).toEqual([]);
      } finally {
        await c.rollback();
        c.release();
        other.release();
      }
    });
    it("serializes two weekly publications without erasing either revision", async () => {
      await Promise.all([
        runWeeklyAnalysis(owner.merchantId),
        runWeeklyAnalysis(owner.merchantId),
      ]);
      expect((await saved()).revision).toBe(2);
      expect(
        (await getPlaybook(owner.merchantId)).topObjections[0].frequency
      ).toBe(1);
    });
    it("takes its source snapshot after a competing publisher releases the row", async () => {
      await runWeeklyAnalysis(owner.merchantId);
      const next = await observe(conversationId);
      const [pending] = await query(
        "SELECT * FROM sari_learning_signals WHERE merchant_id=? AND source_key=?",
        [
          owner.merchantId,
          `contextual_learning:${conversationId}:${next.incoming}`,
        ]
      );
      await query("DELETE FROM sari_learning_signals WHERE id=?", [pending.id]);
      const pool = (await getPool())!,
        blocker = await pool.getConnection(),
        worker = await pool.getConnection();
      let reached!: () => void;
      const waiting = new Promise<void>(resolve => {
        reached = resolve;
      });
      const original = worker.execute.bind(worker);
      const execute = vi.spyOn(worker, "execute").mockImplementation(((
        ...args: any[]
      ) => {
        if (String(args[0]).includes("(merchant_id, revision)")) reached();
        return (original as any)(...args);
      }) as any);
      const acquire = vi
        .spyOn(pool, "getConnection")
        .mockResolvedValueOnce(worker);
      let running: Promise<void> | undefined;
      try {
        await blocker.beginTransaction();
        await blocker.execute(
          "SELECT merchant_id FROM ai_sales_playbooks WHERE merchant_id=? FOR UPDATE",
          [owner.merchantId]
        );
        running = runWeeklyAnalysis(owner.merchantId);
        await Promise.race([
          waiting,
          running.then(() => {
            throw Error("Publisher did not serialize before reading");
          }),
        ]);
        // Commit an already proven observation without taking the merchant admission lock.
        await query(
          `INSERT INTO sari_learning_signals(merchant_id,conversation_id,signal_type,signal_weight,bot_message,customer_message,merchant_correction,context_summary,source_key)
          VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            owner.merchantId,
            conversationId,
            pending.signal_type,
            pending.signal_weight,
            pending.bot_message,
            pending.customer_message,
            pending.merchant_correction,
            pending.context_summary,
            pending.source_key,
          ]
        );
        await blocker.commit();
        await running;
        expect(
          (await getPlaybook(owner.merchantId)).topObjections[0].frequency
        ).toBe(2);
      } finally {
        await blocker.rollback();
        blocker.release();
        if (running) await running;
        else worker.release();
        execute.mockRestore();
        acquire.mockRestore();
      }
    });
  }
);
