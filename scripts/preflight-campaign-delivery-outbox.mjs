import mysql from 'mysql2/promise';

const mode = process.argv.includes('--before') ? 'before' : 'after';
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const connection = await mysql.createConnection(databaseUrl);
try {
  const [[active]] = await connection.query(
    `SELECT
       SUM(status = 'sending') AS activeSendingCampaigns,
       SUM(status IN ('draft','scheduled') AND imageUrl IS NOT NULL AND imageUrl NOT LIKE 'https://%') AS insecureCampaignImageUrls,
       SUM(status IN ('draft','scheduled') AND targetAudience IS NOT NULL AND (
         JSON_VALID(targetAudience) = 0
         OR JSON_TYPE(IF(JSON_VALID(targetAudience), targetAudience, '{}')) <> 'OBJECT'
       )) AS invalidTargetingDefinitions
     FROM campaigns`,
  );
  const result = {
    mode,
    ...Object.fromEntries(Object.entries(active).map(([key, value]) => [key, Number(value || 0)])),
  };

  if (mode === 'after') {
    const [[integrity]] = await connection.query(
      `SELECT
         SUM(c.id IS NULL OR m.id IS NULL OR c.merchantId <> o.merchant_id) AS tenantOrphans,
         SUM(o.status = 'processing' AND (o.processing_token IS NULL OR o.claimed_at IS NULL)) AS invalidProcessingLeases,
         SUM(o.status <> 'processing' AND o.processing_token IS NOT NULL) AS leakedProcessingTokens,
         SUM(o.status = 'sent' AND o.sent_at IS NULL) AS incompleteSends,
         SUM(o.quota_reserved NOT IN (0,1) OR (o.quota_reserved = 1 AND o.quota_subscription_id IS NULL)) AS invalidQuotaReservations,
         SUM(o.attempts < 0 OR o.attempts > 8) AS invalidAttempts
       FROM campaign_delivery_outbox o
       LEFT JOIN campaigns c ON c.id = o.campaign_id
       LEFT JOIN merchants m ON m.id = o.merchant_id`,
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
