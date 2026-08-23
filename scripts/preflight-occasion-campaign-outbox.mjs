import mysql from 'mysql2/promise';

const mode = process.argv.includes('--before') ? 'before' : 'after';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const connection = await mysql.createConnection(databaseUrl);
try {
  const [[legacy]] = await connection.query(
    `SELECT
       COUNT(*) - COUNT(DISTINCT CONCAT(merchantId, ':', occasionType, ':', year)) AS duplicateDefinitions,
       SUM(enabled NOT IN (0,1)) AS invalidEnabledFlags,
       SUM(discountPercentage < 5 OR discountPercentage > 50) AS invalidDiscountPercentages
     FROM occasion_campaigns`,
  );
  const result = {
    mode,
    ...Object.fromEntries(Object.entries(legacy).map(([key, value]) => [key, Number(value || 0)])),
  };

  if (mode === 'after') {
    const [[integrity]] = await connection.query(
      `SELECT
         SUM(oc.campaign_id IS NOT NULL AND (c.id IS NULL OR c.merchantId <> oc.merchantId)) AS crossTenantOrMissingCampaignLinks,
         SUM(oc.status = 'sending' AND (oc.campaign_id IS NULL OR c.status NOT IN ('sending','failed'))) AS invalidSendingLinks,
         SUM(oc.status = 'pending' AND oc.sentAt IS NOT NULL) AS pendingWithTerminalTimestamp,
         SUM(oc.status = 'completed' AND oc.campaign_id IS NOT NULL AND c.status <> 'completed') AS completedStateDrift,
         SUM(oc.status = 'failed' AND oc.campaign_id IS NOT NULL AND c.status <> 'failed') AS failedStateDrift
       FROM occasion_campaigns oc
       LEFT JOIN campaigns c ON c.id = oc.campaign_id`,
    );
    Object.assign(result, Object.fromEntries(
      Object.entries(integrity).map(([key, value]) => [key, Number(value || 0)]),
    ));
  }

  console.log(JSON.stringify(result));
  const failures = Object.entries(result)
    .filter(([key, value]) => key !== 'mode' && Number(value) !== 0);
  if (failures.length) process.exitCode = 1;
} finally {
  await connection.end();
}
