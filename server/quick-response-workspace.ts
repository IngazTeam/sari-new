import { createHash } from "node:crypto";
import { and, asc, eq, or } from "drizzle-orm";
import {
  abTestResults,
  merchants,
  quickResponses,
  type QuickResponse,
} from "../drizzle/schema";
import { getDb } from "./db/connection";
import {
  quickResponseDraft,
  quickResponseKeywords,
  type QuickResponseDraft,
} from "../shared/quick-response";
import { containsUnverifiedActionClaim } from "./ai/transactional-truth";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const quickResponseRevision = (row: QuickResponse) =>
  hash({ merchantId: row.merchantId, id: row.id, ...quickResponseDraft(row) });
export const quickResponseCollectionRevision = (
  merchantId: number,
  rows: QuickResponse[]
) =>
  hash({
    merchantId,
    rows: [...rows].sort((a, b) => a.id - b.id).map(quickResponseRevision),
  });
export class QuickResponseError extends Error {
  constructor(
    public code:
      | "CONFLICT"
      | "NOT_FOUND"
      | "PRECONDITION_FAILED"
      | "BAD_REQUEST",
    message: string
  ) {
    super(message);
    this.name = "QuickResponseError";
  }
}
export async function readQuickResponseWorkspace(merchantId: number) {
  const db = await getDb();
  if (!db) throw Error("Database unavailable");
  const rows = await db
    .select()
    .from(quickResponses)
    .where(eq(quickResponses.merchantId, merchantId))
    .orderBy(asc(quickResponses.id));
  return {
    merchantId,
    revision: quickResponseCollectionRevision(merchantId, rows),
    rows: rows.map(row => ({ ...row, revision: quickResponseRevision(row) })),
    total: rows.length,
    active: rows.filter(row => row.isActive).length,
    inactive: rows.filter(row => !row.isActive).length,
  };
}
type Change =
  | { kind: "create"; expectedRevision: string; draft: QuickResponseDraft }
  | {
      kind: "update";
      id: number;
      expectedRevision: string;
      patch: Partial<QuickResponseDraft>;
    }
  | { kind: "delete"; id: number; expectedRevision: string };
export async function writeQuickResponse(merchantId: number, change: Change) {
  const db = await getDb();
  if (!db) throw Error("Database unavailable");
  return db.transaction(async tx => {
    const [merchant] = await tx
      .select({ id: merchants.id })
      .from(merchants)
      .where(eq(merchants.id, merchantId))
      .for("update");
    if (!merchant)
      throw new QuickResponseError("NOT_FOUND", "Quick response unavailable");
    let existing: QuickResponse | undefined;
    if (change.kind === "create") {
      const rows = await tx
        .select()
        .from(quickResponses)
        .where(eq(quickResponses.merchantId, merchantId))
        .for("update");
      if (
        quickResponseCollectionRevision(merchantId, rows) !==
        change.expectedRevision
      )
        throw new QuickResponseError(
          "CONFLICT",
          "Quick responses changed; refresh and review"
        );
    } else {
      [existing] = await tx
        .select()
        .from(quickResponses)
        .where(
          and(
            eq(quickResponses.id, change.id),
            eq(quickResponses.merchantId, merchantId)
          )
        )
        .for("update");
      if (!existing)
        throw new QuickResponseError("NOT_FOUND", "Quick response unavailable");
      if (quickResponseRevision(existing) !== change.expectedRevision)
        throw new QuickResponseError(
          "CONFLICT",
          "Quick response changed; refresh and review"
        );
    }
    if (change.kind === "delete") {
      // The legacy FK cascades into experiments. Keep their history intact.
      const references = await tx
        .select({ id: abTestResults.id })
        .from(abTestResults)
        .where(
          or(
            eq(abTestResults.variantAId, change.id),
            eq(abTestResults.variantBId, change.id)
          )
        )
        .limit(1)
        .for("update");
      if (references.length)
        throw new QuickResponseError(
          "PRECONDITION_FAILED",
          "This response belongs to an experiment; deactivate it instead"
        );
      await tx
        .delete(quickResponses)
        .where(
          and(
            eq(quickResponses.id, change.id),
            eq(quickResponses.merchantId, merchantId)
          )
        );
      return { deleted: true as const };
    }
    const draft =
      change.kind === "create"
        ? change.draft
        : { ...quickResponseDraft(existing!), ...change.patch };
    // Legacy unsafe text can be disabled, but may not be reactivated.
    if (
      (draft.isActive ||
        change.kind === "create" ||
        change.patch.response !== undefined) &&
      containsUnverifiedActionClaim(draft.response)
    )
      throw new QuickResponseError(
        "BAD_REQUEST",
        "Response claims an unverified action"
      );
    const values = {
      ...draft,
      keywords: JSON.stringify(quickResponseKeywords(draft.keywords)),
      isActive: draft.isActive ? 1 : 0,
    };
    let id: number;
    if (change.kind === "create") {
      const [result] = await tx
        .insert(quickResponses)
        .values({ ...values, merchantId });
      id = Number(result.insertId);
    } else {
      id = change.id;
      await tx
        .update(quickResponses)
        .set(values)
        .where(
          and(
            eq(quickResponses.id, id),
            eq(quickResponses.merchantId, merchantId)
          )
        );
    }
    const [saved] = await tx
      .select()
      .from(quickResponses)
      .where(
        and(
          eq(quickResponses.id, id),
          eq(quickResponses.merchantId, merchantId)
        )
      );
    return { ...saved, revision: quickResponseRevision(saved) };
  });
}
