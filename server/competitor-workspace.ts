import type { PoolConnection } from "mysql2/promise";
import { createHash } from "node:crypto";
import { getPool } from "./db/connection";
import { databaseTimeEpoch } from "./db/time";
import {
  ALL_ROLES,
  hasPermission,
  type MerchantRole,
} from "./_core/permissions";
import { publicWebsiteUrl } from "./security/public-website";
import { estimatedScore } from "../shared/website-reports";
import {
  competitorSelection,
  competitorDetailSelection,
  COMPETITOR_PAGE_SIZE,
  competitorDeleteInput,
} from "../shared/competitor-workspace";

export class CompetitorWorkspaceError extends Error {
  constructor(
    readonly reason:
      | "forbidden"
      | "missing"
      | "unavailable"
      | "stale"
      | "running"
      | "reference"
  ) {
    super("competitor_workspace:" + reason);
  }
}
async function rows(tx: PoolConnection, sql: string, args: any[] = []) {
  const [result] = await tx.execute(sql, args);
  if (!Array.isArray(result)) throw new CompetitorWorkspaceError("unavailable");
  return result as any[];
}
async function readSnapshot<T>(
  actorId: number,
  merchantId: number,
  operation: (tx: PoolConnection, canManage: boolean) => Promise<T>
) {
  let tx: PoolConnection | undefined,
    committing = false,
    reusable = true;
  try {
    if (
      ![actorId, merchantId].every(
        n => Number.isInteger(n) && n > 0 && n <= 2147483647
      )
    )
      throw new CompetitorWorkspaceError("forbidden");
    const pool = await getPool();
    if (!pool) throw new CompetitorWorkspaceError("unavailable");
    tx = await pool.getConnection();
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await tx.beginTransaction();
    const [merchant] = await rows(
      tx,
      "SELECT id,userId,status FROM merchants WHERE id=? FOR SHARE",
      [merchantId]
    );
    const users = await rows(
      tx,
      "SELECT id,account_status FROM users WHERE id IN (?,?) ORDER BY id FOR SHARE",
      [actorId, merchant?.userId || actorId]
    );
    const members = await rows(
      tx,
      "SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE",
      [merchantId, actorId]
    );
    const role =
      members.length === 1 && members[0].is_active === 1
        ? members[0].role
        : !members.length && merchant?.userId === actorId
          ? "owner"
          : null;
    if (
      !merchant ||
      !["active", "pending"].includes(merchant.status) ||
      users.find(u => u.id === actorId)?.account_status !== "active" ||
      users.find(u => u.id === merchant.userId)?.account_status !== "active" ||
      !ALL_ROLES.includes(role) ||
      !hasPermission(role as MerchantRole, "analytics.read")
    )
      throw new CompetitorWorkspaceError("forbidden");
    const value = await operation(
      tx,
      merchant.status === "active" &&
        hasPermission(role as MerchantRole, "bot_settings.manage")
    );
    committing = true;
    await tx.commit();
    return value;
  } catch (error) {
    if (committing) reusable = false;
    else if (tx)
      try {
        await tx.rollback();
      } catch {
        reusable = false;
      }
    if (error instanceof CompetitorWorkspaceError) throw error;
    throw new CompetitorWorkspaceError("unavailable");
  } finally {
    if (tx) {
      if (reusable) tx.release();
      else tx.destroy();
    }
  }
}
function sourceUrl(value: unknown) {
  try {
    return typeof value === "string" ? publicWebsiteUrl(value).href : null;
  } catch {
    return null;
  }
}
function timestamp(value: any) {
  const n = databaseTimeEpoch(value);
  return Number.isFinite(n) ? new Date(n).toISOString() : null;
}
function project(raw: any) {
  const status = ["pending", "analyzing", "completed", "failed"].includes(
    raw.status
  )
    ? (raw.status as "pending" | "analyzing" | "completed" | "failed")
    : ("unknown" as const);
  return {
    id: Number(raw.id),
    name: String(raw.name),
    industry: typeof raw.industry === "string" ? raw.industry : null,
    url: sourceUrl(raw.url),
    status,
    createdAt: timestamp(raw.created_at),
    updatedAt: timestamp(raw.updated_at),
    analyzedAt: timestamp(raw.analyzed_at),
    scores: {
      overall: estimatedScore(raw.overall_score, status),
      seo: estimatedScore(raw.seo_score, status),
      performance: estimatedScore(raw.performance_score, status),
      ux: estimatedScore(raw.ux_score, status),
      content: estimatedScore(raw.content_score, status),
    },
    products: Number(raw.products || 0),
    excludedProducts: Number(raw.excluded_products || 0),
    recordedProductCount:
      Number.isInteger(raw.product_count) && raw.product_count >= 0
        ? raw.product_count
        : null,
    failure: status === "failed" ? ("analysis_failed" as const) : null,
    scoreEvidence: "website_estimate" as const,
    salesProficiency: null,
  };
}
// Explicit columns exclude provider errors, stored aggregate prices and raw notes from list responses.
const reportColumns = `c.id,c.name,c.industry,c.url,c.status,c.created_at,c.updated_at,c.analyzed_at,c.overall_score,c.seo_score,c.performance_score,c.ux_score,c.content_score,c.product_count,
  (SELECT COUNT(*) FROM competitor_products p WHERE p.competitor_id=c.id AND p.merchant_id=c.merchant_id) AS products,
  (SELECT COUNT(*) FROM competitor_products p WHERE p.competitor_id=c.id AND p.merchant_id<>c.merchant_id) AS excluded_products`;
export async function readCompetitorWorkspace(
  actorId: number,
  merchantId: number,
  input: unknown
) {
  const selection = competitorSelection.parse(input);
  return readSnapshot(actorId, merchantId, async (tx, canManage) => {
    const [stats] = await rows(
      tx,
      `SELECT COUNT(*) AS total,COALESCE(SUM(status='completed'),0) AS completed,
      COALESCE(SUM(status IN ('pending','analyzing')),0) AS running,COALESCE(SUM(status='failed'),0) AS failed FROM competitor_analyses WHERE merchant_id=?`,
      [merchantId]
    );
    const where =
      "c.merchant_id=?" +
      (selection.state !== "all" ? " AND c.status=?" : "") +
      (selection.query
        ? " AND LOCATE(?,CONCAT(c.name,' ',c.url,' ',c.id))>0"
        : "");
    const args: any[] = [merchantId];
    if (selection.state !== "all") args.push(selection.state);
    if (selection.query) args.push(selection.query);
    const [count] = await rows(
      tx,
      `SELECT COUNT(*) AS total FROM competitor_analyses c WHERE ${where}`,
      args
    );
    const matched = Number(count.total),
      pages = Math.ceil(matched / COMPETITOR_PAGE_SIZE),
      currentPage = Math.min(selection.page, Math.max(1, pages));
    const values = await rows(
      tx,
      `SELECT ${reportColumns} FROM competitor_analyses c WHERE ${where} ORDER BY c.id ${selection.sort === "oldest" ? "ASC" : "DESC"} LIMIT ${COMPETITOR_PAGE_SIZE} OFFSET ${(currentPage - 1) * COMPETITOR_PAGE_SIZE}`,
      args
    );
    return {
      actorId,
      selection,
      merchantId,
      canManage,
      rows: values.map(project),
      matched,
      pages,
      currentPage,
      stats: {
        total: Number(stats.total),
        completed: Number(stats.completed),
        running: Number(stats.running),
        failed: Number(stats.failed),
      },
    };
  });
}
function notes(value: unknown) {
  if (value === null) return { items: [] as string[], invalid: false };
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (Array.isArray(parsed) && parsed.every(s => typeof s === "string"))
      return { items: parsed as string[], invalid: false };
  } catch {
    /* Historic malformed notes stay explicit without breaking the report. */
  }
  return { items: [] as string[], invalid: true };
}
// Hash the persisted report and all children, not only the currently visible product page.
async function deletionSnapshot(
  tx: PoolConnection,
  merchantId: number,
  id: number,
  lock = false
) {
  const suffix = lock ? " FOR UPDATE" : "";
  const [report] = await rows(
    tx,
    "SELECT * FROM competitor_analyses WHERE merchant_id=? AND id=?" + suffix,
    [merchantId, id]
  );
  if (!report) throw new CompetitorWorkspaceError("missing");
  const products = await rows(
    tx,
    "SELECT * FROM competitor_products WHERE competitor_id=? ORDER BY id" +
      suffix,
    [id]
  );
  return {
    report,
    products,
    revision: createHash("sha256")
      .update(JSON.stringify([report, products]))
      .digest("hex"),
  };
}
export async function deleteReviewedCompetitor(
  actorId: number,
  merchantId: number,
  value: unknown
) {
  const input = competitorDeleteInput.parse(value);
  return readSnapshot(actorId, merchantId, async (tx, canManage) => {
    if (!canManage) throw new CompetitorWorkspaceError("forbidden");
    const review = await deletionSnapshot(tx, merchantId, input.id, true);
    if (review.products.some(p => p.merchant_id !== merchantId))
      throw new CompetitorWorkspaceError("reference");
    if (!["completed", "failed"].includes(review.report.status))
      throw new CompetitorWorkspaceError("running");
    if (review.revision !== input.expectedRevision)
      throw new CompetitorWorkspaceError("stale");
    await tx.execute(
      "DELETE FROM competitor_analyses WHERE merchant_id=? AND id=?",
      [merchantId, input.id]
    );
    await tx.execute(
      "INSERT INTO sari_activity_log (merchant_id,action_type,description,details) VALUES (?,'competitor_report_delete',?,?)",
      [
        merchantId,
        `Competitor report #${input.id} deleted after review`,
        JSON.stringify({
          id: input.id,
          products: review.products.length,
          actorId,
        }),
      ]
    );
    return { merchantId, id: input.id, success: true as const };
  });
}
export async function readCompetitorDetail(
  actorId: number,
  merchantId: number,
  input: unknown
) {
  const selection = competitorDetailSelection.parse(input);
  return readSnapshot(actorId, merchantId, async (tx, canManage) => {
    const [raw] = await rows(
      tx,
      `SELECT ${reportColumns},c.strengths,c.weaknesses,c.opportunities FROM competitor_analyses c WHERE c.merchant_id=? AND c.id=?`,
      [merchantId, selection.id]
    );
    if (!raw) throw new CompetitorWorkspaceError("missing");
    const report = project(raw),
      pages = Math.ceil(report.products / COMPETITOR_PAGE_SIZE),
      currentPage = Math.min(selection.productPage, Math.max(1, pages));
    const args = [merchantId, selection.id];
    const priced = "price>0 AND REGEXP_LIKE(currency,'^[A-Z]{3}$','c')";
    const groups = await rows(
      tx,
      `SELECT currency,COUNT(*) AS count,MIN(price) AS minimum,MAX(price) AS maximum,AVG(price) AS average FROM competitor_products WHERE merchant_id=? AND competitor_id=? AND ${priced} GROUP BY currency ORDER BY currency`,
      args
    );
    const products = await rows(
      tx,
      `SELECT p.id,p.name,p.description,p.price,p.currency,p.product_url,p.image_url,p.category,
      mine.id AS own_product_id,mine.name AS own_product_name FROM competitor_products p LEFT JOIN products mine ON mine.id=p.similar_to_merchant_product AND mine.merchantId=p.merchant_id
      WHERE p.merchant_id=? AND p.competitor_id=? ORDER BY p.id LIMIT ${COMPETITOR_PAGE_SIZE} OFFSET ${(currentPage - 1) * COMPETITOR_PAGE_SIZE}`,
      args
    );
    const qualified = (p: any) =>
      p.price !== null &&
      Number(p.price) > 0 &&
      typeof p.currency === "string" &&
      /^[A-Z]{3}$/.test(p.currency);
    const pricedCount = groups.reduce(
      (total, group) => total + Number(group.count),
      0
    );
    const deletion = await deletionSnapshot(tx, merchantId, selection.id);
    return {
      actorId,
      merchantId,
      canManage,
      revision: deletion.revision,
      report,
      notes: {
        strengths: notes(raw.strengths),
        weaknesses: notes(raw.weaknesses),
        opportunities: notes(raw.opportunities),
      },
      products: products.map(p => ({
        id: Number(p.id),
        name: p.name as string,
        description: p.description as string | null,
        category: p.category as string | null,
        price: qualified(p) ? String(p.price) : null,
        currency: qualified(p) ? (p.currency as string) : null,
        url: sourceUrl(p.product_url),
        imageUrl: sourceUrl(p.image_url),
        matchedProduct: p.own_product_id
          ? { id: Number(p.own_product_id), name: String(p.own_product_name) }
          : null,
        comparisonEvidence: "not_verified" as const,
        priceEvidence: qualified(p)
          ? ("extracted" as const)
          : ("unverified" as const),
      })),
      productPages: pages,
      productPage: currentPage,
      pricing: {
        pricedCount,
        unverifiedCount: report.products - pricedCount,
        groups: groups.map(g => ({
          currency: String(g.currency),
          count: Number(g.count),
          minimum: String(g.minimum),
          maximum: String(g.maximum),
          average: String(g.average),
        })),
        evidence: "extracted_not_current" as const,
      },
    };
  });
}
