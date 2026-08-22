import { getPool } from '../db';
import { assertRuntimeSchema } from '../db/schema-readiness';
import type { SchemaRequirement } from '../db/schema-readiness';
import {
  ApiBrainResetValidationError,
  normalizeApiBrainResetRequest,
} from './api-brain-reset-core';
import type { ApiBrainResetType } from './api-brain-reset-core';
import type { ExternalProductSource } from './product-source-sync-core';

export { ApiBrainResetValidationError } from './api-brain-reset-core';

export interface ApiBrainResetResult {
  source: ExternalProductSource;
  deleted: Record<ApiBrainResetType, number>;
  totalDeleted: number;
}

export async function resetApiManagedKnowledge(
  merchantId: number,
  request: unknown,
  productSource: ExternalProductSource,
): Promise<ApiBrainResetResult> {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0) {
    throw new Error('Invalid merchant for API brain reset');
  }
  if (productSource !== 'api' && productSource !== 'byaan') {
    throw new ApiBrainResetValidationError();
  }
  const normalized = normalizeApiBrainResetRequest(request);

  const schemaRequirements: SchemaRequirement[] = [{ table: 'merchants' }];
  if (normalized.types.includes('products')) {
    schemaRequirements.push({ table: 'products', columns: ['merchantId', 'sallaProductId'] });
  }
  if (normalized.types.includes('faqs')) {
    schemaRequirements.push({ table: 'extracted_faqs', columns: ['merchant_id', 'sync_source'] });
  }
  await assertRuntimeSchema('API-managed brain reset', schemaRequirements);
  const pool = await getPool();
  if (!pool) throw new Error('Knowledge data unavailable');
  const connection = await pool.getConnection();
  const deleted: Record<ApiBrainResetType, number> = { products: 0, faqs: 0 };

  try {
    await connection.beginTransaction();
    const [merchantRows] = await connection.execute(
      'SELECT id FROM merchants WHERE id = ? LIMIT 1 FOR UPDATE',
      [merchantId],
    );
    if (!(merchantRows as Array<{ id: number }>).length) {
      throw new Error('API brain reset merchant not found');
    }

    if (normalized.types.includes('products')) {
      const [result] = await connection.execute(
        'DELETE FROM products WHERE `merchantId` = ? AND `sallaProductId` LIKE ?',
        [merchantId, `${productSource}:%`],
      );
      deleted.products = Number((result as { affectedRows?: number }).affectedRows || 0);
    }
    if (normalized.types.includes('faqs')) {
      const [result] = await connection.execute(
        `DELETE FROM extracted_faqs
         WHERE merchant_id = ? AND sync_source = 'api'`,
        [merchantId],
      );
      deleted.faqs = Number((result as { affectedRows?: number }).affectedRows || 0);
    }

    await connection.commit();
    return {
      source: productSource,
      deleted,
      totalDeleted: deleted.products + deleted.faqs,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
