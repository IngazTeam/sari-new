import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { websiteImportReviews as reviews } from "../../drizzle/website-import-schema";
import {
  merchants,
  products,
  productVariants,
  discoveredPages,
  extractedFaqs,
  knowledgeSections,
  sariActivityLog,
} from "../../drizzle/schema";
import { getDb } from "../db/connection";
import {
  withKnowledgeTransaction,
  type KnowledgeTransaction,
} from "./transaction";
import { sectionDescendants } from "./source-lifecycle";
import {
  applyAnalysisSnapshotInTransaction,
  storedUrl,
} from "../catalog/analysis-snapshot";
import {
  analysisSnapshotSchema,
  importApplyInput,
  type ImportSnapshot,
  type ImportBasis,
  type ImportRead,
  type ImportReview,
  type ImportChoices,
  type ImportReceipt,
} from "../../shared/website-import";

// MySQL JSON may reorder properties. Canonical hashes also survive Date JSON serialization.
const hash = (value: unknown) =>
  createHash("sha256")
    .update(
      JSON.stringify(value, (_key, item) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? Object.fromEntries(
              Object.keys(item)
                .sort()
                .map(key => [key, item[key]])
            )
          : item
      )
    )
    .digest("hex");
const scope = (merchantId: number, previewId: string) =>
  and(eq(reviews.merchantId, merchantId), eq(reviews.previewId, previewId));
const expired = sql<boolean>`${reviews.expiresAt} <= UTC_TIMESTAMP(3)`.mapWith(
  Boolean
);
async function database() {
  const db = await getDb();
  if (!db) throw Error("Database unavailable");
  return db;
}
function bounded(value: unknown) {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > 2_000_000)
    throw new TRPCError({
      code: "PAYLOAD_TOO_LARGE",
      message: "IMPORT_REVIEW_TOO_LARGE",
    });
}
async function basis(
  tx: KnowledgeTransaction,
  merchantId: number,
  lock = false
): Promise<ImportBasis> {
  const run = async <T extends { for: (mode: "update") => unknown }>(q: T) =>
    (await (lock ? q.for("update") : q)) as Record<string, unknown>[];
  const [merchant] = await run(
    tx
      .select({
        phone: merchants.phone,
        address: merchants.address,
        websiteUrl: merchants.websiteUrl,
        platformType: merchants.platformType,
        analysisStatus: merchants.analysisStatus,
      })
      .from(merchants)
      .where(eq(merchants.id, merchantId))
  );
  if (!merchant) throw new TRPCError({ code: "NOT_FOUND" });
  return {
    merchant,
    products: await run(
      tx
        .select()
        .from(products)
        .where(eq(products.merchantId, merchantId))
        .orderBy(products.id)
    ),
    variants: await run(
      tx
        .select()
        .from(productVariants)
        .where(eq(productVariants.merchantId, merchantId))
        .orderBy(productVariants.id)
    ),
    pages: await run(
      tx
        .select()
        .from(discoveredPages)
        .where(eq(discoveredPages.merchantId, merchantId))
        .orderBy(discoveredPages.id)
    ),
    faqs: await run(
      tx
        .select()
        .from(extractedFaqs)
        .where(eq(extractedFaqs.merchantId, merchantId))
        .orderBy(extractedFaqs.id)
    ),
    sections: await run(
      tx
        .select()
        .from(knowledgeSections)
        .where(eq(knowledgeSections.merchantId, merchantId))
        .orderBy(knowledgeSections.id)
    ),
  };
}
type Row = typeof reviews.$inferSelect;
function review(row: Row): ImportReview {
  return {
    previewId: row.previewId,
    revision: hash([row.previewId, row.proposal, row.basisHash]),
    expiresAt: row.expiresAt.replace(" ", "T") + "Z",
    proposal: row.proposal,
    current: row.basis,
    warnings: row.warnings,
  };
}
async function read(
  tx: KnowledgeTransaction,
  merchantId: number,
  previewId: string
): Promise<ImportRead> {
  const [row] = await tx
    .select({ row: reviews, expired })
    .from(reviews)
    .where(scope(merchantId, previewId));
  if (!row) return { state: "not_found" };
  if (row.row.receipt)
    return {
      state:
        hash(await basis(tx, merchantId)) === row.row.afterHash
          ? "applied"
          : "changed",
      receipt: row.row.receipt,
    };
  return row.expired
    ? { state: "expired" }
    : { state: "review", review: review(row.row) };
}
export function normalizeImportProposal(value: unknown) {
  const input = analysisSnapshotSchema.parse(value);
  input.websiteUrl = storedUrl(input.websiteUrl);
  const seen = new Set<string>();
  for (const p of input.products) {
    p.productUrl = p.productUrl
      ? storedUrl(p.productUrl, input.websiteUrl)
      : null;
    p.imageUrl = p.imageUrl ? storedUrl(p.imageUrl, input.websiteUrl) : null;
    const key =
      p.productUrl ||
      p.name.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
    if (seen.has(key))
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "IMPORT_DUPLICATE_PRODUCTS",
      });
    seen.add(key);
    if ((p.productUrl?.length || 0) > 500 || (p.imageUrl?.length || 0) > 500)
      throw new TRPCError({ code: "BAD_REQUEST" });
  }
  const pageUrls = new Set<string>();
  for (const p of input.pages) {
    p.url = storedUrl(p.url);
    if (p.url.length > 1000) throw new TRPCError({ code: "BAD_REQUEST" });
    if (pageUrls.has(p.url))
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "IMPORT_DUPLICATE_PAGES",
      });
    pageUrls.add(p.url);
  }
  const questions = new Set<string>();
  for (const faq of input.faqs) {
    const key = faq.question
      .normalize("NFKC")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
    if (questions.has(key))
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "IMPORT_DUPLICATE_FAQS",
      });
    questions.add(key);
  }
  bounded(input);
  return input;
}
export async function storeImportReview(
  merchantId: number,
  value: unknown,
  warnings: string[] = []
) {
  const proposal = normalizeImportProposal(value);
  return (await database()).transaction(async tx => {
    await tx
      .select({ id: merchants.id })
      .from(merchants)
      .where(eq(merchants.id, merchantId))
      .for("update");
    await tx
      .delete(reviews)
      .where(
        and(
          eq(reviews.merchantId, merchantId),
          isNull(reviews.receipt),
          expired
        )
      );
    const pending = await tx
      .select({ id: reviews.id })
      .from(reviews)
      .where(and(eq(reviews.merchantId, merchantId), isNull(reviews.receipt)));
    if (pending.length >= 5)
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "IMPORT_PENDING_LIMIT",
      });
    const current = await basis(tx, merchantId, true);
    bounded(current);
    const previewId = randomUUID();
    await tx.insert(reviews).values({
      merchantId,
      previewId,
      proposal,
      basis: current,
      basisHash: hash(current),
      warnings: warnings.slice(0, 50),
      expiresAt: sql`DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 30 MINUTE)`,
    });
    return read(tx, merchantId, previewId);
  });
}
export async function readImportReview(merchantId: number, previewId: string) {
  return (await database()).transaction(tx => read(tx, merchantId, previewId), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
}
export async function refreshImportReview(
  merchantId: number,
  previewId: string
) {
  return (await database()).transaction(async tx => {
    await tx
      .select({ id: merchants.id })
      .from(merchants)
      .where(eq(merchants.id, merchantId))
      .for("update");
    const [row] = await tx
      .select({ row: reviews, expired })
      .from(reviews)
      .where(scope(merchantId, previewId))
      .for("update");
    if (!row || row.row.receipt || row.expired)
      return read(tx, merchantId, previewId);
    const current = await basis(tx, merchantId, true);
    bounded(current);
    await tx
      .update(reviews)
      .set({ basis: current, basisHash: hash(current) })
      .where(scope(merchantId, previewId));
    return read(tx, merchantId, previewId);
  });
}
function dependentSections(
  current: ImportBasis,
  proposal: ImportSnapshot,
  choices: ImportChoices
) {
  const roots = current.sections
    .filter(
      s =>
        (choices.pagesAction === "replace" &&
          proposal.pages.length > 0 &&
          // Earlier crawlers created aggregate roots without a matching page URL.
          // Replacing the whole page group must pause those old derivatives too.
          s.source === "website") ||
        (choices.faqsAction === "replace" &&
          proposal.faqs.length > 0 &&
          s.source === "faqs") ||
        (choices.productsAction === "replace" &&
          proposal.products.length > 0 &&
          s.source === "products")
    )
    .map(s => Number(s.id));
  return sectionDescendants(
    current.sections.map(s => ({
      id: Number(s.id),
      parentId: s.parentId === null ? null : Number(s.parentId),
    })),
    roots
  );
}
export async function applyReviewedImport(
  merchantId: number,
  raw: unknown
): Promise<ImportRead> {
  const input = importApplyInput.parse(raw),
    decisionHash = hash(input.choices);
  return withKnowledgeTransaction(merchantId, async tx => {
    const [entry] = await tx
      .select({ row: reviews, expired })
      .from(reviews)
      .where(scope(merchantId, input.previewId))
      .for("update");
    if (!entry)
      throw new TRPCError({ code: "NOT_FOUND", message: "IMPORT_NOT_FOUND" });
    const row = entry.row;
    if (row.receipt) {
      if (row.decisionHash !== decisionHash)
        throw new TRPCError({
          code: "CONFLICT",
          message: "IMPORT_ALREADY_APPLIED",
        });
      return read(tx, merchantId, input.previewId);
    }
    if (entry.expired)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "IMPORT_EXPIRED",
      });
    if (review(row).revision !== input.expectedRevision)
      throw new TRPCError({
        code: "CONFLICT",
        message: "IMPORT_REVIEW_CHANGED",
      });
    const current = await basis(tx, merchantId, true);
    if (hash(current) !== row.basisHash)
      throw new TRPCError({ code: "CONFLICT", message: "IMPORT_DATA_CHANGED" });
    const proposal = row.proposal,
      choices = input.choices;
    if (
      !choices.applyContactInfo &&
      [choices.productsAction, choices.pagesAction, choices.faqsAction].every(
        v => v === "skip"
      )
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "IMPORT_NO_SELECTION",
      });
    // The selected snapshot is the only authority: clients never send imported content.
    const inputData = { ...proposal, ...choices };
    if (
      choices.pagesAction !== "skip" &&
      current.pages.length +
        proposal.pages.filter(p => !current.pages.some(x => x.url === p.url))
          .length >
        50
    )
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "IMPORT_PAGE_LIMIT",
      });
    const normalize = (v: unknown) =>
      String(v).normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
    if (
      choices.faqsAction !== "skip" &&
      current.faqs.length +
        proposal.faqs.filter(
          f =>
            !current.faqs.some(
              x => normalize(x.question) === normalize(f.question)
            )
        ).length >
        500
    )
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "IMPORT_FAQ_LIMIT",
      });
    const result = await applyAnalysisSnapshotInTransaction(
      tx,
      merchantId,
      inputData
    );
    const paused = dependentSections(current, proposal, choices);
    if (paused.length)
      await tx
        .update(knowledgeSections)
        .set({ useInBot: 0 })
        .where(
          and(
            eq(knowledgeSections.merchantId, merchantId),
            inArray(knowledgeSections.id, paused)
          )
        );
    const receipt: ImportReceipt = {
      ...result,
      pausedSections: paused.length,
      choices,
      appliedAt: new Date().toISOString(),
    };
    await tx.insert(sariActivityLog).values({
      merchantId,
      actionType: "website_import_apply",
      description: "Applied the saved website import after review",
      details: JSON.stringify({ previewId: input.previewId, ...receipt }),
    });
    await tx
      .update(reviews)
      .set({
        receipt,
        decisionHash,
        afterHash: hash(await basis(tx, merchantId)),
      })
      .where(scope(merchantId, input.previewId));
    return { state: "applied", receipt };
  });
}
