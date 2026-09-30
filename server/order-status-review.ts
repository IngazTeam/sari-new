import { createHash } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { getPool } from "./db/connection";
import { assertRuntimeSchema } from "./db/schema-readiness";
import { hasPermission, type MerchantRole } from "./_core/permissions";
import { fillOrderNotificationTemplate } from "../shared/order-notification-template";
import { orderMinor, orderReadInput } from "../shared/order-workspace";
import {
  orderStatusIntent,
  orderStatusWrite,
  orderStatusReceiptInput,
  orderStatusHistoryInput,
  orderStatusReceipt,
  type OrderStatusReceipt,
  type OrderStatusReview,
  type OrderStatusIntent,
} from "../shared/order-status-review";
export class OrderStatusConflict extends Error {}
export class OrderStatusUnavailable extends Error {}
export class OrderStatusPrecondition extends Error {}
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
async function schema() {
  await assertRuntimeSchema("reviewed order status", [
    {
      table: "order_status_receipts",
      columns: ["actor_id", "order_id", "input_hash", "result"],
      uniqueIndexes: [
        {
          name: "uq_order_status_request",
          columns: ["merchant_id", "request_id"],
        },
      ],
    },
    {
      table: "orders",
      columns: ["checkout_review_required", "payment_status"],
    },
    {
      table: "notification_templates",
      uniqueIndexes: [
        {
          name: "uq_notification_template_merchant_status",
          columns: ["merchant_id", "status"],
        },
      ],
    },
    {
      table: "order_notifications",
      columns: ["event_key", "delivery_status"],
      uniqueIndexes: [
        {
          name: "uq_order_notification_event",
          columns: ["merchant_id", "event_key"],
        },
      ],
    },
  ]);
}
async function transaction<T>(run: (c: PoolConnection) => Promise<T>) {
  await schema();
  const pool = await getPool();
  if (!pool) throw Error("Orders unavailable");
  const c = await pool.getConnection();
  let reusable = true,
    committing = false;
  try {
    await c.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await c.beginTransaction();
    const result = await run(c);
    committing = true;
    await c.commit();
    return result;
  } catch (error) {
    if (committing) reusable = false;
    else
      try {
        await c.rollback();
      } catch {
        reusable = false;
      }
    throw error;
  } finally {
    if (reusable) c.release();
    else c.destroy();
  }
}
async function actor(c: PoolConnection, merchantId: number, actorId: number) {
  orderReadInput.parse({ id: merchantId });
  orderReadInput.parse({ id: actorId });
  const [merchants] = await c.execute<any[]>(
    "SELECT id,userId,status,businessName FROM merchants WHERE id=? FOR UPDATE",
    [merchantId]
  );
  if (merchants.length !== 1) throw new OrderStatusUnavailable();
  const merchant = merchants[0];
  const [users] = await c.execute<any[]>(
    "SELECT account_status FROM users WHERE id=? FOR SHARE",
    [actorId]
  );
  const [members] = await c.execute<any[]>(
    "SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE",
    [merchantId, actorId]
  );
  const role =
    members.length === 1 && Number(members[0].is_active) === 1
      ? members[0].role
      : members.length === 0 && Number(merchant.userId) === actorId
        ? "owner"
        : null;
  if (
    merchant.status === "suspended" ||
    users[0]?.account_status !== "active" ||
    !role ||
    !hasPermission(role as MerchantRole, "orders.manage")
  )
    throw new OrderStatusConflict();
  return merchant;
}
const rank: Record<string, number> = {
  pending: 0,
  paid: 1,
  processing: 2,
  shipped: 3,
  delivered: 4,
};
async function review(
  c: PoolConnection,
  merchant: any,
  actorId: number,
  intent: OrderStatusIntent
): Promise<OrderStatusReview> {
  const [rows] = await c.execute<any[]>(
    `SELECT id,merchantId,orderNumber,customerName,customerPhone,status,payment_status,currency,totalAmount,sallaOrderId,trackingNumber,
    checkout_review_required,checkout_discount_released,checkout_subtotal_minor,checkout_discount_minor,discountCode,
    SHA2(items,256) itemsHash,SHA2(COALESCE(notes,''),256) notesHash,SHA2(COALESCE(address,''),256) addressHash,
    DATE_FORMAT(updatedAt,'%Y-%m-%dT%H:%i:%s.000Z') updatedAt
    FROM orders WHERE merchantId=? AND id=? FOR UPDATE`,
    [merchant.id, intent.id]
  );
  const o = rows[0];
  if (!o) throw new OrderStatusUnavailable();
  if (
    o.sallaOrderId ||
    ["cancelled", "delivered"].includes(o.status) ||
    rank[o.status] === undefined ||
    (intent.status !== "cancelled" &&
      (rank[intent.status] <= rank[o.status] ||
        o.checkout_review_required ||
        o.checkout_discount_released))
  )
    throw new OrderStatusPrecondition();
  let notification: OrderStatusReview["notification"] = null;
  if (intent.notify) {
    const [templates] = await c.execute<any[]>(
      "SELECT template,enabled FROM notification_templates WHERE merchant_id=? AND status=? FOR SHARE",
      [merchant.id, intent.status]
    );
    if (
      templates.length !== 1 ||
      Number(templates[0].enabled) !== 1 ||
      !/^\+?[0-9]{8,15}$/.test(o.customerPhone)
    )
      throw new OrderStatusPrecondition();
    let message: string;
    try {
      message = fillOrderNotificationTemplate(templates[0].template, {
        customerName: o.customerName,
        storeName: merchant.businessName,
        orderNumber: o.orderNumber || `ORD-${o.id}`,
        total: o.totalAmount,
        currency: o.currency,
        trackingNumber: intent.trackingNumber ?? o.trackingNumber ?? undefined,
      });
    } catch {
      throw new OrderStatusPrecondition();
    }
    if (!message.trim() || message.length > 4096)
      throw new OrderStatusPrecondition();
    notification = { customerPhone: o.customerPhone, message };
  }
  return {
    merchantId: merchant.id,
    actorId,
    intent,
    digest: hash([merchant.id, actorId, o, intent, notification]),
    order: {
      id: o.id,
      number: o.orderNumber,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      status: o.status,
      paymentStatus: o.payment_status,
      currency: o.currency,
      totalMinor: orderMinor(o.totalAmount),
      trackingNumber: o.trackingNumber,
    },
    notification,
  };
}
export async function reviewOrderStatus(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  const intent = orderStatusIntent.parse(raw);
  return transaction(async c =>
    review(c, await actor(c, merchantId, actorId), actorId, intent)
  );
}
function saved(
  row: any,
  merchantId: number,
  actorId: number,
  requestId: string
) {
  const result = orderStatusReceipt.parse(
    typeof row.result === "string" ? JSON.parse(row.result) : row.result
  );
  if (
    result.merchantId !== merchantId ||
    result.actorId !== actorId ||
    result.requestId !== requestId ||
    result.orderId !== Number(row.order_id)
  )
    throw Error("Invalid order receipt");
  return result;
}
export async function writeOrderStatus(
  merchantId: number,
  actorId: number,
  raw: unknown
): Promise<OrderStatusReceipt> {
  const input = orderStatusWrite.parse(raw),
    inputHash = hash(input);
  return transaction(async c => {
    const merchant = await actor(c, merchantId, actorId);
    const [prior] = await c.execute<any[]>(
      "SELECT actor_id,order_id,input_hash,result FROM order_status_receipts WHERE merchant_id=? AND request_id=?",
      [merchantId, input.requestId]
    );
    if (prior.length) {
      if (
        Number(prior[0].actor_id) !== actorId ||
        prior[0].input_hash !== inputHash
      )
        throw new OrderStatusConflict();
      return saved(prior[0], merchantId, actorId, input.requestId);
    }
    const current = await review(c, merchant, actorId, input.intent);
    if (current.digest !== input.expectedDigest)
      throw new OrderStatusConflict();
    const tracking =
      input.intent.trackingNumber ?? current.order.trackingNumber;
    const [updated] = await c.execute<any>(
      "UPDATE orders SET status=?,trackingNumber=?,updatedAt=UTC_TIMESTAMP() WHERE merchantId=? AND id=? AND status=?",
      [
        input.intent.status,
        tracking,
        merchantId,
        input.intent.id,
        current.order.status,
      ]
    );
    if (updated.affectedRows !== 1) throw new OrderStatusConflict();
    if (current.notification) {
      // Shares the established outbox event identity; an existing event rolls back this write instead of resending.
      const eventKey = createHash("sha256")
        .update(
          `order-status:v1\0${merchantId}\0${input.intent.id}\0${input.intent.status}`,
          "utf8"
        )
        .digest("hex");
      await c.execute(
        "INSERT INTO order_notifications (order_id,merchant_id,event_key,customer_phone,status,message,sent,delivery_status) VALUES (?,?,?,?,?,?,0,'pending')",
        [
          input.intent.id,
          merchantId,
          eventKey,
          current.notification.customerPhone,
          input.intent.status,
          current.notification.message,
        ]
      );
    }
    const [clock] = await c.execute<any[]>(
      "SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') now"
    );
    const receipt = orderStatusReceipt.parse({
      version: "order-status.v1",
      merchantId,
      actorId,
      requestId: input.requestId,
      orderId: input.intent.id,
      from: current.order.status,
      status: input.intent.status,
      trackingNumber: tracking,
      reason: input.intent.reason ?? null,
      notificationQueued: !!current.notification,
      committedAt: String(clock[0].now).replace(/(\.\d{3})\d{3}Z$/, "$1Z"),
    });
    await c.execute(
      "INSERT INTO order_status_receipts (merchant_id,actor_id,order_id,request_id,input_hash,result) VALUES (?,?,?,?,?,?)",
      [
        merchantId,
        actorId,
        input.intent.id,
        input.requestId,
        inputHash,
        JSON.stringify(receipt),
      ]
    );
    return receipt;
  });
}
export async function readOrderStatusReceipt(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  const input = orderStatusReceiptInput.parse(raw);
  return transaction(async c => {
    await actor(c, merchantId, actorId);
    const [rows] = await c.execute<any[]>(
      "SELECT actor_id,order_id,result FROM order_status_receipts WHERE merchant_id=? AND actor_id=? AND request_id=?",
      [merchantId, actorId, input.requestId]
    );
    return rows.length
      ? saved(rows[0], merchantId, actorId, input.requestId)
      : null;
  });
}
export async function readOrderStatusHistory(merchantId: number, raw: unknown) {
  orderReadInput.parse({ id: merchantId });
  const input = orderStatusHistoryInput.parse(raw);
  return transaction(async c => {
    const [owned] = await c.execute<any[]>(
      "SELECT id FROM orders WHERE merchantId=? AND id=?",
      [merchantId, input.id]
    );
    if (!owned.length) return null;
    const [rows] = await c.query<any[]>(
      "SELECT id,actor_id,order_id,request_id,result FROM order_status_receipts WHERE merchant_id=? AND order_id=? AND id<? ORDER BY id DESC LIMIT 21",
      [merchantId, input.id, input.beforeId ?? Number.MAX_SAFE_INTEGER]
    );
    return {
      merchantId,
      orderId: input.id,
      items: rows.slice(0, 20).map(row => ({
        id: Number(row.id),
        receipt: saved(row, merchantId, Number(row.actor_id), row.request_id),
      })),
      next: rows.length > 20 ? Number(rows[19].id) : null,
    };
  });
}
