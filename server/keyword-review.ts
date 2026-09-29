import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { keywordAnalysis } from "../drizzle/schema";
import { getDb } from "./db/connection";
import { insightDate } from "../shared/insights-workspace";
import {
  keywordListInput,
  keywordStatusInput,
  keywordDeleteInput,
} from "../shared/keyword-review";
import type { z } from "zod";
type Keyword = typeof keywordAnalysis.$inferSelect;
export class KeywordReviewError extends Error {
  constructor(
    public code: "NOT_FOUND" | "CONFLICT",
    message: string
  ) {
    super(message);
    this.name = "KeywordReviewError";
  }
}
/** Includes observations: a new sample must invalidate an earlier deletion review. */
export function keywordRecordRevision(row: Keyword) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        row.merchantId,
        row.id,
        row.keyword,
        row.category,
        row.frequency,
        row.sampleMessages,
        row.suggestedResponse,
        row.status,
        row.firstSeenAt,
        row.lastSeenAt,
        row.reviewedAt,
        row.createdAt,
        row.updatedAt,
      ])
    )
    .digest("hex");
}
function present(row: Keyword) {
  return {
    ...row,
    revision: keywordRecordRevision(row),
    firstSeenAt: insightDate(row.firstSeenAt),
    lastSeenAt: insightDate(row.lastSeenAt),
    reviewedAt: insightDate(row.reviewedAt),
    createdAt: insightDate(row.createdAt),
    updatedAt: insightDate(row.updatedAt),
  };
}
const scope = (merchantId: number, id: number) =>
  and(eq(keywordAnalysis.merchantId, merchantId), eq(keywordAnalysis.id, id));
export async function readKeywordRecords(
  merchantId: number,
  input: z.infer<typeof keywordListInput>,
  onlySuggested = false
) {
  const db = await getDb();
  if (!db) throw Error("Database unavailable");
  const conditions = [eq(keywordAnalysis.merchantId, merchantId)];
  if (input.category)
    conditions.push(eq(keywordAnalysis.category, input.category));
  if (input.status) conditions.push(eq(keywordAnalysis.status, input.status));
  if (input.minFrequency !== undefined)
    conditions.push(gte(keywordAnalysis.frequency, input.minFrequency));
  if (onlySuggested)
    conditions.push(
      sql`trim(coalesce(${keywordAnalysis.suggestedResponse}, '')) <> ''`
    );
  const rows = await db
    .select()
    .from(keywordAnalysis)
    .where(and(...conditions))
    .orderBy(desc(keywordAnalysis.frequency), asc(keywordAnalysis.id))
    .limit(input.limit)
    .offset((input.page - 1) * input.limit);
  return rows.map(present);
}
export async function readKeywordRecord(merchantId: number, id: number) {
  const db = await getDb();
  if (!db) throw Error("Database unavailable");
  const [row] = await db
    .select()
    .from(keywordAnalysis)
    .where(scope(merchantId, id))
    .limit(1);
  if (!row) throw new KeywordReviewError("NOT_FOUND", "Keyword unavailable");
  return present(row);
}
export async function writeKeywordRecord(
  merchantId: number,
  change:
    | (z.infer<typeof keywordStatusInput> & { kind: "status" })
    | (z.infer<typeof keywordDeleteInput> & { kind: "delete" })
) {
  const db = await getDb();
  if (!db) throw Error("Database unavailable");
  return db.transaction(async tx => {
    const where = scope(merchantId, change.keywordId);
    const [row] = await tx
      .select()
      .from(keywordAnalysis)
      .where(where)
      .limit(1)
      .for("update");
    if (!row) throw new KeywordReviewError("NOT_FOUND", "Keyword unavailable");
    if (keywordRecordRevision(row) !== change.expectedRevision)
      throw new KeywordReviewError(
        "CONFLICT",
        "Keyword changed; refresh and review"
      );
    if (change.kind === "delete") {
      await tx.delete(keywordAnalysis).where(where);
      return { success: true as const, deleted: true as const };
    }
    // A record mark never creates a response; reopening clears the old review date.
    await tx
      .update(keywordAnalysis)
      .set({
        status: change.status,
        reviewedAt: change.status === "new" ? null : sql`UTC_TIMESTAMP()`,
        updatedAt: sql`UTC_TIMESTAMP()`,
      })
      .where(where);
    const [updated] = await tx
      .select()
      .from(keywordAnalysis)
      .where(where)
      .limit(1);
    return { success: true as const, row: present(updated) };
  });
}
