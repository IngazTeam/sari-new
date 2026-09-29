import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getPool, closeDb } from "../db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import { applyWhatsAppOwnershipCommand as apply } from "./whatsapp-ownership-command";
import { transitionConversationOwnership as transition } from "./conversation-handoff";

describe.skipIf(!process.env.DATABASE_URL)(
  "explicit WhatsApp ownership controls on MySQL",
  () => {
    let fixture: Awaited<ReturnType<typeof createDisposableMerchant>>,
      conversationId: number,
      instanceId: number;
    const phone = "966500000086";
    const query = async (sql: string, params: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, params))[0];
    const state = async () =>
      (
        await query("SELECT * FROM conversations WHERE id=?", [conversationId])
      )[0];
    const input = (text = "#stop", suffix = text) => ({
      merchantId: fixture.merchantId,
      instanceRecordId: instanceId,
      customerPhone: phone,
      messageId: `command-${fixture.merchantId}-${suffix}`,
      text,
    });
    const receipts = async () =>
      await query("SELECT * FROM messages WHERE conversationId=? ORDER BY id", [
        conversationId,
      ]);
    beforeEach(async () => {
      fixture = await createDisposableMerchant("ownership-command");
      conversationId = Number(
        (
          await query(
            "INSERT INTO conversations (merchantId,customerPhone,status) VALUES (?,?,'active')",
            [fixture.merchantId, phone]
          )
        ).insertId
      );
      instanceId = Number(
        (
          await query(
            "INSERT INTO whatsapp_instances (merchant_id,instance_id,token,status) VALUES (?,?,'fixture','active')",
            [fixture.merchantId, `command-${fixture.merchantId}`]
          )
        ).insertId
      );
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants([fixture.userId]);
    });
    afterAll(closeDb);

    it("records both controls with their author and changes ownership through the common boundary", async () => {
      expect(await apply(input())).toMatchObject({
        changed: true,
        duplicate: false,
        action: "takeover",
        version: 1,
      });
      expect((await state()).human_takeover).toBe(1);
      expect(await apply(input("#start"))).toMatchObject({
        changed: true,
        action: "resume",
        version: 2,
      });
      const row = await state(),
        recorded = await receipts();
      expect(row.human_takeover).toBe(0);
      expect(row.automation_after_message_id).toBe(recorded[1].id);
      expect(
        recorded.map((m: any) => [
          m.content,
          m.direction,
          m.sender_type,
          m.isProcessed,
        ])
      ).toEqual([
        ["#stop", "outgoing", "merchant", 1],
        ["#start", "outgoing", "merchant", 1],
      ]);
    });
    it("does not replay a delayed start receipt over a newer human takeover", async () => {
      await apply(input());
      await apply(input("#start"));
      await transition(
        conversationId,
        { humanTakeover: 1 },
        { merchantId: fixture.merchantId, expectedVersion: 2 }
      );
      expect(await apply(input("#start"))).toMatchObject({
        changed: false,
        duplicate: true,
        version: 3,
      });
      expect((await state()).human_takeover).toBe(1);
      expect(await receipts()).toHaveLength(2);
    });
    it("does not replay a delayed stop receipt over a newer resume", async () => {
      await apply(input());
      await apply(input("#start"));
      expect(await apply(input())).toMatchObject({
        changed: false,
        duplicate: true,
        version: 2,
      });
      expect((await state()).human_takeover).toBe(0);
    });
    it("serializes duplicate deliveries and creates a single transition and receipt", async () => {
      const results = await Promise.all([
        apply(input()),
        apply(input()),
        apply(input()),
      ]);
      expect(results.filter(r => r.changed)).toHaveLength(1);
      expect(results.filter(r => r.duplicate)).toHaveLength(2);
      expect((await state()).handoff_version).toBe(1);
      expect(await receipts()).toHaveLength(1);
    });
    it("does not execute a previously recorded disabled command when settings later enable controls", async () => {
      await query(
        "INSERT INTO messages (conversationId,direction,sender_type,content,externalId) VALUES (?,'outgoing','merchant','#start',?)",
        [conversationId, input("#start").messageId]
      );
      await transition(
        conversationId,
        { humanTakeover: 1 },
        { merchantId: fixture.merchantId }
      );
      expect(await apply(input("#start"))).toMatchObject({
        duplicate: true,
        changed: false,
      });
      expect((await state()).human_takeover).toBe(1);
    });
    it("records a no-op start without claiming a transition or letting its replay resume a later takeover", async () => {
      expect(await apply(input("#start"))).toMatchObject({
        changed: false,
        duplicate: false,
        version: 0,
      });
      await apply(input());
      expect(await apply(input("#start"))).toMatchObject({
        changed: false,
        duplicate: true,
        version: 1,
      });
      expect((await state()).human_takeover).toBe(1);
    });
    it.each(["text", "author", "direction", "case"])(
      "rejects a reused receipt with conflicting %s",
      async field => {
        await apply(input());
        if (field === "text")
          await query(
            "UPDATE messages SET content='#start' WHERE externalId=?",
            [input().messageId]
          );
        if (field === "author")
          await query(
            "UPDATE messages SET sender_type='assistant' WHERE externalId=?",
            [input().messageId]
          );
        if (field === "direction")
          await query(
            "UPDATE messages SET direction='incoming' WHERE externalId=?",
            [input().messageId]
          );
        const request = input();
        if (field === "case")
          request.messageId = request.messageId.toUpperCase();
        await expect(apply(request)).rejects.toThrow("receipt conflict");
        expect((await state()).handoff_version).toBe(1);
        expect(await receipts()).toHaveLength(1);
      }
    );
    it("rejects receipts from another conversation", async () => {
      const other = Number(
        (
          await query(
            "INSERT INTO conversations (merchantId,customerPhone) VALUES (?,'966500000087')",
            [fixture.merchantId]
          )
        ).insertId
      );
      await query(
        "INSERT INTO messages (conversationId,direction,sender_type,content,externalId) VALUES (?,'outgoing','merchant','#stop',?)",
        [other, input().messageId]
      );
      await expect(apply(input())).rejects.toThrow("receipt conflict");
      expect((await state()).handoff_version).toBe(0);
    });
    it.each(["tenant", "instance", "phone"])(
      "rejects an invalid ownership binding: %s",
      async field => {
        const request = input();
        if (field === "tenant") request.merchantId += 999999;
        if (field === "instance") request.instanceRecordId += 999999;
        if (field === "phone") request.customerPhone = "966500000088";
        await expect(apply(request)).rejects.toThrow("unavailable");
        expect((await state()).handoff_version).toBe(0);
        expect(await receipts()).toHaveLength(0);
      }
    );
    it.each(["instance", "receipt"])(
      "rejects a real foreign tenant %s even when the phone and command match",
      async field => {
        const other = await createDisposableMerchant("foreign-ownership");
        try {
          const otherConversation = Number(
            (
              await query(
                "INSERT INTO conversations (merchantId,customerPhone) VALUES (?,?)",
                [other.merchantId, phone]
              )
            ).insertId
          );
          const otherInstance = Number(
            (
              await query(
                "INSERT INTO whatsapp_instances (merchant_id,instance_id,token,status) VALUES (?,?,'fixture','active')",
                [other.merchantId, `foreign-command-${other.merchantId}`]
              )
            ).insertId
          );
          if (field === "receipt")
            await query(
              "INSERT INTO messages (conversationId,direction,sender_type,content,externalId) VALUES (?,'outgoing','merchant','#stop',?)",
              [otherConversation, input().messageId]
            );
          const request = input();
          if (field === "instance") request.instanceRecordId = otherInstance;
          await expect(apply(request)).rejects.toThrow(
            field === "instance" ? "instance unavailable" : "receipt conflict"
          );
          expect((await state()).handoff_version).toBe(0);
          expect(await receipts()).toHaveLength(0);
          expect(
            (
              await query(
                "SELECT handoff_version FROM conversations WHERE id=?",
                [otherConversation]
              )
            )[0].handoff_version
          ).toBe(0);
        } finally {
          await cleanupDisposableMerchants([other.userId]);
        }
      }
    );
    it.each(["", "two words", "<invalid>"])(
      "rejects an invalid source receipt %j before writing",
      async messageId => {
        await expect(apply({ ...input(), messageId })).rejects.toThrow();
        expect(await receipts()).toHaveLength(0);
      }
    );
    it("rolls back the receipt together with ownership if session invalidation fails", async () => {
      const pool = (await getPool())!,
        connection = await pool.getConnection(),
        original = connection.execute.bind(connection);
      vi.spyOn(pool, "getConnection").mockResolvedValueOnce(connection);
      vi.spyOn(connection, "execute").mockImplementation(((
        sql: string,
        args: any[]
      ) => {
        if (sql.includes("INSERT INTO session_contexts"))
          throw Error("fixture session failure");
        return original(sql, args);
      }) as any);
      await expect(apply(input())).rejects.toThrow("session failure");
      vi.restoreAllMocks();
      expect((await state()).handoff_version).toBe(0);
      expect(await receipts()).toHaveLength(0);
      expect(await apply(input())).toMatchObject({
        changed: true,
        duplicate: false,
      });
    });
    it("preserves explicit permanent silence on stop and releases it only on an explicit start", async () => {
      await transition(
        conversationId,
        {
          humanTakeover: 1,
          agentHistory: JSON.stringify({
            permanentSilence: true,
            custom: "keep",
          }),
        },
        { merchantId: fixture.merchantId }
      );
      await apply(input());
      expect(JSON.parse((await state()).agent_history).permanentSilence).toBe(
        true
      );
      await apply(input("#start"));
      expect(JSON.parse((await state()).agent_history)).toEqual({
        custom: "keep",
      });
    });
  }
);
