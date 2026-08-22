import { getPool } from '../db';
import { assertRuntimeSchema } from '../db/schema-readiness';
import {
  ApiConversionAction,
  ApiConversionConflictError,
  ApiConversionStatus,
  canAdvanceConversionStatus,
  normalizeApiConversion,
} from './api-conversion-sync-core';
import { ByaanSyncValidationError } from './byaan-sync-errors';

export { ApiConversionConflictError } from './api-conversion-sync-core';

export interface ApiConversionWriteResult {
  id: number;
  created: boolean;
  status: ApiConversionStatus;
}

export interface ConversionLedgerSummary {
  totalEnrollments: number;
  totalPayments: number;
  totalRevenue: number;
}

export interface ConversionLedgerRow {
  id: number;
  customer_phone: string | null;
  customer_name: string | null;
  action_type: string;
  product_name: string | null;
  amount: string | number | null;
  external_ref: string | null;
  source: string | null;
  status: string | null;
  created_at: string;
}

interface StoredConversion {
  id: number;
  customer_phone: string;
  customer_name: string | null;
  action_type: string;
  product_name: string;
  amount: string | number | null;
  external_ref: string;
  status: ApiConversionStatus;
}

function sameNullableText(left: unknown, right: string | null): boolean {
  return (left === undefined || left === null ? null : String(left)) === right;
}

function sameAmount(left: unknown, right: string | null): boolean {
  if (left === undefined || left === null || left === '') return right === null;
  if (right === null) return false;
  return Math.round(Number(left) * 100) === Math.round(Number(right) * 100);
}

export async function recordApiConversion(merchantId: number, input: unknown): Promise<ApiConversionWriteResult> {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0) {
    throw new Error('Invalid merchant for API conversion');
  }
  const conversion = normalizeApiConversion(input);
  await assertRuntimeSchema('API conversion ledger', [
    { table: 'merchants' },
    { table: 'sari_conversions', columns: ['idempotency_key'] },
  ]);
  const pool = await getPool();
  if (!pool) throw new Error('Conversion ledger unavailable');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [merchantRows] = await connection.execute(
      'SELECT id FROM merchants WHERE id = ? LIMIT 1',
      [merchantId],
    );
    if (!(merchantRows as Array<{ id: number }>).length) throw new Error('Conversion merchant not found');

    const [writeResult] = await connection.execute(
      `INSERT INTO sari_conversions (
         merchant_id, customer_phone, customer_name, action_type, product_name, amount,
         external_ref, idempotency_key, source, status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'api', ?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
      [
        merchantId,
        conversion.customerPhone,
        conversion.customerName,
        conversion.actionType,
        conversion.productName,
        conversion.amount,
        conversion.externalRef,
        conversion.idempotencyKey,
        conversion.status,
      ],
    );
    const conversionId = Number((writeResult as { insertId?: number }).insertId || 0);
    if (!Number.isSafeInteger(conversionId) || conversionId <= 0) throw new Error('Conversion write returned no identity');

    const [rows] = await connection.execute(
      `SELECT id, customer_phone, customer_name, action_type, product_name, amount, external_ref, status
       FROM sari_conversions
       WHERE id = ? AND merchant_id = ? AND source = 'api' AND idempotency_key = ?
       LIMIT 1 FOR UPDATE`,
      [conversionId, merchantId, conversion.idempotencyKey],
    );
    const stored = (rows as StoredConversion[])[0];
    if (!stored) throw new Error('Conversion identity could not be reloaded');

    const payloadMatches =
      stored.customer_phone === conversion.customerPhone
      && sameNullableText(stored.customer_name, conversion.customerName)
      && stored.action_type === conversion.actionType
      && stored.product_name === conversion.productName
      && sameAmount(stored.amount, conversion.amount)
      && stored.external_ref === conversion.externalRef;
    if (!payloadMatches || !canAdvanceConversionStatus(stored.status, conversion.status)) {
      throw new ApiConversionConflictError();
    }

    if (stored.status !== conversion.status) {
      await connection.execute(
        `UPDATE sari_conversions SET status = ?
         WHERE id = ? AND merchant_id = ? AND source = 'api' AND idempotency_key = ?`,
        [conversion.status, conversionId, merchantId, conversion.idempotencyKey],
      );
    }

    await connection.commit();
    return {
      id: conversionId,
      created: Number((writeResult as { affectedRows?: number }).affectedRows || 0) === 1,
      status: conversion.status,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function assertLedgerQuery(merchantId: number, startAt?: Date): void {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0) throw new Error('Invalid conversion ledger merchant');
  if (startAt && Number.isNaN(startAt.getTime())) throw new Error('Invalid conversion ledger date');
}

async function getLedgerPool() {
  await assertRuntimeSchema('conversion ledger reads', [
    { table: 'sari_conversions', columns: ['idempotency_key'] },
  ]);
  const pool = await getPool();
  if (!pool) throw new Error('Conversion ledger unavailable');
  return pool;
}

export async function getConversionSummary(merchantId: number, startAt?: Date): Promise<ConversionLedgerSummary> {
  assertLedgerQuery(merchantId, startAt);
  const pool = await getLedgerPool();
  const dateClause = startAt ? ' AND created_at >= ?' : '';
  const params: Array<number | Date> = startAt ? [merchantId, startAt] : [merchantId];
  const [rows] = await pool.execute(
    `SELECT
       COALESCE(SUM(CASE WHEN action_type = 'enrollment' AND status = 'completed' THEN 1 ELSE 0 END), 0) AS totalEnrollments,
       COALESCE(SUM(CASE WHEN action_type = 'payment' AND status = 'completed' THEN 1 ELSE 0 END), 0) AS totalPayments,
       COALESCE(SUM(CASE WHEN action_type = 'payment' AND status = 'completed' THEN amount ELSE 0 END), 0) AS totalRevenue
     FROM sari_conversions WHERE merchant_id = ?${dateClause}`,
    params,
  );
  const row = (rows as Array<Record<string, unknown>>)[0] || {};
  return {
    totalEnrollments: Number(row.totalEnrollments || 0),
    totalPayments: Number(row.totalPayments || 0),
    totalRevenue: Number(row.totalRevenue || 0),
  };
}

export async function getConversionPage(
  merchantId: number,
  limit: number = 20,
  actionType?: ApiConversionAction,
  startAt?: Date,
): Promise<{ total: number; data: ConversionLedgerRow[] }> {
  assertLedgerQuery(merchantId, startAt);
  if (actionType && !['enrollment', 'payment', 'inquiry'].includes(actionType)) {
    throw new ByaanSyncValidationError('conversion');
  }
  const safeLimit = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 200) : 20;
  const clauses = ['merchant_id = ?'];
  const params: Array<number | string | Date> = [merchantId];
  if (actionType) {
    clauses.push('action_type = ?');
    params.push(actionType);
  }
  if (startAt) {
    clauses.push('created_at >= ?');
    params.push(startAt);
  }
  const where = clauses.join(' AND ');
  const pool = await getLedgerPool();
  const [countResult, pageResult] = await Promise.all([
    pool.execute(`SELECT COUNT(*) AS total FROM sari_conversions WHERE ${where}`, params),
    pool.execute(
      `SELECT id, customer_phone, customer_name, action_type, product_name, amount,
              external_ref, source, status, created_at
       FROM sari_conversions WHERE ${where}
       ORDER BY created_at DESC, id DESC LIMIT ${safeLimit}`,
      params,
    ),
  ]);
  const countRows = countResult[0] as Array<{ total?: number }>;
  return {
    total: Number(countRows[0]?.total || 0),
    data: pageResult[0] as ConversionLedgerRow[],
  };
}
