import { createHash } from "node:crypto";
import { and, eq, desc, sql, getTableColumns } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  knowledgeSections as sections,
  knowledgeChangelog as changes,
  knowledgeIntakeReceipts as receipts,
  sariActivityLog,
} from "../../drizzle/schema";
import { getDb } from "../db/connection";
import {
  withKnowledgeTransaction,
  type KnowledgeTransaction,
} from "./transaction";
import { knowledgePlanSchema } from "../../shared/knowledge-plan";
import { knowledgeSectionLinksSchema } from "../../shared/knowledge-section-links";
import {
  conflictDecisionInput,
  type ConflictReview,
  type ConflictText,
} from "../../shared/knowledge-conflicts";
const { embedding, embeddingContentHash, updatedAt, ...columns } =
  getTableColumns(sections);
type Row = Pick<typeof sections.$inferSelect, keyof typeof columns> & {
  expired: boolean;
};
const record = (r: Row): ConflictText => ({
  id: r.id,
  title: r.title,
  content: r.content,
  summary: r.summary,
  status: r.status,
  useInBot: !!r.useInBot,
  injectAs: r.injectAs,
  source: r.source,
  sourceUrl: r.sourceUrl,
});
const metadata = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
async function database() {
  const db = await getDb();
  if (!db) throw Error("Knowledge database unavailable");
  return db;
}
async function row(
  tx: KnowledgeTransaction,
  merchantId: number,
  id: number,
  lock: boolean
) {
  const query = tx
    .select({
      ...columns,
      expired:
        sql<boolean>`(${sections.validUntil} IS NOT NULL AND ${sections.validUntil} <= UTC_TIMESTAMP(3))`.mapWith(
          Boolean
        ),
    })
    .from(sections)
    .where(and(eq(sections.merchantId, merchantId), eq(sections.id, id)));
  return (await (lock ? query.for("update") : query))[0] as Row | undefined;
}
async function context(
  tx: KnowledgeTransaction,
  merchantId: number,
  id: number,
  lock = false
) {
  const proposed = await row(tx, merchantId, id, lock);
  if (!proposed || proposed.status !== "pending_review")
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Pending proposal unavailable",
    });
  const provenance = metadata(proposed.provenance);
  const receiptQuery = tx
    .select({
      documentId: receipts.documentId,
      review: receipts.reviewSnapshot,
      links: receipts.sectionLinks,
    })
    .from(receipts)
    .where(
      and(
        eq(receipts.merchantId, merchantId),
        eq(receipts.requestId, String(provenance.requestId))
      )
    );
  const receipt =
    typeof provenance.requestId === "string"
      ? (await (lock ? receiptQuery.for("update") : receiptQuery))[0]
      : undefined;
  const plan = knowledgePlanSchema.safeParse(receipt?.review?.plan),
    links = knowledgeSectionLinksSchema.safeParse(receipt?.links);
  const mapped = links.success
    ? links.data.items.filter(item => item.sectionId === proposed.id)
    : [];
  const item =
    plan.success && mapped.length === 1
      ? plan.data.items[mapped[0].planIndex]
      : undefined;
  const trustedSource =
    receipt &&
    receipt.documentId !== null &&
    receipt.documentId === provenance.documentId &&
    receipt.review?.id === provenance.reviewId &&
    plan.success &&
    links.success &&
    links.data.items.length === plan.data.items.length &&
    links.data.items.every((link, index) => link.planIndex === index);
  const trusted =
    trustedSource &&
    item?.action === "conflict" &&
    item.targetId &&
    item.targetId !== proposed.id;
  const current = trusted
    ? await row(tx, merchantId, item.targetId!, lock)
    : undefined;
  const parent = proposed.parentId
    ? await row(tx, merchantId, proposed.parentId, lock)
    : undefined;
  const logQuery = tx
    .select()
    .from(changes)
    .where(
      and(
        eq(changes.merchantId, merchantId),
        eq(changes.sectionId, id),
        eq(changes.action, "conflict"),
        eq(changes.resolved, 0)
      )
    )
    .orderBy(desc(changes.id));
  const log = await (lock ? logQuery.for("update") : logQuery);
  const link: ConflictReview["link"] = trusted
    ? current
      ? "verified"
      : "unavailable"
    : trustedSource && item?.action === "add" && item.targetId === null
      ? "unlinked"
      : typeof provenance.requestId === "string"
        ? "unavailable"
        : "unlinked";
  const usable = (r: Row) =>
    !r.expired &&
    ["fact", "behavior"].includes(r.injectAs || "") &&
    r.sectionType !== "opportunities";
  const parentReady =
    !proposed.parentId ||
    (!!parent &&
      ["approved", "auto_approved"].includes(parent.status || "") &&
      !!parent.useInBot &&
      usable(parent));
  const wouldDisableParent =
    link === "verified" && current?.id === proposed.parentId;
  const canApprove =
    provenance.origin !== "contextual_whatsapp_dialogue" &&
    link !== "unavailable" &&
    usable(proposed) &&
    parentReady &&
    !wouldDisableParent;
  // Full reviewed records, linkage and conflict evidence participate. Indexing alone does not.
  const revision = createHash("sha256")
    .update(
      JSON.stringify({
        proposed,
        current: current || null,
        parent: parent || null,
        receipt: receipt || null,
        log,
      })
    )
    .digest("hex");
  const view: ConflictReview = {
    section: record(proposed),
    current: current ? record(current) : null,
    parent: parent ? record(parent) : null,
    previousText: item?.before?.content || log[0]?.oldContent || null,
    reason: item?.reason || log[0]?.reason || null,
    link,
    canApprove,
    revision,
  };
  return { view, proposed, current };
}
export async function listConflictWorkspace(merchantId: number, page: number) {
  return (await database()).transaction(
    async tx => {
      const filter = and(
        eq(sections.merchantId, merchantId),
        eq(sections.status, "pending_review")
      );
      const [count] = await tx
        .select({ total: sql<number>`count(*)` })
        .from(sections)
        .where(filter);
      const total = Number(count.total),
        totalPages = Math.max(1, Math.ceil(total / 8)),
        currentPage = Math.min(page, totalPages);
      const items = await tx
        .select({
          id: sections.id,
          title: sections.title,
          source: sections.source,
        })
        .from(sections)
        .where(filter)
        .orderBy(desc(sections.id))
        .limit(8)
        .offset((currentPage - 1) * 8);
      return { items, total, page: currentPage, totalPages };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
export async function readConflictReview(
  merchantId: number,
  sectionId: number
) {
  return (await database()).transaction(
    async tx => (await context(tx, merchantId, sectionId)).view,
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
export async function decideKnowledgeConflict(
  merchantId: number,
  raw: unknown
) {
  const input = conflictDecisionInput.parse(raw);
  return withKnowledgeTransaction(merchantId, async tx => {
    const { view, proposed, current } = await context(
      tx,
      merchantId,
      input.sectionId,
      true
    );
    if (view.revision !== input.expectedRevision)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Reviewed knowledge changed",
      });
    if (input.action === "approve" && !view.canApprove)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Proposal cannot be enabled",
      });
    const replace =
      input.action === "approve" && view.link === "verified" && current;
    if (replace)
      await tx
        .update(sections)
        .set({ useInBot: 0, merchantEdited: 1 })
        .where(
          and(eq(sections.merchantId, merchantId), eq(sections.id, current.id))
        );
    const decision = {
      action: input.action,
      revision: view.revision,
      replacedSectionId: replace ? current.id : null,
    };
    await tx
      .update(sections)
      .set({
        status: "approved",
        useInBot: input.action === "approve" ? 1 : 0,
        merchantEdited: 1,
        provenance: {
          ...metadata(proposed.provenance),
          reviewDecision: decision,
        },
      })
      .where(
        and(eq(sections.merchantId, merchantId), eq(sections.id, proposed.id))
      );
    await tx
      .update(changes)
      .set({ resolved: 1 })
      .where(
        and(
          eq(changes.merchantId, merchantId),
          eq(changes.sectionId, proposed.id),
          eq(changes.action, "conflict"),
          eq(changes.resolved, 0)
        )
      );
    await tx.insert(sariActivityLog).values({
      merchantId,
      actionType: "conflict_reviewed",
      description:
        input.action === "approve"
          ? "اعتماد اقتراح معرفة بعد المراجعة"
          : "إغلاق اقتراح معرفة دون تفعيل",
      details: JSON.stringify({ sectionId: proposed.id, ...decision }),
    });
    return {
      success: true,
      action: input.action,
      replacedSectionId: replace ? current.id : null,
      indexing: "not_requested" as const,
    };
  });
}
