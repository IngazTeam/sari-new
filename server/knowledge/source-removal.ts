import { createHash } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { getPool } from "../db/connection";
import { assertRuntimeSchema } from "../db/schema-readiness";
import { hasPermission, type MerchantRole } from "../_core/permissions";
import { catalogVisibleSql } from "../integrations/catalog-scope";
import { destroyMerchantSessions } from "../ai/session-context";
import {
  removeKnowledgeSourceInTransaction,
  resetKnowledgeSourcesInTransaction,
} from "./source-lifecycle";
import {
  knowledgeRemovalTarget,
  knowledgeRemovalWrite,
  knowledgeRemovalReceiptInput,
  knowledgeRemovalReview,
  knowledgeRemovalReceipt,
  planKnowledgeSourceRemoval,
  type KnowledgeRemovalTarget,
  type KnowledgeRemovalReview,
} from "../../shared/knowledge-source-removal";

export class KnowledgeRemovalForbidden extends Error {}
export class KnowledgeRemovalConflict extends Error {}
export class KnowledgeRemovalBlocked extends Error {}
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function scope(merchantId: number, actorId: number) {
  for (const id of [merchantId, actorId])
    if (!Number.isInteger(id) || id < 1 || id > 2147483647)
      throw new KnowledgeRemovalForbidden();
}
async function transaction<T>(
  write: boolean,
  run: (c: PoolConnection) => Promise<T>
): Promise<T> {
  await assertRuntimeSchema(
    "knowledge removal",
    [
      {
        table: "knowledge_removal_receipts",
        columns: ["actor_id", "input_hash", "result"],
        uniqueIndexes: [
          {
            name: "uq_knowledge_removal_request",
            columns: ["merchant_id", "request_id"],
          },
        ],
      },
    ],
    { cacheSuccess: false }
  );
  const pool = await getPool();
  if (!pool) throw Error("Knowledge storage unavailable");
  const c = await pool.getConnection();
  let reusable = true,
    committing = false;
  try {
    await c.query(
      `SET TRANSACTION ISOLATION LEVEL ${write ? "SERIALIZABLE" : "REPEATABLE READ"}`
    );
    if (!write) await c.query("SET TRANSACTION READ ONLY");
    await c.beginTransaction();
    const result = await run(c);
    committing = true;
    await c.commit();
    return result;
  } catch (error) {
    // Never reuse an uncertain connection or automatically repeat a destructive request.
    if (committing) reusable = false;
    else
      try {
        await c.rollback();
      } catch {
        reusable = false;
      }
    throw error;
  } finally {
    if (reusable) c.release();
    else c.destroy();
  }
}
async function authority(
  c: PoolConnection,
  merchantId: number,
  actorId: number,
  lock: boolean
) {
  const [merchants] = await c.execute<any[]>(
    `SELECT id,userId,status,businessName,integration_source FROM merchants WHERE id=?${lock ? " FOR UPDATE" : ""}`,
    [merchantId]
  );
  const [users] = await c.execute<any[]>(
    `SELECT account_status FROM users WHERE id=?${lock ? " FOR SHARE" : ""}`,
    [actorId]
  );
  const [members] = await c.execute<any[]>(
    `SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=?${lock ? " FOR SHARE" : ""}`,
    [merchantId, actorId]
  );
  const m = merchants[0];
  const role =
    members.length === 1 && Number(members[0].is_active) === 1
      ? members[0].role
      : members.length === 0 && Number(m?.userId) === actorId
        ? "owner"
        : null;
  if (
    merchants.length !== 1 ||
    m.status === "suspended" ||
    users[0]?.account_status !== "active" ||
    !role ||
    !hasPermission(role as MerchantRole, "bot_settings.manage")
  )
    throw new KnowledgeRemovalForbidden();
  return m;
}

async function snapshot(
  c: PoolConnection,
  merchantId: number,
  actorId: number,
  target: KnowledgeRemovalTarget,
  merchant: any,
  lock: boolean
) {
  const suffix = lock ? " FOR UPDATE" : "";
  let bytes = 0;
  const read = async (query: string): Promise<any[]> => {
    const [rows] = await c.execute<any[]>(`${query} LIMIT 20001${suffix}`, [
      merchantId,
    ]);
    bytes += Buffer.byteLength(JSON.stringify(rows));
    if (rows.length > 20000 || bytes > 32 * 1024 * 1024)
      throw new KnowledgeRemovalBlocked("Review capacity exceeded");
    return rows;
  };
  // Entire rows are fingerprinted on the server, but source text never leaves this function.
  const owned = (table: string, column = "merchant_id", order = "id") =>
    read(`SELECT * FROM ${table} WHERE ${column}=? ORDER BY ${order}`);
  const documents = await owned("merchant_knowledge_docs");
  const products =
    await read(`SELECT p.*, (COALESCE(p.sallaProductId,'')<>'' OR NOT ${catalogVisibleSql("p")}
    OR EXISTS(SELECT 1 FROM woocommerce_products WHERE product_id=p.id)
    OR EXISTS(SELECT 1 FROM zid_products WHERE sari_product_id=p.id)
    OR EXISTS(SELECT 1 FROM salla_product_projections WHERE local_product_id=p.id)) AS external_source
    FROM products p WHERE p.merchantId=? ORDER BY p.id`);
  const analyses = await owned("website_analyses"),
    pages = await owned("discovered_pages");
  const faqs = await owned("extracted_faqs"),
    sections = await owned("knowledge_sections");
  const intake = await owned("knowledge_intake_receipts");
  const rows = (list: any[]) =>
    list.map(r => ({ id: Number(r.id), merchantId: Number(r.merchant_id) }));
  const plan = planKnowledgeSourceRemoval(
    {
      merchantId,
      businessName: merchant.businessName,
      integrationSource: merchant.integration_source,
      runningIntake: intake.some(r => r.state === "processing"),
      documents: rows(documents),
      analyses: rows(analyses),
      pages: rows(pages),
      faqs: rows(faqs),
      products: products.map(r => ({
        id: Number(r.id),
        merchantId: Number(r.merchantId),
        external: Boolean(Number(r.external_source)),
      })),
      sections: sections.map(r => ({
        id: Number(r.id),
        merchantId: Number(r.merchant_id),
        parentId: r.parent_id === null ? null : Number(r.parent_id),
        source: r.source,
      })),
    },
    target
  );
  const all = target.kind === "all",
    doc = all || target.kind === "document",
    web = all || target.kind === "website",
    catalog = all || target.kind === "products";
  const relatedRows: Record<string, any[]> = {};
  let foreign = false;
  const linked = async (
    key: string,
    table: string,
    fk: string,
    parent: string,
    parentOwner = "merchant_id"
  ) => {
    const value = await read(
      `SELECT r.* FROM ${table} r JOIN ${parent} p ON r.${fk}=p.id WHERE p.${parentOwner}=? ORDER BY r.id`
    );
    if (value.some(r => Number(r.merchant_id) !== merchantId)) foreign = true;
    relatedRows[key] = value;
    return value;
  };
  if (doc) {
    relatedRows.documentReviews = await owned(
      "knowledge_intake_reviews",
      "merchant_id",
      "review_id"
    );
    relatedRows.documentReceipts = intake;
    // Guard malformed cross-tenant FK links before MySQL can SET NULL another merchant's receipt.
    await linked(
      "sourceDocumentLinks",
      "knowledge_intake_receipts",
      "source_document_id",
      "merchant_knowledge_docs"
    );
    await linked(
      "documentLinks",
      "knowledge_intake_receipts",
      "document_id",
      "merchant_knowledge_docs"
    );
  }
  if (web) {
    relatedRows.websitePreviews = await read(
      "SELECT * FROM knowledge_page_previews WHERE merchant_id=? AND page_id IS NULL ORDER BY id"
    );
    relatedRows.websiteImportReviews = await read(
      "SELECT * FROM website_import_reviews WHERE merchant_id=? AND receipt IS NULL ORDER BY id"
    );
    await linked(
      "websiteInsights",
      "website_insights",
      "analysis_id",
      "website_analyses"
    );
    await linked(
      "extractedProducts",
      "extracted_products",
      "analysis_id",
      "website_analyses"
    );
    await linked(
      "faqPageLinks",
      "extracted_faqs",
      "page_id",
      "discovered_pages"
    );
  }
  if (catalog)
    for (const [key, table, fk] of [
      ["productOptions", "product_options", "product_id"],
      ["productVariants", "product_variants", "product_id"],
      ["loyaltyLinks", "loyalty_rewards", "product_id"],
      ["competitorLinks", "competitor_products", "similar_to_merchant_product"],
    ])
      await linked(key, table, fk, "products", "merchantId");
  if (doc || web || all) {
    const ids = new Set(plan.sectionIds);
    relatedRows.sectionHistory = (await owned("knowledge_changelog")).filter(
      r => all || ids.has(Number(r.section_id))
    );
  }
  const related = Object.fromEntries(
    [
      "documentReviews",
      "documentReceipts",
      "websitePreviews",
      "websiteImportReviews",
      "sectionHistory",
      "productOptions",
      "productVariants",
      "loyaltyLinks",
      "competitorLinks",
      "websiteInsights",
      "extractedProducts",
      "faqPageLinks",
    ].map(key => [
      key,
      key === "faqPageLinks" && all ? 0 : relatedRows[key]?.length || 0,
    ])
  );
  return knowledgeRemovalReview.parse({
    merchantId,
    actorId,
    target,
    businessName: plan.businessName,
    counts: plan.counts,
    related,
    blockers: [...plan.blockers, ...(foreign ? ["foreign_relationship"] : [])],
    revision: hash({
      merchantId,
      actorId,
      target,
      merchant,
      documents,
      products,
      analyses,
      pages,
      faqs,
      sections,
      intake,
      relatedRows,
    }),
  });
}
export async function reviewKnowledgeRemoval(
  merchantId: number,
  actorId: number,
  raw: unknown
): Promise<KnowledgeRemovalReview> {
  scope(merchantId, actorId);
  const target = knowledgeRemovalTarget.parse(raw);
  return transaction(false, async c =>
    snapshot(
      c,
      merchantId,
      actorId,
      target,
      await authority(c, merchantId, actorId, false),
      false
    )
  );
}
function receipt(
  row: any,
  merchantId: number,
  actorId: number,
  requestId: string
) {
  if (Number(row.actor_id) !== actorId) throw new KnowledgeRemovalConflict();
  const result = knowledgeRemovalReceipt.parse(
    typeof row.result === "string" ? JSON.parse(row.result) : row.result
  );
  if (
    result.merchantId !== merchantId ||
    result.actorId !== actorId ||
    result.requestId !== requestId
  )
    throw Error("Invalid removal receipt");
  return result;
}
export async function removeReviewedKnowledge(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  scope(merchantId, actorId);
  const input = knowledgeRemovalWrite.parse(raw),
    inputHash = hash(input);
  const result = await transaction(true, async c => {
    const merchant = await authority(c, merchantId, actorId, true);
    const [prior] = await c.execute<any[]>(
      "SELECT actor_id,input_hash,result FROM knowledge_removal_receipts WHERE merchant_id=? AND request_id=? FOR UPDATE",
      [merchantId, input.requestId]
    );
    if (prior.length) {
      if (prior.length !== 1 || prior[0].input_hash !== inputHash)
        throw new KnowledgeRemovalConflict();
      return receipt(prior[0], merchantId, actorId, input.requestId);
    }
    const current = await snapshot(
      c,
      merchantId,
      actorId,
      input.target,
      merchant,
      true
    );
    if (current.revision !== input.expectedRevision)
      throw new KnowledgeRemovalConflict();
    if (current.blockers.length || input.confirmation !== current.businessName)
      throw new KnowledgeRemovalBlocked();
    const db = drizzle({ client: c });
    if (input.target.kind === "all")
      await resetKnowledgeSourcesInTransaction(db, merchantId);
    else
      await removeKnowledgeSourceInTransaction(
        db,
        merchantId,
        input.target.kind
      );
    await c.execute("DELETE FROM sari_response_cache WHERE merchant_id=?", [
      merchantId,
    ]);
    await c.execute(
      "UPDATE session_contexts SET context_json='null', expires_at=UTC_TIMESTAMP(), version=version+1 WHERE merchant_id=?",
      [merchantId]
    );
    const saved = knowledgeRemovalReceipt.parse({
      merchantId,
      actorId,
      requestId: input.requestId,
      target: input.target,
      revision: current.revision,
      counts: current.counts,
      related: current.related,
      completedAt: new Date().toISOString(),
    });
    await c.execute(
      "INSERT INTO knowledge_removal_receipts (merchant_id,actor_id,request_id,input_hash,result) VALUES (?,?,?,?,?)",
      [merchantId, actorId, input.requestId, inputHash, JSON.stringify(saved)]
    );
    return saved;
  });
  destroyMerchantSessions(merchantId);
  return result;
}
export async function readKnowledgeRemovalReceipt(
  merchantId: number,
  actorId: number,
  raw: unknown
) {
  scope(merchantId, actorId);
  const { requestId } = knowledgeRemovalReceiptInput.parse(raw);
  return transaction(false, async c => {
    await authority(c, merchantId, actorId, false);
    const [prior] = await c.execute<any[]>(
      "SELECT actor_id,result FROM knowledge_removal_receipts WHERE merchant_id=? AND request_id=?",
      [merchantId, requestId]
    );
    if (!prior.length) return null;
    if (prior.length !== 1) throw Error("Invalid receipt count");
    return receipt(prior[0], merchantId, actorId, requestId);
  });
}
