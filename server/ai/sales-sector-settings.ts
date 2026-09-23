import { z } from 'zod';
import { getPool } from '../db/connection';
import { checkoutTransaction } from './checkout-agreements';
import { getSalesSectorPlaybook, salesSectorPlaybooks } from '../../shared/sales-sector-playbooks';

export const salesSectorSelectionSchema = z.string().max(64).refine(value => salesSectorPlaybooks.some(p => p.id === value), 'Unknown sales sector');
export async function getSalesSectorSettings(merchantId: number) {
  z.number().int().positive().parse(merchantId);
  const pool = await getPool(); if (!pool) throw new Error('Sales settings unavailable');
  const [rows] = await pool.execute<any[]>('SELECT playbook_id, revision FROM ai_sales_sector_settings WHERE merchant_id = ?', [merchantId]);
  return { playbook: getSalesSectorPlaybook(rows[0]?.playbook_id ?? 'general'), revision: rows[0]?.revision ?? 0 };
}

export async function updateSalesSectorSettings(input: { merchantId: number; actorUserId: number; playbookId: string; expectedRevision: number }) {
  const parsed = z.object({ merchantId: z.number().int().positive(), actorUserId: z.number().int().positive(),
    playbookId: salesSectorSelectionSchema, expectedRevision: z.number().int().nonnegative() }).strict().parse(input);
  return checkoutTransaction(async connection => {
    // Parent lock serializes first insertion and subsequent CAS without gap-lock deadlocks.
    const [merchant] = await connection.execute<any[]>('SELECT id FROM merchants WHERE id = ? FOR UPDATE', [parsed.merchantId]);
    if (merchant.length !== 1) throw new Error('Merchant unavailable');
    const [rows] = await connection.execute<any[]>('SELECT revision FROM ai_sales_sector_settings WHERE merchant_id = ?', [parsed.merchantId]);
    const revision = rows[0]?.revision ?? 0;
    if (revision !== parsed.expectedRevision) throw new Error('Sales settings changed');
    await connection.execute(`INSERT INTO ai_sales_sector_settings (merchant_id, playbook_id, revision, updated_by)
      VALUES (?, ?, 1, ?) ON DUPLICATE KEY UPDATE playbook_id = VALUES(playbook_id), revision = revision + 1,
      updated_by = VALUES(updated_by), updated_at = UTC_TIMESTAMP(3)`, [parsed.merchantId, parsed.playbookId, parsed.actorUserId]);
    return { revision: revision + 1, playbook: getSalesSectorPlaybook(parsed.playbookId) };
  });
}
