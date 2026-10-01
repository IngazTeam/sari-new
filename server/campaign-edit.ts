import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { InsertCampaign } from '../drizzle/schema';
import { getPool } from './db/connection';
import { campaignDefinitionKey, type CampaignDefinition } from './campaign-definition';
import { assertCampaignContent } from './campaign-content';

const editableColumns = ['name', 'message', 'imageUrl', 'targetAudience', 'scheduledAt', 'status'] as const;
export type CampaignEditPatch = Pick<Partial<InsertCampaign>, (typeof editableColumns)[number]>;

/** Merge and validate under the same parent lock used by dispatch admission. */
export async function editTenantCampaign(id: number, merchantId: number, patch: CampaignEditPatch, expectedDefinition?: string): Promise<boolean> {
  if (![id, merchantId].every(value => Number.isSafeInteger(value) && value > 0)
    || (expectedDefinition !== undefined && !/^[a-f0-9]{64}$/.test(expectedDefinition))) throw new Error('Invalid campaign edit scope');
  const fields = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (!fields.length || fields.some(([key]) => !editableColumns.includes(key as (typeof editableColumns)[number]))
    || (patch.status !== undefined && !['draft', 'scheduled'].includes(patch.status))) throw new Error('Invalid campaign edit fields');
  const pool = await getPool();
  if (!pool) throw new Error('Database not available');
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<(RowDataPacket & CampaignDefinition)[]>(
      'SELECT name,message,imageUrl,targetAudience,scheduledAt,status FROM campaigns WHERE id=? AND merchantId=? LIMIT 1 FOR UPDATE', [id, merchantId],
    );
    const current = rows[0];
    if (!current || !['draft', 'scheduled'].includes(current.status)
      || (expectedDefinition !== undefined && campaignDefinitionKey(current) !== expectedDefinition)) {
      await connection.rollback();
      return false;
    }
    const merged = { ...current, ...Object.fromEntries(fields) };
    assertCampaignContent(merged.message, merged.imageUrl);
    // Column names are from the fixed allowlist; values remain parameterized.
    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE campaigns SET ${fields.map(([key]) => `\`${key}\`=?`).join(',')},updatedAt=NOW() WHERE id=? AND merchantId=? AND status IN ('draft','scheduled')`,
      [...fields.map(([, value]) => value), id, merchantId],
    );
    if (result.affectedRows > 1) throw new Error('Unexpected campaign edit result');
    await connection.commit();
    return true; // An unchanged, locked definition is a successful idempotent edit.
  } catch (error) {
    try { await connection.rollback(); } catch { /* preserve original failure */ }
    throw error;
  } finally { connection.release(); }
}
