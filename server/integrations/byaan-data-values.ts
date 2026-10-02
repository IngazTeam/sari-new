import crypto from 'node:crypto';
import { ByaanDashboardFault } from './byaan-dashboard-fault';
export function byaanDataInteger(value: unknown) {
  if (!(typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value))) throw new ByaanDashboardFault('unavailable');
  const number = Number(value); if (!Number.isSafeInteger(number) || number < 0) throw new ByaanDashboardFault('unavailable'); return number;
}
export function byaanDataStamp(value: unknown) {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value).replace(' ', 'T') + (String(value).includes('T') ? '' : 'Z'));
  if (!Number.isFinite(date.getTime())) throw new ByaanDashboardFault('unavailable'); return date.toISOString();
}
export function byaanFaqRevision(row: Record<string, any>) {
  return crypto.createHash('sha256').update(JSON.stringify({
    merchantId: byaanDataInteger(row.merchantId), id: byaanDataInteger(row.id), question: row.question, answer: row.answer, category: row.category,
    isActive: row.isActive, useInBot: row.useInBot, syncedAt: byaanDataStamp(row.syncedAt),
  })).digest('hex');
}
