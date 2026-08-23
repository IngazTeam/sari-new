import mysql from 'mysql2/promise';

const databaseUrl = process.env.DATABASE_URL;
const beforeMigration = process.argv.includes('--before');
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}

const pool = mysql.createPool(databaseUrl);
try {
  const [templateRows] = await pool.query(`
    SELECT
      COALESCE(SUM(status = 'confirmed'), 0) AS legacyConfirmedTemplates,
      COALESCE(SUM(status NOT IN ('pending','paid','processing','shipped','delivered','cancelled','confirmed')), 0) AS invalidTemplateStatuses,
      (
        SELECT COUNT(*) FROM (
          SELECT merchant_id, IF(status = 'confirmed', 'paid', status) AS canonicalStatus
            FROM notification_templates
           GROUP BY merchant_id, canonicalStatus
          HAVING COUNT(*) > 1
        ) duplicate_groups
      ) AS duplicateTemplateGroups
    FROM notification_templates
  `);
  const [outboxRows] = await pool.query(`
    SELECT
      COALESCE(SUM(n.event_key IS NOT NULL AND (o.id IS NULL OR o.merchantId <> n.merchant_id)), 0) AS orphanOutboxRows,
      COALESCE(SUM(n.delivery_status = 'processing' AND n.claimed_at < DATE_SUB(NOW(3), INTERVAL 10 MINUTE)), 0) AS staleProcessingRows,
      COALESCE(SUM(n.delivery_status = 'manual_review'), 0) AS manualReviewRows
    FROM order_notifications n
    LEFT JOIN orders o ON o.id = n.order_id
  `);

  const result = {
    legacyConfirmedTemplates: Number(templateRows[0]?.legacyConfirmedTemplates || 0),
    invalidTemplateStatuses: Number(templateRows[0]?.invalidTemplateStatuses || 0),
    duplicateTemplateGroups: Number(templateRows[0]?.duplicateTemplateGroups || 0),
    orphanOutboxRows: Number(outboxRows[0]?.orphanOutboxRows || 0),
    staleProcessingRows: Number(outboxRows[0]?.staleProcessingRows || 0),
    manualReviewRows: Number(outboxRows[0]?.manualReviewRows || 0),
  };

  if (!beforeMigration) {
    const [columnRows] = await pool.query(`
      SELECT
        COUNT(DISTINCT CASE WHEN column_name IN ('reviewed_at','reviewed_by_user_id') THEN column_name END) AS reviewColumns
      FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'order_notifications'
    `);
    const [indexRows] = await pool.query(`
      SELECT
        COUNT(DISTINCT CASE WHEN table_name = 'notification_templates' AND index_name = 'uq_notification_template_merchant_status' THEN index_name END) AS templateUniqueIndex,
        COUNT(DISTINCT CASE WHEN table_name = 'order_notifications' AND index_name = 'idx_order_notification_merchant_health' THEN index_name END) AS healthIndex
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name IN ('notification_templates','order_notifications')
    `);
    Object.assign(result, {
      reviewColumns: Number(columnRows[0]?.reviewColumns || 0),
      templateUniqueIndex: Number(indexRows[0]?.templateUniqueIndex || 0),
      healthIndex: Number(indexRows[0]?.healthIndex || 0),
    });
  }

  console.log(JSON.stringify(result));
  const commonFailure = result.invalidTemplateStatuses > 0
    || result.duplicateTemplateGroups > 0
    || result.orphanOutboxRows > 0;
  const afterFailure = !beforeMigration && (
    result.legacyConfirmedTemplates > 0
    || result.reviewColumns !== 2
    || result.templateUniqueIndex !== 1
    || result.healthIndex !== 1
  );
  if (commonFailure || afterFailure) {
    console.error('ORDER_NOTIFICATION_OPERATIONS_PREFLIGHT_FAILED');
    process.exitCode = 1;
  }
} catch {
  console.error('ORDER_NOTIFICATION_OPERATIONS_PREFLIGHT_UNAVAILABLE');
  process.exitCode = 2;
} finally {
  await pool.end();
}
