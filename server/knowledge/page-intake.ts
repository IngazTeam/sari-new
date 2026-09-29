import { randomUUID, createHash } from "node:crypto";
import { and, eq, isNull, sql, getTableColumns } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  merchants,
  knowledgePagePreviews as previews,
  discoveredPages as pages,
  knowledgeSections as sections,
  knowledgeIntakeReceipts,
  sariActivityLog,
} from "../../drizzle/schema";
import { getDb } from "../db/connection";
import {
  withKnowledgeTransaction,
  type KnowledgeTransaction,
} from "./transaction";
import {
  pageSnapshotFields,
  pageClassification,
  pagePreviewSaveInput,
  type PageSnapshot,
  type PageIntakeRead,
  type PageIntakeReceipt,
  type PagePreview,
} from "../../shared/knowledge-page-intake";
const digest = (url: string, title: string, content: string) =>
  createHash("sha256")
    .update(JSON.stringify([url, title, content]))
    .digest("hex");
async function database() {
  const db = await getDb();
  if (!db) throw Error("Database unavailable");
  return db;
}
const own = (merchantId: number, id: string) =>
  and(eq(previews.merchantId, merchantId), eq(previews.previewId, id));
const expired = sql<boolean>`${previews.expiresAt} <= UTC_TIMESTAMP(3)`.mapWith(
  Boolean
);
type RecordRow = typeof previews.$inferSelect;
async function room(tx: KnowledgeTransaction, merchantId: number, url: string) {
  const rows = await tx
    .select({ id: pages.id, url: pages.url })
    .from(pages)
    .where(eq(pages.merchantId, merchantId));
  if (rows.length >= 50)
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "PAGE_LIMIT" });
  const linked = await tx
    .select({ id: sections.id, url: sections.sourceUrl })
    .from(sections)
    .where(
      and(
        eq(sections.merchantId, merchantId),
        eq(sections.source, "website"),
        eq(sections.sourceUrl, url)
      )
    );
  if (rows.some(r => r.url === url) || linked.some(r => r.url === url))
    throw new TRPCError({ code: "CONFLICT", message: "PAGE_EXISTS" });
}
function review(row: RecordRow): PagePreview {
  return {
    previewId: row.previewId,
    url: row.url,
    title: row.title,
    content: row.content!,
    analysis: row.analysis,
    expiresAt: row.expiresAt.replace(" ", "T") + "Z",
    wordCount: row.content!.trim().split(/\s+/).length,
  };
}
async function receipt(
  tx: KnowledgeTransaction,
  merchantId: number,
  row: RecordRow
): Promise<PageIntakeReceipt> {
  const [page] = await tx
    .select()
    .from(pages)
    .where(and(eq(pages.merchantId, merchantId), eq(pages.id, row.pageId!)));
  const [section] = await tx
    .select({
      id: sections.id,
      url: sections.sourceUrl,
      title: sections.title,
      content: sections.content,
      source: sections.source,
      parentId: sections.parentId,
      type: sections.sectionType,
      status: sections.status,
      useInBot: sections.useInBot,
      injectAs: sections.injectAs,
      validUntil: sections.validUntil,
    })
    .from(sections)
    .where(
      and(eq(sections.merchantId, merchantId), eq(sections.id, row.sectionId!))
    );
  const unchanged =
    page &&
    section &&
    digest(page.url, page.title || "", page.content || "") ===
      row.contentHash &&
    digest(section.url || "", section.title, section.content) ===
      row.contentHash &&
    page.isActive === 1 &&
    page.useInBot === 0 &&
    page.pageType === "other" &&
    section.source === "website" &&
    section.parentId === null &&
    section.type === "custom" &&
    section.status === "approved" &&
    section.useInBot === 0 &&
    section.injectAs === "fact" &&
    !section.validUntil;
  return {
    state: !page && !section ? "deleted" : unchanged ? "saved" : "changed",
    pageId: row.pageId!,
    sectionId: row.sectionId!,
  };
}
export async function storePagePreview(
  merchantId: number,
  raw: PageSnapshot
): Promise<PagePreview> {
  const fields = pageSnapshotFields.parse(raw),
    analysis =
      raw.analysis === null ? null : pageClassification.parse(raw.analysis);
  return (await database()).transaction(async tx => {
    const [merchant] = await tx
      .select({ id: merchants.id })
      .from(merchants)
      .where(eq(merchants.id, merchantId))
      .for("update");
    if (!merchant)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Merchant unavailable",
      });
    await tx
      .delete(previews)
      .where(
        and(
          eq(previews.merchantId, merchantId),
          isNull(previews.pageId),
          expired
        )
      );
    await room(tx, merchantId, fields.url);
    const pending = await tx
      .select({ id: previews.id })
      .from(previews)
      .where(and(eq(previews.merchantId, merchantId), isNull(previews.pageId)));
    if (pending.length >= 5)
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "PREVIEW_LIMIT",
      });
    const previewId = randomUUID();
    await tx
      .insert(previews)
      .values({
        merchantId,
        previewId,
        ...fields,
        analysis,
        contentHash: digest(fields.url, fields.title, fields.content),
        expiresAt: sql`DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 30 MINUTE)`,
      });
    const [row] = await tx
      .select()
      .from(previews)
      .where(own(merchantId, previewId));
    return review(row);
  });
}
export async function readPageIntake(
  merchantId: number,
  previewId: string
): Promise<PageIntakeRead> {
  return (await database()).transaction(
    async tx => {
      const [row] = await tx
        .select({ ...getTableColumns(previews), expired })
        .from(previews)
        .where(own(merchantId, previewId));
      if (!row) return { state: "not_found" };
      const record = row as unknown as RecordRow & { expired: boolean };
      if (record.pageId && record.sectionId)
        return receipt(tx, merchantId, record);
      if (record.expired || !record.content) return { state: "expired" };
      return { state: "review", preview: review(record) };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
export async function savePagePreview(merchantId: number, raw: unknown) {
  const input = pagePreviewSaveInput.parse(raw);
  return withKnowledgeTransaction(merchantId, async tx => {
    const [row] = await tx
      .select()
      .from(previews)
      .where(own(merchantId, input.previewId))
      .for("update");
    if (!row)
      throw new TRPCError({ code: "NOT_FOUND", message: "PREVIEW_MISSING" });
    if (row.pageId && row.sectionId)
      return { ...(await receipt(tx, merchantId, row)), replayed: true };
    const [fresh] = await tx
      .select({ expired })
      .from(previews)
      .where(own(merchantId, input.previewId));
    if (fresh.expired || !row.content)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "PREVIEW_EXPIRED",
      });
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
      throw new TRPCError({ code: "CONFLICT", message: "INTAKE_RUNNING" });
    await room(tx, merchantId, row.url);
    const [page] = await tx
      .insert(pages)
      .values({
        merchantId,
        pageType: "other",
        title: row.title,
        url: row.url,
        content: row.content,
        isActive: 1,
        useInBot: 0,
      });
    const [section] = await tx
      .insert(sections)
      .values({
        merchantId,
        sectionType: "custom",
        title: row.title,
        content: row.content,
        source: "website",
        sourceUrl: row.url,
        status: "approved",
        injectAs: "fact",
        useInBot: 0,
        provenance: { pagePreviewId: input.previewId },
      });
    await tx
      .update(previews)
      .set({
        pageId: page.insertId,
        sectionId: section.insertId,
        content: null,
        analysis: null,
      })
      .where(own(merchantId, input.previewId));
    await tx
      .insert(sariActivityLog)
      .values({
        merchantId,
        actionType: "website_page_created",
        description: "Website page and section saved paused after review",
        details: JSON.stringify({
          pageId: page.insertId,
          sectionId: section.insertId,
          previewId: input.previewId,
        }),
      });
    return {
      state: "saved" as const,
      pageId: page.insertId,
      sectionId: section.insertId,
      replayed: false,
    };
  });
}
