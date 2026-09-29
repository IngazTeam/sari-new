import { createHash } from "node:crypto";
import { and, eq, sql, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import type { z } from "zod";
import {
  websiteAnalyses as reports,
  websiteInsights as insights,
  extractedProducts as products,
  sariActivityLog,
} from "../../drizzle/schema";
import { getDb } from "../db/connection";
import {
  withKnowledgeTransaction,
  type KnowledgeTransaction,
} from "./transaction";
import {
  reportDeleteInput,
  reportListInput,
} from "../../shared/website-reports";

async function database() {
  const db = await getDb();
  if (!db) throw Error("Database unavailable");
  return db;
}
export async function listWebsiteReports(
  merchantId: number,
  input: z.infer<typeof reportListInput>
) {
  const match = and(
    eq(reports.merchantId, merchantId),
    input.state === "all" ? undefined : eq(reports.status, input.state),
    // LOCATE treats %, _ and backslashes literally, without LIKE wildcard surprises.
    input.search
      ? sql`LOCATE(${input.search}, CONCAT(COALESCE(${reports.title}, ''), ' ', ${reports.url}, ' ', ${reports.id})) > 0`
      : undefined
  );
  return (await database()).transaction(
    async tx => {
      const [count] = await tx
        .select({ total: sql<number>`COUNT(*)`.mapWith(Number) })
        .from(reports)
        .where(match);
      const totalPages = Math.max(1, Math.ceil(count.total / 8)),
        page = Math.min(input.page, totalPages);
      const items = await tx
        .select({
          id: reports.id,
          url: reports.url,
          title: reports.title,
          status: reports.status,
          createdAt: reports.createdAt,
          overallScore: reports.overallScore,
        })
        .from(reports)
        .where(match)
        .orderBy(desc(reports.id))
        .limit(8)
        .offset((page - 1) * 8);
      return { items, total: count.total, totalPages, page };
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
  const query = tx
    .select()
    .from(reports)
    .where(and(eq(reports.merchantId, merchantId), eq(reports.id, id)));
  const [report] = await (lock ? query.for("update") : query);
  if (!report)
    throw new TRPCError({ code: "NOT_FOUND", message: "Report unavailable" });
  const iq = tx
    .select()
    .from(insights)
    .where(
      and(eq(insights.merchantId, merchantId), eq(insights.analysisId, id))
    )
    .orderBy(insights.id);
  const pq = tx
    .select()
    .from(products)
    .where(
      and(eq(products.merchantId, merchantId), eq(products.analysisId, id))
    )
    .orderBy(products.id);
  const savedInsights = await (lock ? iq.for("update") : iq),
    extractedProducts = await (lock ? pq.for("update") : pq);
  return {
    report,
    insights: savedInsights,
    products: extractedProducts,
    revision: createHash("sha256")
      .update(JSON.stringify([report, savedInsights, extractedProducts]))
      .digest("hex"),
  };
}
export async function readWebsiteReport(merchantId: number, id: number) {
  return (await database()).transaction(tx => snapshot(tx, merchantId, id), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
}
export async function deleteReviewedWebsiteReport(
  merchantId: number,
  value: unknown
) {
  const input = reportDeleteInput.parse(value);
  return withKnowledgeTransaction(merchantId, async tx => {
    const review = await snapshot(tx, merchantId, input.id, true);
    // Do not let a legacy corrupt cross-tenant FK turn a scoped delete into a cascade.
    const foreignInsights = await tx
      .select({ merchantId: insights.merchantId })
      .from(insights)
      .where(eq(insights.analysisId, input.id))
      .for("update");
    const foreignProducts = await tx
      .select({ merchantId: products.merchantId })
      .from(products)
      .where(eq(products.analysisId, input.id))
      .for("update");
    if (
      [...foreignInsights, ...foreignProducts].some(
        r => r.merchantId !== merchantId
      )
    )
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Inconsistent report ownership",
      });
    if (
      review.report.status === "analyzing" ||
      review.report.status === "pending"
    )
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Report is still running",
      });
    if (review.revision !== input.expectedRevision)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Report changed; review again",
      });
    await tx
      .delete(insights)
      .where(
        and(
          eq(insights.merchantId, merchantId),
          eq(insights.analysisId, input.id)
        )
      );
    await tx
      .delete(products)
      .where(
        and(
          eq(products.merchantId, merchantId),
          eq(products.analysisId, input.id)
        )
      );
    await tx
      .delete(reports)
      .where(and(eq(reports.merchantId, merchantId), eq(reports.id, input.id)));
    await tx
      .insert(sariActivityLog)
      .values({
        merchantId,
        actionType: "website_report_delete",
        description: `Website report #${input.id} deleted after review`,
        details: JSON.stringify({
          id: input.id,
          insights: review.insights.length,
          products: review.products.length,
        }),
      });
    return { success: true as const };
  });
}
