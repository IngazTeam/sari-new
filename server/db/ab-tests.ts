import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import type { abTestResults } from '../../drizzle/schema';
import { getPool } from './connection';
import { abCreateInput, abIdentity, abStatus, abWinner, LegacyABConflict } from '../ai/legacy-ab-contract';

type Test = typeof abTestResults.$inferSelect;
const columns = `id, merchant_id AS merchantId, test_name AS testName, keyword,
  variant_a_id AS variantAId, variant_a_text AS variantAText, variant_a_usage_count AS variantAUsageCount,
  variant_a_success_count AS variantASuccessCount, variant_b_id AS variantBId, variant_b_text AS variantBText,
  variant_b_usage_count AS variantBUsageCount, variant_b_success_count AS variantBSuccessCount,
  status, winner, confidence_level AS confidenceLevel,
  DATE_FORMAT(started_at,'%Y-%m-%d %H:%i:%s') AS startedAt,
  DATE_FORMAT(completed_at,'%Y-%m-%d %H:%i:%s') AS completedAt,
  DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s') AS createdAt,
  DATE_FORMAT(updated_at,'%Y-%m-%d %H:%i:%s') AS updatedAt`;
const conflict = (): never => { throw new LegacyABConflict(); };
async function pool() { const value = await getPool(); if (!value) conflict(); return value!; }
// Keep data access independent of checkout, campaigns and AI module initialization.
async function transaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await (await pool()).getConnection();
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await connection.beginTransaction(); const result = await work(connection); await connection.commit(); return result;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
async function lockMerchant(c: PoolConnection, merchantId: number) {
  const [rows] = await c.execute<any[]>('SELECT id FROM merchants WHERE id=? FOR UPDATE', [merchantId]);
  if (rows.length !== 1) conflict();
}
async function lockedTest(c: PoolConnection, merchantId: number, testId: number) {
  const [rows] = await c.execute<any[]>(`SELECT ${columns} FROM ab_test_results WHERE merchant_id=? AND id=? FOR UPDATE`, [merchantId, testId]);
  if (rows.length !== 1) conflict(); return rows[0] as Test;
}
export async function createABTest(data: z.infer<typeof abCreateInput> & { merchantId: number; variantAId?: number; variantBId?: number }) {
  const input = abCreateInput.extend({ merchantId: abIdentity, variantAId: abIdentity.optional(), variantBId: abIdentity.optional() }).strict().parse(data);
  return transaction(async c => {
    await lockMerchant(c, input.merchantId);
    const [active] = await c.execute<any[]>('SELECT id FROM ab_test_results WHERE merchant_id=? AND keyword=? AND status=? LIMIT 1 FOR UPDATE', [input.merchantId, input.keyword, 'running']);
    if (active.length) conflict();
    for (const id of [input.variantAId, input.variantBId]) if (id !== undefined) {
      const [rows] = await c.execute<any[]>('SELECT id FROM quick_responses WHERE id=? AND merchant_id=? FOR SHARE', [id, input.merchantId]);
      if (rows.length !== 1) conflict();
    }
    const [result] = await c.execute<any>(`INSERT INTO ab_test_results
      (merchant_id,test_name,keyword,variant_a_id,variant_a_text,variant_b_id,variant_b_text,status,confidence_level)
      VALUES (?,?,?,?,?,?,?,'running',0)`, [input.merchantId, input.testName, input.keyword,
      input.variantAId ?? null, input.variantAText, input.variantBId ?? null, input.variantBText]);
    return Number(result.insertId);
  });
}
export async function getABTests(merchantId: number, status?: z.infer<typeof abStatus>) {
  const merchant = abIdentity.parse(merchantId), state = abStatus.optional().parse(status);
  const [rows] = await (await pool()).execute<any[]>(`SELECT ${columns} FROM ab_test_results WHERE merchant_id=?${state ? ' AND status=?' : ''} ORDER BY started_at DESC, id DESC`, state ? [merchant, state] : [merchant]);
  return rows as Test[];
}
export async function getABTestById(testId: number, merchantId: number) {
  const merchant = abIdentity.parse(merchantId), id = abIdentity.parse(testId);
  const [rows] = await (await pool()).execute<any[]>(`SELECT ${columns} FROM ab_test_results WHERE merchant_id=? AND id=?`, [merchant, id]);
  return (rows[0] as Test | undefined) ?? null;
}
export async function getActiveABTestForKeyword(merchantId: number, keyword: string) {
  const merchant = abIdentity.parse(merchantId), key = abCreateInput.shape.keyword.parse(keyword);
  const [rows] = await (await pool()).execute<any[]>(`SELECT ${columns} FROM ab_test_results WHERE merchant_id=? AND keyword=? AND status='running' ORDER BY id LIMIT 2`, [merchant, key]);
  // Old databases can contain duplicate active tests from the former unlocked path.
  return rows.length === 1 ? rows[0] as Test : null;
}
export async function trackABTestUsage(testId: number, variant: 'A' | 'B', wasSuccessful: boolean, merchantId: number) {
  const id = abIdentity.parse(testId), merchant = abIdentity.parse(merchantId);
  const arm = z.enum(['A', 'B']).parse(variant) === 'A' ? 'a' : 'b', successful = z.boolean().parse(wasSuccessful);
  // Descriptive observations only: no payment attribution or experiment evidence.
  const [result] = await (await pool()).execute<any>(`UPDATE ab_test_results SET
    variant_${arm}_usage_count=variant_${arm}_usage_count+1,
    variant_${arm}_success_count=variant_${arm}_success_count+?, updated_at=NOW()
    WHERE id=? AND merchant_id=? AND status='running'
      AND variant_${arm}_usage_count>=0 AND variant_${arm}_usage_count<2147483647
      AND variant_${arm}_success_count>=0 AND variant_${arm}_success_count<=variant_${arm}_usage_count`, [successful ? 1 : 0, id, merchant]);
  if (result.affectedRows !== 1) conflict();
}
export async function declareABTestWinner(testId: number, winner: z.infer<typeof abWinner>, merchantId: number) {
  const id = abIdentity.parse(testId), merchant = abIdentity.parse(merchantId), selected = abWinner.parse(winner);
  return transaction(async c => {
    await lockMerchant(c, merchant); const test = await lockedTest(c, merchant, id);
    if (test.status === 'completed') { if (test.winner !== selected) conflict(); return; }
    // Explicit manual selection, never an inferred or statistically proven winner.
    await c.execute("UPDATE ab_test_results SET status='completed',winner=?,confidence_level=0,completed_at=NOW(),updated_at=NOW() WHERE merchant_id=? AND id=?", [selected, merchant, id]);
  });
}
async function changeState(testId: number, merchantId: number, next: 'running' | 'paused') {
  const id = abIdentity.parse(testId), merchant = abIdentity.parse(merchantId);
  return transaction(async c => {
    await lockMerchant(c, merchant); const test = await lockedTest(c, merchant, id);
    if (test.status === 'completed') conflict();
    if (test.status === next) return;
    if (next === 'running') {
      const [active] = await c.execute<any[]>("SELECT id FROM ab_test_results WHERE merchant_id=? AND keyword=? AND status='running' AND id<>? LIMIT 1 FOR UPDATE", [merchant, test.keyword, id]);
      if (active.length) conflict();
    }
    await c.execute('UPDATE ab_test_results SET status=?,updated_at=NOW() WHERE merchant_id=? AND id=?', [next, merchant, id]);
  });
}
export const pauseABTest = (testId: number, merchantId: number) => changeState(testId, merchantId, 'paused');
export const resumeABTest = (testId: number, merchantId: number) => changeState(testId, merchantId, 'running');
