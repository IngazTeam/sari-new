import { getPool } from "../db/connection";
import { catalogVisibleSql } from "../integrations/catalog-scope";
import { knowledgeSourceGroups, type KnowledgeSourceGroups } from "../../shared/knowledge-source-groups";

// mysql2 uses a UTC session. Unknown legacy dates remain unavailable, never today.
function date(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  return null;
}

/** One tenant, one read-only snapshot. Counts represent stored rows/switches, not
 * successful retrieval or sales quality. No source text, credentials or URLs. */
export async function readKnowledgeSourceGroups(merchantId: number): Promise<KnowledgeSourceGroups> {
  if (!Number.isInteger(merchantId) || merchantId < 1 || merchantId > 2147483647) throw Error("Invalid source scope");
  const pool = await getPool();
  if (!pool) throw Error("Source groups unavailable");
  const c = await pool.getConnection();
  let reusable = true;
  try {
    await c.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await c.query("SET TRANSACTION READ ONLY");
    await c.beginTransaction();
    const row = async (sql: string) => {
      const [rows] = await c.execute<any[]>(sql, [merchantId]);
      if (rows.length !== 1) throw Error("Source summary unavailable");
      return rows[0];
    };
    const merchant = await row("SELECT businessName,createdAt,updatedAt FROM merchants WHERE id=?");
    const docs = await row(`SELECT COUNT(*) total, MAX(id) anchor, MAX(uploaded_at) uploaded,
      COALESCE(SUM(extraction_status='completed' AND COALESCE(extracted_text,'') REGEXP '[^[:space:]]'),0) textReady,
      COALESCE(SUM(extraction_status='completed' AND NOT(COALESCE(extracted_text,'') REGEXP '[^[:space:]]')),0) emptyCount,
      COALESCE(SUM(extraction_status='pending'),0) pending,
      COALESCE(SUM(extraction_status='processing'),0) processing,
      COALESCE(SUM(extraction_status='failed'),0) failed
      FROM merchant_knowledge_docs WHERE merchant_id=?`);
    const products = await row(`SELECT COUNT(*) total, MAX(updatedAt) modified,
      COALESCE(SUM(${catalogVisibleSql()}),0) visible,
      COALESCE(SUM(isActive=1 AND ${catalogVisibleSql()}),0) activeVisible
      FROM products WHERE merchantId=?`);
    const analyses = await row("SELECT COUNT(*) total, MAX(id) anchor, MAX(analyzed_at) analyzed FROM website_analyses WHERE merchant_id=?");
    const pages = await row(`SELECT COUNT(*) total, MAX(updated_at) modified,
      COALESCE(SUM(is_active=1 AND use_in_bot=1),0) enabled,
      COALESCE(SUM(COALESCE(content,'') REGEXP '[^[:space:]]'),0) withText
      FROM discovered_pages WHERE merchant_id=?`);
    const faqs = await row(`SELECT COUNT(*) total, MAX(updated_at) modified,
      COALESCE(SUM(source_status='active' AND is_active=1 AND use_in_bot=1),0) enabled,
      COALESCE(SUM(source_status='archived'),0) archived
      FROM extracted_faqs WHERE merchant_id=?`);
    const sections = await row(`SELECT COUNT(*) total, MAX(updated_at) modified,
      COALESCE(SUM(use_in_bot=1),0) switchedOn FROM knowledge_sections WHERE merchant_id=?`);
    const result = knowledgeSourceGroups.parse({
      merchantId, businessName: merchant.businessName,
      documents: { total: Number(docs.total), textReady: Number(docs.textReady), empty: Number(docs.emptyCount), pending: Number(docs.pending), processing: Number(docs.processing), failed: Number(docs.failed), latestUploadedAt: date(docs.uploaded), removalAnchorId: docs.anchor === null ? null : Number(docs.anchor) },
      products: { total: Number(products.total), visible: Number(products.visible), activeVisible: Number(products.activeVisible), latestModifiedAt: date(products.modified) },
      website: { analyses: Number(analyses.total), pages: Number(pages.total), enabledPages: Number(pages.enabled), pagesWithText: Number(pages.withText), latestAnalysisAt: date(analyses.analyzed), latestPageUpdateAt: date(pages.modified), removalAnchorId: analyses.anchor === null ? null : Number(analyses.anchor) },
      faqs: { total: Number(faqs.total), enabled: Number(faqs.enabled), archived: Number(faqs.archived), latestModifiedAt: date(faqs.modified) },
      sections: { total: Number(sections.total), switchedOn: Number(sections.switchedOn), latestModifiedAt: date(sections.modified) },
      settings: { createdAt: date(merchant.createdAt), modifiedAt: date(merchant.updatedAt) },
    });
    await c.commit();
    return result;
  } catch (error) {
    try { await c.rollback(); } catch { reusable = false; }
    throw error;
  } finally { if (reusable) c.release(); else c.destroy(); }
}
