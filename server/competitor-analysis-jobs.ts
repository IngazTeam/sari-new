import { randomUUID } from "node:crypto";
import type { PoolConnection } from "mysql2/promise";
import { getPool } from "./db/connection";
import { assertRuntimeSchema } from "./db/schema-readiness";
import {
  ALL_ROLES,
  hasPermission,
  type MerchantRole,
} from "./_core/permissions";
import { publicWebsiteUrl } from "./security/public-website";
import {
  competitorAnalysisStart,
  competitorAnalysisAttempt,
  competitorAnalysisExecution,
  competitorAnalysisResult,
  type CompetitorAnalysisExecution,
  type CompetitorAnalysisResult,
} from "../shared/competitor-analysis-job";

export class CompetitorJobError extends Error {
  constructor(
    readonly reason:
      | "forbidden"
      | "unavailable"
      | "expired"
      | "stale"
      | "busy"
      | "cooldown"
      | "unknown"
      | "website"
      | "reference"
  ) {
    super("competitor_job:" + reason);
  }
}
const validId = (n: number) => Number.isInteger(n) && n > 0 && n <= 2147483647;
const columns = `*,lease_expires_at>UTC_TIMESTAMP(3) AND deadline_at>UTC_TIMESTAMP(3) AS lease_current`;
async function rows(
  tx: PoolConnection,
  query: string,
  args: any[] = []
): Promise<any[]> {
  const [value] = await tx.execute(query, args);
  if (!Array.isArray(value)) throw new CompetitorJobError("unavailable");
  return value;
}
async function ready() {
  await assertRuntimeSchema("durable competitor analysis jobs", [
    {
      table: "competitor_analysis_jobs",
      columns: [
        "request_id",
        "actor_id",
        "owner_id",
        "competitor_id",
        "website_url",
        "execution_token",
        "lease_expires_at",
        "deadline_at",
        "active_slot",
      ],
      uniqueIndexes: [
        {
          name: "uq_competitor_job_request",
          columns: ["merchant_id", "request_id"],
        },
        { name: "uq_competitor_job_report", columns: ["competitor_id"] },
        {
          name: "uq_competitor_job_active",
          columns: ["merchant_id", "active_slot"],
        },
      ],
      checkConstraints: [
        {
          name: "ck_competitor_job_active",
          expression:
            "(state = 'running' AND active_slot IS NOT NULL AND active_slot = 1) OR (state <> 'running' AND active_slot IS NULL)",
          enforced: true,
        },
      ],
    },
  ]);
}
async function transaction<T>(
  merchantId: number,
  work: (tx: PoolConnection, merchant: any) => Promise<T>,
  writing = true
) {
  if (!validId(merchantId)) throw new CompetitorJobError("forbidden");
  let tx: PoolConnection | undefined,
    committing = false,
    reusable = true;
  try {
    await ready();
    const pool = await getPool();
    if (!pool) throw new CompetitorJobError("unavailable");
    tx = await pool.getConnection();
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await tx.beginTransaction();
    const [merchant] = await rows(
      tx,
      `SELECT id,userId,status FROM merchants WHERE id=? FOR ${writing ? "UPDATE" : "SHARE"}`,
      [merchantId]
    );
    if (!merchant) throw new CompetitorJobError("forbidden");
    const result = await work(tx, merchant);
    committing = true;
    await tx.commit();
    return result;
  } catch (error) {
    if (committing) reusable = false;
    else if (tx)
      try {
        await tx.rollback();
      } catch {
        reusable = false;
      }
    if (committing && writing) throw new CompetitorJobError("unknown");
    if (error instanceof CompetitorJobError) throw error;
    throw new CompetitorJobError("unavailable");
  } finally {
    if (tx) {
      if (reusable) tx.release();
      else tx.destroy();
    }
  }
}
async function authorize(
  tx: PoolConnection,
  merchant: any,
  actorId: number,
  write: boolean
) {
  if (!validId(actorId)) throw new CompetitorJobError("forbidden");
  const users = await rows(
    tx,
    "SELECT id,account_status FROM users WHERE id IN (?,?) ORDER BY id FOR SHARE",
    [actorId, merchant.userId]
  );
  const members = await rows(
    tx,
    "SELECT role,is_active FROM merchant_members WHERE merchant_id=? AND user_id=? FOR SHARE",
    [merchant.id, actorId]
  );
  const role =
    members.length === 1 && members[0].is_active === 1
      ? members[0].role
      : !members.length && actorId === merchant.userId
        ? "owner"
        : null;
  if (
    !["active", "pending"].includes(merchant.status) ||
    users.find(u => u.id === actorId)?.account_status !== "active" ||
    users.find(u => u.id === merchant.userId)?.account_status !== "active" ||
    !ALL_ROLES.includes(role) ||
    !hasPermission(
      role as MerchantRole,
      write ? "bot_settings.manage" : "analytics.read"
    ) ||
    (write && merchant.status !== "active")
  )
    throw new CompetitorJobError("forbidden");
}
// Expiry closes the receipt and its own still-running report. It never restarts network work.
async function settleExpired(tx: PoolConnection, merchantId: number) {
  const expired = await rows(
    tx,
    `SELECT ${columns} FROM competitor_analysis_jobs WHERE merchant_id=? AND state='running' AND (lease_expires_at IS NULL OR lease_expires_at<=UTC_TIMESTAMP(3) OR deadline_at<=UTC_TIMESTAMP(3)) FOR UPDATE`,
    [merchantId]
  );
  for (const job of expired) {
    await tx.execute(
      "UPDATE competitor_analyses SET status='failed',error_message='COMPETITOR_ANALYSIS_INTERRUPTED' WHERE merchant_id=? AND id=? AND status='analyzing' AND BINARY name=BINARY ? AND BINARY url=BINARY ?",
      [merchantId, job.competitor_id, job.name, job.website_url]
    );
    await tx.execute(
      "UPDATE competitor_analysis_jobs SET state='interrupted',active_slot=NULL,lease_expires_at=NULL,updated_at=UTC_TIMESTAMP(3) WHERE id=? AND merchant_id=?",
      [job.id, merchantId]
    );
  }
}
export async function settleCompetitorAnalysisJobs(
  actorId: number,
  merchantId: number
) {
  return transaction(merchantId, async (tx, merchant) => {
    await authorize(tx, merchant, actorId, false);
    await settleExpired(tx, merchantId);
  });
}
export async function beginCompetitorAnalysisJob(
  actorId: number,
  merchantId: number,
  input: unknown
) {
  const command = competitorAnalysisStart.parse(input);
  let url: string;
  try {
    url = publicWebsiteUrl(command.url).href;
    if (url.length > 500) throw Error();
  } catch {
    throw new CompetitorJobError("website");
  }
  return transaction(merchantId, async (tx, merchant) => {
    await authorize(tx, merchant, actorId, true);
    await settleExpired(tx, merchantId);
    const [same] = await rows(
      tx,
      `SELECT ${columns} FROM competitor_analysis_jobs WHERE merchant_id=? AND request_id=? FOR UPDATE`,
      [merchantId, command.requestId]
    );
    if (same) {
      if (same.actor_id !== actorId) throw new CompetitorJobError("forbidden");
      if (same.name !== command.name || same.website_url !== url)
        throw new CompetitorJobError("stale");
      return {
        created: false,
        competitorId: Number(same.competitor_id),
        requestId: command.requestId,
        execution: null,
        url: null,
      };
    }
    if (
      (
        await rows(
          tx,
          "SELECT id FROM competitor_analysis_jobs WHERE merchant_id=? AND active_slot=1 FOR UPDATE",
          [merchantId]
        )
      ).length
    )
      throw new CompetitorJobError("busy");
    const [rate] = await rows(
      tx,
      `SELECT COUNT(*) AS total,COALESCE(SUM(started_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 20 SECOND)),0) AS recent FROM competitor_analysis_jobs WHERE merchant_id=? AND started_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 1 HOUR)`,
      [merchantId]
    );
    if (Number(rate.total) >= 5 || Number(rate.recent) > 0)
      throw new CompetitorJobError("cooldown");
    const [report]: any = await tx.execute(
      "INSERT INTO competitor_analyses (merchant_id,name,url,status) VALUES (?,?,?,'analyzing')",
      [merchantId, command.name, url]
    );
    if (!validId(Number(report.insertId)))
      throw new CompetitorJobError("unavailable");
    const execution = {
      merchantId,
      requestId: command.requestId,
      token: randomUUID(),
    };
    await tx.execute(
      `INSERT INTO competitor_analysis_jobs (merchant_id,request_id,actor_id,owner_id,competitor_id,name,website_url,execution_token,lease_expires_at,deadline_at) VALUES (?,?,?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 90 SECOND),DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 15 MINUTE))`,
      [
        merchantId,
        command.requestId,
        actorId,
        merchant.userId,
        Number(report.insertId),
        command.name,
        url,
        execution.token,
      ]
    );
    return {
      created: true,
      competitorId: Number(report.insertId),
      requestId: command.requestId,
      execution,
      url,
    };
  });
}
export async function readCompetitorAnalysisJob(
  actorId: number,
  merchantId: number,
  input: unknown
) {
  const { requestId } = competitorAnalysisAttempt.parse(input);
  return transaction(
    merchantId,
    async (tx, merchant) => {
      await authorize(tx, merchant, actorId, false);
      const [job] = await rows(
        tx,
        `SELECT ${columns} FROM competitor_analysis_jobs WHERE merchant_id=? AND request_id=?`,
        [merchantId, requestId]
      );
      const identity = { actorId, merchantId, requestId };
      if (!job)
        return {
          ...identity,
          state: "idle" as const,
          competitorId: null,
          reportAvailable: false,
        };
      if (job.actor_id !== actorId) throw new CompetitorJobError("forbidden");
      const report = await rows(
        tx,
        "SELECT id FROM competitor_analyses WHERE merchant_id=? AND id=? AND BINARY name=BINARY ? AND BINARY url=BINARY ?",
        [merchantId, job.competitor_id, job.name, job.website_url]
      );
      return {
        ...identity,
        state: (job.state === "running" && !job.lease_current
          ? "interrupted"
          : job.state) as "running" | "completed" | "failed" | "interrupted",
        competitorId: Number(job.competitor_id),
        reportAvailable: report.length === 1,
      };
    },
    false
  );
}
// Only DB work belongs inside this callback. Merchant, current authority and report stay locked.
async function withExecution<T>(
  input: CompetitorAnalysisExecution,
  work: (tx: PoolConnection, job: any) => Promise<T>
) {
  const scope = competitorAnalysisExecution.parse(input);
  return transaction(scope.merchantId, async (tx, merchant) => {
    const [job] = await rows(
      tx,
      `SELECT ${columns} FROM competitor_analysis_jobs WHERE merchant_id=? AND request_id=? AND execution_token=? FOR UPDATE`,
      [scope.merchantId, scope.requestId, scope.token]
    );
    if (
      !job ||
      job.state !== "running" ||
      !job.lease_current ||
      job.owner_id !== merchant.userId
    )
      throw new CompetitorJobError("expired");
    await authorize(tx, merchant, job.actor_id, true);
    const [report] = await rows(
      tx,
      "SELECT id,name,url,status FROM competitor_analyses WHERE merchant_id=? AND id=? FOR UPDATE",
      [scope.merchantId, job.competitor_id]
    );
    if (
      !report ||
      report.name !== job.name ||
      report.url !== job.website_url ||
      report.status !== "analyzing"
    )
      throw new CompetitorJobError("reference");
    return work(tx, job);
  });
}
export const assertCompetitorAnalysisJob = (
  scope: CompetitorAnalysisExecution
) => withExecution(scope, async () => undefined);
export const advanceCompetitorAnalysisJob = (
  scope: CompetitorAnalysisExecution
) =>
  withExecution(scope, async (tx, job) => {
    await tx.execute(
      "UPDATE competitor_analysis_jobs SET lease_expires_at=LEAST(DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 90 SECOND),deadline_at),updated_at=UTC_TIMESTAMP(3) WHERE id=?",
      [job.id]
    );
  });
export async function finishCompetitorAnalysisJob(
  scope: CompetitorAnalysisExecution,
  input: CompetitorAnalysisResult
) {
  const result = competitorAnalysisResult.parse(input);
  const safeUrl = (value: string | null) => {
    if (!value) return null;
    try {
      const href = publicWebsiteUrl(value).href;
      return href.length <= 500 ? href : null;
    } catch {
      return null;
    }
  };
  return withExecution(scope, async (tx, job) => {
    // New jobs start with no children; existing children indicate another writer or damaged linkage.
    if (
      (
        await rows(
          tx,
          "SELECT id FROM competitor_products WHERE competitor_id=? FOR UPDATE",
          [job.competitor_id]
        )
      ).length
    )
      throw new CompetitorJobError("reference");
    for (const product of result.products)
      await tx.execute(
        "INSERT INTO competitor_products (competitor_id,merchant_id,name,description,price,currency,image_url,product_url,category) VALUES (?,?,?,?,?,?,?,?,?)",
        [
          job.competitor_id,
          scope.merchantId,
          product.name,
          product.description,
          product.price,
          product.currency,
          safeUrl(product.imageUrl),
          safeUrl(product.productUrl),
          product.category,
        ]
      );
    const [current] = await rows(
      tx,
      `SELECT ${columns} FROM competitor_analysis_jobs WHERE id=?`,
      [job.id]
    );
    if (!current?.lease_current) throw new CompetitorJobError("expired");
    await tx.execute(
      "UPDATE competitor_analyses SET industry=?,overall_score=?,seo_score=?,performance_score=?,ux_score=?,content_score=?,product_count=?,avg_price=NULL,min_price=NULL,max_price=NULL,status='completed',error_message=NULL,analyzed_at=UTC_TIMESTAMP() WHERE id=? AND merchant_id=?",
      [
        result.industry,
        result.scores.overall,
        result.scores.seo,
        result.scores.performance,
        result.scores.ux,
        result.scores.content,
        result.products.length,
        job.competitor_id,
        scope.merchantId,
      ]
    );
    await tx.execute(
      "UPDATE competitor_analysis_jobs SET state='completed',active_slot=NULL,lease_expires_at=NULL,updated_at=UTC_TIMESTAMP(3) WHERE id=?",
      [job.id]
    );
  });
}
export const failCompetitorAnalysisJob = (scope: CompetitorAnalysisExecution) =>
  withExecution(scope, async (tx, job) => {
    await tx.execute(
      "UPDATE competitor_analyses SET status='failed',error_message='COMPETITOR_ANALYSIS_FAILED' WHERE id=? AND merchant_id=?",
      [job.competitor_id, scope.merchantId]
    );
    await tx.execute(
      "UPDATE competitor_analysis_jobs SET state='failed',active_slot=NULL,lease_expires_at=NULL,updated_at=UTC_TIMESTAMP(3) WHERE id=?",
      [job.id]
    );
  });
