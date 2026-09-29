import type { PoolConnection } from "mysql2/promise";
import { z } from "zod";
import { verifiedContextualLearningSources } from "./contextual-learning-source";
import type { TopObjection } from "./sales-conductor";

const windowMs = 30 * 86400_000;
export const objectionEvidenceLimit = 2000;
const windowSchema = z
  .object({
    schemaVersion: z.literal(2),
    measurement: z.literal("verified_interpreted_objections"),
    windowDays: z.literal(30),
    windowFrom: z.string().datetime(),
    windowUntil: z.string().datetime(),
    maxSignalId: z.number().int().nonnegative().safe(),
  })
  .strict()
  .refine(
    w => Date.parse(w.windowUntil) - Date.parse(w.windowFrom) === windowMs,
    "Invalid observation window"
  );
export type ObjectionEvidenceWindow = z.infer<typeof windowSchema>;
type Connection = Pick<PoolConnection, "execute">;

/** Persist the selection boundary, never customer excerpts or unverified materialized counts. */
export async function prepareObjectionWindow(
  c: Connection,
  merchantId: number
): Promise<ObjectionEvidenceWindow> {
  z.number().int().positive().safe().parse(merchantId);
  const [[clock]] = await c.execute<any[]>(
    "SELECT DATE_FORMAT(UTC_TIMESTAMP(3),'%Y-%m-%dT%H:%i:%s.%fZ') AS observed_at"
  );
  const end = new Date(clock.observed_at);
  const [[latest]] = await c.execute<any[]>(
    "SELECT COALESCE(MAX(id),0) AS latest FROM sari_learning_signals WHERE merchant_id=?",
    [merchantId]
  );
  return windowSchema.parse({
    schemaVersion: 2,
    measurement: "verified_interpreted_objections",
    windowDays: 30,
    windowFrom: new Date(end.getTime() - windowMs).toISOString(),
    windowUntil: end.toISOString(),
    maxSignalId: Number(latest.latest),
  });
}

export function parseObjectionWindow(
  value: unknown,
  updatedAt: unknown
): ObjectionEvidenceWindow | null {
  try {
    const parsed = windowSchema.parse(
      typeof value === "string" ? JSON.parse(value) : value
    );
    const updated = new Date(updatedAt as string | Date).getTime();
    if (!Number.isFinite(updated) || Date.parse(parsed.windowUntil) > updated)
      return null;
    return parsed;
  } catch {
    return null;
  }
}

/** The caller supplies one consistent read transaction for the manifest, signals and original messages. */
export async function readVerifiedObjections(
  c: Connection,
  merchantId: number,
  value: ObjectionEvidenceWindow
): Promise<TopObjection[]> {
  z.number().int().positive().safe().parse(merchantId);
  const window = windowSchema.parse(value);
  const [rows] = await c.execute<any[]>(
    `SELECT s.* FROM sari_learning_signals s
    JOIN conversations v ON v.id=s.conversation_id AND v.merchantId=s.merchant_id
    WHERE s.merchant_id=? AND s.id<=? AND s.created_at>=? AND s.created_at<=?
      AND s.signal_type IN ('price_objection','sales_objection')
      AND BINARY LEFT(s.source_key,20)=BINARY 'contextual_learning:'
    ORDER BY s.id LIMIT ${objectionEvidenceLimit + 1}`,
    [
      merchantId,
      window.maxSignalId,
      new Date(window.windowFrom),
      new Date(window.windowUntil),
    ]
  );
  if (rows.length > objectionEvidenceLimit)
    throw Error("Objection evidence capacity exceeded");
  const contextual = rows.filter(
    row =>
      String(row.source_key || "").startsWith("contextual_learning:") &&
      ["price_objection", "sales_objection"].includes(row.signal_type)
  );
  const verified = await verifiedContextualLearningSources(
    c,
    merchantId,
    contextual
  );
  const groups = new Map<
    string,
    { frequency: number; conversations: Set<number> }
  >();
  for (const row of verified) {
    const group = groups.get(row.signal_type) || {
      frequency: 0,
      conversations: new Set<number>(),
    };
    group.frequency++;
    group.conversations.add(row.conversation_id);
    groups.set(row.signal_type, group);
  }
  return Array.from(groups, ([objection, group]) => ({
    objection,
    frequency: group.frequency,
    independentConversations: group.conversations.size,
    bestStrategy: null,
    winRate: null,
  })).sort(
    (a, b) =>
      b.frequency - a.frequency || a.objection.localeCompare(b.objection)
  );
}
