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
const mocks = vi.hoisted(() => ({ call: vi.fn(), settings: vi.fn() }));
vi.mock("../ai/openai", () => ({ callGPT4: mocks.call }));
vi.mock("../db_ai_settings", () => ({
  getTextGenerationSettings: mocks.settings,
}));
vi.mock("../ai/zahypi-client", () => ({
  runWithZahyPiContext: (_: unknown, run: () => unknown) => run(),
  resolveZahyPiRuntimeConfig: async () => ({ enabled: false }),
  getOptionalZahyPiRequestContext: () => undefined,
}));
import { getDb, getPool, closeDb } from "../db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import { enqueueInbound, assertInboundOwned } from "../messaging/inbound-jobs";
import {
  withInboundExecution,
  type InboundExecution,
} from "../messaging/inbound-context";
import { readTeachingSource } from "./whatsapp-teaching-source";
import {
  findTeachingReceipt,
  saveContextualMerchantTeaching,
  TeachingLimitError,
} from "./whatsapp-teaching";
import {
  teachingTextHash,
  type TeachingDecision,
} from "../ai/merchant-teaching-understanding";
import { handleMerchantTeaching } from "../ai/merchant-teaching-handler";
import { deleteSection, updateSection, getBotSections } from "../db/knowledge";
import { knowledgeChangelog } from "../../drizzle/schema";

describe.skipIf(!process.env.DATABASE_URL)(
  "contextual WhatsApp teaching with real MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      instanceId: number,
      account: string;
    const users: number[] = [],
      author = "966500000023";
    const text =
      "اعتمد هذه السياسة لكل العملاء: الضمان سنتان ولا يشمل الكسر أو سوء الاستخدام.";
    const query = async (
      statement: string,
      args: unknown[] = []
    ): Promise<any> => (await (await getPool())!.execute(statement, args))[0];
    const decision = (value = text): TeachingDecision => ({
      version: 1,
      sourceHash: teachingTextHash(value),
      intent: "teach",
      scope: "general",
      confidence: 0.98,
      ambiguous: false,
      businessKnowledge: true,
      title: "شروط الضمان",
    });
    beforeEach(async () => {
      vi.resetAllMocks();
      owner = await createDisposableMerchant("wa-teaching");
      users.push(owner.userId);
      account = randomUUID();
      await query("UPDATE merchants SET phone=? WHERE id=?", [
        author,
        owner.merchantId,
      ]);
      const saved = await query(
        "INSERT INTO whatsapp_instances (merchant_id,instance_id,token,status) VALUES (?,?,'fixture','active')",
        [owner.merchantId, account]
      );
      instanceId = saved.insertId;
      mocks.settings.mockResolvedValue({
        isActive: true,
        model: "fixture-central-model",
      });
      mocks.call.mockImplementation(async messages =>
        JSON.stringify(decision(JSON.parse(messages[1].content).message))
      );
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(users);
      users.length = 0;
    });
    afterAll(closeDb);
    async function event(
      value = text,
      mutate?: (payload: any) => void,
      source: "webhook" | "meta" = "webhook"
    ) {
      const payload: any = {
        typeWebhook: "incomingMessageReceived",
        instanceData: { idInstance: account },
        idMessage: randomUUID(),
        timestamp: Math.floor(Date.now() / 1000),
        senderData: { sender: `${author}@c.us`, chatId: `${author}@c.us` },
        messageData: {
          typeMessage: "textMessage",
          textMessageData: { textMessage: value },
        },
      };
      mutate?.(payload);
      const queued = await enqueueInbound({
        payload,
        source,
        expectedMerchantId: owner.merchantId,
      });
      payload.sourceProvider = source === "meta" ? "meta_cloud" : "green_api";
      const token = randomUUID();
      await query(
        "UPDATE whatsapp_inbound_jobs SET status='running',lease_token=?,lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE) WHERE id=?",
        [token, queued.id]
      );
      const [row] = await query(
        "SELECT * FROM whatsapp_inbound_jobs WHERE id=?",
        [queued.id]
      );
      const context: InboundExecution = {
        id: row.id,
        merchantId: owner.merchantId,
        instanceId,
        token,
        eventKey: row.event_key,
        partitionKey: row.partition_key,
        sendOrdinal: 0,
        assertOwned: () =>
          assertInboundOwned({ id: row.id, lease_token: token }),
      };
      const within = <T>(run: () => Promise<T>) =>
        withInboundExecution({ ...context }, run);
      return {
        context,
        payload,
        within,
        run: () =>
          within(() => handleMerchantTeaching(owner.merchantId, value)),
        source: () => within(() => readTeachingSource(owner.merchantId, value)),
      };
    }
    const sections = () =>
      query("SELECT * FROM knowledge_sections WHERE merchant_id=?", [
        owner.merchantId,
      ]);
    it("persists the complete original policy, analysis, source and audit before success; a process retry does not call AI again", async () => {
      const inbound = await event();
      expect((await inbound.run()).response).toContain("تم حفظ المعلومة كاملة");
      const [section] = await sections();
      expect(section.content).toBe(`المعلومة: ${text}`);
      const proof =
        typeof section.provenance === "string"
          ? JSON.parse(section.provenance)
          : section.provenance;
      expect(proof).toMatchObject({
        inboundId: inbound.context.id,
        origin: "contextual_whatsapp_teaching",
        analysis: decision(),
      });
      expect(JSON.stringify(proof)).not.toContain(inbound.context.token);
      expect(JSON.stringify(proof)).not.toContain(author);
      expect((await inbound.run()).response).toContain("مسجلة بالفعل");
      expect(mocks.call).toHaveBeenCalledOnce();
      expect(await sections()).toHaveLength(1);
    });
    it("deduplicates concurrent accepted writes inside the merchant transaction", async () => {
      const inbound = await event(),
        source = await inbound.source();
      const receipts = await Promise.all(
        Array.from({ length: 6 }, () =>
          inbound.within(() =>
            saveContextualMerchantTeaching(source, decision())
          )
        )
      );
      expect(new Set(receipts.map(item => item.sectionId)).size).toBe(1);
      expect(receipts.filter(item => !item.replayed)).toHaveLength(1);
      expect(
        await query("SELECT * FROM knowledge_changelog WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toHaveLength(1);
    });
    it("enforces the durable quota under concurrent different messages; replay remains available at the limit", async () => {
      const events = await Promise.all(
        Array.from({ length: 12 }, (_, index) => event(text + ` مرجع ${index}`))
      );
      const outcomes = await Promise.all(
        events.map(async inbound => {
          const source = await inbound.source();
          try {
            return await inbound.within(() =>
              saveContextualMerchantTeaching(source, decision(source.text))
            );
          } catch (error) {
            expect(error).toBeInstanceOf(TeachingLimitError);
            return null;
          }
        })
      );
      expect(outcomes.filter(Boolean)).toHaveLength(10);
      expect(await sections()).toHaveLength(10);
      const index = outcomes.findIndex(Boolean);
      expect((await events[index].run()).response).toContain("مسجلة بالفعل");
    });
    it.each(["deleted", "disabled", "pending"] as const)(
      "cannot resurrect knowledge after it was %s",
      async state => {
        const inbound = await event();
        await inbound.run();
        const [section] = await sections();
        if (state === "deleted")
          await deleteSection(section.id, owner.merchantId);
        else
          await updateSection(
            section.id,
            owner.merchantId,
            state === "disabled"
              ? { useInBot: false }
              : { status: "pending_review", useInBot: false }
          );
        expect((await inbound.run()).response).toContain("لم أُعد اعتمادها");
        expect(await getBotSections(owner.merchantId)).toHaveLength(0);
        expect(await sections()).toHaveLength(state === "deleted" ? 0 : 1);
        expect(mocks.call).toHaveBeenCalledOnce();
      }
    );
    it("retains the quota after deletion and frees it only after the rolling window", async () => {
      const events = [];
      for (let i = 0; i < 10; i++) {
        const inbound = await event(text + i);
        await inbound.run();
        events.push(inbound);
      }
      for (const section of await sections())
        await deleteSection(section.id, owner.merchantId);
      const next = await event(text + "جديد");
      expect((await next.run()).response).toContain("وصلت إلى 10");
      await query(
        "UPDATE knowledge_changelog SET created_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 25 HOUR) WHERE merchant_id=? AND LEFT(source,9)='wa_teach:'",
        [owner.merchantId]
      );
      expect((await next.run()).response).toContain("تم حفظ المعلومة كاملة");
    });
    it.each([
      "lease",
      "author",
      "merchant",
      "instance",
      "source",
      "account",
      "provider",
      "owner_account",
      "partition",
      "message_id",
    ] as const)(
      "rejects %s changes while the model is running, before publication",
      async change => {
        const inbound = await event();
        mocks.call.mockImplementationOnce(async () => {
          if (change === "lease")
            await query(
              "UPDATE whatsapp_inbound_jobs SET lease_token=? WHERE id=?",
              [randomUUID(), inbound.context.id]
            );
          if (change === "author")
            await query("UPDATE merchants SET phone=NULL WHERE id=?", [
              owner.merchantId,
            ]);
          if (change === "merchant")
            await query("UPDATE merchants SET status='suspended' WHERE id=?", [
              owner.merchantId,
            ]);
          if (change === "instance")
            await query(
              "UPDATE whatsapp_instances SET status='inactive' WHERE id=?",
              [instanceId]
            );
          if (change === "account")
            await query(
              "UPDATE whatsapp_instances SET instance_id=? WHERE id=?",
              [randomUUID(), instanceId]
            );
          if (change === "provider")
            await query(
              "UPDATE whatsapp_instances SET provider='meta_cloud' WHERE id=?",
              [instanceId]
            );
          if (change === "partition")
            await query(
              "UPDATE whatsapp_inbound_jobs SET partition_key=? WHERE id=?",
              ["f".repeat(64), inbound.context.id]
            );
          if (change === "message_id") {
            inbound.payload.idMessage = randomUUID();
            await query(
              "UPDATE whatsapp_inbound_jobs SET payload_json=? WHERE id=?",
              [JSON.stringify(inbound.payload), inbound.context.id]
            );
          }
          if (change === "owner_account")
            await query(
              "UPDATE users SET account_status='deletion_pending' WHERE id=?",
              [owner.userId]
            );
          if (change === "source") {
            inbound.payload.messageData.textMessageData.textMessage =
              "نص تغيّر";
            await query(
              "UPDATE whatsapp_inbound_jobs SET payload_json=? WHERE id=?",
              [JSON.stringify(inbound.payload), inbound.context.id]
            );
          }
          return JSON.stringify(decision());
        });
        expect((await inbound.run()).response).toContain("لم يتم تأكيد");
        expect(await sections()).toHaveLength(0);
      }
    );
    it.each([
      "group",
      "quote",
      "nested_quote",
      "stanza",
      "customer",
      "spoofed_sender",
      "media",
      "wrong_text",
    ] as const)(
      "rejects forged or non-original source %s before calling AI",
      async kind => {
        const inbound = await event(text, payload => {
          if (kind === "group") payload.senderData.chatId = "123@g.us";
          if (kind === "quote")
            payload.messageData.quotedMessage = { textMessage: text };
          if (kind === "nested_quote")
            payload.messageData.extendedTextMessageData = {
              text,
              quotedMessage: {},
            };
          if (kind === "stanza")
            payload.messageData.extendedTextMessageData = {
              text,
              stanzaId: "unverified",
            };
          if (kind === "customer")
            payload.senderData = {
              chatId: "966500000099@c.us",
              sender: "966500000099@c.us",
            };
          if (kind === "spoofed_sender")
            payload.senderData.sender = "966500000099@c.us";
          if (kind === "media")
            payload.messageData.typeMessage = "imageMessage";
          if (kind === "wrong_text")
            payload.messageData.textMessageData.textMessage = "محتوى آخر";
        });
        expect((await inbound.run()).response).toContain("لم يتم تأكيد");
        expect(mocks.call).not.toHaveBeenCalled();
        expect(await sections()).toHaveLength(0);
      }
    );
    it("rejects cross-tenant execution and stolen sources", async () => {
      const inbound = await event(),
        source = await inbound.source();
      const other = await createDisposableMerchant("wa-teach-other");
      users.push(other.userId);
      await expect(
        inbound.within(() => readTeachingSource(other.merchantId, text))
      ).rejects.toThrow();
      await expect(
        inbound.within(() =>
          saveContextualMerchantTeaching(
            { ...source, merchantId: other.merchantId },
            decision()
          )
        )
      ).rejects.toThrow();
      expect(await sections()).toHaveLength(0);
    });
    it("rejects expired leases, missing ambient identity, modified decisions and modified digests", async () => {
      const inbound = await event(),
        source = await inbound.source();
      await expect(
        saveContextualMerchantTeaching(source, decision())
      ).rejects.toThrow();
      await expect(
        inbound.within(() =>
          saveContextualMerchantTeaching(
            { ...source, digest: "forged" },
            decision()
          )
        )
      ).rejects.toThrow();
      await expect(
        inbound.within(() =>
          saveContextualMerchantTeaching(source, {
            ...decision(),
            sourceHash: "a".repeat(64),
          })
        )
      ).rejects.toThrow();
      await query(
        "UPDATE whatsapp_inbound_jobs SET lease_until=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 SECOND) WHERE id=?",
        [inbound.context.id]
      );
      await expect(
        inbound.within(() => saveContextualMerchantTeaching(source, decision()))
      ).rejects.toThrow();
      expect(await sections()).toHaveLength(0);
    });
    it("rolls back the knowledge row when the atomic audit write fails", async () => {
      const inbound = await event(),
        source = await inbound.source(),
        db = (await getDb())!;
      const transaction = db.transaction.bind(db);
      vi.spyOn(db, "transaction").mockImplementationOnce((async (run: any) =>
        transaction(async tx => {
          const insert = tx.insert.bind(tx);
          vi.spyOn(tx, "insert").mockImplementation(((table: any) => {
            if (table === knowledgeChangelog)
              throw Error("fixture audit failure");
            return insert(table);
          }) as any);
          return run(tx);
        })) as any);
      await expect(
        inbound.within(() => saveContextualMerchantTeaching(source, decision()))
      ).rejects.toThrow("fixture audit failure");
      expect(await sections()).toHaveLength(0);
      expect(
        await query("SELECT * FROM knowledge_changelog WHERE merchant_id=?", [
          owner.merchantId,
        ])
      ).toHaveLength(0);
    });
    it("rejects changed content under an already accepted event instead of silently overwriting it", async () => {
      const inbound = await event();
      await inbound.run();
      const changed = text + " تغيير";
      inbound.payload.messageData.textMessageData.textMessage = changed;
      await query(
        "UPDATE whatsapp_inbound_jobs SET payload_json=? WHERE id=?",
        [JSON.stringify(inbound.payload), inbound.context.id]
      );
      const source = await inbound.within(() =>
        readTeachingSource(owner.merchantId, changed)
      );
      await expect(
        inbound.within(() => findTeachingReceipt(source))
      ).rejects.toThrow("changed");
      expect((await sections())[0].content).toBe(`المعلومة: ${text}`);
    });
    it.each(["emergency", "chain", "instance"] as const)(
      "admits current %s authority without trusting payload WID",
      async authority => {
        await query("UPDATE merchants SET phone=NULL WHERE id=?", [
          owner.merchantId,
        ]);
        if (authority === "emergency")
          await query("UPDATE merchants SET emergency_phone=? WHERE id=?", [
            author,
            owner.merchantId,
          ]);
        if (authority === "chain")
          await query("UPDATE merchants SET escalation_phones=? WHERE id=?", [
            JSON.stringify([{ phone: author, order: 1, label: "fixture" }]),
            owner.merchantId,
          ]);
        if (authority === "instance")
          await query(
            "UPDATE whatsapp_instances SET phone_number=? WHERE id=?",
            [author, instanceId]
          );
        const inbound = await event();
        expect((await inbound.run()).response).toContain(
          "تم حفظ المعلومة كاملة"
        );
      }
    );
    it("rejects a forged WID claiming an ordinary customer is the merchant", async () => {
      await query("UPDATE merchants SET phone=NULL WHERE id=?", [
        owner.merchantId,
      ]);
      const inbound = await event(text, payload => {
        payload.instanceData.wid = `${author}@c.us`;
      });
      expect((await inbound.run()).response).toContain("لم يتم تأكيد");
      expect(await sections()).toHaveLength(0);
    });
    it("supports original extended text from Meta without mixing provider identities", async () => {
      await query(
        "UPDATE whatsapp_instances SET provider='meta_cloud' WHERE id=?",
        [instanceId]
      );
      const inbound = await event(
        text,
        payload => {
          payload.senderData = {
            sender: `${author}@s.whatsapp.net`,
            chatId: `${author}@s.whatsapp.net`,
          };
          payload.messageData = {
            typeMessage: "extendedTextMessage",
            extendedTextMessageData: { text },
          };
        },
        "meta"
      );
      expect((await inbound.run()).response).toContain("تم حفظ المعلومة كاملة");
      expect(await sections()).toHaveLength(1);
    });
    it("keeps a later merchant revision on event replay", async () => {
      const inbound = await event();
      await inbound.run();
      const [section] = await sections();
      await updateSection(section.id, owner.merchantId, {
        content: "الضمان بعد المراجعة سنة واحدة",
      });
      expect((await inbound.run()).response).toContain(
        "احتفظت بالمراجعة الحالية"
      );
      expect((await sections())[0].content).toBe(
        "الضمان بعد المراجعة سنة واحدة"
      );
      expect(mocks.call).toHaveBeenCalledOnce();
    });
  }
);
