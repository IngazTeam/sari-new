import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
const notifications = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../_core/notificationService", () => ({
  sendNotification: notifications.send,
}));
import { closeDb, getPool } from "../db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import { seedSealedLearningFixture } from "../tests/helpers/sealed-learning-fixture";
import { getDailyKnowledgeGaps } from "../db/learning";
import { sendKnowledgeGapDigest } from "./smart-escalation";

describe.skipIf(!process.env.DATABASE_URL)(
  "sourced daily learning observations and transport authorization",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      conversation: number;
    const query = async (sql: string, args: any[] = []): Promise<any> =>
      (await (await getPool())!.execute(sql, args))[0];
    const newConversation = async (merchantId = owner.merchantId) =>
      (
        await query(
          "INSERT INTO conversations(merchantId,customerPhone) VALUES (?,'966500000299')",
          [merchantId]
        )
      ).insertId;
    const seed = async (
      text = "لا أجد تفاصيل كافية عن شروط الخدمة.",
      conv = conversation,
      merchantId = owner.merchantId
    ) => {
      const id = (
        await query(
          "INSERT INTO sari_learning_signals(merchant_id,conversation_id,signal_type,customer_message) VALUES (?,?,'knowledge_gap',?)",
          [merchantId, conv, text]
        )
      ).insertId;
      await seedSealedLearningFixture([id]);
      return id;
    };
    const get = () => getDailyKnowledgeGaps(owner.merchantId);
    beforeEach(async () => {
      owner = await createDisposableMerchant("gap-digest");
      other = await createDisposableMerchant("gap-digest-other");
      conversation = await newConversation();
      notifications.send
        .mockReset()
        .mockImplementation(async (_payload, authorize) => {
          await authorize?.();
          return true;
        });
      vi.stubGlobal(
        "fetch",
        vi.fn(() => {
          throw Error("No model or transport call permitted");
        })
      );
    });
    afterEach(async () => {
      expect(fetch).not.toHaveBeenCalled();
      vi.useRealTimers();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      await cleanupDisposableMerchants([owner.userId, other.userId]);
    });
    afterAll(closeDb);
    it("does not turn an operational handoff or unsealed old signal into a declared knowledge gap", async () => {
      await query(
        "INSERT INTO sari_escalation_queue(merchant_id,conversation_id,customer_phone,question) VALUES (?,?,'966500000299','أحتاج موظفًا لتنفيذ الاسترداد')",
        [owner.merchantId, conversation]
      );
      await query(
        "INSERT INTO sari_learning_signals(merchant_id,conversation_id,signal_type,customer_message) VALUES (?,?,'knowledge_gap','Unsealed old question')",
        [owner.merchantId, conversation]
      );
      expect(await get()).toEqual([]);
      await sendKnowledgeGapDigest(owner.merchantId);
      expect(notifications.send).not.toHaveBeenCalled();
    });
    it("counts distinct conversations per exact excerpt, including already analyzed valid sources", async () => {
      const first = await seed("Synthetic observation");
      await seed("Synthetic observation");
      await seed("Synthetic observation", await newConversation());
      await query("UPDATE sari_learning_signals SET analyzed=1 WHERE id=?", [
        first,
      ]);
      expect(await get()).toEqual([
        { question: "Synthetic observation", count: 2 },
      ]);
    });
    it("keeps the same phone and excerpt separate between tenants", async () => {
      await seed("Owned observation");
      await seed(
        "Foreign observation",
        await newConversation(other.merchantId),
        other.merchantId
      );
      expect(await get()).toEqual([
        { question: "Owned observation", count: 1 },
      ]);
      expect(await getDailyKnowledgeGaps(other.merchantId)).toEqual([
        { question: "Foreign observation", count: 1 },
      ]);
    });
    it.each([
      "deleted message",
      "changed message",
      "deleted interpretation",
      "altered copy",
      "case variant",
      "foreign conversation",
      "group",
    ])("withdraws %s evidence without publishing copied text", async change => {
      const id = await seed(),
        [row] = await query("SELECT * FROM sari_learning_signals WHERE id=?", [
          id,
        ]),
        source = JSON.parse(row.context_summary).sourceMessageId;
      if (change === "deleted message")
        await query("DELETE FROM messages WHERE id=?", [source]);
      if (change === "changed message")
        await query(
          "UPDATE messages SET content='Different source' WHERE id=?",
          [source]
        );
      if (change === "deleted interpretation")
        await query(
          "DELETE FROM ai_conversation_understanding WHERE incoming_message_id=?",
          [source]
        );
      if (change === "altered copy")
        await query(
          "UPDATE sari_learning_signals SET customer_message='Forged copy' WHERE id=?",
          [id]
        );
      if (change === "case variant")
        await query(
          "UPDATE sari_learning_signals SET signal_type='KNOWLEDGE_GAP' WHERE id=?",
          [id]
        );
      if (change === "foreign conversation")
        await query(
          "UPDATE sari_learning_signals SET conversation_id=? WHERE id=?",
          [await newConversation(other.merchantId), id]
        );
      if (change === "group")
        await query(
          "UPDATE conversations SET customerPhone='group_synthetic@g.us' WHERE id=?",
          [conversation]
        );
      expect(await get()).toEqual([]);
      await sendKnowledgeGapDigest(owner.merchantId);
      expect(notifications.send).not.toHaveBeenCalled();
      expect(
        await query("SELECT id FROM sari_learning_signals WHERE id=?", [id])
      ).toHaveLength(1);
    });
    it("uses the UTC capture day and excludes yesterday and the next day", async () => {
      const yesterday = await seed("Yesterday"),
        start = await seed("Today"),
        future = await seed("Tomorrow");
      await query(
        "UPDATE sari_learning_signals SET created_at=UTC_DATE()-INTERVAL 1 SECOND WHERE id=?",
        [yesterday]
      );
      await query(
        "UPDATE sari_learning_signals SET created_at=UTC_DATE() WHERE id=?",
        [start]
      );
      await query(
        "UPDATE sari_learning_signals SET created_at=UTC_DATE()+INTERVAL 1 DAY WHERE id=?",
        [future]
      );
      expect(await get()).toEqual([{ question: "Today", count: 1 }]);
    });
    it("reads one consistent snapshot during concurrent source deletion and withdraws it on the next read", async () => {
      const id = await seed("Snapshot observation");
      const [row] = await query(
        "SELECT context_summary FROM sari_learning_signals WHERE id=?",
        [id]
      );
      const source = JSON.parse(row.context_summary).sourceMessageId;
      const pool = (await getPool())!,
        original = pool.getConnection.bind(pool);
      let deleted = false;
      const spy = vi
        .spyOn(pool, "getConnection")
        .mockImplementation(async () => {
          const connection = await original();
          return new Proxy(connection, {
            get(target, property) {
              if (property === "execute")
                return async (...args: any[]) => {
                  const result = await (target.execute as any)(...args);
                  if (
                    !deleted &&
                    String(args[0]).includes(
                      "SELECT s.* FROM sari_learning_signals s"
                    )
                  ) {
                    deleted = true;
                    await query("DELETE FROM messages WHERE id=?", [source]);
                  }
                  return result;
                };
              const value = (target as any)[property];
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
        });
      expect(await get()).toEqual([
        { question: "Snapshot observation", count: 1 },
      ]);
      expect(deleted).toBe(true);
      spy.mockRestore();
      expect(await get()).toEqual([]);
    });
    it("excludes unmarked history before capacity and limits only the verified grouped presentation", async () => {
      const values = Array.from({ length: 2100 }, () => [
        owner.merchantId,
        conversation,
      ]);
      await query(
        `INSERT INTO sari_learning_signals(merchant_id,conversation_id,signal_type) VALUES ${values.map(() => "(?,?,'knowledge_gap')").join(",")}`,
        values.flat()
      );
      for (let i = 0; i < 11; i++) await seed(`Excerpt ${i}`);
      await seed("Most frequent", await newConversation());
      await seed("Most frequent", await newConversation());
      const result = await get();
      expect(result).toHaveLength(10);
      expect(result[0]).toEqual({ question: "Most frequent", count: 2 });
    });
    it("fails explicitly on too many tagged candidates and does not send a truncated digest", async () => {
      const values = Array.from({ length: 2001 }, (_, i) => [
        owner.merchantId,
        conversation,
        `contextual_learning:${conversation}:${i + 1}`,
      ]);
      await query(
        `INSERT INTO sari_learning_signals(merchant_id,conversation_id,signal_type,source_key) VALUES ${values.map(() => "(?,?,'knowledge_gap',?)").join(",")}`,
        values.flat()
      );
      await expect(get()).rejects.toThrow("capacity");
      await sendKnowledgeGapDigest(owner.merchantId);
      expect(notifications.send).not.toHaveBeenCalled();
    });
    it("describes model observations and conversation counts without asserting missing knowledge or guaranteed answers", async () => {
      await seed("ط".repeat(100));
      await sendKnowledgeGapDigest(owner.merchantId);
      expect(notifications.send).toHaveBeenCalledOnce();
      const payload = notifications.send.mock.calls[0][0];
      expect(payload).toMatchObject({
        merchantId: owner.merchantId,
        metadata: {
          basis: "interpreted_conversation",
          countUnit: "conversation",
          period: "utc_day",
        },
      });
      expect(payload.body).toContain("ط".repeat(80) + "…");
      expect(payload.body).toContain("1 محادثة");
      expect(payload.body).not.toContain("سأل عنها");
      expect(payload.body).not.toContain("لم أجد لها إجابة");
      expect(payload.body).not.toContain("لأتمكن من الرد تلقائياً");
    });
    it("rechecks evidence at each notification transport boundary", async () => {
      const id = await seed();
      let accepted = 0;
      notifications.send.mockImplementation(async (_payload, authorize) => {
        await authorize();
        accepted++;
        await query(
          "UPDATE sari_learning_signals SET customer_message='Changed before second channel' WHERE id=?",
          [id]
        );
        await expect(authorize()).rejects.toThrow("changed");
        return false;
      });
      const log = vi.spyOn(console, "log");
      await sendKnowledgeGapDigest(owner.merchantId);
      expect(accepted).toBe(1);
      expect(log.mock.calls.flat().join(" ")).not.toContain("digest accepted");
    });
    it("does not reuse the previous UTC day at a delayed transport boundary", async () => {
      await seed();
      notifications.send.mockImplementation(async (_payload, authorize) => {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(Date.now() + 86400000);
        await expect(authorize()).rejects.toThrow("changed");
        return false;
      });
      await sendKnowledgeGapDigest(owner.merchantId);
    });
    it.each([0, -1, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1])(
      "rejects invalid tenant scope %s",
      async id => {
        await expect(getDailyKnowledgeGaps(id)).rejects.toThrow("scope");
      }
    );
  }
);
