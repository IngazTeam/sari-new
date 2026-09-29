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
const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("../channels/whatsapp/providers", () => ({
  getWhatsAppProvider: () => ({ send: mocks.send }),
}));
import { getPool, closeDb } from "../db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import { ensureMerchantDirectiveTestSchema } from "../tests/helpers/merchant-directive-schema";
import { enqueueInbound, assertInboundOwned } from "../messaging/inbound-jobs";
import {
  withInboundExecution,
  type InboundExecution,
} from "../messaging/inbound-context";
import {
  readMerchantDirectiveContext,
  commitMerchantOwnership,
  recheckMerchantDirective,
  findMerchantDirectiveReceipt,
  type MerchantDirectiveContext,
} from "./merchant-directive-store";
import type { DirectiveDecision } from "./merchant-directive-understanding";
import { transitionConversationOwnership } from "./conversation-handoff";
import {
  createSourcedEscalation,
  sendSourcedEscalationAlert,
  relayEscalationReply,
} from "./escalation-relay";

describe.skipIf(!process.env.DATABASE_URL)(
  "merchant directives on synthetic MySQL",
  () => {
    const users: number[] = [],
      author = "966500000032",
      customer = "966500000090";
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      instanceId: number,
      account: string;
    const query = async (s: string, a: unknown[] = []): Promise<any> =>
      (await (await getPool())!.execute(s, a))[0];
    beforeAll(ensureMerchantDirectiveTestSchema);
    beforeEach(async () => {
      owner = await createDisposableMerchant("directive");
      users.push(owner.userId);
      account = randomUUID();
      await query("UPDATE merchants SET phone=? WHERE id=?", [
        author,
        owner.merchantId,
      ]);
      instanceId = (
        await query(
          "INSERT INTO whatsapp_instances (merchant_id,instance_id,token,status,provider,is_primary) VALUES (?,?,'fixture','active','green_api',1)",
          [owner.merchantId, account]
        )
      ).insertId;
      mocks.send.mockReset().mockImplementation(async () => ({
        accepted: true,
        outcome: "accepted",
        status: "sent",
        providerMessageId: randomUUID(),
      }));
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants(users);
      users.length = 0;
    });
    afterAll(closeDb);
    async function conversation(phone = customer) {
      const id = (
        await query(
          "INSERT INTO conversations (merchantId,customerPhone,status,agent_history) VALUES (?,?,'active','{\"custom\":\"keep\"}')",
          [owner.merchantId, phone]
        )
      ).insertId;
      const messageId = (
        await query(
          "INSERT INTO messages (conversationId,direction,messageType,content,sender_type,isProcessed) VALUES (?,'incoming','text','أحتاج موعدًا مسائيًا','customer',0)",
          [id]
        )
      ).insertId;
      return { id, messageId };
    }
    async function inbound(
      text = "أوقف الرد على العميل " + customer,
      quote?: string,
      sender = author
    ) {
      const payload = {
        typeWebhook: "incomingMessageReceived",
        instanceData: { idInstance: account },
        idMessage: randomUUID(),
        timestamp: Math.floor(Date.now() / 1000),
        senderData: { sender: sender + "@c.us", chatId: sender + "@c.us" },
        messageData: quote
          ? {
              typeMessage: "quotedMessage",
              extendedTextMessageData: { text, stanzaId: quote },
              quotedMessage: { stanzaId: quote },
            }
          : {
              typeMessage: "textMessage",
              textMessageData: { textMessage: text },
            },
      };
      const queued = await enqueueInbound({
          payload,
          source: "webhook",
          expectedMerchantId: owner.merchantId,
        }),
        token = randomUUID();
      await query(
        "UPDATE whatsapp_inbound_jobs SET status='running',lease_token=?,lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 10 MINUTE) WHERE id=?",
        [token, queued.id]
      );
      const [r] = await query(
        "SELECT * FROM whatsapp_inbound_jobs WHERE id=?",
        [queued.id]
      );
      const execution: InboundExecution = {
        id: r.id,
        merchantId: owner.merchantId,
        instanceId,
        token,
        eventKey: r.event_key,
        partitionKey: r.partition_key,
        sendOrdinal: 0,
        assertOwned: () => assertInboundOwned({ id: r.id, lease_token: token }),
      };
      const within = <T>(run: () => Promise<T>) =>
        withInboundExecution({ ...execution }, run);
      return {
        text,
        quote,
        execution,
        within,
        read: () =>
          within(() =>
            readMerchantDirectiveContext(owner.merchantId, text, quote)
          ),
      };
    }
    const decision = (
      context: MerchantDirectiveContext,
      intent: DirectiveDecision["intent"] = "pause"
    ): DirectiveDecision => ({
      version: 1,
      basisHash: context.basisHash,
      intent,
      targetId: context.targets[0]?.id || null,
      confidence: 0.99,
      explicit: true,
      ambiguous: false,
      conditional: false,
      reviewed: true,
      scope: "one",
      evidence: context.source.text,
      replyText: intent === "relay" ? context.source.text : null,
      reportPeriod: "none",
      rationale: "fixture",
    });
    const state = async (id: number) =>
      (await query("SELECT * FROM conversations WHERE id=?", [id]))[0];
    const actions = () =>
      query("SELECT * FROM merchant_directive_actions WHERE merchant_id=?", [
        owner.merchantId,
      ]);
    async function alert() {
      const c = await conversation();
      const eid = (await createSourcedEscalation({
        merchantId: owner.merchantId,
        conversationId: c.id,
        customerPhone: customer,
        incomingMessageId: c.messageId,
        question: "هل الموعد متاح؟",
      }))!;
      const result = await sendSourcedEscalationAlert({
        merchantId: owner.merchantId,
        escalationId: eid,
        instanceRecordId: instanceId,
        to: author,
        level: 0,
        text: "تنبيه عميل",
      });
      expect(result.accepted).toBe(true);
      mocks.send.mockClear();
      return { ...c, eid, quote: result.providerMessageId! };
    }
    it("pauses the specified older customer only and persists source, decision and ownership together", async () => {
      const c = await conversation(),
        other = await conversation("966500000099"),
        event = await inbound(),
        context = await event.read();
      const result = await event.within(() =>
        commitMerchantOwnership({ context, decision: decision(context) })
      );
      expect(result).toMatchObject({
        changed: true,
        conversationId: c.id,
        version: 1,
      });
      const row = await state(c.id);
      expect(row.human_takeover).toBe(1);
      expect(JSON.parse(row.agent_history)).toMatchObject({
        custom: "keep",
        permanentSilence: true,
      });
      expect(row.human_expires_at).toBeNull();
      expect((await state(other.id)).human_takeover).toBe(0);
      expect(await actions()).toHaveLength(1);
    });
    it("resumes one reviewed conversation without replaying old customer messages or resuming others", async () => {
      const c = await conversation(),
        other = await conversation("966500000099");
      for (const item of [c, other])
        await transitionConversationOwnership(
          item.id,
          { humanTakeover: 1, agentHistory: '{"permanentSilence":true}' },
          { merchantId: owner.merchantId, expectedVersion: 0 }
        );
      const event = await inbound(
          "راجعت المحادثة، استأنف الرد للعميل " + customer
        ),
        context = await event.read();
      await event.within(() =>
        commitMerchantOwnership({
          context,
          decision: decision(context, "resume"),
        })
      );
      const row = await state(c.id);
      expect(row.human_takeover).toBe(0);
      expect(JSON.parse(row.agent_history)).toEqual({ custom: "keep" });
      expect(row.automation_after_message_id).toBe(c.messageId);
      expect(
        (
          await query("SELECT isProcessed FROM messages WHERE id=?", [
            c.messageId,
          ])
        )[0].isProcessed
      ).toBe(1);
      expect((await state(other.id)).human_takeover).toBe(1);
    });
    it("serializes six writes of one event and preserves a subsequent manual resume on replay", async () => {
      const c = await conversation(),
        event = await inbound(),
        context = await event.read(),
        proof = { context, decision: decision(context) };
      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          event.within(() => commitMerchantOwnership(proof))
        )
      );
      expect(results.filter(r => !r.replayed)).toHaveLength(1);
      expect((await state(c.id)).handoff_version).toBe(1);
      expect(await actions()).toHaveLength(1);
      await transitionConversationOwnership(
        c.id,
        { humanTakeover: 0 },
        { merchantId: owner.merchantId, expectedVersion: 1 }
      );
      expect(
        await event.within(() => commitMerchantOwnership(proof))
      ).toMatchObject({ replayed: true });
      expect((await state(c.id)).human_takeover).toBe(0);
      expect(
        await event.within(() => findMerchantDirectiveReceipt(context.source))
      ).toMatchObject({ intent: "pause" });
    });
    it.each([
      "lease",
      "authority",
      "account",
      "provider",
      "owner",
      "suspended",
      "closed",
      "phone",
      "history",
      "append",
      "cutoff",
      "version",
      "forged_context",
    ] as const)("rechecks %s after inference before mutation", async change => {
      const c = await conversation(),
        event = await inbound(),
        context = await event.read();
      if (change === "lease")
        await query(
          "UPDATE whatsapp_inbound_jobs SET lease_token=? WHERE id=?",
          [randomUUID(), event.execution.id]
        );
      if (change === "authority")
        await query("UPDATE merchants SET phone=NULL WHERE id=?", [
          owner.merchantId,
        ]);
      if (change === "account")
        await query("UPDATE whatsapp_instances SET instance_id=? WHERE id=?", [
          randomUUID(),
          instanceId,
        ]);
      if (change === "provider")
        await query(
          "UPDATE whatsapp_instances SET provider='meta_cloud' WHERE id=?",
          [instanceId]
        );
      if (change === "owner")
        await query(
          "UPDATE users SET account_status='deletion_pending' WHERE id=?",
          [owner.userId]
        );
      if (change === "suspended")
        await query("UPDATE merchants SET status='suspended' WHERE id=?", [
          owner.merchantId,
        ]);
      if (change === "closed")
        await query("UPDATE conversations SET status='closed' WHERE id=?", [
          c.id,
        ]);
      if (change === "phone")
        await query(
          "UPDATE conversations SET customerPhone='966500000099' WHERE id=?",
          [c.id]
        );
      if (change === "history")
        await query("UPDATE messages SET content='تغير السؤال' WHERE id=?", [
          c.messageId,
        ]);
      if (change === "append")
        await query(
          "INSERT INTO messages (conversationId,direction,messageType,content) VALUES (?,'incoming','text','سؤال جديد')",
          [c.id]
        );
      if (change === "cutoff")
        await query(
          "INSERT INTO customer_profiles (merchant_id,customer_phone,memory_forget_before_message_id) VALUES (?,?,?)",
          [owner.merchantId, customer, c.messageId]
        );
      if (change === "version")
        await query(
          "UPDATE conversations SET handoff_version=handoff_version+1 WHERE id=?",
          [c.id]
        );
      if (change === "forged_context")
        context.targets[0].messages[0].content = "invented";
      await expect(
        event.within(() =>
          commitMerchantOwnership({ context, decision: decision(context) })
        )
      ).rejects.toThrow();
      expect((await state(c.id)).human_takeover).toBe(0);
      expect(await actions()).toHaveLength(0);
    });
    it("rolls back ownership, session invalidation and followups when recording the action fails", async () => {
      const c = await conversation(),
        event = await inbound(),
        context = await event.read(),
        pool = (await getPool())!,
        get = pool.getConnection.bind(pool);
      await query(
        "INSERT INTO sales_followups (merchant_id,conversation_id,customer_phone,follow_up_type,scheduled_at,message_text) VALUES (?,?,?,'ghost',UTC_TIMESTAMP(),'fixture')",
        [owner.merchantId, c.id, customer]
      );
      vi.spyOn(pool, "getConnection").mockImplementationOnce(async () => {
        const connection = await get(),
          execute = connection.execute.bind(connection);
        vi.spyOn(connection, "execute").mockImplementation(((
          sql: any,
          ...args: any[]
        ) => {
          if (String(sql).startsWith("INSERT INTO merchant_directive_actions"))
            throw Error("fixture action failure");
          return (execute as any)(sql, ...args);
        }) as any);
        return connection;
      });
      await expect(
        event.within(() =>
          commitMerchantOwnership({ context, decision: decision(context) })
        )
      ).rejects.toThrow("fixture action failure");
      expect((await state(c.id)).handoff_version).toBe(0);
      expect(await actions()).toHaveLength(0);
      expect(
        (
          await query(
            "SELECT cancelled_at FROM sales_followups WHERE conversation_id=?",
            [c.id]
          )
        )[0].cancelled_at
      ).toBeNull();
    });
    it("cannot select the newest conversation for an unqualified message", async () => {
      await conversation();
      const event = await inbound("لا ترد"),
        context = await event.read();
      expect(context.targets).toEqual([]);
      await expect(
        event.within(() =>
          commitMerchantOwnership({ context, decision: decision(context) })
        )
      ).rejects.toThrow();
    });
    it("rejects a foreign sender and a foreign merchant despite supplied IDs", async () => {
      await conversation();
      const event = await inbound(undefined, undefined, "966500000099");
      await expect(event.read()).rejects.toThrow();
      const own = await inbound(),
        other = await createDisposableMerchant("directive-other");
      users.push(other.userId);
      await expect(
        own.within(() =>
          readMerchantDirectiveContext(other.merchantId, own.text)
        )
      ).rejects.toThrow();
    });
    it("rejects ambiguous duplicate conversations with the same number", async () => {
      await conversation();
      await conversation();
      const e = await inbound(),
        context = await e.read();
      expect(context.targets).toHaveLength(2);
      await expect(
        e.within(() =>
          commitMerchantOwnership({ context, decision: decision(context) })
        )
      ).rejects.toThrow("Ambiguous");
    });
    it("uses a delivered alert to identify an older customer without forwarding the pause instruction", async () => {
      const a = await alert();
      await conversation("966500000099");
      const e = await inbound("أوقف رد ساري على صاحب هذا التنبيه", a.quote),
        context = await e.read();
      expect(context.targets[0]).toMatchObject({ id: a.id, quoted: true });
      await e.within(() =>
        commitMerchantOwnership({ context, decision: decision(context) })
      );
      expect(mocks.send).not.toHaveBeenCalled();
      expect((await state(a.id)).human_takeover).toBe(1);
    });
    it.each([
      "recipient",
      "receipt",
      "source",
      "text",
      "provider",
      "guard_version",
    ] as const)("refuses a changed quoted alert %s", async change => {
      const a = await alert(),
        e = await inbound("أوقف رد ساري على صاحب هذا التنبيه", a.quote),
        context = await e.read();
      if (change === "recipient")
        await query(
          "UPDATE whatsapp_message_deliveries SET request_json=JSON_SET(request_json,'$.to','966500000099') WHERE merchant_id=?",
          [owner.merchantId]
        );
      if (change === "receipt")
        await query(
          "UPDATE whatsapp_message_deliveries SET status='failed' WHERE merchant_id=?",
          [owner.merchantId]
        );
      if (change === "source")
        await query("UPDATE messages SET content='changed' WHERE id=?", [
          a.messageId,
        ]);
      if (change === "text")
        await query(
          "UPDATE whatsapp_message_deliveries SET request_json=JSON_SET(request_json,'$.text','changed') WHERE merchant_id=?",
          [owner.merchantId]
        );
      if (change === "provider")
        await query(
          "UPDATE whatsapp_message_deliveries SET provider='meta_cloud' WHERE merchant_id=?",
          [owner.merchantId]
        );
      if (change === "guard_version")
        await query(
          "UPDATE whatsapp_message_deliveries SET request_json=JSON_SET(request_json,'$.escalationGuard.version',22) WHERE merchant_id=?",
          [owner.merchantId]
        );
      await expect(
        e.within(() =>
          commitMerchantOwnership({ context, decision: decision(context) })
        )
      ).rejects.toThrow();
      expect((await state(a.id)).human_takeover).toBe(0);
    });
    it("records a semantic relay decision atomically with native relay ownership and sends original text once", async () => {
      const a = await alert(),
        e = await inbound("الموعد متاح الخميس بشرط اكتمال التسجيل", a.quote),
        context = await e.read(),
        proof = { context, decision: decision(context, "relay") };
      const result = await e.within(() =>
        relayEscalationReply({
          merchantId: owner.merchantId,
          instanceRecordId: instanceId,
          merchantPhone: author,
          quotedMessageId: a.quote,
          replyText: e.text,
          directive: proof,
        })
      );
      expect(result.accepted).toBe(true);
      expect(mocks.send).toHaveBeenCalledOnce();
      expect(mocks.send.mock.calls[0][1].text).toBe(e.text);
      expect(await actions()).toHaveLength(1);
      expect(
        await e.within(() => findMerchantDirectiveReceipt(context.source))
      ).toMatchObject({ intent: "relay" });
    });
    it("blocks a relay if source authority is revoked after AI, with no ownership change or send", async () => {
      const a = await alert(),
        e = await inbound("الموعد الخميس", a.quote),
        context = await e.read();
      await query(
        "UPDATE users SET account_status='deletion_pending' WHERE id=?",
        [owner.userId]
      );
      await expect(
        e.within(() =>
          relayEscalationReply({
            merchantId: owner.merchantId,
            instanceRecordId: instanceId,
            merchantPhone: author,
            quotedMessageId: a.quote,
            replyText: e.text,
            directive: { context, decision: decision(context, "relay") },
          })
        )
      ).rejects.toThrow();
      expect(mocks.send).not.toHaveBeenCalled();
      expect((await state(a.id)).human_takeover).toBe(0);
      expect(await actions()).toHaveLength(0);
    });
  }
);
