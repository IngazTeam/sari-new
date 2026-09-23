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
const mock = vi.hoisted(() => ({ send: vi.fn(), instance: vi.fn() }));
vi.mock("../channels/whatsapp/providers", () => ({
  getWhatsAppProvider: () => ({ send: mock.send }),
}));
vi.mock("../db", async original => ({
  ...(await original<typeof import("../db")>()),
  getWhatsAppInstanceById: mock.instance,
}));
import { getPool, closeDb } from "../db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "../tests/helpers/disposable-merchant";
import {
  reserveSalesOfferShare,
  beginSalesOfferDispatch,
  finishSalesOfferDispatch,
  type SalesOfferIdentity,
} from "./sales-offer-authority";
import { selectSalesDiscounts } from "./sales-offer-evidence";
import { dispatchSalesOffer, salesOfferKey } from "./sales-offer-delivery";
import {
  reconcileSalesOffer,
  runSalesOfferReconciliationBatch,
} from "./sales-offer-reconciliation";
import {
  sendMerchantWhatsApp,
  updateWhatsAppDeliveryStatus,
} from "../channels/whatsapp/service";
import { executeAction } from "./action-selector";
import {
  withInboundExecution,
  type InboundExecution,
} from "../messaging/inbound-context";

describe.skipIf(!process.env.DATABASE_URL)(
  "sales offer receipt authority on MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      input: SalesOfferIdentity;
    let instanceId: number, couponId: number, account: any;
    const phone = "966550222333";
    const query = async (sql: string, values: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, values))[0];
    const share = async () => {
      const rows = await query(
        "SELECT *,customer_phone AS customerPhone FROM discount_codes WHERE id=?",
        [couponId]
      );
      return (await reserveSalesOfferShare(
        input,
        selectSalesDiscounts(rows, {
          merchantId: owner.merchantId,
          customerPhone: phone,
        })[0]
      ))!;
    };
    const state = async (id: string) =>
      (await query("SELECT * FROM sales_offer_attempts WHERE id=?", [id]))[0];
    const delivery = async (id: string) =>
      (
        await query(
          "SELECT * FROM whatsapp_message_deliveries WHERE merchant_id=? AND idempotency_key=?",
          [owner.merchantId, salesOfferKey(owner.merchantId, id)]
        )
      )[0];
    const transport = (s: Awaited<ReturnType<typeof share>>) => ({
      merchantId: owner.merchantId,
      instanceRecordId: instanceId,
      idempotencyKey: salesOfferKey(owner.merchantId, s.id),
      to: s.phone,
      kind: "text" as const,
      text: s.text,
      salesOfferGuard: {
        attemptId: s.id,
        conversationId: input.conversationId,
        sourceMessageId: input.incomingMessageId,
      },
    });
    const accepted = async () => {
      const s = await share();
      await dispatchSalesOffer(input, s, instanceId);
      return s;
    };
    beforeEach(async () => {
      owner = await createDisposableMerchant("offer-receipt");
      other = await createDisposableMerchant("offer-foreign");
      const conv = await query(
        "INSERT INTO conversations (merchantId,customerPhone) VALUES (?,?)",
        [owner.merchantId, phone]
      );
      const source = await query(
        "INSERT INTO messages (conversationId,direction,content) VALUES (?,'incoming','هل يوجد خصم؟')",
        [conv.insertId]
      );
      input = {
        merchantId: owner.merchantId,
        conversationId: Number(conv.insertId),
        incomingMessageId: Number(source.insertId),
        customerPhone: phone,
      };
      instanceId = Number(
        (
          await query(
            "INSERT INTO whatsapp_instances (merchant_id,instance_id,token,status,is_primary) VALUES (?,?,'fixture','active',1)",
            [owner.merchantId, `offer-${owner.merchantId}`]
          )
        ).insertId
      );
      couponId = Number(
        (
          await query(
            "INSERT INTO discount_codes (merchantId,code,type,value,maxUses,customer_phone) VALUES (?,'OWN10','percentage',10,1,?)",
            [owner.merchantId, phone]
          )
        ).insertId
      );
      account = {
        id: instanceId,
        merchantId: owner.merchantId,
        instanceId: `offer-${owner.merchantId}`,
        provider: "green_api",
        token: "fixture",
        status: "active",
      };
      mock.instance.mockReset().mockResolvedValue(account);
      mock.send
        .mockReset()
        .mockImplementation(async () => ({
          accepted: true,
          outcome: "accepted",
          status: "sent",
          providerMessageId: `receipt-${randomUUID()}`,
        }));
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants([owner.userId, other.userId]);
    });
    afterAll(closeDb);

    it("uses the persisted account and exact offer through the channel, then projects one assistant message", async () => {
      const callback = vi.fn();
      await executeAction({
        ...input,
        instanceRecordId: instanceId,
        customerMessage: "هل يوجد خصم؟",
        action: { type: "offer_discount", reason: "fixture" },
        sendMessage: callback,
      });
      expect(callback).not.toHaveBeenCalled();
      expect(mock.send).toHaveBeenCalledTimes(1);
      const [r] = await query(
        "SELECT * FROM sales_offer_attempts WHERE merchant_id=? AND kind='share'",
        [owner.merchantId]
      );
      expect(r).toMatchObject({
        state: "accepted",
        instance_id: instanceId,
        provider: "green_api",
        provider_account: account.instanceId,
      });
      expect((await delivery(r.id)).provider_message_id).toBe(
        r.provider_message_id
      );
      const [message] = await query(
        "SELECT * FROM messages WHERE conversationId=? AND direction='outgoing'",
        [input.conversationId]
      );
      expect(message).toMatchObject({
        content: r.dispatch_text,
        externalId: r.provider_message_id,
        sender_type: "assistant",
        aiResponse: r.dispatch_text,
      });
      expect(
        (
          await query("SELECT usedCount FROM discount_codes WHERE id=?", [
            couponId,
          ])
        )[0].usedCount
      ).toBe(0);
    });
    it("does not accept a legacy void callback or caller-supplied completion without a channel receipt", async () => {
      const s = await share();
      await beginSalesOfferDispatch(input, s, instanceId);
      await expect(
        finishSalesOfferDispatch(input, s.id, "accepted")
      ).rejects.toThrow("requires review");
      expect((await state(s.id)).state).toBe("dispatching");
      expect(mock.send).not.toHaveBeenCalled();
    });
    it("reconciles receipt-first worker loss after reconnect without a second send", async () => {
      const s = await share();
      await beginSalesOfferDispatch(input, s, instanceId);
      await sendMerchantWhatsApp(transport(s));
      expect((await state(s.id)).state).toBe("dispatching");
      await closeDb();
      await Promise.all(
        Array.from({ length: 5 }, () => reconcileSalesOffer(input, s.id))
      );
      expect((await state(s.id)).state).toBe("accepted");
      expect(mock.send).toHaveBeenCalledTimes(1);
      expect(
        await query(
          "SELECT id FROM messages WHERE conversationId=? AND direction='outgoing'",
          [input.conversationId]
        )
      ).toHaveLength(1);
    });
    it("rolls back projection and acceptance together, then repairs the persisted receipt", async () => {
      const s = await share(),
        pool = (await getPool())!,
        original = pool.getConnection.bind(pool);
      vi.spyOn(pool, "getConnection").mockImplementation(async () => {
        const c = await original(),
          execute = c.execute.bind(c),
          release = c.release.bind(c);
        c.execute = ((sql: any, values: any[]) =>
          String(sql).includes("INSERT INTO messages")
            ? Promise.reject(new Error("projection fault"))
            : (execute as any)(sql, values)) as any;
        c.release = () => {
          c.execute = execute as any;
          c.release = release;
          release();
        };
        return c;
      });
      await expect(dispatchSalesOffer(input, s, instanceId)).rejects.toThrow(
        "projection fault"
      );
      vi.restoreAllMocks();
      expect((await state(s.id)).state).toBe("unknown");
      expect((await delivery(s.id)).status).toBe("sent");
      expect(await reconcileSalesOffer(input, s.id)).toMatchObject({
        accepted: true,
        projected: true,
      });
      expect(mock.send).toHaveBeenCalledTimes(1);
    });
    it.each(["network", "no-receipt", "rejected", "invalid-receipt"])(
      "retains %s outcomes without inventing acceptance or retrying",
      async mode => {
        if (mode === "network")
          mock.send.mockRejectedValue(new Error("network timeout"));
        else
          mock.send.mockResolvedValue({
            accepted: mode !== "rejected",
            outcome: mode === "rejected" ? "rejected" : "accepted",
            status: "sent",
            providerMessageId:
              mode === "invalid-receipt" ? "bad receipt" : undefined,
            errorCode: mode === "rejected" ? "invalid_recipient" : undefined,
          });
        const s = await share();
        await expect(dispatchSalesOffer(input, s, instanceId)).rejects.toThrow(
          "requires review"
        );
        await closeDb();
        expect((await reconcileSalesOffer(input, s.id)).accepted).toBe(false);
        await dispatchSalesOffer(input, s, instanceId);
        expect(mock.send).toHaveBeenCalledTimes(1);
        expect(
          await query(
            "SELECT id FROM messages WHERE conversationId=? AND direction='outgoing'",
            [input.conversationId]
          )
        ).toHaveLength(0);
        expect((await state(s.id)).state).toBe("unknown");
      }
    );
    it.each([
      "text",
      "recipient",
      "group",
      "source",
      "conversation",
      "attempt",
      "kind",
      "direction",
      "provider",
      "account",
      "instance",
      "receipt",
      "missing-guard",
      "missing-delivery",
    ])("rejects forged or mismatched receipt evidence: %s", async attack => {
      const s = await share();
      await beginSalesOfferDispatch(input, s, instanceId);
      await sendMerchantWhatsApp(transport(s));
      const d = await delivery(s.id),
        r =
          typeof d.request_json === "string"
            ? JSON.parse(d.request_json)
            : d.request_json;
      if (attack === "text") r.text += " مزور";
      if (attack === "recipient") r.to = "966500000099";
      if (attack === "group") r.to = phone + "@g.us";
      if (attack === "source") r.salesOfferGuard.sourceMessageId++;
      if (attack === "conversation") r.salesOfferGuard.conversationId++;
      if (attack === "attempt") r.salesOfferGuard.attemptId = randomUUID();
      if (attack === "kind") r.kind = "image";
      if (attack === "missing-guard") delete r.salesOfferGuard;
      await query(
        "UPDATE whatsapp_message_deliveries SET request_json=? WHERE id=?",
        [JSON.stringify(r), d.id]
      );
      if (attack === "direction")
        await query(
          "UPDATE whatsapp_message_deliveries SET direction='incoming' WHERE id=?",
          [d.id]
        );
      if (attack === "provider")
        await query(
          "UPDATE whatsapp_message_deliveries SET provider='meta_cloud' WHERE id=?",
          [d.id]
        );
      if (attack === "account")
        await query(
          "UPDATE whatsapp_instances SET instance_id='different' WHERE id=?",
          [instanceId]
        );
      if (attack === "instance")
        await query(
          "UPDATE whatsapp_message_deliveries SET instance_id=NULL WHERE id=?",
          [d.id]
        );
      if (attack === "receipt")
        await query(
          "UPDATE whatsapp_message_deliveries SET provider_message_id='<invalid>' WHERE id=?",
          [d.id]
        );
      if (attack === "missing-delivery")
        await query("DELETE FROM whatsapp_message_deliveries WHERE id=?", [
          d.id,
        ]);
      expect((await reconcileSalesOffer(input, s.id)).accepted).toBe(false);
      expect(mock.send).toHaveBeenCalledTimes(1);
      expect(
        await query(
          "SELECT id FROM messages WHERE conversationId=? AND direction='outgoing'",
          [input.conversationId]
        )
      ).toHaveLength(0);
    });
    it.each([
      "new-message",
      "takeover",
      "coupon",
      "account-disabled",
      "account-changed",
    ])(
      "rechecks after outbox/account loading before provider transport: %s",
      async change => {
        mock.instance.mockImplementationOnce(async () => {
          if (change === "new-message")
            await query(
              "INSERT INTO messages (conversationId,direction,content) VALUES (?,'incoming','لا أريد')",
              [input.conversationId]
            );
          if (change === "takeover")
            await query(
              "UPDATE conversations SET human_takeover=1 WHERE id=?",
              [input.conversationId]
            );
          if (change === "coupon")
            await query("UPDATE discount_codes SET value=99 WHERE id=?", [
              couponId,
            ]);
          if (change === "account-disabled")
            await query(
              "UPDATE whatsapp_instances SET status='inactive',is_primary=0 WHERE id=?",
              [instanceId]
            );
          if (change === "account-changed")
            await query(
              "UPDATE whatsapp_instances SET instance_id='changed' WHERE id=?",
              [instanceId]
            );
          return account;
        });
        const s = await share();
        await expect(dispatchSalesOffer(input, s, instanceId)).rejects.toThrow(
          "requires review"
        );
        expect(mock.send).not.toHaveBeenCalled();
        expect((await delivery(s.id)).error_code).toBe(
          "sales_offer_suppressed"
        );
      }
    );
    it.each(["missing", "foreign", "non-primary"])(
      "does not choose an unavailable account: %s",
      async mode => {
        const s = await share();
        if (mode === "missing")
          await query(
            "UPDATE whatsapp_instances SET status='inactive',is_primary=0 WHERE id=?",
            [instanceId]
          );
        if (mode === "non-primary")
          await query("UPDATE whatsapp_instances SET is_primary=0 WHERE id=?", [
            instanceId,
          ]);
        await expect(
          dispatchSalesOffer(
            input,
            s,
            mode === "foreign" ? instanceId + 999999 : undefined
          )
        ).rejects.toThrow("account unavailable");
        expect(mock.send).not.toHaveBeenCalled();
        expect((await state(s.id)).state).toBe("cancelled");
      }
    );
    it("blocks reserved transport keys without a guard and forbids retryFailed for an offer", async () => {
      const s = await share();
      await beginSalesOfferDispatch(input, s, instanceId);
      expect(
        (
          await sendMerchantWhatsApp({
            ...transport(s),
            salesOfferGuard: undefined,
          })
        ).accepted
      ).toBe(false);
      expect(
        (await sendMerchantWhatsApp({ ...transport(s), retryFailed: true }))
          .accepted
      ).toBe(false);
      expect(mock.send).not.toHaveBeenCalled();
    });
    it.each(["tenant", "source", "conversation", "phone"])(
      "rejects a reconciliation identity with another %s",
      async attack => {
        const s = await accepted(),
          changed = { ...input };
        if (attack === "tenant") changed.merchantId = other.merchantId;
        if (attack === "source") changed.incomingMessageId++;
        if (attack === "conversation") changed.conversationId++;
        if (attack === "phone") changed.customerPhone = "966500000099";
        await expect(reconcileSalesOffer(changed, s.id)).rejects.toThrow(
          "requires review"
        );
        expect(mock.send).toHaveBeenCalledTimes(1);
      }
    );
    it("repairs historical acceptance even after coupon expiry, newer incoming messages and takeover", async () => {
      const s = await share();
      await beginSalesOfferDispatch(input, s, instanceId);
      await sendMerchantWhatsApp(transport(s));
      await query("DELETE FROM discount_codes WHERE id=?", [couponId]);
      await query("UPDATE conversations SET human_takeover=1 WHERE id=?", [
        input.conversationId,
      ]);
      await query(
        "INSERT INTO messages (conversationId,direction,content) VALUES (?,'incoming','انتهينا')",
        [input.conversationId]
      );
      expect(await reconcileSalesOffer(input, s.id)).toMatchObject({
        accepted: true,
        projected: true,
      });
      expect(mock.send).toHaveBeenCalledTimes(1);
    });
    it.each(["deleted", "reassigned"])(
      "keeps historical receipt without projecting into a %s conversation",
      async change => {
        const s = await share();
        await beginSalesOfferDispatch(input, s, instanceId);
        await sendMerchantWhatsApp(transport(s));
        if (change === "deleted")
          await query("DELETE FROM conversations WHERE id=?", [
            input.conversationId,
          ]);
        else
          await query(
            "UPDATE conversations SET customerPhone='966500000099' WHERE id=?",
            [input.conversationId]
          );
        expect(await reconcileSalesOffer(input, s.id)).toMatchObject({
          accepted: true,
          projected: false,
        });
        expect((await state(s.id)).last_reconcile_error).toBe(
          "conversation_unavailable"
        );
        expect(
          await query(
            "SELECT id FROM messages WHERE conversationId=? AND direction='outgoing'",
            [input.conversationId]
          )
        ).toHaveLength(0);
      }
    );
    it("never overwrites a conflicting receipt projection", async () => {
      const s = await share();
      await beginSalesOfferDispatch(input, s, instanceId);
      await sendMerchantWhatsApp(transport(s));
      const d = await delivery(s.id);
      await query(
        "INSERT INTO messages (conversationId,direction,content,externalId) VALUES (?,'incoming','conflict',?)",
        [input.conversationId, d.provider_message_id]
      );
      await expect(reconcileSalesOffer(input, s.id)).rejects.toThrow(
        "projection conflict"
      );
      expect((await state(s.id)).state).toBe("dispatching");
    });
    it("separates provider acceptance from a later failure or delivered/read callback with scoped account identity", async () => {
      const s = await accepted(),
        r = await state(s.id);
      expect(
        await updateWhatsAppDeliveryStatus({
          provider: "green_api",
          providerAccount: "foreign",
          providerMessageId: r.provider_message_id,
          status: "read",
        })
      ).toBe("not_found");
      await updateWhatsAppDeliveryStatus({
        provider: "green_api",
        providerAccount: account.instanceId,
        providerMessageId: r.provider_message_id,
        status: "failed",
      });
      expect(await reconcileSalesOffer(input, s.id)).toMatchObject({
        accepted: true,
        deliveryState: "failed",
      });
      expect(mock.send).toHaveBeenCalledTimes(1);
    });
    it("claims due receipts once across workers and repairs them without provider calls", async () => {
      const s = await share();
      await beginSalesOfferDispatch(input, s, instanceId);
      await sendMerchantWhatsApp(transport(s));
      await query(
        "UPDATE sales_offer_attempts SET next_reconcile_at=TIMESTAMPADD(MINUTE,-1,UTC_TIMESTAMP(3)) WHERE id=?",
        [s.id]
      );
      const results = await Promise.all([
        runSalesOfferReconciliationBatch(),
        runSalesOfferReconciliationBatch(),
      ]);
      expect(results.reduce((a, b) => a + b, 0)).toBe(1);
      expect((await state(s.id)).state).toBe("accepted");
      expect((await state(s.id)).next_reconcile_at).toBeNull();
      expect(mock.send).toHaveBeenCalledTimes(1);
    });
    it.each(["delivered", "read"] as const)(
      "uses a scoped %s callback as stronger delivery evidence",
      async status => {
        const s = await share();
        await beginSalesOfferDispatch(input, s, instanceId);
        await sendMerchantWhatsApp(transport(s));
        const d = await delivery(s.id);
        await updateWhatsAppDeliveryStatus({
          provider: "green_api",
          providerAccount: account.instanceId,
          providerMessageId: d.provider_message_id,
          status,
        });
        expect(await reconcileSalesOffer(input, s.id)).toMatchObject({
          accepted: true,
          projected: true,
          deliveryState: status,
        });
        expect(mock.send).toHaveBeenCalledTimes(1);
      }
    );
    it("defers a worker projection conflict for review and keeps the attempt counted", async () => {
      const s = await share();
      await beginSalesOfferDispatch(input, s, instanceId);
      await sendMerchantWhatsApp(transport(s));
      const d = await delivery(s.id);
      await query(
        "INSERT INTO messages (conversationId,direction,content,externalId) VALUES (?,'incoming','conflict',?)",
        [input.conversationId, d.provider_message_id]
      );
      await query(
        "UPDATE sales_offer_attempts SET next_reconcile_at=TIMESTAMPADD(MINUTE,-1,UTC_TIMESTAMP(3)) WHERE id=?",
        [s.id]
      );
      expect(await runSalesOfferReconciliationBatch()).toBe(1);
      expect(await state(s.id)).toMatchObject({
        state: "dispatching",
        last_reconcile_error: "projection_unavailable",
      });
      expect(await runSalesOfferReconciliationBatch()).toBe(0);
      expect(mock.send).toHaveBeenCalledTimes(1);
    });
    it("rechecks expiry after waiting for the final account lock", async () => {
      await query(
        "UPDATE discount_codes SET expiresAt=TIMESTAMPADD(SECOND,2,UTC_TIMESTAMP()) WHERE id=?",
        [couponId]
      );
      const s = await share();
      await beginSalesOfferDispatch(input, s, instanceId);
      const pool = (await getPool())!,
        original = pool.getConnection.bind(pool);
      vi.spyOn(pool, "getConnection").mockImplementation(async () => {
        const c = await original(),
          execute = c.execute.bind(c),
          release = c.release.bind(c);
        c.execute = (async (sql: any, values: any[]) => {
          if (String(sql).includes("SELECT id FROM whatsapp_instances"))
            await c.query("SELECT SLEEP(2.1)");
          return (execute as any)(sql, values);
        }) as any;
        c.release = () => {
          c.execute = execute as any;
          c.release = release;
          release();
        };
        return c;
      });
      expect((await sendMerchantWhatsApp(transport(s))).accepted).toBe(false);
      expect(mock.send).not.toHaveBeenCalled();
    });
    it("checks inbound lease ownership again after the final transport guard", async () => {
      const s = await share();
      await beginSalesOfferDispatch(input, s, instanceId);
      const assertOwned = vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValue(new Error("lease expired"));
      const execution: InboundExecution = {
        id: 1,
        merchantId: owner.merchantId,
        instanceId,
        token: "fixture",
        eventKey: "fixture",
        partitionKey: "fixture",
        sendOrdinal: 0,
        assertOwned,
      };
      await expect(
        withInboundExecution(execution, () =>
          sendMerchantWhatsApp(transport(s))
        )
      ).rejects.toThrow("lease expired");
      expect(mock.send).not.toHaveBeenCalled();
      expect(execution.uncertainEffect).toBe(true);
    });
  }
);
