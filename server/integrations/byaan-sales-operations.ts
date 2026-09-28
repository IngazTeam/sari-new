import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { decryptSecret } from '../security/secrets';
import { databaseTimeEpoch } from '../db/time';
import { policyArtifactDigest as digest } from '../ai/learning-policy-evaluation-bundle';
import { normalizeByaanTenantDomain, normalizeByaanApiBaseUrl } from './byaan-security';
import { byaanEnrollmentInput, byaanPaymentInput, byaanMerchantId, byaanSalesRequest,
  byaanSalesFailure, readByaanSalesResult, type ByaanSalesFailure, type ByaanSalesReceipt } from './byaan-sales-contract';
import { normalizeApiConversion } from './api-conversion-sync-core';
import { conversionPayloadDigest, readConversionObservations } from './api-conversion-history';

type Kind = 'enrollment' | 'payment';
type Intent = z.infer<typeof byaanEnrollmentInput> | z.infer<typeof byaanPaymentInput>;
export type ByaanOperationResult = ByaanSalesFailure | (ByaanSalesReceipt & { enrollmentId?: string; invoiceId?: string; paymentUrl?: string });
export type ByaanOperationMetadata = { operationId?: number; replayed?: boolean };
/** Internal capability supplied by the agreement adapter, never deserialized from a request. */
export type ByaanSalesAuthorization = {
  binding: string;
  assert: (c: PoolConnection, phase: 'reserve' | 'replay' | 'dispatch') => Promise<void>;
};
const id = byaanMerchantId;
const successSchema = z.object({ success: z.literal(true), outcome: z.literal('reported'), paymentEvidence: z.literal('not_verified'),
  tracking: z.enum(['recorded', 'unavailable']), conversionId: id.optional(), enrollmentId: z.string().optional(),
  invoiceId: z.string().optional(), paymentUrl: z.string().optional() }).strict()
  .refine(v => (v.tracking === 'recorded') === (v.conversionId !== undefined));
const failureSchema = z.object({ success: z.literal(false), outcome: z.enum(['not_sent', 'unknown']), retryable: z.literal(false), error: z.string() }).strict();
const resultSchema = z.union([successSchema, failureSchema]);
export const BYAAN_SALES_OPERATION_REQUIREMENTS = [{ table: 'byaan_sales_operations',
  columns: ['merchant_id', 'request_id', 'request_hash', 'operation_kind', 'authority_hash', 'attempt_token', 'state', 'result_json', 'result_hash'],
  uniqueIndexes: [{ name: 'byaan_sales_request', columns: ['merchant_id', 'request_id'] }], checkConstraints: ['chk_byaan_sales_operation'] }];
const assertSchema = () => assertRuntimeSchema('Byaan sales operations', BYAAN_SALES_OPERATION_REQUIREMENTS, { cacheSuccess: false });
class AuthorityUnavailable extends Error {}
export async function byaanSalesTransaction<T>(work: (c: PoolConnection) => Promise<T>): Promise<T> {
  const pool = await getPool(); if (!pool) throw Error('Database unavailable');
  const c = await pool.getConnection(); let reusable = true, committing = false;
  try { await c.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED'); await c.beginTransaction(); const result = await work(c); committing = true; await c.commit(); committing = false; return result; }
  catch (error) {
    if (committing) { reusable = false; c.destroy(); }
    else try { await c.rollback(); } catch { reusable = false; c.destroy(); }
    throw error;
  } finally { if (reusable) c.release(); }
}
function connectionHash(row: any) {
  const domain = normalizeByaanTenantDomain(row.tenant_domain), base = normalizeByaanApiBaseUrl(domain, row.api_base_url);
  const secret = decryptSecret(row.webhook_secret);
  if (typeof secret !== 'string' || secret.length < 32 || !row.is_active || !row.verified_at || !row.api_base_url) throw Error('Connection unavailable');
  const verifiedAt = databaseTimeEpoch(row.verified_at);
  if (!Number.isFinite(verifiedAt)) throw Error('Invalid connection verification time');
  return digest({ id: id.parse(row.id), merchantId: id.parse(row.merchant_id), domain, base,
    verifiedAt, secretHash: digest(secret) });
}
export async function lockByaanSalesAuthority(c: PoolConnection, merchantId: number) {
  const [merchants] = await c.execute<any[]>('SELECT userId,status FROM merchants WHERE id=? FOR UPDATE', [merchantId]);
  if (merchants.length !== 1 || merchants[0].status !== 'active') throw new AuthorityUnavailable();
  const [users] = await c.execute<any[]>("SELECT id FROM users WHERE id=? AND account_status='active' FOR SHARE", [merchants[0].userId]);
  if (users.length !== 1) throw new AuthorityUnavailable();
  const [connections] = await c.execute<any[]>('SELECT * FROM byaan_connections WHERE merchant_id=? FOR SHARE', [merchantId]);
  if (connections.length !== 1) throw new AuthorityUnavailable();
  let connection: string;
  try { connection = connectionHash(connections[0]); } catch { throw new AuthorityUnavailable(); }
  return { hash: digest({ merchantId, ownerId: users[0].id, connection }), connection };
}
const seal = (row: any, result: ByaanOperationResult) => digest({ version: 1, id: row.id, merchantId: row.merchant_id,
  requestId: row.request_id, requestHash: row.request_hash, authorityHash: row.authority_hash,
  token: row.attempt_token, kind: row.operation_kind, result });
function checkedResult(raw: unknown, kind: Kind): ByaanOperationResult {
  const result = resultSchema.parse(raw);
  if (result.success) {
    if (kind === 'enrollment' ? result.invoiceId !== undefined : result.enrollmentId !== undefined) throw Error('Wrong receipt kind');
    readByaanSalesResult(result, kind);
  } else if (result.error !== byaanSalesFailure(result.outcome).error) throw Error('Invalid failure');
  return result;
}
async function verifyTracking(c: PoolConnection, merchantId: number, kind: Kind, intent: Intent, result: ByaanOperationResult) {
  if (!result.success || result.tracking !== 'recorded') return;
  const [rows] = await c.execute<any[]>('SELECT * FROM sari_conversions WHERE id=? AND merchant_id=? FOR UPDATE', [id.parse(result.conversionId), merchantId]);
  if (rows.length !== 1) throw Error('Tracking unavailable');
  const history = await readConversionObservations(c, merchantId, rows[0]);
  const data: any = intent;
  const expected = normalizeApiConversion({ customerPhone: data.traineePhone, customerName: kind === 'enrollment' ? data.traineeName : '',
    actionType: kind, productName: (kind === 'enrollment' ? data.courseTitle : data.description) || `Course #${data.courseId}`,
    ...(kind === 'payment' ? { amount: data.amount } : {}), externalRef: kind === 'enrollment' ? result.enrollmentId : result.invoiceId,
    status: kind === 'enrollment' ? 'completed' : 'pending' });
  if (!history.length || history[0].observation.payloadDigest !== conversionPayloadDigest(merchantId, expected)) throw Error('Tracking identity mismatch');
}
/** Server-only guard. A caller must persist one request ID per agreed operation;
 * a new ID is a different operation, not a safe retry of an unknown one. */
export async function runByaanSalesOperation(merchantId: number, kind: Kind, request: unknown, rawIntent: unknown,
  work: (beforeDispatch: (connection: unknown) => Promise<void>) => Promise<ByaanOperationResult>,
  authorization?: ByaanSalesAuthorization): Promise<ByaanOperationResult & ByaanOperationMetadata> {
  const requestId = byaanSalesRequest.parse(request).requestId;
  merchantId = id.parse(merchantId);
  const intent = kind === 'enrollment' ? byaanEnrollmentInput.parse(rawIntent) : byaanPaymentInput.parse(rawIntent);
  const binding = authorization ? z.string().regex(/^[a-f0-9]{64}$/).parse(authorization.binding) : undefined;
  const authorize = authorization?.assert;
  const hash = digest({ version: 1, merchantId, kind, intent, ...(binding ? { authorization: binding } : {}) });
  let attempt: any;
  try {
    await assertSchema();
    const reservation = await byaanSalesTransaction(async c => {
      const authority = await lockByaanSalesAuthority(c, merchantId);
      const [rows] = await c.execute<any[]>('SELECT * FROM byaan_sales_operations WHERE merchant_id=? AND request_id=? FOR UPDATE', [merchantId, requestId]);
      if (authorize) await authorize(c, rows.length ? 'replay' : 'reserve');
      if (rows.length) {
        const row = rows[0];
        if (row.request_hash !== hash || row.operation_kind !== kind || row.authority_hash !== authority.hash) throw Error('Request conflict');
        if (['preparing', 'dispatching'].includes(row.state)) return { replay: { ...byaanSalesFailure('unknown'), operationId: row.id, replayed: true } };
        const result = checkedResult(typeof row.result_json === 'string' ? JSON.parse(row.result_json) : row.result_json, kind);
        if (row.state !== result.outcome || seal(row, result) !== row.result_hash) throw Error('Result unavailable');
        await verifyTracking(c, merchantId, kind, intent, result);
        return { replay: { ...result, operationId: row.id, replayed: true } };
      }
      const token = randomUUID();
      const [r] = await c.execute<any>(`INSERT INTO byaan_sales_operations
        (merchant_id,request_id,request_hash,operation_kind,authority_hash,attempt_token,state)
        VALUES (?,?,?,?,?,?,'preparing')`, [merchantId, requestId, hash, kind, authority.hash, token]);
      return { attempt: { id: Number(r.insertId), merchant_id: merchantId, request_id: requestId, request_hash: hash,
        operation_kind: kind, authority_hash: authority.hash, attempt_token: token } };
    });
    if (reservation.replay) return reservation.replay;
    attempt = reservation.attempt;
  } catch (error) { return byaanSalesFailure(error instanceof AuthorityUnavailable ? 'not_sent' : 'unknown'); }
  const lockAttempt = async (c: PoolConnection) => {
    const [rows] = await c.execute<any[]>('SELECT * FROM byaan_sales_operations WHERE id=? AND merchant_id=? FOR UPDATE', [attempt.id, merchantId]);
    if (rows.length !== 1 || Object.keys(attempt).some(key => rows[0][key] !== attempt[key])) throw Error('Attempt changed');
    return rows[0];
  };
  let result: ByaanOperationResult;
  try {
    result = await work(async snapshot => {
      await byaanSalesTransaction(async c => {
        const authority = await lockByaanSalesAuthority(c, merchantId);
        if (authority.hash !== attempt.authority_hash || authority.connection !== connectionHash(snapshot)) throw Error('Authority changed');
        const row = await lockAttempt(c);
        if (row.state !== 'preparing') throw Error('Dispatch already reserved');
        if (authorize) await authorize(c, 'dispatch');
        await c.execute("UPDATE byaan_sales_operations SET state='dispatching',updated_at=UTC_TIMESTAMP(3) WHERE id=?", [attempt.id]);
      });
    });
  } catch { result = byaanSalesFailure('unknown'); }
  try {
    return await byaanSalesTransaction(async c => {
      const row = await lockAttempt(c);
      if (!['preparing', 'dispatching'].includes(row.state)) throw Error('Attempt settled');
      if (row.state === 'preparing') result = byaanSalesFailure('not_sent');
      else if (!result.success) result = byaanSalesFailure('unknown');
      result = checkedResult(result, kind);
      await c.execute(`UPDATE byaan_sales_operations SET state=?,result_json=?,result_hash=?,updated_at=UTC_TIMESTAMP(3) WHERE id=?`,
        [result.outcome, JSON.stringify(result), seal(row, result), attempt.id]);
      return { ...result, operationId: attempt.id, replayed: false };
    });
  } catch { return { ...byaanSalesFailure('unknown'), operationId: attempt.id, replayed: false }; }
}
