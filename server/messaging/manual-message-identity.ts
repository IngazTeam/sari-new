import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { historyMessageId } from './message-identity';

/** Legacy receipts may have a raw ID. New manual receipts and history must share one unique ID. */
export async function manualMessageExternalId(merchantId: number, conversationId: number, account: string, providerId: string): Promise<string | null> {
  const pool = await getPool(); if (!pool) throw new Error('Receipt storage unavailable');
  const [conversations] = await pool.execute<RowDataPacket[]>('SELECT customerPhone FROM conversations WHERE id = ? AND merchantId = ?', [conversationId, merchantId]);
  if (conversations.length !== 1) throw new Error('Receipt conversation unavailable');
  const [legacy] = await pool.execute<RowDataPacket[]>(`SELECT m.direction, m.isProcessed, c.customerPhone FROM messages m JOIN conversations c ON c.id = m.conversationId
    WHERE m.externalId = ? AND c.merchantId = ?`, [providerId, merchantId]);
  if (legacy.length) {
    if (legacy.some(r => r.direction !== 'outgoing' || r.isProcessed !== 1 || r.customerPhone !== conversations[0].customerPhone)) throw new Error('Receipt identity conflict');
    return null;
  }
  return historyMessageId(merchantId, account, providerId, 'outgoing');
}
