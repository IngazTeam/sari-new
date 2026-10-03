import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { KnowledgeTransaction } from "./transaction";
import type { PoolConnection } from "mysql2/promise";
import { getPool } from "../db/connection";
import { assertRuntimeSchema } from "../db/schema-readiness";
import {
  ALL_ROLES,
  hasPermission,
  type MerchantRole,
} from "../_core/permissions";
import { websiteAnalysisAttempt } from "../../shared/website-analysis-tracking";
import {
  websiteJobExecution,
  websiteJobStep,
  websiteJobResult,
  type WebsiteJobExecution,
  type WebsiteJobResult,
} from "../../shared/website-analysis-job";

export class WebsiteJobError extends Error {
  constructor(
    readonly reason:
      | "forbidden"
      | "unavailable"
      | "expired"
      | "website"
      | "cooldown"
      | "unknown"
  ) {
    super(`website_job:${reason}`);
  }
}
const validId = (value: number) =>
  Number.isInteger(value) && value > 0 && value <= 2147483647;
async function rows(
  tx: PoolConnection,
  query: string,
  args: any[] = []
): Promise<any[]> {
  const [data] = await tx.execute(query, args);
  if (!Array.isArray(data)) throw new WebsiteJobError("unavailable");
  return data;
}
const columns = `*, lease_expires_at > UTC_TIMESTAMP(3) AND deadline_at > UTC_TIMESTAMP(3) AS lease_current,
  GREATEST(0,TIMESTAMPDIFF(MICROSECOND,started_at,UTC_TIMESTAMP(3))/1000) AS elapsed_ms`;
async function ready() {
  await assertRuntimeSchema("durable website analysis jobs", [
    {
      table: "website_analysis_jobs",
      columns: [
        "actor_id",
        "owner_id",
        "execution_token",
        "lease_expires_at",
        "deadline_at",
        "result_json",
        "active_slot",
      ],
      uniqueIndexes: [
        { name: "uq_website_job_request", columns: ["merchant_id", "job_id"] },
        {
          name: "uq_website_job_active",
          columns: ["merchant_id", "active_slot"],
        },
      ],
      checkConstraints: [
        {
          name: "ck_website_job_active",
          expression:
            "(state = 'running' AND active_slot IS NOT NULL AND active_slot = 1) OR (state <> 'running' AND active_slot IS NULL)",
          enforced: true,
        },
      ],
    },
  ]);
}

/** Database-only work. Every mutation serializes against other attempts through the merchant row. */
async function transaction<T>(
  merchantId: number,
  write: boolean,
  work: (tx: PoolConnection, merchant: any) => Promise<T>
): Promise<T> {
  if (!validId(merchantId)) throw new WebsiteJobError("forbidden");
  let tx: PoolConnection | undefined,
    committing = false,
    reusable = true;
  try {
    await ready();
    const pool = await getPool();
    if (!pool) throw new WebsiteJobError("unavailable");
    tx = await pool.getConnection();
    await tx.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await tx.beginTransaction();
    const [merchant] = await rows(
      tx,
      `SELECT id,userId,status,website_url AS websiteUrl,businessName,description,phone FROM merchants WHERE id=? FOR ${write ? "UPDATE" : "SHARE"}`,
      [merchantId]
    );
    if (!merchant) throw new WebsiteJobError("forbidden");
    const value = await work(tx, merchant);
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
    if (committing && write) throw new WebsiteJobError("unknown");
    if (error instanceof WebsiteJobError) throw error;
    throw new WebsiteJobError("unavailable");
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
  if (!validId(actorId)) throw new WebsiteJobError("forbidden");
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
  validateAuthority(merchant, actorId, write, users, members);
}

function validateAuthority(
  merchant: any,
  actorId: number,
  write: boolean,
  users: any[],
  members: any[]
) {
  const role =
    members.length === 1 && members[0].is_active === 1
      ? members[0].role
      : !members.length && merchant.userId === actorId
        ? "owner"
        : null;
  if (
    !["active", "pending"].includes(merchant.status) ||
    users.find(row => row.id === actorId)?.account_status !== "active" ||
    users.find(row => row.id === merchant.userId)?.account_status !==
      "active" ||
    !ALL_ROLES.includes(role) ||
    (write &&
      (merchant.status !== "active" ||
        !hasPermission(role as MerchantRole, "bot_settings.manage")))
  )
    throw new WebsiteJobError("forbidden");
}

/** Called inside the same Drizzle transaction as a knowledge write, after its merchant lock. */
export async function assertWebsiteAnalysisTransaction(
  tx: KnowledgeTransaction,
  input: WebsiteJobExecution
) {
  const scope = websiteJobExecution.parse(input);
  const read = async (query: ReturnType<typeof sql>) => {
    const [value] = await tx.execute(query);
    if (!Array.isArray(value)) throw new WebsiteJobError("unavailable");
    return value as any[];
  };
  const [merchant] = await read(
    sql`SELECT id,userId,status,website_url AS websiteUrl FROM merchants WHERE id=${scope.merchantId} FOR UPDATE`
  );
  const [job] =
    await read(sql`SELECT *,lease_expires_at>UTC_TIMESTAMP(3) AND deadline_at>UTC_TIMESTAMP(3) AS lease_current
    FROM website_analysis_jobs WHERE merchant_id=${scope.merchantId} AND job_id=${scope.jobId} AND execution_token=${scope.token} FOR UPDATE`);
  if (
    !merchant ||
    !job ||
    job.state !== "running" ||
    !job.lease_current ||
    job.owner_id !== merchant.userId ||
    job.website_url !== merchant.websiteUrl
  )
    throw new WebsiteJobError("expired");
  const users = await read(
    sql`SELECT id,account_status FROM users WHERE id IN (${job.actor_id},${merchant.userId}) ORDER BY id FOR SHARE`
  );
  const members = await read(
    sql`SELECT role,is_active FROM merchant_members WHERE merchant_id=${scope.merchantId} AND user_id=${job.actor_id} FOR SHARE`
  );
  validateAuthority(merchant, job.actor_id, true, users, members);
}

function view(merchantId: number, jobId: string, row: any) {
  if (!row) return { merchantId, jobId, status: "idle" as const };
  if (row.state === "completed") {
    let parsed;
    try {
      parsed = websiteJobResult.safeParse(
        typeof row.result_json === "string"
          ? JSON.parse(row.result_json)
          : row.result_json
      );
    } catch {
      /* corrupt legacy result */
    }
    return parsed?.success
      ? { ...parsed.data, merchantId, jobId, status: "completed" as const }
      : {
          merchantId,
          jobId,
          status: "error" as const,
          issue: "result_unavailable" as const,
        };
  }
  if (row.state !== "running" || !row.lease_current)
    return {
      merchantId,
      jobId,
      status: "error" as const,
      issue:
        row.state === "error"
          ? ("processing_failed" as const)
          : ("interrupted" as const),
    };
  if (
    !websiteJobStep.safeParse(row.current_step).success ||
    row.current_step === "completed" ||
    !Number.isInteger(row.progress) ||
    row.progress < 0 ||
    row.progress > 99
  )
    return {
      merchantId,
      jobId,
      status: "error" as const,
      issue: "result_unavailable" as const,
    };
  return {
    merchantId,
    jobId,
    status: "running" as const,
    currentStep: row.current_step,
    progress: row.progress,
    elapsedMs: Number(row.elapsed_ms),
  };
}

/** Duplicate starts return the existing receipt and never schedule another provider call. */
export async function beginWebsiteAnalysisJob(
  actorId: number,
  merchantId: number,
  jobId: string
) {
  websiteAnalysisAttempt.parse({ merchantId, jobId });
  return transaction(merchantId, true, async (tx, merchant) => {
    await authorize(tx, merchant, actorId, true);
    await tx.execute(
      `UPDATE website_analysis_jobs SET state='uncertain',active_slot=NULL,issue='interrupted',lease_expires_at=NULL,updated_at=UTC_TIMESTAMP(3)
      WHERE merchant_id=? AND state='running' AND (lease_expires_at IS NULL OR lease_expires_at<=UTC_TIMESTAMP(3) OR deadline_at<=UTC_TIMESTAMP(3))`,
      [merchantId]
    );
    const [same] = await rows(
      tx,
      `SELECT ${columns} FROM website_analysis_jobs WHERE merchant_id=? AND job_id=? FOR UPDATE`,
      [merchantId, jobId]
    );
    if (same)
      return {
        created: false,
        jobId: same.job_id,
        alreadyRunning: same.state === "running",
        execution: null,
        merchant: null,
        websiteUrl: null,
      };
    const [active] = await rows(
      tx,
      `SELECT ${columns} FROM website_analysis_jobs WHERE merchant_id=? AND active_slot=1 FOR UPDATE`,
      [merchantId]
    );
    if (active)
      return {
        created: false,
        jobId: active.job_id,
        alreadyRunning: true,
        execution: null,
        merchant: null,
        websiteUrl: null,
      };
    const [recent] = await rows(
      tx,
      `SELECT id FROM website_analysis_jobs WHERE merchant_id=? AND started_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 20 SECOND) LIMIT 1`,
      [merchantId]
    );
    if (recent) throw new WebsiteJobError("cooldown");
    let url: URL;
    try {
      url = new URL(merchant.websiteUrl);
    } catch {
      throw new WebsiteJobError("website");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      merchant.websiteUrl.length > 2048
    )
      throw new WebsiteJobError("website");
    const execution = { merchantId, jobId, token: randomUUID() };
    await tx.execute(
      `INSERT INTO website_analysis_jobs (merchant_id,job_id,actor_id,owner_id,website_url,execution_token,lease_expires_at,deadline_at)
      VALUES (?,?,?,?,?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 90 SECOND),DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 15 MINUTE))`,
      [
        merchantId,
        jobId,
        actorId,
        merchant.userId,
        merchant.websiteUrl,
        execution.token,
      ]
    );
    return {
      created: true,
      jobId,
      alreadyRunning: false,
      execution,
      merchant,
      websiteUrl: merchant.websiteUrl as string,
    };
  });
}

export async function readWebsiteAnalysisJob(
  actorId: number,
  merchantId: number,
  jobId: string
) {
  websiteAnalysisAttempt.parse({ merchantId, jobId });
  return transaction(merchantId, false, async (tx, merchant) => {
    await authorize(tx, merchant, actorId, false);
    const [row] = await rows(
      tx,
      `SELECT ${columns} FROM website_analysis_jobs WHERE merchant_id=? AND job_id=?`,
      [merchantId, jobId]
    );
    return view(merchantId, jobId, row);
  });
}

/** The callback must do DB writes only; the held authority also fences expiry recovery and replacement. */
export async function withWebsiteAnalysisWrite<T>(
  input: WebsiteJobExecution,
  work: (tx: PoolConnection) => Promise<T>
) {
  const scope = websiteJobExecution.parse(input);
  return transaction(scope.merchantId, true, async (tx, merchant) => {
    const [job] = await rows(
      tx,
      `SELECT ${columns} FROM website_analysis_jobs WHERE merchant_id=? AND job_id=? AND execution_token=? FOR UPDATE`,
      [scope.merchantId, scope.jobId, scope.token]
    );
    if (!job || job.state !== "running" || !job.lease_current)
      throw new WebsiteJobError("expired");
    await authorize(tx, merchant, job.actor_id, true);
    if (
      job.owner_id !== merchant.userId ||
      job.website_url !== merchant.websiteUrl
    )
      throw new WebsiteJobError("expired");
    return work(tx);
  });
}

export const assertWebsiteAnalysisJob = (scope: WebsiteJobExecution) =>
  withWebsiteAnalysisWrite(scope, async () => undefined);
export async function advanceWebsiteAnalysisJob(
  scope: WebsiteJobExecution,
  step?: string,
  progress?: number
) {
  if ((step === undefined) !== (progress === undefined))
    throw new WebsiteJobError("unavailable");
  if (step !== undefined) {
    websiteJobStep.parse(step);
    if (
      step === "completed" ||
      !Number.isInteger(progress) ||
      progress! < 0 ||
      progress! > 99
    )
      throw new WebsiteJobError("unavailable");
  }
  return withWebsiteAnalysisWrite(scope, async tx => {
    const [updated]: any = await tx.execute(
      `UPDATE website_analysis_jobs SET lease_expires_at=LEAST(DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 90 SECOND),deadline_at),updated_at=UTC_TIMESTAMP(3)
      ${step !== undefined ? ",current_step=?,progress=?" : ""} WHERE merchant_id=? AND job_id=? ${step !== undefined ? "AND progress<=?" : ""}`,
      [
        ...(step !== undefined ? [step, progress!] : []),
        scope.merchantId,
        scope.jobId,
        ...(step !== undefined ? [progress!] : []),
      ]
    );
    if (updated.affectedRows !== 1) throw new WebsiteJobError("expired");
  });
}

export async function finishWebsiteAnalysisJob(
  scope: WebsiteJobExecution,
  result: WebsiteJobResult
) {
  const payload = JSON.stringify(websiteJobResult.parse(result));
  return withWebsiteAnalysisWrite(scope, async tx => {
    await tx.execute(
      `UPDATE website_analysis_jobs SET state='completed',active_slot=NULL,current_step='completed',progress=100,result_json=?,issue=NULL,lease_expires_at=NULL,updated_at=UTC_TIMESTAMP(3)
      WHERE merchant_id=? AND job_id=?`,
      [payload, scope.merchantId, scope.jobId]
    );
  });
}
export async function failWebsiteAnalysisJob(
  scope: WebsiteJobExecution,
  issue: "processing_failed" | "interrupted" = "processing_failed"
) {
  if (!["processing_failed", "interrupted"].includes(issue))
    throw new WebsiteJobError("unavailable");
  return withWebsiteAnalysisWrite(scope, async tx => {
    await tx.execute(
      `UPDATE website_analysis_jobs SET state=?,active_slot=NULL,issue=?,lease_expires_at=NULL,updated_at=UTC_TIMESTAMP(3) WHERE merchant_id=? AND job_id=?`,
      [
        issue === "interrupted" ? "uncertain" : "error",
        issue,
        scope.merchantId,
        scope.jobId,
      ]
    );
  });
}
