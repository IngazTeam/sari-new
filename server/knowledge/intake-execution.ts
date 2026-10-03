import { AsyncLocalStorage } from 'node:async_hooks';
import type { Pool, PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { and, eq, sql } from 'drizzle-orm';
import { knowledgeIntakeReceipts } from '../../drizzle/schema';
import type { KnowledgeTransaction } from './transaction';
import { currentWebsiteAnalysisExecution, assertActiveWebsiteAnalysisTransaction, assertWebsiteAnalysisCheckpoint, runWebsiteAnalysisKnowledgeWrite } from './website-analysis-execution';

export type IntakeExecution = { merchantId: number; requestId: string; token: string };
const activeExecution = new AsyncLocalStorage<IntakeExecution>();
export const runIntakeExecution = <T>(execution: IntakeExecution, work: () => Promise<T>) => activeExecution.run(execution, work);
export class IntakeExecutionExpired extends Error {
  constructor() { super('Knowledge intake execution is no longer active'); this.name = 'IntakeExecutionExpired'; }
}
const eligibility = `merchant_id = ? AND request_id = ? AND execution_token = ? AND state = 'processing'
  AND lease_expires_at > UTC_TIMESTAMP() AND created_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 MINUTE)`;
const identity = (scope: IntakeExecution) => [scope.merchantId, scope.requestId, scope.token];

export async function assertIntakeTransaction(tx: KnowledgeTransaction, merchantId: number) {
  await assertActiveWebsiteAnalysisTransaction(tx,merchantId);
  const scope = activeExecution.getStore(); if (!scope) return;
  if (scope.merchantId !== merchantId) throw new IntakeExecutionExpired();
  const table = knowledgeIntakeReceipts;
  const [row] = await tx.select({ id: table.id }).from(table).where(and(eq(table.merchantId, merchantId), eq(table.requestId, scope.requestId),
    eq(table.executionToken, scope.token), eq(table.state, 'processing'), sql`${table.leaseExpiresAt} > UTC_TIMESTAMP()`,
    sql`${table.createdAt} > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 MINUTE)`)).for('update');
  if (!row) throw new IntakeExecutionExpired();
}

/** No provider work here. Merchant lock serializes writes with recovery and deletion. */
async function fencedConnection<T>(pool: Pool, scope: IntakeExecution, write: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [merchant] = await connection.execute<any[]>('SELECT id FROM merchants WHERE id = ? FOR UPDATE', [scope.merchantId]);
    if (!merchant.length) throw new IntakeExecutionExpired();
    const [receipt] = await connection.execute<any[]>(`SELECT id FROM knowledge_intake_receipts WHERE ${eligibility} FOR UPDATE`, identity(scope));
    if (!receipt.length) throw new IntakeExecutionExpired();
    const result = await write(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

/** Legacy callers keep their existing behavior. An intake can only write to its own tenant. */
export async function runKnowledgeWrite<T>(pool: Pool, merchantId: number, write: (connection: Pool | PoolConnection) => Promise<T>): Promise<T> {
  const scope = activeExecution.getStore();
  if(currentWebsiteAnalysisExecution()) {
    if(scope)throw new IntakeExecutionExpired();
    return runWebsiteAnalysisKnowledgeWrite(pool,merchantId,write);
  }
  if (!scope) return write(pool);
  if (scope.merchantId !== merchantId) throw new IntakeExecutionExpired();
  return fencedConnection(pool, scope, write);
}

/** Avoid starting another model call after expiry; the write fence remains the atomic authority. */
export async function assertIntakeCheckpoint(merchantId?: number): Promise<void> {
  await assertWebsiteAnalysisCheckpoint(merchantId);
  const scope = activeExecution.getStore();
  if (!scope) return;
  if (scope.merchantId !== merchantId) throw new IntakeExecutionExpired();
  const pool = await getPool(); if (!pool) throw new IntakeExecutionExpired();
  const [rows] = await pool.execute<any[]>(`SELECT id FROM knowledge_intake_receipts WHERE ${eligibility}`, identity(scope));
  if (!rows.length) throw new IntakeExecutionExpired();
}

export async function renewIntakeLease(scope: IntakeExecution): Promise<void> {
  const pool = await getPool(); if (!pool) throw new IntakeExecutionExpired();
  await fencedConnection(pool, scope, connection => connection.execute(
    `UPDATE knowledge_intake_receipts SET lease_expires_at = LEAST(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 90 SECOND), DATE_ADD(created_at, INTERVAL 30 MINUTE)) WHERE ${eligibility}`, identity(scope)));
}

/** A failed renewal never resurrects a lease. No overlapping renewals or detached writes. */
export function startIntakeHeartbeat(scope: IntakeExecution) {
  let pending: Promise<void> | null = null, stopped = false;
  const timer = setInterval(() => {
    if (stopped || pending) return;
    pending = renewIntakeLease(scope).catch(() => { stopped = true; clearInterval(timer); }).finally(() => { pending = null; });
  }, 30_000);
  timer.unref?.();
  return async () => { stopped = true; clearInterval(timer); await pending; };
}
