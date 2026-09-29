import { randomUUID } from "node:crypto";
import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
const mock = vi.hoisted(() => ({
  understand: vi.fn(),
  send: vi.fn(),
  privateChat: vi.fn(),
}));
vi.mock("../ai/group-understanding", async original => ({
  ...(await original<typeof import("../ai/group-understanding")>()),
  understandGroup: mock.understand,
}));
vi.mock("../channels/whatsapp/providers", () => ({
  getWhatsAppProvider: () => ({ send: mock.send }),
}));
vi.mock("../ai/sari-personality", () => ({ chatWithSari: mock.privateChat }));
import { getPool, closeDb } from "../db/connection";
import {
  createDisposableMerchant,
  createDisposableTrialSubscription,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import { ensureGroupTestSchema } from "../tests/helpers/group-schema";
import { enqueueInbound, claimInbound, executeInbound } from "./inbound-jobs";
import { handleGreenAPIWebhook } from "../webhooks/greenapi";
import { currentInboundExecution } from "./inbound-context";
import { readGroupContext } from "./group-context";
import { checkoutTransaction } from "../ai/checkout-agreements";
import { runInteractionJob } from "../ai/interaction-jobs";
import { canDispatchGroupReply } from "./group-handler";
import { resumeExpiredGroupOwnership } from "./group-ownership";
import { ordinaryReplyDigest } from "../ai/reply-reservation";
import { purgeCompletedInboundPayloads } from "./retention";
import { ensureTeachingDialogueSchema } from "../tests/helpers/teaching-dialogue-schema";
import { ensureOnboardingTestSchema } from "../tests/helpers/onboarding-schema";
import type { GroupInput } from "../ai/group-understanding";
const q = async (s: string, p: unknown[] = []) =>
  (await (await getPool())!.execute<any>(s, p))[0];
describe.skipIf(!process.env.DATABASE_URL)(
  "contextual groups with real source and channel storage",
  () => {
    let f: Awaited<ReturnType<typeof createDisposableMerchant>>,
      instance: number,
      account: string,
      planId: number;
    const users: number[] = [],
      group = "120363000000001@g.us",
      sender = "966500000111@c.us",
      bot = "966500000222";
    beforeAll(async () => {
      await ensureGroupTestSchema();
      await ensureTeachingDialogueSchema();
      await ensureOnboardingTestSchema();
    });
    beforeEach(async () => {
      f = await createDisposableMerchant("group-ai");
      users.push(f.userId);
      await createDisposableTrialSubscription(f.merchantId);
      planId = Number(
        (
          await q(
            "INSERT INTO subscription_plans (name,name_en,monthly_price,yearly_price,max_customers,message_limit) VALUES ('Synthetic group','Synthetic group',1,10,100,1000)"
          )
        ).insertId
      );
      await q(
        "UPDATE merchant_subscriptions SET plan_id=? WHERE merchant_id=?",
        [planId, f.merchantId]
      );
      account = randomUUID();
      instance = (
        await q(
          "INSERT INTO whatsapp_instances (merchant_id,instance_id,token,provider,status,phone_number,is_primary) VALUES (?,?,'fixture','green_api','active',?,1)",
          [f.merchantId, account, bot]
        )
      ).insertId;
      await q(
        "INSERT INTO bot_settings (merchant_id,group_mode,group_keywords,response_delay) VALUES (?,'keyword_only',?,0)",
        [f.merchantId, JSON.stringify(["تدريب إكسل"])]
      );
      await q(
        "INSERT INTO extracted_faqs (merchant_id,question,answer) VALUES (?,'ما مجال الدورة؟','تعلّم تنظيم الجداول للمبتدئين')",
        [f.merchantId]
      );
      mock.understand
        .mockReset()
        .mockImplementation(async (_m: number, i: GroupInput) => ({
          version: 1,
          basisHash: i.basisHash,
          currentMessageId: i.currentMessageId,
          action: "respond",
          confidence: 0.99,
          ambiguous: false,
          evidence: [
            {
              messageId: i.currentMessageId,
              excerpt: i.messages.find(m => m.id === i.currentMessageId)!.text,
            },
          ],
          factKeys: [i.facts[0].key],
          reply: "الدورة تساعدك على تنظيم الجداول. ما مستوى خبرتك؟",
          reason: "fixture",
        }));
      mock.send.mockReset().mockImplementation(async () => ({
        accepted: true,
        outcome: "accepted",
        status: "sent",
        providerMessageId: randomUUID(),
      }));
      mock.privateChat.mockReset();
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(users);
      users.length = 0;
      if (planId)
        await q("DELETE FROM subscription_plans WHERE id=?", [planId]);
    });
    afterAll(closeDb);
    async function event(
      text = "أحتاج ترتيب شغلي بالأرقام، هل تساعدونني؟",
      chat = group,
      from = sender,
      extra: any = {}
    ) {
      const payload = {
        typeWebhook: "incomingMessageReceived",
        instanceData: { idInstance: account, wid: bot + "@c.us" },
        idMessage: randomUUID(),
        timestamp: Math.floor(Date.now() / 1000),
        senderData: { chatId: chat, sender: from },
        messageData: {
          typeMessage: "textMessage",
          textMessageData: { textMessage: text },
          ...extra,
        },
      };
      const queued = await enqueueInbound({
        payload,
        source: "webhook",
        expectedMerchantId: f.merchantId,
      });
      return { payload, id: queued.id };
    }
    const run = async (before?: (p: any) => Promise<void>) => {
      const job = await claimInbound(f.merchantId);
      expect(job).toBeTruthy();
      await executeInbound(job!, async payload => {
        await before?.(payload);
        return handleGreenAPIWebhook(payload);
      });
      return (
        await q("SELECT * FROM whatsapp_inbound_jobs WHERE id=?", [job!.id])
      )[0];
    };
    it("understands a need without a topic keyword, persists its decision and sends only to the group", async () => {
      const e = await event();
      expect((await run()).status).toBe("completed");
      expect(mock.understand).toHaveBeenCalledOnce();
      expect(mock.privateChat).not.toHaveBeenCalled();
      expect(mock.send).toHaveBeenCalledWith(
        expect.objectContaining({ instanceId: account }),
        expect.objectContaining({ to: group })
      );
      const [a] = await q(
        "SELECT * FROM ai_group_understanding WHERE merchant_id=?",
        [f.merchantId]
      );
      expect(a.inbound_id).toBe(e.id);
      expect(
        (
          await q(
            "SELECT messages_used FROM merchant_subscriptions WHERE merchant_id=?",
            [f.merchantId]
          )
        )[0].messages_used
      ).toBe(2);
      expect(
        await q("SELECT * FROM customer_profiles WHERE merchant_id=?", [
          f.merchantId,
        ])
      ).toHaveLength(0);
    });
    it("ignores a negated quoted topic when AI decides no assistance is requested", async () => {
      const original = mock.understand.getMockImplementation()!;
      mock.understand.mockImplementation(async (m, i) => ({
        ...(await original(m, i)),
        action: "ignore",
        reply: null,
        factKeys: [],
      }));
      await event("قال تدريب إكسل، لكننا لا نطلب دورة منكم");
      expect((await run()).status).toBe("completed");
      expect(mock.send).not.toHaveBeenCalled();
      expect(mock.understand).toHaveBeenCalledOnce();
      expect(
        await q("SELECT * FROM conversations WHERE merchantId=?", [
          f.merchantId,
        ])
      ).toHaveLength(0);
    });
    it("reuses event identity without another interpretation, charge or send", async () => {
      const first = await event();
      await run();
      expect(
        await enqueueInbound({
          payload: first.payload,
          source: "webhook",
          expectedMerchantId: f.merchantId,
        })
      ).toEqual({ id: first.id, duplicate: true });
      expect(await claimInbound(f.merchantId)).toBeNull();
      expect(mock.understand).toHaveBeenCalledOnce();
      expect(mock.send).toHaveBeenCalledOnce();
      expect(
        (
          await q(
            "SELECT messages_used FROM merchant_subscriptions WHERE merchant_id=?",
            [f.merchantId]
          )
        )[0].messages_used
      ).toBe(2);
    });
    it("keeps uncertain transport in review instead of repeating a group or private send", async () => {
      mock.send.mockResolvedValue({
        accepted: false,
        outcome: "unknown",
        errorCode: "transport_unknown",
      });
      await event();
      expect((await run()).status).toBe("review");
      expect(mock.send).toHaveBeenCalledOnce();
      expect(await claimInbound(f.merchantId)).toBeNull();
      expect(mock.privateChat).not.toHaveBeenCalled();
    });
    it("includes only acknowledged assistant text in the following group turn", async () => {
      const first = await event();
      expect((await run()).status).toBe("completed");
      await event("أنا مبتدئ");
      expect((await run()).status).toBe("completed");
      const input = mock.understand.mock.calls[1][1] as GroupInput;
      expect(input.messages).toHaveLength(2);
      expect(input.assistantReplies).toEqual([
        {
          afterMessageId: first.id,
          text: "الدورة تساعدك على تنظيم الجداول. ما مستوى خبرتك؟",
        },
      ]);
    });
    it.each(["provider", "malformed", "low_confidence"])(
      "never falls back to keyword responses on %s",
      async kind => {
        const original = mock.understand.getMockImplementation()!;
        mock.understand.mockImplementation(async (m, i) => {
          if (kind === "provider") throw Error("fixture");
          return {
            ...(await original(m, i)),
            ...(kind === "malformed"
              ? { factKeys: ["foreign:1"] }
              : { confidence: 0.1 }),
          };
        });
        await event("تدريب إكسل");
        expect((await run()).status).toBe("review");
        expect(mock.send).not.toHaveBeenCalled();
        expect(mock.privateChat).not.toHaveBeenCalled();
      }
    );
    it("uses different participant identities and excludes private and other group transcripts", async () => {
      const a = await event("أنا المشارك الأول");
      await q(
        "UPDATE whatsapp_inbound_jobs SET status='completed' WHERE id=?",
        [a.id]
      );
      for (const [text, chat] of [
        ["private sentinel", sender],
        ["other-group sentinel", "120363000000099@g.us"],
      ]) {
        const x = await event(text, chat);
        await q(
          "UPDATE whatsapp_inbound_jobs SET status='completed' WHERE id=?",
          [x.id]
        );
      }
      await event("أنا مشارك ثانٍ", group, "966500000333@c.us");
      await run();
      const i = mock.understand.mock.calls[0][1] as GroupInput;
      expect(i.messages).toHaveLength(2);
      expect(i.messages[0].actor).not.toBe(i.messages[1].actor);
      expect(JSON.stringify(i)).not.toContain("sentinel");
      expect(JSON.stringify(i)).not.toContain(sender);
    });
    it.each(["text", "suffix", "forged_wid"])(
      "rejects a %s pseudo-mention without calling AI",
      async kind => {
        await q(
          "UPDATE bot_settings SET group_mode='mention_only' WHERE merchant_id=?",
          [f.merchantId]
        );
        const e = await event(
          "@" + bot,
          group,
          sender,
          kind === "suffix"
            ? {
                extendedTextMessageData: {
                  text: "سؤال",
                  mentionedJidList: [bot + "7@c.us"],
                },
              }
            : {}
        );
        if (kind === "forged_wid")
          await q(
            "UPDATE whatsapp_inbound_jobs SET payload_json=JSON_SET(payload_json,'$.instanceData.wid','966500000999@c.us','$.messageData.extendedTextMessageData',JSON_OBJECT('text','سؤال','mentionedJidList',JSON_ARRAY('966500000999@c.us'))) WHERE id=?",
            [e.id]
          );
        expect((await run()).status).toBe("completed");
        expect(mock.understand).not.toHaveBeenCalled();
        expect(mock.send).not.toHaveBeenCalled();
      }
    );
    it("accepts an exact native mention of the stored connected phone", async () => {
      await q(
        "UPDATE bot_settings SET group_mode='mention_only' WHERE merchant_id=?",
        [f.merchantId]
      );
      await event("سؤال", group, sender, {
        extendedTextMessageData: {
          text: "أي دورة؟",
          mentionedJidList: [bot + "@c.us"],
        },
      });
      expect((await run()).status).toBe("completed");
      expect(mock.send).toHaveBeenCalledOnce();
    });
    it("invites inside the group without unsolicited private delivery", async () => {
      await q(
        "UPDATE bot_settings SET group_mode='private_redirect',group_redirect_message='legacy private sentinel' WHERE merchant_id=?",
        [f.merchantId]
      );
      const original = mock.understand.getMockImplementation()!;
      mock.understand.mockImplementation(async (m, i) => ({
        ...(await original(m, i)),
        action: "invite_private",
        factKeys: [],
        reply: "راسلنا على الخاص لمراجعة تفاصيل طلبك.",
      }));
      await event("أحتاج مراجعة تفاصيل طلبي");
      expect((await run()).status).toBe("completed");
      expect(mock.send).toHaveBeenCalledOnce();
      expect(mock.send.mock.calls[0][1].to).toBe(group);
      expect(JSON.stringify(mock.send.mock.calls)).not.toContain("sentinel");
    });
    it.each(["source", "settings", "faq", "lease", "instance", "ownership"])(
      "suppresses a response if %s changes during AI",
      async kind => {
        const original = mock.understand.getMockImplementation()!;
        mock.understand.mockImplementation(async (m, i) => {
          const d = await original(m, i),
            e = currentInboundExecution()!;
          if (kind === "source")
            await q(
              "UPDATE whatsapp_inbound_jobs SET payload_json=JSON_SET(payload_json,'$.messageData.textMessageData.textMessage','changed') WHERE id=?",
              [e.id]
            );
          if (kind === "settings")
            await q(
              "UPDATE bot_settings SET group_keywords='[]' WHERE merchant_id=?",
              [f.merchantId]
            );
          if (kind === "faq")
            await q(
              "UPDATE extracted_faqs SET answer='changed' WHERE merchant_id=?",
              [f.merchantId]
            );
          if (kind === "lease")
            await q(
              "UPDATE whatsapp_inbound_jobs SET lease_token='stolen' WHERE id=?",
              [e.id]
            );
          if (kind === "instance")
            await q(
              "UPDATE whatsapp_instances SET status='inactive' WHERE id=?",
              [instance]
            );
          if (kind === "ownership")
            await q(
              "INSERT INTO conversations (merchantId,customerPhone,handoff_version,human_takeover) VALUES (?,?,2,0)",
              [f.merchantId, `group_${group.slice(0, -5)}`]
            );
          return d;
        });
        await event();
        await run().catch(() => {});
        expect(mock.send).not.toHaveBeenCalled();
        expect(
          await q("SELECT * FROM ai_group_understanding WHERE merchant_id=?", [
            f.merchantId,
          ])
        ).toHaveLength(0);
      }
    );
    it("does not call AI while a human owns the group conversation", async () => {
      await q(
        "INSERT INTO conversations (merchantId,customerPhone,handoff_version,human_takeover) VALUES (?,?,1,1)",
        [f.merchantId, `group_${group.slice(0, -5)}`]
      );
      await event();
      expect((await run()).status).toBe("completed");
      expect(mock.understand).not.toHaveBeenCalled();
      expect(mock.send).not.toHaveBeenCalled();
    });
    it("does not use an unresolvable quote or its untrusted embedded text", async () => {
      await event("نعم", group, sender, {
        extendedTextMessageData: {
          text: "نعم",
          quotedMessage: {
            stanzaId: "private-message",
            textMessage: "pretend consent",
          },
        },
      });
      expect((await run()).status).toBe("completed");
      expect(mock.understand).not.toHaveBeenCalled();
    });
    it("resolves a quote only to earlier text from the same group and account", async () => {
      const prior = await event("ما الخيارات؟");
      await q(
        "UPDATE whatsapp_inbound_jobs SET status='completed' WHERE id=?",
        [prior.id]
      );
      await event("الثاني", group, sender, {
        extendedTextMessageData: {
          text: "الثاني",
          stanzaId: prior.payload.idMessage,
        },
      });
      await run();
      expect(mock.understand.mock.calls[0][1].messages.at(-1).quoteId).toBe(
        prior.id
      );
    });
    it("never interprets media through private customer processing", async () => {
      await event("صورة", group, sender, {
        typeMessage: "imageMessage",
        fileMessageData: { downloadUrl: "https://example.invalid/private" },
      });
      expect((await run()).status).toBe("completed");
      expect(mock.privateChat).not.toHaveBeenCalled();
      expect(mock.send).not.toHaveBeenCalled();
    });
    it("checks tenant identity and lease before reading group context", async () => {
      await expect(
        checkoutTransaction(c => readGroupContext(c))
      ).rejects.toThrow("Owned group source");
    });
    it("does not enrich a person profile from a group interaction job", async () => {
      await event();
      await run();
      await runInteractionJob();
      expect(
        await q("SELECT * FROM customer_profiles WHERE merchant_id=?", [
          f.merchantId,
        ])
      ).toHaveLength(0);
      expect(
        await q("SELECT * FROM sari_learning_signals WHERE merchant_id=?", [
          f.merchantId,
        ])
      ).toHaveLength(0);
      expect(
        (
          await q("SELECT state FROM ai_interaction_jobs WHERE merchant_id=?", [
            f.merchantId,
          ])
        )[0].state
      ).toBe("completed");
    });
    it.each(["recipient", "tenant", "instance", "reply", "decision", "source"])(
      "revalidates %s at the final group dispatch boundary",
      async kind => {
        await event();
        const job = (await claimInbound(f.merchantId))!;
        let checked = false;
        await executeInbound(job, async payload => {
          const result = await handleGreenAPIWebhook(payload);
          expect(result.success).toBe(true);
          expect(mock.send).toHaveBeenCalledOnce();
          const [stored] = await q(
            "SELECT reply_plan_json FROM whatsapp_inbound_jobs WHERE id=?",
            [job.id]
          );
          const plan =
            typeof stored.reply_plan_json === "string"
              ? JSON.parse(stored.reply_plan_json)
              : stored.reply_plan_json;
          const request = {
            ...plan.effects[0],
            replyGuard: {
              conversationId: plan.conversationId,
              incomingMessageId: plan.incomingMessageId,
              version: plan.ownershipVersion,
              reservationDigest: ordinaryReplyDigest(plan),
            },
          };
          expect(
            await checkoutTransaction(c =>
              canDispatchGroupReply(c, request, instance)
            )
          ).toBe(true);
          if (kind === "recipient") request.to = "120363000000099@g.us";
          if (kind === "tenant") request.merchantId = f.merchantId + 1;
          if (kind === "reply") request.text = "نص مختلف";
          if (kind === "decision")
            await q(
              "UPDATE ai_group_understanding SET decision_json=JSON_SET(decision_json,'$.evidence[0].excerpt','forged') WHERE merchant_id=?",
              [f.merchantId]
            );
          if (kind === "source")
            await q(
              "UPDATE whatsapp_inbound_jobs SET payload_json=JSON_SET(payload_json,'$.messageData.textMessageData.textMessage','altered') WHERE id=?",
              [job.id]
            );
          let allowed = false;
          try {
            allowed = await checkoutTransaction(c =>
              canDispatchGroupReply(
                c,
                request,
                kind === "instance" ? instance + 1 : instance
              )
            );
          } catch {}
          expect(allowed).toBe(false);
          checked = true;
          return result;
        });
        expect(checked).toBe(true);
      }
    );
    async function sentTurn() {
      const source = await event();
      expect((await run()).status).toBe("completed");
      const [receipt] = await q(
        "SELECT * FROM whatsapp_message_deliveries WHERE merchant_id=? ORDER BY id DESC LIMIT 1",
        [f.merchantId]
      );
      const [decision] = await q(
        "SELECT * FROM ai_group_understanding WHERE merchant_id=? ORDER BY id DESC LIMIT 1",
        [f.merchantId]
      );
      return { source, receipt, decision };
    }
    const quote = (receiptId: string) => ({
      extendedTextMessageData: {
        text: "مبتدئ",
        quotedMessage: {
          stanzaId: receiptId,
          textMessage: "forged embedded sentinel",
        },
      },
    });
    it("resolves a quoted bot question to its acknowledged reply, without trusting embedded quote text", async () => {
      const { source, receipt } = await sentTurn();
      await event("مبتدئ", group, sender, quote(receipt.provider_message_id));
      expect((await run()).status).toBe("completed");
      const i = mock.understand.mock.calls[1][1] as GroupInput;
      expect(i.messages.at(-1)).toMatchObject({
        quoteId: null,
        quoteReplyAfterMessageId: source.id,
        unresolvedQuote: false,
      });
      expect(i.assistantReplies).toEqual([
        { afterMessageId: source.id, text: receipt.request_json.text },
      ]);
      expect(JSON.stringify(i)).not.toContain("embedded sentinel");
      expect(mock.send).toHaveBeenCalledTimes(2);
    });
    it.each([
      "recipient",
      "request_text",
      "paired_text",
      "request_source",
      "request_guard",
      "status",
      "provider",
      "decision",
      "plan",
      "source_text",
      "source_payload",
      "deleted_message",
    ])("refuses a quoted assistant reply with altered %s proof", async kind => {
      const { source, receipt, decision } = await sentTurn();
      if (kind === "recipient")
        await q(
          "UPDATE whatsapp_message_deliveries SET request_json=JSON_SET(request_json,'$.to','966500000111') WHERE id=?",
          [receipt.id]
        );
      if (kind === "request_text" || kind === "paired_text")
        await q(
          "UPDATE whatsapp_message_deliveries SET request_json=JSON_SET(request_json,'$.text','tampered') WHERE id=?",
          [receipt.id]
        );
      if (kind === "paired_text")
        await q(
          "UPDATE ai_group_understanding SET decision_json=JSON_SET(decision_json,'$.reply','tampered') WHERE id=?",
          [decision.id]
        );
      if (kind === "request_source")
        await q(
          "UPDATE whatsapp_message_deliveries SET request_json=JSON_SET(request_json,'$.inboundJobId',999999) WHERE id=?",
          [receipt.id]
        );
      if (kind === "request_guard")
        await q(
          "UPDATE whatsapp_message_deliveries SET request_json=JSON_SET(request_json,'$.replyGuard.incomingMessageId',999999) WHERE id=?",
          [receipt.id]
        );
      if (kind === "status")
        await q(
          "UPDATE whatsapp_message_deliveries SET status='failed' WHERE id=?",
          [receipt.id]
        );
      if (kind === "provider")
        await q(
          "UPDATE whatsapp_message_deliveries SET provider='mock' WHERE id=?",
          [receipt.id]
        );
      if (kind === "decision")
        await q(
          "UPDATE ai_group_understanding SET decision_json=JSON_SET(decision_json,'$.currentMessageId',999999) WHERE id=?",
          [decision.id]
        );
      if (kind === "plan")
        await q(
          "UPDATE whatsapp_inbound_jobs SET reply_plan_json=JSON_SET(reply_plan_json,'$.effects[0].text','tampered') WHERE id=?",
          [source.id]
        );
      if (kind === "source_text")
        await q("UPDATE messages SET content='tampered' WHERE id=?", [
          decision.incoming_message_id,
        ]);
      if (kind === "source_payload")
        await q(
          "UPDATE whatsapp_inbound_jobs SET payload_json=JSON_SET(payload_json,'$.messageData.textMessageData.textMessage','tampered') WHERE id=?",
          [source.id]
        );
      if (kind === "deleted_message")
        await q("DELETE FROM messages WHERE id=?", [
          decision.incoming_message_id,
        ]);
      mock.understand.mockClear();
      mock.send.mockClear();
      await event("مبتدئ", group, sender, quote(receipt.provider_message_id));
      expect((await run()).status).toBe("completed");
      expect(mock.understand).not.toHaveBeenCalled();
      expect(mock.send).not.toHaveBeenCalled();
    });
    it("prevents duplicate provider receipts in storage and keeps the original quote resolvable", async () => {
      const { receipt } = await sentTurn();
      await expect(
        q(
          "INSERT INTO whatsapp_message_deliveries (merchant_id,instance_id,provider,idempotency_key,direction,status,provider_message_id,request_json) SELECT merchant_id,instance_id,provider,CONCAT(idempotency_key,':duplicate'),'outgoing','sent',provider_message_id,request_json FROM whatsapp_message_deliveries WHERE id=?",
          [receipt.id]
        )
      ).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
      mock.understand.mockClear();
      await event("مبتدئ", group, sender, quote(receipt.provider_message_id));
      expect((await run()).status).toBe("completed");
      expect(mock.understand).toHaveBeenCalledOnce();
    });
    it("rejects a provider-id collision between a participant and an assistant quote", async () => {
      const { source, receipt } = await sentTurn();
      await q(
        "UPDATE whatsapp_message_deliveries SET provider_message_id=? WHERE id=?",
        [source.payload.idMessage, receipt.id]
      );
      mock.understand.mockClear();
      await event("مبتدئ", group, sender, quote(source.payload.idMessage));
      await run();
      expect(mock.understand).not.toHaveBeenCalled();
    });
    it("does not resolve an assistant quote from a different group", async () => {
      const { receipt } = await sentTurn();
      mock.understand.mockClear();
      await event(
        "مبتدئ",
        "120363000000099@g.us",
        sender,
        quote(receipt.provider_message_id)
      );
      await run();
      expect(mock.understand).not.toHaveBeenCalled();
    });
    it("invalidates an answer when a historical receipt changes during AI even if its text is unchanged", async () => {
      const { receipt } = await sentTurn(),
        original = mock.understand.getMockImplementation()!;
      mock.understand.mockImplementation(async (m, i) => {
        const d = await original(m, i);
        await q(
          "UPDATE whatsapp_message_deliveries SET provider_message_id=? WHERE id=?",
          [randomUUID(), receipt.id]
        );
        return d;
      });
      mock.send.mockClear();
      await event("مبتدئ");
      expect((await run()).status).toBe("review");
      expect(mock.send).not.toHaveBeenCalled();
    });
    async function timedHold(kind = "expired") {
      const turn = await sentTurn();
      await q(
        "UPDATE conversations SET human_takeover=1,handoff_version=1,human_takeover_at=TIMESTAMPADD(DAY,-2,UTC_TIMESTAMP()),human_expires_at=TIMESTAMPADD(MINUTE,-1,UTC_TIMESTAMP()),agent_history='{}' WHERE id=?",
        [turn.decision.conversation_id]
      );
      if (kind === "future")
        await q(
          "UPDATE conversations SET human_expires_at=TIMESTAMPADD(DAY,1,UTC_TIMESTAMP()) WHERE id=?",
          [turn.decision.conversation_id]
        );
      if (kind === "manual")
        await q("UPDATE conversations SET human_expires_at=NULL WHERE id=?", [
          turn.decision.conversation_id,
        ]);
      if (kind === "permanent")
        await q("UPDATE conversations SET agent_history=? WHERE id=?", [
          JSON.stringify({ permanentSilence: true }),
          turn.decision.conversation_id,
        ]);
      if (kind === "malformed")
        await q(
          "UPDATE conversations SET agent_history='invalid-json' WHERE id=?",
          [turn.decision.conversation_id]
        );
      mock.understand.mockClear();
      mock.send.mockClear();
      return turn;
    }
    it("resumes an expired explicit timed hold before AI and anchors the new message after the cutoff", async () => {
      const { decision } = await timedHold();
      await event("أكمل شرح الدورة");
      expect((await run()).status).toBe("completed");
      const [conversation] = await q("SELECT * FROM conversations WHERE id=?", [
        decision.conversation_id,
      ]);
      expect(conversation.human_takeover).toBe(0);
      expect(conversation.handoff_version).toBe(2);
      const [latest] = await q(
        "SELECT incoming_message_id FROM ai_group_understanding WHERE merchant_id=? ORDER BY id DESC LIMIT 1",
        [f.merchantId]
      );
      expect(latest.incoming_message_id).toBeGreaterThan(
        conversation.automation_after_message_id
      );
      expect(mock.understand).toHaveBeenCalledOnce();
      expect(mock.send).toHaveBeenCalledOnce();
      await event("ومدة الدورة؟");
      await run();
      expect(
        (
          await q("SELECT handoff_version FROM conversations WHERE id=?", [
            conversation.id,
          ])
        )[0].handoff_version
      ).toBe(2);
    });
    it.each(["future", "manual", "permanent", "malformed"])(
      "preserves a %s human hold without AI or a group reply",
      async kind => {
        const { decision } = await timedHold(kind);
        await event();
        expect((await run()).status).toBe("completed");
        expect(mock.understand).not.toHaveBeenCalled();
        expect(mock.send).not.toHaveBeenCalled();
        expect(
          (
            await q(
              "SELECT human_takeover,handoff_version FROM conversations WHERE id=?",
              [decision.conversation_id]
            )
          )[0]
        ).toMatchObject({ human_takeover: 1, handoff_version: 1 });
      }
    );
    it("rechecks a hold extended after the first read inside the expiry transaction", async () => {
      const { decision } = await timedHold();
      await event();
      const job = (await claimInbound(f.merchantId))!;
      let checked = false;
      await executeInbound(job, async () => {
        expect(
          (await checkoutTransaction(c => readGroupContext(c))).timedExpired
        ).toBe(true);
        await q(
          "UPDATE conversations SET human_expires_at=TIMESTAMPADD(DAY,1,UTC_TIMESTAMP()) WHERE id=?",
          [decision.conversation_id]
        );
        expect(await resumeExpiredGroupOwnership()).toBe(false);
        checked = true;
        return { success: true };
      });
      expect(checked).toBe(true);
      expect(
        (
          await q(
            "SELECT human_takeover,handoff_version FROM conversations WHERE id=?",
            [decision.conversation_id]
          )
        )[0]
      ).toMatchObject({ human_takeover: 1, handoff_version: 1 });
    });
    it.each(["receipt", "message"])(
      "locks the historical %s proof until the final context transaction finishes",
      async kind => {
        const { receipt, decision } = await sentTurn();
        await event("مبتدئ");
        const job = (await claimInbound(f.merchantId))!;
        const other = await (await getPool())!.getConnection();
        let checked = false;
        const [[prior]] = await other.query<any[]>(
          "SELECT @@SESSION.innodb_lock_wait_timeout AS value"
        );
        const sql =
          kind === "receipt"
            ? "UPDATE whatsapp_message_deliveries SET provider_message_id=? WHERE id=?"
            : "UPDATE messages SET content=? WHERE id=?";
        const args = [
          randomUUID(),
          kind === "receipt" ? receipt.id : decision.incoming_message_id,
        ];
        try {
          await other.query("SET SESSION innodb_lock_wait_timeout=1");
          await executeInbound(job, async () => {
            await checkoutTransaction(async c => {
              expect(
                (await readGroupContext(c, true)).input.assistantReplies
              ).toHaveLength(1);
              await expect(other.execute(sql, args)).rejects.toMatchObject({
                code: "ER_LOCK_WAIT_TIMEOUT",
              });
              checked = true;
            });
            await other.execute(sql, args);
            return { success: true };
          });
          expect(checked).toBe(true);
        } finally {
          await other.query("SET SESSION innodb_lock_wait_timeout=?", [
            Number(prior.value),
          ]);
          other.release();
        }
      }
    );
    it("requires an owned inbound event to resume group automation", async () => {
      await expect(resumeExpiredGroupOwnership()).rejects.toThrow(
        "Owned group source"
      );
    });
    it("redacts old terminal group evidence, retains review cases and keeps replay identifiers", async () => {
      const original = mock.understand.getMockImplementation()!;
      mock.understand.mockImplementation(async (m, i) => ({
        ...(await original(m, i)),
        action: "ignore",
        reply: null,
        factKeys: [],
      }));
      const first = await event("old personal evidence");
      await run();
      const review = await event("review evidence");
      await run();
      await q(
        "UPDATE whatsapp_inbound_jobs SET updated_at=TIMESTAMPADD(DAY,-31,UTC_TIMESTAMP()) WHERE merchant_id=?",
        [f.merchantId]
      );
      await q(
        "UPDATE whatsapp_inbound_jobs SET status='review',updated_at=TIMESTAMPADD(DAY,-31,UTC_TIMESTAMP()) WHERE id=?",
        [review.id]
      );
      await purgeCompletedInboundPayloads();
      const rows = await q(
        "SELECT inbound_id,event_key,decision_json FROM ai_group_understanding WHERE merchant_id=? ORDER BY id",
        [f.merchantId]
      );
      expect(rows[0].inbound_id).toBe(first.id);
      expect(rows[0].event_key).toHaveLength(64);
      expect(JSON.stringify(rows[0].decision_json)).not.toContain("personal");
      const d =
        typeof rows[0].decision_json === "string"
          ? JSON.parse(rows[0].decision_json)
          : rows[0].decision_json;
      expect(d).toEqual({ redacted: true });
      expect(JSON.stringify(rows[1].decision_json)).toContain(
        "review evidence"
      );
      expect(await purgeCompletedInboundPayloads()).toBe(0);
    });
  }
);
