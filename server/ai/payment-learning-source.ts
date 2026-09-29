import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";

const metadataSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: z.literal("tap"),
    paymentId: z.number().int().positive().safe(),
    outcome: z.enum(["purchase_completed", "purchase_refunded"]),
    attribution: z.literal("verified_payment_only"),
  })
  .strict();
const decode = (v: any): any => (typeof v === "string" ? JSON.parse(v) : v);
const from = `FROM ai_purchase_outcomes e JOIN order_payments p ON p.id=e.payment_id AND p.merchant_id=e.merchant_id
  JOIN customer_profiles f ON f.id=e.profile_id AND f.merchant_id=e.merchant_id
  LEFT JOIN orders o ON o.id=p.order_id AND o.merchantId=p.merchant_id
  LEFT JOIN bookings b ON b.id=p.booking_id AND b.merchant_id=p.merchant_id`;
const eligible = `e.schema_version=1 AND ((p.order_id IS NOT NULL AND p.booking_id IS NULL AND o.id IS NOT NULL)
    OR (p.order_id IS NULL AND p.booking_id IS NOT NULL AND b.id IS NOT NULL))
  AND p.customer_phone=COALESCE(o.customerPhone,b.customer_phone) AND f.customer_phone=p.customer_phone
  AND p.tap_charge_id IS NOT NULL AND TRIM(p.tap_charge_id)<>''
  AND p.amount>=0 AND REGEXP_LIKE(p.currency,'^[A-Z]{3}$','c')
  AND ((p.status='captured' AND e.outcome_type='purchase_completed') OR (p.status='refunded' AND e.outcome_type='purchase_refunded'))`;

/** Financial counts include un-attributed payments, but never invent a customer
 * or learn a sales strategy from an invalid/missing canonical owner. */
export async function readVerifiedTapOutcomeCounts(
  c: Pick<PoolConnection, "execute">,
  merchantId: number
) {
  const [rows] = await c.execute<any[]>(
    `SELECT
    COUNT(DISTINCT CASE WHEN e.outcome_type='purchase_completed' THEN p.id END) AS purchases,
    COUNT(DISTINCT CASE WHEN e.outcome_type='purchase_refunded' THEN p.id END) AS refunds
    ${from} WHERE e.merchant_id=? AND ${eligible}`,
    [merchantId]
  );
  return rows[0];
}

/** Filter financial learning only; unrelated families are checked by their own readers.
 * The caller owns the read snapshot/transaction and any enclosing source locks. */
export async function verifiedTapLearningSources<T extends Record<string, any>>(
  c: Pick<PoolConnection, "execute">,
  merchantId: number,
  rows: T[],
  lock = false
): Promise<T[]> {
  if (
    !Number.isSafeInteger(merchantId) ||
    merchantId <= 0 ||
    rows.length > 2000
  )
    throw Error("Invalid payment evidence scope");
  const accepted = new Set<T>(),
    candidates: Array<{ row: T; metadata: z.infer<typeof metadataSchema> }> =
      [];
  for (const row of rows) {
    let metadata: any;
    try {
      metadata = decode(row.context_summary);
    } catch {
      /* A malformed financial source stays quarantined. */
    }
    if (
      !String(row.source_key || "").startsWith("tap:") &&
      metadata?.source !== "tap" &&
      !["purchase_completed", "purchase_refunded"].includes(row.signal_type)
    ) {
      accepted.add(row);
      continue;
    }
    try {
      const m = metadataSchema.parse(metadata);
      if (
        row.merchant_id !== merchantId ||
        row.signal_type !== m.outcome ||
        row.source_key !== `tap:${m.paymentId}:${m.outcome}` ||
        Number(row.signal_weight) !== 1 ||
        row.customer_message !== null ||
        row.bot_message !== null ||
        row.merchant_correction !== null
      )
        continue;
      candidates.push({ row, metadata: m });
    } catch {
      /* A copied or legacy signal without its canonical receipt is not payment evidence. */
    }
  }
  const ids = Array.from(new Set(candidates.map(c => c.metadata.paymentId)));
  for (let at = 0; at < ids.length; at += 200) {
    const batch = ids.slice(at, at + 200);
    const [outcomes] = await c.execute<any[]>(
      `SELECT e.payment_id,e.outcome_type,e.conversation_id
      ${from} JOIN conversations v ON v.id=e.conversation_id AND v.merchantId=e.merchant_id AND v.customerPhone=p.customer_phone
      WHERE e.merchant_id=? AND e.payment_id IN (${batch.map(() => "?").join(",")}) AND ${eligible}
      ${lock ? "FOR SHARE" : ""}`,
      [merchantId, ...batch]
    );
    for (const { row, metadata } of candidates)
      if (
        outcomes.some(
          e =>
            e.payment_id === metadata.paymentId &&
            e.outcome_type === metadata.outcome &&
            e.conversation_id === row.conversation_id
        )
      )
        accepted.add(row);
  }
  return rows.filter(row => accepted.has(row));
}
