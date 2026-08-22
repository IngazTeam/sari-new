import mysql from 'mysql2/promise';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}

const pool = mysql.createPool(databaseUrl);
try {
  const [identityRows] = await pool.query(`
    SELECT
      COALESCE(SUM((p.order_id IS NULL) = (p.booking_id IS NULL)), 0) AS invalidTargetCardinality,
      COALESCE(SUM(p.order_id IS NOT NULL AND (o.id IS NULL OR o.merchantId <> p.merchant_id)), 0) AS invalidOrderTargets,
      COALESCE(SUM(p.booking_id IS NOT NULL AND (b.id IS NULL OR b.merchant_id <> p.merchant_id OR s.id IS NULL)), 0) AS invalidBookingTargets
    FROM order_payments p
    LEFT JOIN orders o ON o.id = p.order_id
    LEFT JOIN bookings b ON b.id = p.booking_id
    LEFT JOIN services s ON s.id = b.service_id AND s.merchant_id = b.merchant_id
  `);
  const [duplicateRows] = await pool.query(`
    SELECT
      COALESCE(SUM(targetType = 'order'), 0) AS ordersWithMultipleCapturedPayments,
      COALESCE(SUM(targetType = 'booking'), 0) AS bookingsWithMultipleCapturedPayments
    FROM (
      SELECT 'order' AS targetType, merchant_id, order_id AS targetId
        FROM order_payments
       WHERE status IN ('captured', 'refunded') AND order_id IS NOT NULL
       GROUP BY merchant_id, order_id HAVING COUNT(*) > 1
      UNION ALL
      SELECT 'booking' AS targetType, merchant_id, booking_id AS targetId
        FROM order_payments
       WHERE status IN ('captured', 'refunded') AND booking_id IS NOT NULL
       GROUP BY merchant_id, booking_id HAVING COUNT(*) > 1
    ) duplicates
  `);
  const [linkRows] = await pool.query(`
    SELECT COUNT(*) AS paymentLinkIdentityDrift,
           (SELECT COUNT(*) FROM order_payments
             WHERE metadata IS NOT NULL AND metadata <> '' AND NOT JSON_VALID(metadata)) AS invalidLocalMetadata
      FROM order_payments p
      JOIN payment_links pl
        ON pl.id = CAST(JSON_UNQUOTE(JSON_EXTRACT(
          CASE WHEN JSON_VALID(p.metadata) THEN p.metadata ELSE '{}' END,
          '$.paymentLinkId'
        )) AS UNSIGNED)
     WHERE JSON_VALID(p.metadata)
       AND JSON_EXTRACT(p.metadata, '$.paymentLinkId') IS NOT NULL
       AND (
         pl.merchant_id <> p.merchant_id OR pl.amount <> p.amount OR pl.currency <> p.currency
         OR NOT (pl.order_id <=> p.order_id) OR NOT (pl.booking_id <=> p.booking_id)
       )
  `);
  const [projectionRows] = await pool.query(`
    SELECT
      COALESCE(SUM(p.order_id IS NOT NULL AND (
        (p.status = 'captured' AND o.status NOT IN ('paid', 'processing', 'shipped', 'delivered'))
        OR (p.status = 'refunded' AND o.status NOT IN ('cancelled', 'shipped', 'delivered'))
      )), 0) AS orderProjectionDrift,
      COALESCE(SUM(p.booking_id IS NOT NULL AND (
        (p.status = 'captured' AND b.payment_status <> 'paid')
        OR (p.status = 'refunded' AND b.payment_status <> 'refunded')
      )), 0) AS bookingProjectionDrift
    FROM order_payments p
    LEFT JOIN orders o ON o.id = p.order_id AND o.merchantId = p.merchant_id
    LEFT JOIN bookings b ON b.id = p.booking_id AND b.merchant_id = p.merchant_id
    WHERE p.status IN ('captured', 'refunded')
  `);
  const [counterRows] = await pool.query(`
    SELECT COUNT(*) AS paymentLinkCounterDrift
      FROM payment_links pl
      JOIN (
        SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.paymentLinkId')) AS UNSIGNED) AS paymentLinkId,
               SUM(status IN ('captured', 'refunded')) AS expectedUsageCount,
               SUM(status = 'captured') AS expectedSuccessfulPayments,
               SUM(status IN ('failed', 'cancelled')) AS expectedFailedPayments,
               COALESCE(SUM(CASE WHEN status = 'captured' THEN amount ELSE 0 END), 0) AS expectedTotalCollected
          FROM order_payments
         WHERE JSON_VALID(metadata) AND JSON_EXTRACT(metadata, '$.paymentLinkId') IS NOT NULL
         GROUP BY paymentLinkId
      ) expected ON expected.paymentLinkId = pl.id
     WHERE pl.usage_count <> expected.expectedUsageCount
        OR pl.successful_payments <> expected.expectedSuccessfulPayments
        OR pl.failed_payments <> expected.expectedFailedPayments
        OR pl.total_collected <> expected.expectedTotalCollected
  `);

  const result = {
    invalidTargetCardinality: Number(identityRows[0]?.invalidTargetCardinality || 0),
    invalidOrderTargets: Number(identityRows[0]?.invalidOrderTargets || 0),
    invalidBookingTargets: Number(identityRows[0]?.invalidBookingTargets || 0),
    ordersWithMultipleCapturedPayments: Number(duplicateRows[0]?.ordersWithMultipleCapturedPayments || 0),
    bookingsWithMultipleCapturedPayments: Number(duplicateRows[0]?.bookingsWithMultipleCapturedPayments || 0),
    paymentLinkIdentityDrift: Number(linkRows[0]?.paymentLinkIdentityDrift || 0),
    invalidLocalMetadata: Number(linkRows[0]?.invalidLocalMetadata || 0),
    orderProjectionDrift: Number(projectionRows[0]?.orderProjectionDrift || 0),
    bookingProjectionDrift: Number(projectionRows[0]?.bookingProjectionDrift || 0),
    paymentLinkCounterDrift: Number(counterRows[0]?.paymentLinkCounterDrift || 0),
  };
  console.log(JSON.stringify(result));
  if (Object.values(result).some(value => value > 0)) {
    console.error('TAP_ORDER_EFFECTS_PREFLIGHT_FAILED');
    process.exitCode = 1;
  }
} catch {
  console.error('TAP_ORDER_EFFECTS_PREFLIGHT_UNAVAILABLE');
  process.exitCode = 2;
} finally {
  await pool.end();
}
