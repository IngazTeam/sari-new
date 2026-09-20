import { getPool } from '../db';
import { assertRuntimeSchema } from '../db/schema-readiness';
import {
  ExternalProductSource,
  ExternalProductSyncMode,
  normalizeExternalProductBatch,
  ProductSyncValidationError,
} from './product-source-sync-core';

export { ProductSyncValidationError } from './product-source-sync-core';

export interface ExternalProductSyncResult {
  created: number;
  updated: number;
  archived: number;
}

export async function syncExternalProducts(
  merchantId: number,
  products: unknown,
  mode: ExternalProductSyncMode,
  source: ExternalProductSource,
): Promise<ExternalProductSyncResult> {
  if (!Number.isSafeInteger(merchantId) || merchantId <= 0) {
    throw new Error('Invalid merchant for external product sync');
  }
  if (!['append', 'replace'].includes(mode) || !['api', 'byaan'].includes(source)) {
    throw new ProductSyncValidationError();
  }

  // Normalize and reject the whole batch before any database operation.
  const normalizedByExternalId = normalizeExternalProductBatch(products, source);
  await assertRuntimeSchema('external product sync', [
    { table: 'merchants' },
    { table: 'products', columns: ['sallaProductId', 'lastSyncedAt', 'course_start_date', 'course_end_date', 'price_unit'] },
  ]);
  const pool = await getPool();
  if (!pool) throw new Error('Product data unavailable');

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [merchantRows] = await connection.execute(
      'SELECT id FROM merchants WHERE id = ? LIMIT 1 FOR UPDATE',
      [merchantId],
    );
    if (!(merchantRows as Array<{ id: number }>).length) throw new Error('Product sync merchant not found');

    const externalIds = Array.from(normalizedByExternalId.keys());
    const existingExternalIds = new Set<string>();
    if (externalIds.length > 0) {
      const [existingRows] = await connection.execute(
        `SELECT \`sallaProductId\` AS externalId FROM products
         WHERE \`merchantId\` = ? AND \`sallaProductId\` IN (${externalIds.map(() => '?').join(', ')})`,
        [merchantId, ...externalIds],
      );
      for (const row of existingRows as Array<{ externalId: string }>) {
        existingExternalIds.add(row.externalId);
      }
    }

    let created = 0;
    let updated = 0;
    for (const product of Array.from(normalizedByExternalId.values())) {
      await connection.execute(
        `INSERT INTO products (
           \`merchantId\`, name, \`nameAr\`, description, \`descriptionAr\`, price, currency, price_unit,
           category, \`imageUrl\`, \`productUrl\`, \`isActive\`, stock, \`track_inventory\`,
           \`product_type\`, status, \`sallaProductId\`, \`lastSyncedAt\`, \`course_start_date\`,
           \`course_end_date\`, \`max_students\`, \`enrolled_count\`, \`registration_open\`
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name), \`nameAr\` = VALUES(\`nameAr\`), description = VALUES(description),
           \`descriptionAr\` = VALUES(\`descriptionAr\`), price = VALUES(price), currency = VALUES(currency), price_unit = VALUES(price_unit),
           compare_at_price = NULL, cost_price = NULL,
           category = VALUES(category), \`imageUrl\` = VALUES(\`imageUrl\`), \`productUrl\` = VALUES(\`productUrl\`),
           \`isActive\` = VALUES(\`isActive\`), stock = VALUES(stock), \`track_inventory\` = VALUES(\`track_inventory\`),
           \`product_type\` = VALUES(\`product_type\`), status = VALUES(status), \`lastSyncedAt\` = NOW(3),
           \`course_start_date\` = VALUES(\`course_start_date\`), \`course_end_date\` = VALUES(\`course_end_date\`),
           \`max_students\` = VALUES(\`max_students\`), \`enrolled_count\` = VALUES(\`enrolled_count\`),
           \`registration_open\` = VALUES(\`registration_open\`)`,
        [
          merchantId, product.name, product.nameAr, product.description, product.descriptionAr,
          product.price, product.currency, product.priceUnit, product.category, product.imageUrl, product.productUrl,
          product.isActive, product.stock, product.trackInventory, product.productType, product.status,
          product.externalId, product.courseStartDate, product.courseEndDate, product.maxStudents,
          product.enrolledCount, product.registrationOpen,
        ],
      );
      if (existingExternalIds.has(product.externalId)) updated += 1;
      else created += 1;
    }

    let archived = 0;
    if (mode === 'replace') {
      const sourcePattern = `${source}:%`;
      const [result] = externalIds.length === 0
        ? await connection.execute(
          `UPDATE products SET \`isActive\` = 0, status = 'archived', \`registration_open\` = 0, \`lastSyncedAt\` = NOW(3)
           WHERE \`merchantId\` = ? AND \`sallaProductId\` LIKE ? AND status <> 'archived'`,
          [merchantId, sourcePattern],
        )
        : await connection.execute(
          `UPDATE products SET \`isActive\` = 0, status = 'archived', \`registration_open\` = 0, \`lastSyncedAt\` = NOW(3)
           WHERE \`merchantId\` = ? AND \`sallaProductId\` LIKE ? AND status <> 'archived'
             AND \`sallaProductId\` NOT IN (${externalIds.map(() => '?').join(', ')})`,
          [merchantId, sourcePattern, ...externalIds],
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
