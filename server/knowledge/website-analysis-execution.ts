import { AsyncLocalStorage } from "node:async_hooks";
import type { Pool, PoolConnection } from "mysql2/promise";
import type { KnowledgeTransaction } from "./transaction";
import {
  websiteJobExecution,
  type WebsiteJobExecution,
} from "../../shared/website-analysis-job";
import {
  advanceWebsiteAnalysisJob,
  assertWebsiteAnalysisJob,
  assertWebsiteAnalysisTransaction,
  withWebsiteAnalysisWrite,
  WebsiteJobError,
} from "./website-analysis-jobs";

const active = new AsyncLocalStorage<WebsiteJobExecution>();
export const currentWebsiteAnalysisExecution = () => active.getStore();
export const runWebsiteAnalysisExecution = <T>(
  scope: WebsiteJobExecution,
  work: () => Promise<T>
) => active.run(websiteJobExecution.parse(scope), work);

function scopeFor(merchantId?: number) {
  const scope = active.getStore();
  if (scope && scope.merchantId !== merchantId)
    throw new WebsiteJobError("forbidden");
  return scope;
}
export async function assertWebsiteAnalysisCheckpoint(merchantId?: number) {
  const scope = scopeFor(merchantId);
  if (scope) await assertWebsiteAnalysisJob(scope);
}
export async function assertActiveWebsiteAnalysisTransaction(
  tx: KnowledgeTransaction,
  merchantId: number
) {
  const scope = scopeFor(merchantId);
  if (scope) await assertWebsiteAnalysisTransaction(tx, scope);
}
export async function runWebsiteAnalysisKnowledgeWrite<T>(
  pool: Pool,
  merchantId: number,
  write: (tx: Pool | PoolConnection) => Promise<T>
): Promise<T> {
  const scope = scopeFor(merchantId);
  return scope ? withWebsiteAnalysisWrite(scope, write) : write(pool);
}

/** No overlapping renewals. A failed heartbeat stops itself; writes still verify the durable lease. */
export function startWebsiteAnalysisHeartbeat(scope: WebsiteJobExecution) {
  let pending: Promise<void> | null = null,
    stopped = false;
  const timer = setInterval(() => {
    if (stopped || pending) return;
    pending = advanceWebsiteAnalysisJob(scope)
      .catch(() => {
        stopped = true;
        clearInterval(timer);
      })
      .finally(() => {
        pending = null;
      });
  }, 30_000);
  timer.unref?.();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await pending;
  };
}
