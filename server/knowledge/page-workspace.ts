import { createHash } from "node:crypto";
import { and, eq, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { z } from "zod";
import {
  discoveredPages as pages,
  extractedFaqs as faqs,
  knowledgeSections as sections,
  knowledgeChangelog,
  knowledgeIntakeReceipts,
  sariActivityLog,
} from "../../drizzle/schema";
import { getDb } from "../db/connection";
import {
  withKnowledgeTransaction,
  type KnowledgeTransaction,
} from "./transaction";
import { sectionDescendants } from "./source-lifecycle";
import { sectionState } from "../../shared/knowledge-sections";
import {
  pageListInput,
  pageChangeInput,
  pageState,
  type PageItem,
  type PageReview,
} from "../../shared/knowledge-pages";
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function database() {
  const db = await getDb();
  if (!db) throw Error("Knowledge database unavailable");
  return db;
}
const pageColumns = {
  id: pages.id,
  title: pages.title,
  url: pages.url,
  pageType: pages.pageType,
  isActive: pages.isActive,
  useInBot: pages.useInBot,
};
type PageRow = Pick<typeof pages.$inferSelect, keyof typeof pageColumns>;
function item(row: PageRow & { hasContent: boolean }): PageItem {
  return {
    id: row.id,
    title: row.title || row.url,
    url: row.url,
    pageType: row.pageType,
    state: pageState(row),
  };
}
export async function listPageWorkspace(
  merchantId: number,
  input: z.infer<typeof pageListInput>
) {
  return (await database()).transaction(
    async tx => {
      // Deliberately independent of website_analyses: saved pages can outlive their analysis.
      const rows = (
        await tx
          .select({
            ...pageColumns,
            hasContent:
              sql<boolean>`COALESCE(${pages.content}, '') REGEXP '[^[:space:]]'`.mapWith(
                Boolean
              ),
          })
          .from(pages)
          .where(eq(pages.merchantId, merchantId))
          .orderBy(pages.id)
      ).map(item);
      const search = input.search.toLocaleLowerCase();
      const matches = rows.filter(
        r =>
          (input.state === "all" || r.state === input.state) &&
          (!search ||
            `${r.title} ${r.url} ${r.id}`.toLocaleLowerCase().includes(search))
      );
      const totalPages = Math.max(1, Math.ceil(matches.length / 8)),
        page = Math.min(input.page, totalPages);
      return {
        items: matches.slice((page - 1) * 8, page * 8),
        total: matches.length,
        page,
        totalPages,
        saved: rows.length,
        enabled: rows.filter(r => r.state === "enabled").length,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
async function snapshot(
  tx: KnowledgeTransaction,
  merchantId: number,
  id: number,
  lock = false
) {
  const pq = tx
    .select({ ...pageColumns, content: pages.content })
    .from(pages)
    .where(and(eq(pages.merchantId, merchantId), eq(pages.id, id)));
  const [page] = await (lock ? pq.for("update") : pq);
  if (!page)
    throw new TRPCError({ code: "NOT_FOUND", message: "Page unavailable" });
  const dq = tx
    .select({ id: pages.id, url: pages.url })
    .from(pages)
    .where(and(eq(pages.merchantId, merchantId), eq(pages.url, page.url)))
    .orderBy(pages.id);
  const pageRows = await (lock ? dq.for("update") : dq);
  const treeQuery = tx
    .select({
      id: sections.id,
      parentId: sections.parentId,
      source: sections.source,
      sourceUrl: sections.sourceUrl,
    })
    .from(sections)
    .where(eq(sections.merchantId, merchantId))
    .orderBy(sections.id);
  const tree = await (lock ? treeQuery.for("update") : treeQuery);
  // Exact stored URL and website source only. Never infer ownership from fuzzy URL matching.
  const roots = tree
    .filter(r => r.source === "website" && r.sourceUrl === page.url)
    .map(r => r.id);
  const ids = sectionDescendants(tree, roots);
  const sq = tx
    .select({
      id: sections.id,
      parentId: sections.parentId,
      title: sections.title,
      content: sections.content,
      source: sections.source,
      sourceUrl: sections.sourceUrl,
      status: sections.status,
      useInBot: sections.useInBot,
      injectAs: sections.injectAs,
      validUntil: sections.validUntil,
      expired:
        sql<boolean>`(${sections.validUntil} IS NOT NULL AND ${sections.validUntil} <= UTC_TIMESTAMP(3))`.mapWith(
          Boolean
        ),
    })
    .from(sections)
    .where(
      and(
        eq(sections.merchantId, merchantId),
        inArray(sections.id, ids.length ? ids : [-1])
      )
    )
    .orderBy(sections.id);
  const linkedSections = ids.length ? await (lock ? sq.for("update") : sq) : [];
  const fq = tx
    .select({
      id: faqs.id,
      question: faqs.question,
      answer: faqs.answer,
      isActive: faqs.isActive,
      useInBot: faqs.useInBot,
      sourceStatus: faqs.sourceStatus,
    })
    .from(faqs)
    .where(and(eq(faqs.merchantId, merchantId), eq(faqs.pageId, id)))
    .orderBy(faqs.id);
  const linkedFaqs = await (lock ? fq.for("update") : fq);
  const duplicates = pageRows.filter(r => r.url === page.url).map(r => r.id);
  const result: PageReview = {
    page: {
      ...item({ ...page, hasContent: !!page.content?.trim() }),
      content: page.content || "",
    },
    revision: hash([page, linkedSections, linkedFaqs, duplicates]),
    duplicateCount: duplicates.length - 1,
    canEnable:
      !!page.isActive &&
      !!page.content?.trim() &&
      linkedSections.every(
        r =>
          !!r.content.trim() &&
          sectionState({ ...r, useInBot: true }) === "eligible"
      ) &&
      linkedFaqs.every(
        r =>
          !!r.isActive &&
          r.sourceStatus === "active" &&
          !!r.question.trim() &&
          !!r.answer.trim()
      ),
    sections: linkedSections.map(r => ({
      id: r.id,
      title: r.title,
      content: r.content,
      state: sectionState(r),
    })),
    faqs: linkedFaqs.map(r => ({
      id: r.id,
      question: r.question,
      answer: r.answer,
      enabled: !!r.isActive && !!r.useInBot && r.sourceStatus === "active",
    })),
  };
  return result;
}
export async function readPageWorkspace(merchantId: number, id: number) {
  return (await database()).transaction(tx => snapshot(tx, merchantId, id), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
}
export async function changePageWorkspace(merchantId: number, value: unknown) {
  const input = pageChangeInput.parse(value);
  return withKnowledgeTransaction(merchantId, async tx => {
    const [running] = await tx
      .select({ id: knowledgeIntakeReceipts.id })
      .from(knowledgeIntakeReceipts)
      .where(
        and(
          eq(knowledgeIntakeReceipts.merchantId, merchantId),
          eq(knowledgeIntakeReceipts.state, "processing")
        )
      )
      .limit(1);
    if (running)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Knowledge intake is running",
      });
    const reviewed = await snapshot(tx, merchantId, input.id, true);
    if (reviewed.revision !== input.expectedRevision)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Page review is stale",
      });
    if (reviewed.duplicateCount)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Duplicate page URL needs resolution",
      });
    if (input.action === "enable" && !reviewed.canEnable)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Linked knowledge is not eligible",
      });
    const ownPage = and(
      eq(pages.merchantId, merchantId),
      eq(pages.id, input.id)
    );
    const ownFaqs = and(
      eq(faqs.merchantId, merchantId),
      eq(faqs.pageId, input.id)
    );
    if (input.action === "delete") await tx.delete(faqs).where(ownFaqs);
    else
      await tx
        .update(faqs)
        .set({ useInBot: input.action === "enable" ? 1 : 0 })
        .where(ownFaqs);
    for (let i = 0; i < reviewed.sections.length; i += 500) {
      const ids = reviewed.sections.slice(i, i + 500).map(r => r.id);
      const ownSections = and(
        eq(sections.merchantId, merchantId),
        inArray(sections.id, ids)
      );
      if (input.action === "delete") {
        await tx
          .delete(knowledgeChangelog)
          .where(
            and(
              eq(knowledgeChangelog.merchantId, merchantId),
              inArray(knowledgeChangelog.sectionId, ids)
            )
          );
        await tx.delete(sections).where(ownSections);
      } else
        await tx
          .update(sections)
          .set({ useInBot: input.action === "enable" ? 1 : 0 })
          .where(ownSections);
    }
    if (input.action === "delete") await tx.delete(pages).where(ownPage);
    else
      await tx
        .update(pages)
        .set({ useInBot: input.action === "enable" ? 1 : 0 })
        .where(ownPage);
    await tx.insert(sariActivityLog).values({
      merchantId,
      actionType: `website_page_${input.action}`,
      description: `Page #${input.id}: ${input.action}`,
      details: JSON.stringify({
        pageId: input.id,
        sections: reviewed.sections.length,
        faqs: reviewed.faqs.length,
      }),
    });
    return { success: true as const, action: input.action };
  });
}
