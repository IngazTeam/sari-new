import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, it, expect } from "vitest";
import { getPool, closeDb } from "./db/connection";
import {
  createDisposableMerchant,
  cleanupDisposableMerchants,
} from "./tests/helpers/disposable-merchant";
import {
  reviewOrderStatus,
  writeOrderStatus,
  readOrderStatusReceipt,
  readOrderStatusHistory,
  OrderStatusConflict,
  OrderStatusPrecondition,
  OrderStatusUnavailable,
} from "./order-status-review";
describe.skipIf(!process.env.DATABASE_URL)(
  "reviewed order status MySQL",
  () => {
    let owner: Awaited<ReturnType<typeof createDisposableMerchant>>,
      other: typeof owner,
      id: number;
    const query = async (q: string, p: any[] = []) =>
      (await (await getPool())!.execute<any>(q, p))[0];
    const intent = (extra: any = {}) => ({
      id,
      status: "processing" as const,
      notify: false,
      ...extra,
    });
    const prepare = async (extra: any = {}) => {
      const value = intent(extra);
      const review = await reviewOrderStatus(
        owner.merchantId,
        owner.userId,
        value
      );
      return {
        requestId: randomUUID(),
        intent: value,
        expectedDigest: review.digest,
        reviewed: true as const,
      };
    };
    const write = (raw: unknown) =>
      writeOrderStatus(owner.merchantId, owner.userId, raw);
    beforeEach(async () => {
      owner = await createDisposableMerchant("order-status");
      other = await createDisposableMerchant("status-other");
      id = (
        await query(
          "INSERT INTO orders (merchantId,customerPhone,customerName,items,totalAmount,currency,status,notes) VALUES (?,'+12025550161','Local','[]',3453,'USD','pending','Original notes')",
          [owner.merchantId]
        )
      ).insertId;
    });
    afterEach(async () =>
      cleanupDisposableMerchants([owner?.userId, other?.userId].filter(Boolean))
    );
    afterAll(closeDb);
    it("reviews without changing anything, then saves and replays the same receipt", async () => {
      const request = await prepare();
      expect(
        (await query("SELECT status FROM orders WHERE id=?", [id]))[0].status
      ).toBe("pending");
      expect(
        await query(
          "SELECT id FROM order_status_receipts WHERE merchant_id=?",
          [owner.merchantId]
        )
      ).toHaveLength(0);
      const receipt = await write(request);
      expect(receipt).toMatchObject({
        orderId: id,
        status: "processing",
        from: "pending",
        notificationQueued: false,
        actorId: owner.userId,
      });
      expect(await write(request)).toEqual(receipt);
      expect(
        await readOrderStatusReceipt(owner.merchantId, owner.userId, {
          requestId: request.requestId,
        })
      ).toEqual(receipt);
      expect(
        await query(
          "SELECT id FROM order_status_receipts WHERE merchant_id=?",
          [owner.merchantId]
        )
      ).toHaveLength(1);
    });
    it("serializes concurrent duplicate requests", async () => {
      const v = await prepare();
      const [a, b] = await Promise.all([write(v), write(v)]);
      expect(a).toEqual(b);
    });
    it("rejects another payload with the same UUID", async () => {
      const v = await prepare();
      await write(v);
      await expect(
        write({ ...v, intent: { ...v.intent, status: "shipped" } })
      ).rejects.toBeInstanceOf(OrderStatusConflict);
    });
    it("preserves original notes while recording the cancellation reason", async () => {
      const receipt = await write(
        await prepare({ status: "cancelled", reason: "Reviewed cancellation" })
      );
      expect(receipt.reason).toBe("Reviewed cancellation");
      expect(
        (await query("SELECT notes,status FROM orders WHERE id=?", [id]))[0]
      ).toMatchObject({ notes: "Original notes", status: "cancelled" });
      expect(
        (await readOrderStatusHistory(owner.merchantId, { id }))?.items[0]
          .receipt
      ).toEqual(receipt);
    });
    it("preserves tracking during later transitions and reviews a new tracking value", async () => {
      await query("UPDATE orders SET trackingNumber='Before' WHERE id=?", [id]);
      expect(
        (
          await write(
            await prepare({ status: "shipped", trackingNumber: "After" })
          )
        ).trackingNumber
      ).toBe("After");
      expect(
        (await write(await prepare({ status: "delivered" }))).trackingNumber
      ).toBe("After");
    });
    it.each([
      "totalAmount=3454",
      "customerPhone='+12025550162'",
      "notes='Changed'",
      "items='[{}]'",
      "payment_status='paid'",
      "trackingNumber='Other'",
      "address='Changed'",
    ])("rejects stale review after %s", async change => {
      const v = await prepare();
      await query(`UPDATE orders SET ${change} WHERE id=?`, [id]);
      await expect(write(v)).rejects.toBeInstanceOf(OrderStatusConflict);
      expect(
        await query(
          "SELECT id FROM order_status_receipts WHERE merchant_id=?",
          [owner.merchantId]
        )
      ).toHaveLength(0);
    });
    it.each([
      "sallaOrderId='EXTERNAL'",
      "status='delivered'",
      "status='cancelled'",
      "checkout_review_required=1",
      "checkout_discount_released=1",
    ])("blocks a manual forward transition for %s", async change => {
      await query(`UPDATE orders SET ${change} WHERE id=?`, [id]);
      await expect(prepare()).rejects.toBeInstanceOf(OrderStatusPrecondition);
    });
    it("allows cancelling an invoice awaiting review without approving or paying it", async () => {
      await query("UPDATE orders SET checkout_review_required=1 WHERE id=?", [
        id,
      ]);
      await write(
        await prepare({ status: "cancelled", reason: "Customer cancelled" })
      );
      expect(
        (
          await query(
            "SELECT checkout_review_required,payment_status FROM orders WHERE id=?",
            [id]
          )
        )[0]
      ).toMatchObject({
        checkout_review_required: 1,
        payment_status: "unpaid",
      });
    });
    it("denies foreign orders and keeps foreign receipts and history hidden", async () => {
      const v = await prepare();
      await write(v);
      await expect(
        reviewOrderStatus(other.merchantId, other.userId, intent())
      ).rejects.toBeInstanceOf(OrderStatusUnavailable);
      expect(
        await readOrderStatusReceipt(other.merchantId, other.userId, {
          requestId: v.requestId,
        })
      ).toBeNull();
      expect(await readOrderStatusHistory(other.merchantId, { id })).toBeNull();
    });
    it("queues only the exact reviewed message atomically and uses the order currency", async () => {
      await query(
        "INSERT INTO notification_templates (merchant_id,status,template,enabled) VALUES (?,'processing','{{customerName}} / {{total}} ريال',1)",
        [owner.merchantId]
      );
      const review = await reviewOrderStatus(
        owner.merchantId,
        owner.userId,
        intent({ notify: true })
      );
      expect(review.notification?.message).toBe("Local / 34.53 USD");
      const v = {
        requestId: randomUUID(),
        intent: review.intent,
        expectedDigest: review.digest,
        reviewed: true,
      };
      const saved = await write(v);
      expect(saved.notificationQueued).toBe(true);
      await write(v);
      const rows = await query(
        "SELECT message,customer_phone,delivery_status FROM order_notifications WHERE merchant_id=?",
        [owner.merchantId]
      );
      expect(rows).toEqual([
        {
          message: "Local / 34.53 USD",
          customer_phone: "+12025550161",
          delivery_status: "pending",
        },
      ]);
    });
    it("invalidates a notification review when the enabled template changes", async () => {
      await query(
        "INSERT INTO notification_templates (merchant_id,status,template,enabled) VALUES (?,'processing','First',1)",
        [owner.merchantId]
      );
      const v = await prepare({ notify: true });
      await query(
        "UPDATE notification_templates SET template='Second' WHERE merchant_id=?",
        [owner.merchantId]
      );
      await expect(write(v)).rejects.toBeInstanceOf(OrderStatusConflict);
      expect(
        (await query("SELECT status FROM orders WHERE id=?", [id]))[0].status
      ).toBe("pending");
    });
    it("does not imply permission to notify when the template is absent", async () => {
      await expect(prepare({ notify: true })).rejects.toBeInstanceOf(
        OrderStatusPrecondition
      );
    });
    it("reports unusable notification money as a precondition without changing the order", async () => {
      await query(
        "INSERT INTO notification_templates (merchant_id,status,template,enabled) VALUES (?,'processing','{{total}} {{currency}}',1)",
        [owner.merchantId]
      );
      await query("UPDATE orders SET totalAmount=-1 WHERE id=?", [id]);
      await expect(prepare({ notify: true })).rejects.toBeInstanceOf(
        OrderStatusPrecondition
      );
      expect(
        (await query("SELECT status FROM orders WHERE id=?", [id]))[0].status
      ).toBe("pending");
    });
    it("returns the original receipt even when the order later advances", async () => {
      const v = await prepare(),
        a = await write(v);
      await write(await prepare({ status: "shipped" }));
      expect(await write(v)).toEqual(a);
      const h = await readOrderStatusHistory(owner.merchantId, { id });
      expect(h?.items.map(v => v.receipt.status)).toEqual([
        "shipped",
        "processing",
      ]);
    });
    it("rechecks revoked membership inside the write transaction", async () => {
      const v = await prepare();
      await query(
        "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,'owner',0)",
        [owner.merchantId, owner.userId]
      );
      await expect(write(v)).rejects.toBeInstanceOf(OrderStatusConflict);
    });
    it.each(["manager", "sales_supervisor"])(
      "permits an active %s member without sharing the owner's receipt",
      async role => {
        await query(
          "INSERT INTO merchant_members (merchant_id,user_id,role,is_active) VALUES (?,?,?,1)",
          [owner.merchantId, other.userId, role]
        );
        const own = await prepare(),
          ownReceipt = await write(own);
        expect(
          await readOrderStatusReceipt(owner.merchantId, other.userId, {
            requestId: own.requestId,
          })
        ).toBeNull();
        await expect(
          writeOrderStatus(owner.merchantId, other.userId, own)
        ).rejects.toBeInstanceOf(OrderStatusConflict);
        const value = intent({ status: "shipped" }),
          review = await reviewOrderStatus(
            owner.merchantId,
            other.userId,
            value
          );
        const receipt = await writeOrderStatus(owner.merchantId, other.userId, {
          requestId: randomUUID(),
          intent: value,
          expectedDigest: review.digest,
          reviewed: true,
        });
        expect(receipt.actorId).toBe(other.userId);
        expect(ownReceipt.actorId).toBe(owner.userId);
      }
    );
    it("denies an actor entering account deletion after review", async () => {
      const v = await prepare();
      await query(
        "UPDATE users SET account_status='deletion_pending' WHERE id=?",
        [owner.userId]
      );
      await expect(write(v)).rejects.toBeInstanceOf(OrderStatusConflict);
    });
    it("returns every history page without repeating the boundary receipt", async () => {
      for (let n = 0; n < 25; n++) {
        const requestId = randomUUID(),
          receipt = {
            version: "order-status.v1",
            merchantId: owner.merchantId,
            actorId: owner.userId,
            requestId,
            orderId: id,
            from: "pending",
            status: "processing",
            trackingNumber: null,
            reason: null,
            notificationQueued: false,
            committedAt: "2026-09-30T00:00:00.000Z",
          };
        await query(
          "INSERT INTO order_status_receipts (merchant_id,actor_id,order_id,request_id,input_hash,result) VALUES (?,?,?,?,?,?)",
          [
            owner.merchantId,
            owner.userId,
            id,
            requestId,
            "a".repeat(64),
            JSON.stringify(receipt),
          ]
        );
      }
      const first = await readOrderStatusHistory(owner.merchantId, { id }),
        last = await readOrderStatusHistory(owner.merchantId, {
          id,
          beforeId: first!.next!,
        });
      expect(first?.items).toHaveLength(20);
      expect(last?.items).toHaveLength(5);
      expect(last?.next).toBeNull();
      expect(
        new Set([...first!.items, ...last!.items].map(v => v.id)).size
      ).toBe(25);
    });
  }
);
