import { createHash } from "node:crypto";
import { and, eq, sql, getTableColumns, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  knowledgeSections as table,
  knowledgeChangelog,
  sariActivityLog,
  knowledgeSectionCreations as creations,
} from "../../drizzle/schema";
import { getDb } from "../db/connection";
import { databaseTimeEpoch } from "../db/time";
import {
  withKnowledgeTransaction,
  type KnowledgeTransaction,
} from "./transaction";
import { sectionDescendants } from "./source-lifecycle";
import {
  isSourcedTeaching,
  manualTeachingReviewHash,
} from "./teaching-manual-review";
import {
  sectionCreateInput,
  sectionUpdateInput,
  sectionDeleteInput,
  sectionListInput,
  sectionState,
  summarizeSectionReadiness,
  type SectionReview,
  type SectionListItem,
  type SectionCreationReceipt,
} from "../../shared/knowledge-sections";
import type { z } from "zod";
import { readVerifiedBotSectionsInTransaction } from "./teaching-read";
const { embedding, embeddingContentHash, updatedAt, ...columns } =
  getTableColumns(table);
type Row = Pick<typeof table.$inferSelect, keyof typeof columns> & {
  expired: boolean;
};
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const provenance = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const revision = (row: Row) => hash(row);
function creationState(
  row: Row | undefined,
  requestId: string,
  inputHash: string
): "saved" | "changed" | "deleted" {
  if (!row) return "deleted";
  const payload = {
    title: row.title,
    content: row.content,
    useInBot: !!row.useInBot,
    sectionType: row.sectionType,
    parentId: row.parentId,
    requestId,
    acknowledged: true,
  };
  return hash(payload) === inputHash &&
    row.status === "approved" &&
    row.injectAs === "fact"
    ? "saved"
    : "changed";
}
const expired =
  sql<boolean>`(${table.validUntil} IS NOT NULL AND ${table.validUntil} <= UTC_TIMESTAMP(3))`.mapWith(
    Boolean
  );
const metadata = {
  id: table.id,
  parentId: table.parentId,
  sectionType: table.sectionType,
  title: table.title,
  source: table.source,
  status: table.status,
  useInBot: table.useInBot,
  injectAs: table.injectAs,
  expired,
};
const item = (
  row: Omit<SectionListItem, "state" | "useInBot"> & { useInBot: number | null }
): SectionListItem => ({
  id: row.id,
  parentId: row.parentId,
  sectionType: row.sectionType,
  title: row.title,
  source: row.source,
  status: row.status,
  useInBot: !!row.useInBot,
  injectAs: row.injectAs,
  expired: row.expired,
  state: sectionState(row),
});
async function resolveEligibility(
  tx: KnowledgeTransaction,
  merchantId: number,
  items: SectionListItem[],
  sectionIds?: number[]
): Promise<SectionListItem[]> {
  if (!items.some(r => r.state === "eligible")) return items;
  const verified = new Set(
    (
      await readVerifiedBotSectionsInTransaction(
        tx,
        merchantId,
        false,
        sectionIds
      )
    ).map(r => r.id)
  );
  return items.map(r =>
    r.state === "eligible" && !verified.has(r.id)
      ? { ...r, state: "unverified" }
      : r
  );
}
async function database() {
  const db = await getDb();
  if (!db) throw Error("Knowledge database unavailable");
  return db;
}
async function records(
  tx: KnowledgeTransaction,
  merchantId: number,
  id: number,
  lock = false
) {
  const treeQuery = tx
    .select({ id: table.id, parentId: table.parentId })
    .from(table)
    .where(eq(table.merchantId, merchantId));
  const tree = await (lock ? treeQuery.for("update") : treeQuery);
  const root = tree.find(r => r.id === id);
  if (!root)
    throw new TRPCError({ code: "NOT_FOUND", message: "Section unavailable" });
  const ids = sectionDescendants(tree, [id]);
  if (root.parentId && tree.some(r => r.id === root.parentId))
    ids.push(root.parentId);
  const query = tx
    .select({ ...columns, expired })
    .from(table)
    .where(and(eq(table.merchantId, merchantId), inArray(table.id, ids)))
    .orderBy(table.id);
  return (await (lock ? query.for("update") : query)) as Row[];
}
function review(rows: Row[], id: number): SectionReview {
  const row = rows.find(r => r.id === id);
  if (!row)
    throw new TRPCError({ code: "NOT_FOUND", message: "Section unavailable" });
  const descendantIds = new Set(sectionDescendants(rows, [id]));
  const tree = rows.filter(r => descendantIds.has(r.id));
  const parent = rows.find(r => r.id === row.parentId);
  return {
    section: {
      ...item(row),
      content: row.content,
      summary: row.summary,
      sourceUrl: row.sourceUrl,
      replacesTeachingSource: isSourcedTeaching(
        provenance(row.provenance),
        row.sourceUrl
      ),
      validUntil: row.validUntil
        ? new Date(databaseTimeEpoch(row.validUntil)).toISOString()
        : null,
    },
    revision: revision(row),
    deleteRevision: hash(tree),
    parent: parent ? { id: parent.id, title: parent.title } : null,
    descendants: tree
      .filter(r => r.id !== id)
      .map(r => ({ id: r.id, title: r.title })),
  };
}
export async function listSectionWorkspace(
  merchantId: number,
  input: z.infer<typeof sectionListInput>
) {
  return (await database()).transaction(
    async tx => {
      const rows = await resolveEligibility(
        tx,
        merchantId,
        (
          await tx
            .select(metadata)
            .from(table)
            .where(eq(table.merchantId, merchantId))
            .orderBy(table.id)
        ).map(item)
      );
      const search = input.search.toLocaleLowerCase();
      const matches = rows.filter(
        r =>
          (input.type === "all" || r.sectionType === input.type) &&
          (input.state === "all" || r.state === input.state) &&
          (!search ||
            r.title.toLocaleLowerCase().includes(search) ||
            String(r.id) === search)
      );
      const total = matches.length,
        totalPages = Math.max(1, Math.ceil(total / 8)),
        page = Math.min(input.page, totalPages);
      return {
        items: matches.slice((page - 1) * 8, page * 8),
        total,
        page,
        totalPages,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
export async function sectionReadiness(merchantId: number) {
  return (await database()).transaction(
    async tx => {
      const rows = await tx
        .select(metadata)
        .from(table)
        .where(eq(table.merchantId, merchantId));
      return summarizeSectionReadiness(
        await resolveEligibility(tx, merchantId, rows.map(item))
      );
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
export async function readSectionWorkspace(merchantId: number, id: number) {
  return (await database()).transaction(
    async tx => {
      const result = review(await records(tx, merchantId, id), id);
      const [resolved] = await resolveEligibility(
        tx,
        merchantId,
        [result.section],
        [id]
      );
      result.section.state = resolved.state;
      return result;
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
async function audit(
  tx: KnowledgeTransaction,
  merchantId: number,
  id: number,
  action: "add" | "manual_edit" | "delete",
  before: string | null,
  after: string | null,
  details: unknown
) {
  const contentHash = Object(details)?.contentHash;
  const [change] = await tx.insert(knowledgeChangelog).values({
    merchantId,
    sectionId: action === "delete" ? null : id,
    action,
    oldContent: before,
    newContent: after,
    source: "manual",
    reason:
      "مراجعة يدوية من مساحة أقسام المعرفة" +
      (typeof contentHash === "string" && /^[a-f0-9]{64}$/.test(contentHash)
        ? `\nSHA256:${contentHash}`
        : ""),
  });
  await tx.insert(sariActivityLog).values({
    merchantId,
    actionType:
      action === "add"
        ? "section_created"
        : action === "delete"
          ? "section_deleted"
          : "section_updated",
    description: "تحديث أقسام المعرفة بعد المراجعة",
    details: JSON.stringify({ sectionId: id, ...Object(details) }),
  });
  return Number(change.insertId);
}
export async function createWorkspaceSection(merchantId: number, raw: unknown) {
  const input = sectionCreateInput.parse(raw),
    inputHash = hash(input);
  return withKnowledgeTransaction(merchantId, async tx => {
    const [receipt] = await tx
      .select()
      .from(creations)
      .where(
        and(
          eq(creations.merchantId, merchantId),
          eq(creations.requestId, input.requestId)
        )
      )
      .for("update");
    if (receipt) {
      if (receipt.inputHash !== inputHash)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Manual request changed",
        });
      const [row] = await tx
        .select({ ...columns, expired })
        .from(table)
        .where(
          and(eq(table.merchantId, merchantId), eq(table.id, receipt.sectionId))
        )
        .for("update");
      return {
        success: true,
        id: receipt.sectionId,
        replayed: true,
        state: creationState(
          row as Row | undefined,
          input.requestId,
          inputHash
        ),
      };
    }
    const [prior] = await tx
      .select({ ...columns, expired })
      .from(table)
      .where(
        and(
          eq(table.merchantId, merchantId),
          sql`JSON_UNQUOTE(JSON_EXTRACT(${table.provenance}, '$.manualRequestId')) = ${input.requestId}`
        )
      )
      .for("update");
    if (prior) {
      if (provenance(prior.provenance).manualInputHash !== inputHash)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Manual request changed",
        });
      await tx.insert(creations).values({
        merchantId,
        requestId: input.requestId,
        inputHash,
        sectionId: prior.id,
      });
      return {
        success: true,
        id: prior.id,
        replayed: true,
        state: creationState(prior as Row, input.requestId, inputHash),
      };
    }
    if (input.parentId !== null) {
      const [parent] = await tx
        .select({ id: table.id })
        .from(table)
        .where(
          and(eq(table.merchantId, merchantId), eq(table.id, input.parentId))
        )
        .for("update");
      if (!parent)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Parent unavailable",
        });
    }
    const [created] = await tx.insert(table).values({
      merchantId,
      parentId: input.parentId,
      sectionType: input.sectionType,
      title: input.title,
      content: input.content,
      source: "manual",
      status: "approved",
      useInBot: input.useInBot ? 1 : 0,
      injectAs: "fact",
      merchantEdited: 1,
      provenance: {
        manualRequestId: input.requestId,
        manualInputHash: inputHash,
      },
    });
    await audit(tx, merchantId, created.insertId, "add", null, input.content, {
      useInBot: input.useInBot,
    });
    await tx.insert(creations).values({
      merchantId,
      requestId: input.requestId,
      inputHash,
      sectionId: created.insertId,
    });
    return {
      success: true,
      id: created.insertId,
      replayed: false,
      state: "saved" as const,
    };
  });
}
export async function readSectionCreation(
  merchantId: number,
  requestId: string
): Promise<SectionCreationReceipt> {
  return (await database()).transaction(
    async tx => {
      const [receipt] = await tx
        .select()
        .from(creations)
        .where(
          and(
            eq(creations.merchantId, merchantId),
            eq(creations.requestId, requestId)
          )
        );
      if (!receipt) return { state: "not_found" };
      const [row] = await tx
        .select({ ...columns, expired })
        .from(table)
        .where(
          and(eq(table.merchantId, merchantId), eq(table.id, receipt.sectionId))
        );
      return {
        state: creationState(
          row as Row | undefined,
          requestId,
          receipt.inputHash
        ),
        id: receipt.sectionId,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
export async function changeWorkspaceSection(
  merchantId: number,
  raw: unknown,
  remove = false
) {
  const input = remove
    ? sectionDeleteInput.parse(raw)
    : sectionUpdateInput.parse(raw);
  return withKnowledgeTransaction(merchantId, async tx => {
    const rows = await records(tx, merchantId, input.id, true),
      current = review(rows, input.id);
    if (
      input.expectedRevision !==
      (remove ? current.deleteRevision : current.revision)
    )
      throw new TRPCError({
        code: "CONFLICT",
        message: "Reviewed section changed",
      });
    if (remove) {
      const ids = [input.id, ...current.descendants.map(r => r.id)];
      // A review includes every descendant, regardless of depth; tenant predicates are always retained.
      await tx
        .delete(knowledgeChangelog)
        .where(
          and(
            eq(knowledgeChangelog.merchantId, merchantId),
            inArray(knowledgeChangelog.sectionId, ids)
          )
        );
      await tx
        .delete(table)
        .where(and(eq(table.merchantId, merchantId), inArray(table.id, ids)));
      await audit(
        tx,
        merchantId,
        input.id,
        "delete",
        current.section.content,
        null,
        { deletedIds: ids }
      );
      return { success: true, id: input.id };
    }
    const patch = sectionUpdateInput.parse(raw),
      old = rows.find(r => r.id === input.id)!;
    if (old.status === "pending_review")
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Review the pending proposal first",
      });
    if (patch.useInBot && sectionState({ ...old, useInBot: 1 }) !== "eligible")
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Section cannot be enabled",
      });
    await tx
      .update(table)
      .set({
        title: patch.title,
        content: patch.content,
        useInBot: patch.useInBot ? 1 : 0,
        merchantEdited: 1,
        ...(old.title !== patch.title || old.content !== patch.content
          ? { summary: null, embedding: null, embeddingContentHash: null }
          : {}),
      })
      .where(and(eq(table.merchantId, merchantId), eq(table.id, input.id)));
    const teaching = isSourcedTeaching(
      provenance(old.provenance),
      old.sourceUrl
    );
    const manualHash = teaching
      ? manualTeachingReviewHash({
          merchantId,
          id: input.id,
          title: patch.title,
          content: patch.content,
          useInBot: patch.useInBot,
          summary:
            old.title !== patch.title || old.content !== patch.content
              ? null
              : old.summary,
        })
      : null;
    const changeId = await audit(
      tx,
      merchantId,
      input.id,
      "manual_edit",
      old.content,
      patch.content,
      {
        useInBot: patch.useInBot,
        previousRevision: input.expectedRevision,
        ...(manualHash ? { contentHash: manualHash } : {}),
      }
    );
    if (manualHash)
      await tx
        .update(table)
        .set({
          provenance: {
            ...provenance(old.provenance),
            manualReview: { version: 1, changeId, contentHash: manualHash },
          },
        })
        .where(and(eq(table.merchantId, merchantId), eq(table.id, input.id)));
    return { success: true, id: input.id };
  });
}
