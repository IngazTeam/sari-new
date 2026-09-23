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
  type SalesOfferIdentity,
} from "./sales-offer-authority";
import { selectSalesDiscounts } from "./sales-offer-evidence";
import { salesOfferKey } from "./sales-offer-delivery";
import { sendMerchantWhatsApp } from "../channels/whatsapp/service";
import { reconcileSalesOffer } from "./sales-offer-reconciliation";
import { listSalesOfferAttempts, reviewSalesOffer } from "./sales-offer-review";

describe.skipIf(!process.env.DATABASE_URL)(
  "merchant sales offer review on MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      input: SalesOfferIdentity;
    let attemptId: string,
      instanceId: number,
      couponId: number,
      deliveryId: number,
      text: string;
    const phone = "966550333444";
    const query = async (sql: string, values: any[] = []) =>
      (await (await getPool())!.execute<any>(sql, values))[0];
    const list = () =>
      listSalesOfferAttempts(owner.merchantId, input.conversationId);
    const request = async () => {
      const item = (await list()).items[0];
      return {
        merchantId: owner.merchantId,
        actorUserId: owner.userId,
        conversationId: input.conversationId,
        attemptId,
        expectedRevision: item.revision,
        evidence: item.evidence,
        reviewed: true as const,
        note: "راجعت إيصال العرض وسجل واتساب.",
      };
    };
    const state = async () =>
      (
        await query("SELECT * FROM sales_offer_attempts WHERE id=?", [
          attemptId,
        ])
      )[0];
    const audit = () =>
      query(
        "SELECT * FROM sales_offer_reviews WHERE attempt_id=? ORDER BY revision",
        [attemptId]
      );
    const outgoing = () =>
      query(
        "SELECT * FROM messages WHERE conversationId=? AND direction='outgoing'",
        [input.conversationId]
      );
    const unknown = () =>
      query(
        "UPDATE whatsapp_message_deliveries SET status='queued',provider_message_id=NULL WHERE id=?",
        [deliveryId]
      );
    beforeEach(async () => {
      owner = await createDisposableMerchant("offer-review");
      other = await createDisposableMerchant("review-foreign");
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
            [owner.merchantId, `offer-review-${owner.merchantId}`]
          )
        ).insertId
      );
      couponId = Number(
        (
          await query(
            "INSERT INTO discount_codes (merchantId,code,type,value,maxUses,customer_phone) VALUES (?,'REVIEW10','percentage',10,1,?)",
            [owner.merchantId, phone]
          )
        ).insertId
      );
      mock.instance
        .mockReset()
        .mockResolvedValue({
          id: instanceId,
          merchantId: owner.merchantId,
          instanceId: `offer-review-${owner.merchantId}`,
          provider: "green_api",
          token: "fixture",
          status: "active",
        });
      mock.send
        .mockReset()
        .mockResolvedValue({
          accepted: true,
          outcome: "accepted",
          status: "sent",
          providerMessageId: `receipt-${randomUUID()}`,
        });
      const rows = await query(
        "SELECT *,customer_phone AS customerPhone FROM discount_codes WHERE id=?",
        [couponId]
      );
      const share = (await reserveSalesOfferShare(
        input,
        selectSalesDiscounts(rows, {
          merchantId: owner.merchantId,
          customerPhone: phone,
        })[0]
      ))!;
      attemptId = share.id;
      text = share.text;
      await beginSalesOfferDispatch(input, share, instanceId);
      await sendMerchantWhatsApp({
        merchantId: owner.merchantId,
        instanceRecordId: instanceId,
        idempotencyKey: salesOfferKey(owner.merchantId, attemptId),
        kind: "text",
        to: phone,
        text,
        salesOfferGuard: {
          attemptId,
          conversationId: input.conversationId,
          sourceMessageId: input.incomingMessageId,
        },
      });
      deliveryId = (
        await query(
          "SELECT id FROM whatsapp_message_deliveries WHERE merchant_id=?",
          [owner.merchantId]
        )
      )[0].id;
      mock.send.mockClear();
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await cleanupDisposableMerchants([owner.userId, other.userId]);
    });
    afterAll(closeDb);

    it("previews evidence without projecting, auditing, consuming a coupon or sending", async () => {
      expect((await list()).items[0]).toMatchObject({
        id: attemptId,
        revision: 0,
        accepted: true,
        projected: false,
        state: "sent",
        text,
        sourceText: "هل يوجد خصم؟",
        lastReview: null,
      });
      expect((await state()).state).toBe("dispatching");
      expect(await outgoing()).toHaveLength(0);
      expect(await audit()).toHaveLength(0);
      expect(mock.send).not.toHaveBeenCalled();
    });
    it("saves reviewer identity and repairs history atomically without changing ownership or coupon use", async () => {
      await query(
        "UPDATE conversations SET human_takeover=1,lastMessageAt='2028-01-01 00:00:00' WHERE id=?",
        [input.conversationId]
      );
      const review = await request();
      expect(await reviewSalesOffer(review)).toMatchObject({
        outcome: "recorded",
        accepted: true,
        projected: true,
      });
      expect((await list()).items[0]).toMatchObject({
        revision: 1,
        projected: true,
        lastReview: {
          actorUserId: owner.userId,
          note: review.note,
          outcome: "recorded",
          deliveryState: "sent",
        },
      });
      expect((await audit())[0]).toMatchObject({
        merchant_id: owner.merchantId,
        actor_user_id: owner.userId,
        evidence_hash: review.evidence,
        revision: 1,
      });
      expect(await outgoing()).toHaveLength(1);
      expect(
        (
          await query(
            "SELECT human_takeover,YEAR(lastMessageAt) AS year FROM conversations WHERE id=?",
            [input.conversationId]
          )
        )[0]
      ).toMatchObject({ human_takeover: 1, year: 2028 });
      expect(
        (
          await query("SELECT usedCount FROM discount_codes WHERE id=?", [
            couponId,
          ])
        )[0].usedCount
      ).toBe(0);
      expect(mock.send).not.toHaveBeenCalled();
    });
    it("records a literal note without promoting unknown acceptance or releasing the sharing limit", async () => {
      await unknown();
      const review = await request();
      review.note =
        "راجعت <img src=x onerror=alert(1)> '; DROP TABLE messages; --";
      const [before] = await query(
        "SELECT last_share_at FROM sales_offer_limits WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(await reviewSalesOffer(review)).toMatchObject({
        outcome: "unresolved",
        accepted: false,
        projected: false,
      });
      expect((await list()).items[0]).toMatchObject({
        state: "pending",
        revision: 1,
        lastReview: { note: review.note, outcome: "unresolved" },
      });
      expect(
        (
          await query(
            "SELECT last_share_at FROM sales_offer_limits WHERE merchant_id=?",
            [owner.merchantId]
          )
        )[0]
      ).toEqual(before);
      expect(await outgoing()).toHaveLength(0);
      expect(mock.send).not.toHaveBeenCalled();
    });
    it.each(["tenant", "conversation", "attempt"])(
      "rejects another %s without disclosing or changing the attempt",
      async attack => {
        const review = await request();
        if (attack === "tenant") review.merchantId = other.merchantId;
        if (attack === "conversation") review.conversationId++;
        if (attack === "attempt") review.attemptId = randomUUID();
        await expect(reviewSalesOffer(review)).rejects.toThrow("unavailable");
        expect(await audit()).toHaveLength(0);
        expect(await outgoing()).toHaveLength(0);
        await expect(
          listSalesOfferAttempts(other.merchantId, input.conversationId)
        ).rejects.toThrow("unavailable");
      }
    );
    it.each([
      "receipt",
      "status",
      "text",
      "source",
      "source-deleted",
      "projection",
      "account",
      "stored-offer",
    ])("rejects a changed %s at an unchanged review revision", async change => {
      const review = await request();
      if (change === "receipt")
        await query(
          "UPDATE whatsapp_message_deliveries SET provider_message_id=? WHERE id=?",
          [`changed-${randomUUID()}`, deliveryId]
        );
      if (change === "status")
        await query(
          "UPDATE whatsapp_message_deliveries SET status='read' WHERE id=?",
          [deliveryId]
        );
      if (change === "text")
        await query(
          "UPDATE sales_offer_attempts SET dispatch_text='changed text' WHERE id=?",
          [attemptId]
        );
      if (change === "source")
        await query(
          "UPDATE messages SET content='changed request' WHERE id=?",
          [input.incomingMessageId]
        );
      if (change === "source-deleted")
        await query("DELETE FROM messages WHERE id=?", [
          input.incomingMessageId,
        ]);
      if (change === "projection")
        await query(
          "INSERT INTO messages (conversationId,direction,content,externalId,sender_type) SELECT ?,'outgoing',?,provider_message_id,'assistant' FROM whatsapp_message_deliveries WHERE id=?",
          [input.conversationId, text, deliveryId]
        );
      if (change === "account")
        await query(
          "UPDATE whatsapp_instances SET instance_id='changed-account' WHERE id=?",
          [instanceId]
        );
      if (change === "stored-offer")
        await query(
          "UPDATE sales_offer_attempts SET evidence=JSON_SET(evidence,'$.value',20) WHERE id=?",
          [attemptId]
        );
      await expect(reviewSalesOffer(review)).rejects.toThrow(
        "evidence changed"
      );
      expect(await audit()).toHaveLength(0);
      expect(mock.send).not.toHaveBeenCalled();
    });
    it("allows worker bookkeeping changes but rejects a worker repair of the actual evidence", async () => {
      await unknown();
      const review = await request();
      await reconcileSalesOffer(input, attemptId);
      expect((await list()).items[0].evidence).toBe(review.evidence);
      await reviewSalesOffer(review);
      await query(
        "UPDATE whatsapp_message_deliveries SET status='sent',provider_message_id=? WHERE id=?",
        [`repaired-${randomUUID()}`, deliveryId]
      );
      const accepted = await request();
      await reconcileSalesOffer(input, attemptId);
      await expect(reviewSalesOffer(accepted)).rejects.toThrow(
        "evidence changed"
      );
      expect(await audit()).toHaveLength(1);
      await reviewSalesOffer(await request());
      expect(await outgoing()).toHaveLength(1);
      expect(mock.send).not.toHaveBeenCalled();
    });
    it("serializes five concurrent reviewers and survives reconnect without duplicating the message", async () => {
      const review = await request();
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () => reviewSalesOffer(review))
      );
      expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
      expect(await audit()).toHaveLength(1);
      expect(await outgoing()).toHaveLength(1);
      await closeDb();
      await expect(reviewSalesOffer(review)).rejects.toThrow(
        "evidence changed"
      );
      expect(mock.send).not.toHaveBeenCalled();
    });
    it.each(["audit", "revision", "projection"])(
      "rolls back the review and its projection when %s storage fails",
      async fault => {
        const review = await request(),
          pool = (await getPool())!,
          original = pool.getConnection.bind(pool);
        vi.spyOn(pool, "getConnection").mockImplementation(async () => {
          const c = await original(),
            execute = c.execute.bind(c),
            release = c.release.bind(c);
          c.execute = ((sql: any, values: any[]) => {
            if (
              String(sql).includes(
                fault === "audit"
                  ? "INSERT INTO sales_offer_reviews"
                  : fault === "revision"
                    ? "SET review_revision=review_revision+1"
                    : "INSERT INTO messages"
              )
            )
              throw new Error("fixture storage failure");
            return (execute as any)(sql, values);
          }) as any;
          c.release = () => {
            c.execute = execute as any;
            c.release = release;
            release();
          };
          return c;
        });
        await expect(reviewSalesOffer(review)).rejects.toThrow(
          "storage failure"
        );
        vi.restoreAllMocks();
        expect((await state()).state).toBe("dispatching");
        expect((await state()).review_revision).toBe(0);
        expect(await audit()).toHaveLength(0);
        expect(await outgoing()).toHaveLength(0);
        expect((await reviewSalesOffer(review)).outcome).toBe("recorded");
        expect(mock.send).not.toHaveBeenCalled();
      }
    );
    it("lets a reviewer document a receipt/history conflict without overwriting the conflicting message", async () => {
      await query(
        "INSERT INTO messages (conversationId,direction,content,externalId,sender_type) SELECT ?,'outgoing','existing other text',provider_message_id,'merchant' FROM whatsapp_message_deliveries WHERE id=?",
        [input.conversationId, deliveryId]
      );
      expect((await list()).items[0]).toMatchObject({
        accepted: true,
        projected: false,
        projectionConflict: true,
      });
      expect(await reviewSalesOffer(await request())).toMatchObject({
        outcome: "accepted_unprojected",
        projected: false,
      });
      expect((await outgoing())[0]).toMatchObject({
        content: "existing other text",
        sender_type: "merchant",
      });
      expect((await audit())[0].outcome).toBe("accepted_unprojected");
      expect(mock.send).not.toHaveBeenCalled();
    });
    it.each([true, false])(
      "records failed delivery separately from prior accepted history: %s",
      async previouslyAccepted => {
        if (previouslyAccepted) await reconcileSalesOffer(input, attemptId);
        await query(
          "UPDATE whatsapp_message_deliveries SET status='failed' WHERE id=?",
          [deliveryId]
        );
        const result = await reviewSalesOffer(await request());
        expect(result).toMatchObject({
          deliveryState: "failed",
          accepted: previouslyAccepted,
          outcome: previouslyAccepted ? "recorded" : "failed",
        });
        expect((await audit())[0].delivery_state).toBe("failed");
        expect(mock.send).not.toHaveBeenCalled();
      }
    );
    it.each(["legacy", "reserved", "cancelled"])(
      "does not restart or confirm a %s attempt when reviewing it",
      async mode => {
        await query("DELETE FROM whatsapp_message_deliveries WHERE id=?", [
          deliveryId,
        ]);
        await query(
          "UPDATE sales_offer_attempts SET state=?,instance_id=NULL,provider=NULL,provider_account=NULL,dispatch_text=NULL,dispatch_started_at=NULL,next_reconcile_at=NULL WHERE id=?",
          [mode === "legacy" ? "accepted" : mode, attemptId]
        );
        expect(await reviewSalesOffer(await request())).toMatchObject({
          outcome: "unresolved",
          accepted: false,
          projected: false,
        });
        expect((await state()).next_reconcile_at).toBeNull();
        expect(await outgoing()).toHaveLength(0);
        expect(mock.send).not.toHaveBeenCalled();
      }
    );
    it("does not invent a deleted source and allows a fresh review with that absence visible", async () => {
      await query("DELETE FROM messages WHERE id=?", [input.incomingMessageId]);
      expect((await list()).items[0].sourceText).toBeNull();
      expect((await reviewSalesOffer(await request())).outcome).toBe(
        "recorded"
      );
      expect(mock.send).not.toHaveBeenCalled();
    });
    it.each(["reassigned", "deleted"])(
      "hides prior customer evidence after the conversation is %s",
      async change => {
        const review = await request();
        if (change === "reassigned") {
          await query(
            "UPDATE conversations SET customerPhone='966500000099' WHERE id=?",
            [input.conversationId]
          );
          expect((await list()).items).toHaveLength(0);
        } else {
          await query("DELETE FROM conversations WHERE id=?", [
            input.conversationId,
          ]);
          await expect(list()).rejects.toThrow("unavailable");
        }
        await expect(reviewSalesOffer(review)).rejects.toThrow("unavailable");
        expect(await audit()).toHaveLength(0);
        expect(mock.send).not.toHaveBeenCalled();
      }
    );
    it("paginates by unique source message with stable ties and scopes history to the exact conversation", async () => {
      const r = await state();
      for (let n = 0; n < 12; n++) {
        const source = await query(
          "INSERT INTO messages (conversationId,direction,content) VALUES (?,'incoming','طلب خصم آخر')",
          [input.conversationId]
        );
        await query(
          "INSERT INTO sales_offer_attempts (id,merchant_id,conversation_id,source_message_id,customer_phone,kind,state,discount_code_id,evidence,created_at) VALUES (?,?,?,?,?,'share','reserved',?,?,'2026-09-23 00:00:00')",
          [
            randomUUID(),
            owner.merchantId,
            input.conversationId,
            source.insertId,
            phone,
            couponId,
            JSON.stringify(r.evidence),
          ]
        );
      }
      const first = await list(),
        second = await listSalesOfferAttempts(
          owner.merchantId,
          input.conversationId,
          first.nextCursor!
        );
      expect(first.items).toHaveLength(10);
      expect(second.items).toHaveLength(3);
      expect(second.nextCursor).toBeNull();
      expect(
        new Set([...first.items, ...second.items].map(x => x.id)).size
      ).toBe(13);
      const otherConv = Number(
        (
          await query(
            "INSERT INTO conversations (merchantId,customerPhone) VALUES (?,?)",
            [owner.merchantId, phone]
          )
        ).insertId
      );
      expect(
        (await listSalesOfferAttempts(owner.merchantId, otherConv)).items
      ).toHaveLength(0);
    });
  }
);
