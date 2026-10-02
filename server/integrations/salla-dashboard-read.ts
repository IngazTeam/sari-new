import { getPool } from '../db/connection';
import { bookingReadId } from '../../shared/booking-read';
import { safePlatformUrl } from '../../shared/platform-workspace';
import { getSallaWebhookReceiptHealth } from './salla-webhook-receipts';

/** Legacy dashboard reads deliberately select no credentials or raw error text. */
export async function readSallaDashboardStatus(merchantId: number) {
  bookingReadId.parse(merchantId); const pool = await getPool(); if (!pool) throw Error('Salla source unavailable');
  const [value] = await pool.execute('SELECT storeUrl,syncStatus,lastSyncAt FROM salla_connections WHERE merchantId=? LIMIT 2',[merchantId]);
  if (!Array.isArray(value) || value.length > 1) throw Error('Invalid Salla source');
  if (!value.length) return { connected: false as const };
  const row = value[0] as any;
  return { connected: true as const, storeUrl: safePlatformUrl(row.storeUrl) ?? undefined, syncStatus: row.syncStatus, lastSyncAt: row.lastSyncAt, webhookHealth: await getSallaWebhookReceiptHealth(merchantId) };
}
export async function readSallaDashboardLogs(merchantId: number) {
  bookingReadId.parse(merchantId); const pool = await getPool(); if (!pool) throw Error('Salla source unavailable');
  const [value] = await pool.execute(`SELECT id,syncType,status,itemsSynced,startedAt,completedAt,(errors IS NOT NULL AND errors <> '') AS hasErrors FROM sync_logs WHERE merchantId=? ORDER BY startedAt DESC,id DESC LIMIT 20`,[merchantId]);
  if (!Array.isArray(value)) throw Error('Invalid Salla source');
  return value.map((row: any) => ({ id: row.id, syncType: row.syncType, status: row.status, itemsSynced: row.itemsSynced, startedAt: row.startedAt, completedAt: row.completedAt, errors: row.hasErrors ? 'تعذرت المزامنة. راجع حالة الربط قبل المحاولة التالية.' : null }));
}
