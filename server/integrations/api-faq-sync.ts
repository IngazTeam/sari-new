import { getPool } from '../db';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { ApiFaqSyncValidationError, normalizeApiFaqBatch } from './api-faq-sync-core';

export { ApiFaqSyncValidationError } from './api-faq-sync-core';

export interface ApiFaqSyncResult {
  created: number;
  updated: number;
  archived: number;
}

export async function syncApiFaqs(
  merchantId: number,
  faqs: unknown,
  mode: 'append' | 'replace',
): Promise<ApiFaqSyncResult> {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0) {
    throw new Error('Invalid merchant for API FAQ sync');
  }
  if (!['append', 'replace'].includes(mode)) throw new ApiFaqSyncValidationError();
  const normalizedByExternalId = normalizeApiFaqBatch(faqs);

  await assertRuntimeSchema('API FAQ sync', [
    { table: 'merchants' },
    { table: 'extracted_faqs', columns: ['external_id', 'sync_source', 'source_status'] },
  ]);
  const pool = await getPool();
  if (!pool) throw new Error('FAQ data unavailable');
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [merchantRows] = await connection.execute(
      'SELECT id FROM merchants WHERE id = ? LIMIT 1 FOR UPDATE',
      [merchantId],
    );
    if (!(merchantRows as Array<{ id: number }>).length) throw new Error('FAQ sync merchant not found');

    const externalIds = Array.from(normalizedByExternalId.keys());
    const existingExternalIds = new Set<string>();
    if (externalIds.length > 0) {
      const [existingRows] = await connection.execute(
        `SELECT external_id FROM extracted_faqs
         WHERE merchant_id = ? AND sync_source = 'api'
           AND external_id IN (${externalIds.map(() => '?').join(', ')})`,
        [merchantId, ...externalIds],
      );
      for (const row of existingRows as Array<{ external_id: string }>) {
        existingExternalIds.add(row.external_id);
      }
    }

    let created = 0;
    let updated = 0;
    for (const faq of Array.from(normalizedByExternalId.values())) {
      await connection.execute(
        `INSERT INTO extracted_faqs (
           merchant_id, external_id, sync_source, source_status, question, answer, category,
           is_active, use_in_bot, priority, usage_count, extracted_at
         ) VALUES (?, ?, 'api', 'active', ?, ?, ?, 1, 1, 0, 0, NOW())
         ON DUPLICATE KEY UPDATE
           question = VALUES(question), answer = VALUES(answer), category = VALUES(category),
           source_status = 'active', extracted_at = NOW()`,
        [merchantId, faq.externalId, faq.question, faq.answer, faq.category],
      );
      if (existingExternalIds.has(faq.externalId)) updated += 1;
      else created += 1;
    }

    let archived = 0;
    if (mode === 'replace') {
      const [result] = externalIds.length === 0
        ? await connection.execute(
          `UPDATE extracted_faqs SET source_status = 'archived'
           WHERE merchant_id = ? AND sync_source = 'api' AND source_status = 'active'`,
          [merchantId],
        )
        : await connection.execute(
          `UPDATE extracted_faqs SET source_status = 'archived'
           WHERE merchant_id = ? AND sync_source = 'api' AND source_status = 'active'
             AND external_id NOT IN (${externalIds.map(() => '?').join(', ')})`,
          [merchantId, ...externalIds],
        );
      archived = Number((result as { affectedRows?: number }).affectedRows || 0);
    }

    await connection.commit();
    return { created, updated, archived };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
