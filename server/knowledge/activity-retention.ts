import { z } from "zod";
import { getPool } from "../db/connection";
import { assertRuntimeSchema } from "../db/schema-readiness";

const retentionScope = z.union([
  z.object({ merchantId: z.number().int().min(1).max(2147483647) }).strict(),
  z.object({ allMerchants: z.literal(true) }).strict(),
]);
type RetentionScope = z.infer<typeof retentionScope>;

/** Internal maintenance only. The existing 90-day policy must not run in a GET.
 * Explicit scope prevents a missing merchant ID from becoming a global purge.
 * One statement is atomic and bounded; the DB clock is the retention authority.
 * This table is a summary feed, not knowledge provenance or operation receipts.
 */
export async function purgeExpiredKnowledgeActivity(
  rawScope: RetentionScope,
  limit = 500
): Promise<number> {
  const scope = retentionScope.parse(rawScope);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw Error("Invalid activity retention batch");
  await assertRuntimeSchema("Sari activity retention", [{
    table: "sari_activity_log", columns: ["merchant_id", "created_at"],
  }]);
  const pool = await getPool();
  if (!pool) throw Error("Activity retention database unavailable");
  const scoped = "merchantId" in scope;
  const [result] = await pool.execute<any>(
    `DELETE FROM sari_activity_log WHERE ${scoped ? "merchant_id=? AND " : ""}
      created_at < TIMESTAMPADD(DAY,-90,UTC_TIMESTAMP())
      ORDER BY id LIMIT ${limit}`,
    scoped ? [scope.merchantId] : []
  );
  const affected = Number(result.affectedRows);
  if (!Number.isInteger(affected) || affected < 0 || affected > limit)
    throw Error("Invalid activity retention result");
  return affected;
}

let running = false;
/** Primary-worker scheduler; no overlapping batch in the same worker. */
export async function runKnowledgeActivityRetention(): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    return await purgeExpiredKnowledgeActivity({ allMerchants: true });
  } finally {
    running = false;
  }
}
