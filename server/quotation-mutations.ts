import { createHash, randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { getPool } from "./db/connection";
import { assertRuntimeSchema } from "./db/schema-readiness";
import {
  quotationDraftInput,
  quotationChangeInput,
  quotationTargetInput,
  quotationReceiptInput,
  calculateQuotation,
  type QuotationReceipt,
} from "../shared/quotation-mutations";
import { quotationMonth } from "../shared/quotation-workspace";
export class QuotationConflict extends Error {
  constructor() {
    super("Quotation review changed");
  }
}
export class QuotationUnavailable extends Error {
  constructor() {
    super("Quotation unavailable");
  }
}
const managedFields = [
  "source_message_id",
  "consent_message_id",
  "checkout_snapshot",
  "external_provider",
  "external_snapshot",
  "execution_state",
  "order_id",
  "external_result",
  "execution_attempt_id",
  "external_order_key",
  "offer_expires_at",
] as const;
export const isGovernedQuotation = (row: Record<string, unknown>) =>
  managedFields.some(key => row[key] != null);
const schema = () =>
  assertRuntimeSchema("manual quotation writes", [
    {
      table: "sales_quotations",
      columns: ["tax_basis_points", "offer_version"],
    },
    { table: "sales_targets", columns: ["revision"] },
    {
      table: "quotation_action_receipts",
      columns: ["merchant_id", "request_id", "input_hash", "result"],
    },
    { table: "sari_activity_log" },
  ]);
const validId = (id: number) => {
  if (!Number.isSafeInteger(id) || id < 1) throw Error("Invalid identity");
};
async function commitAction(
  merchantId: number,
  actorId: number,
  kind: QuotationReceipt["kind"],
  input: { requestId: string },
  run: (
    c: PoolConnection
  ) => Promise<Pick<QuotationReceipt, "recordId" | "revision" | "changed">>
): Promise<QuotationReceipt> {
  validId(merchantId);
  validId(actorId);
  await schema();
  const pool = await getPool();
  if (!pool) throw Error("Quotations unavailable");
  const hash = createHash("sha256")
      .update(JSON.stringify({ kind, input }))
      .digest("hex"),
    c = await pool.getConnection();
  try {
    await c.beginTransaction();
    // One short local write at a time per merchant; no provider work under this lock.
    const [merchants] = await c.execute<any[]>(
      "SELECT id FROM merchants WHERE id=? FOR UPDATE",
      [merchantId]
    );
    if (!merchants.length) throw new QuotationUnavailable();
    const [prior] = await c.execute<any[]>(
      "SELECT action,input_hash,result FROM quotation_action_receipts WHERE merchant_id=? AND request_id=?",
      [merchantId, input.requestId]
    );
    if (prior.length) {
      if (prior[0].action !== kind || prior[0].input_hash !== hash)
        throw new QuotationConflict();
      const result =
        typeof prior[0].result === "string"
          ? JSON.parse(prior[0].result)
          : prior[0].result;
      await c.commit();
      return result;
    }
    const result: QuotationReceipt = {
      merchantId,
      requestId: input.requestId,
      kind,
      ...(await run(c)),
      committedAt: new Date().toISOString(),
    };
    await c.execute(
      "INSERT INTO quotation_action_receipts (merchant_id,request_id,action,input_hash,actor_id,result) VALUES (?,?,?,?,?,?)",
      [merchantId, input.requestId, kind, hash, actorId, JSON.stringify(result)]
    );
    await c.execute(
      "INSERT INTO sari_activity_log (merchant_id,action_type,description,details) VALUES (?,?,?,?)",
      [
        merchantId,
        `quotation_${kind}_saved`,
        "تم حفظ إجراء عروض الأسعار محليًا؛ لا يثبت الإرسال أو الدفع",
        JSON.stringify(result),
      ]
    );
    await c.commit();
    return result;
  } catch (error) {
    await c.rollback();
    throw error;
  } finally {
    c.release();
  }
}
export async function createManualQuotation(
  merchantId: number,
  actorId: number,
  raw: unknown,
  now = new Date()
) {
  const input = quotationDraftInput.parse(raw);
  quotationMonth(now);
  const calculation = calculateQuotation(input.items, input.taxBasisPoints);
  return commitAction(merchantId, actorId, "create", input, async c => {
    if (input.conversationId) {
      const [conversation] = await c.execute<any[]>(
        "SELECT customerPhone FROM conversations WHERE id=? AND merchantId=? FOR SHARE",
        [input.conversationId, merchantId]
      );
      if (
        !conversation.length ||
        (input.customerPhone &&
          conversation[0].customerPhone !== input.customerPhone)
      )
        throw new QuotationUnavailable();
    }
    const valid = new Date(now.getTime());
    valid.setUTCDate(valid.getUTCDate() + input.validDays);
    const number = `Q-${now.toISOString().slice(2, 10).replaceAll("-", "")}-${randomUUID().replaceAll("-", "")}`;
    const [insert] = await c.execute<any>(
      `INSERT INTO sales_quotations (merchant_id,customer_phone,customer_name,quotation_number,items,subtotal,tax_amount,total,currency,status,valid_until,conversation_id,tax_basis_points)
      VALUES (?,?,?,?,?,?,?,?,?,'draft',?,?,?)`,
      [
        merchantId,
        input.customerPhone ?? null,
        input.customerName ?? null,
        number,
        JSON.stringify(calculation.items),
        (calculation.subtotalMinor / 100).toFixed(2),
        (calculation.taxMinor / 100).toFixed(2),
        (calculation.totalMinor / 100).toFixed(2),
        input.currency,
        valid.toISOString().slice(0, 10),
        input.conversationId ?? null,
        input.taxBasisPoints,
      ]
    );
    return { recordId: Number(insert.insertId), revision: 1, changed: true };
  });
}
export async function changeManualQuotation(
  merchantId: number,
  actorId: number,
  raw: unknown,
  now = new Date()
) {
  const input = quotationChangeInput.parse(raw);
  quotationMonth(now);
  return commitAction(merchantId, actorId, "status", input, async c => {
    const [rows] = await c.execute<any[]>(
      "SELECT *,DATE_FORMAT(valid_until,'%Y-%m-%d') expiry FROM sales_quotations WHERE id=? AND merchant_id=? FOR UPDATE",
      [input.id, merchantId]
    );
    const q = rows[0];
    if (!q) throw new QuotationUnavailable();
    if (
      isGovernedQuotation(q) ||
      q.offer_version !== input.expectedRevision ||
      q.status !== input.expectedStatus
    )
      throw new QuotationConflict();
    if (q.status === input.status)
      return { recordId: q.id, revision: q.offer_version, changed: false };
    if (
      input.status === "accepted" &&
      (q.status === "expired" ||
        (q.expiry && q.expiry < now.toISOString().slice(0, 10)))
    )
      throw new QuotationConflict();
    await c.execute(
      "UPDATE sales_quotations SET status=?,offer_version=offer_version+1 WHERE id=? AND merchant_id=?",
      [input.status, input.id, merchantId]
    );
    // Targets are derived from current records; no additive counters to duplicate or drift.
    return { recordId: q.id, revision: q.offer_version + 1, changed: true };
  });
}
export async function changeQuotationTarget(
  merchantId: number,
  actorId: number,
  raw: unknown,
  now = new Date()
) {
  const input = quotationTargetInput.parse(raw),
    month = quotationMonth(now);
  return commitAction(merchantId, actorId, "target", input, async c => {
    if (input.period !== month.from.slice(0, 7)) throw new QuotationConflict();
    const [rows] = await c.execute<any[]>(
      "SELECT id,revision,target_amount FROM sales_targets WHERE merchant_id=? AND period_type='monthly' AND period_start=? FOR UPDATE",
      [merchantId, month.from.slice(0, 10)]
    );
    const prior = rows[0];
    if ((prior?.revision ?? null) !== input.expectedRevision)
      throw new QuotationConflict();
    if (prior && Number(prior.target_amount) === input.amount)
      return { recordId: prior.id, revision: prior.revision, changed: false };
    if (prior) {
      await c.execute(
        "UPDATE sales_targets SET target_amount=?,revision=revision+1 WHERE id=? AND merchant_id=?",
        [input.amount.toFixed(2), prior.id, merchantId]
      );
      return {
        recordId: prior.id,
        revision: prior.revision + 1,
        changed: true,
      };
    }
    const [insert] = await c.execute<any>(
      "INSERT INTO sales_targets (merchant_id,period_type,period_start,period_end,target_amount) VALUES (?,'monthly',?,?,?)",
      [merchantId, month.from.slice(0, 10), month.end, input.amount.toFixed(2)]
    );
    return { recordId: Number(insert.insertId), revision: 1, changed: true };
  });
}
export async function readQuotationReceipt(
  merchantId: number,
  raw: unknown
): Promise<QuotationReceipt | null> {
  validId(merchantId);
  const input = quotationReceiptInput.parse(raw);
  await schema();
  const pool = await getPool();
  if (!pool) throw Error("Quotations unavailable");
  const [rows] = await pool.execute<any[]>(
    "SELECT result FROM quotation_action_receipts WHERE merchant_id=? AND request_id=? LIMIT 1",
    [merchantId, input.requestId]
  );
  return rows[0]
    ? typeof rows[0].result === "string"
      ? JSON.parse(rows[0].result)
      : rows[0].result
    : null;
}
