import mysql from 'mysql2/promise';
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is required'); process.exit(2); }
const pool = mysql.createPool(process.env.DATABASE_URL);
try {
  // Count only; never infer old units, change balances, or print customer data.
  const [products] = await pool.query(`SELECT price_unit AS priceUnit, currency, COUNT(*) AS rowsCount,
    SUM(isActive = 1 AND status = 'active') AS activeCount FROM products GROUP BY price_unit, currency`);
  const [variants] = await pool.query(`SELECT v.price_unit AS priceUnit, COUNT(*) AS rowsCount,
    SUM(v.is_active = 1 AND p.isActive = 1 AND p.status = 'active') AS activeCount
    FROM product_variants v JOIN products p ON p.id = v.product_id
    WHERE v.price IS NOT NULL GROUP BY v.price_unit`);
  const [invalid] = await pool.query(`SELECT COUNT(*) AS invalidCount FROM products
    WHERE price < 0 OR currency NOT IN ('SAR','USD')`);
  const [links] = await pool.query(`SELECT COUNT(*) AS conflictingSallaLinks FROM payment_links pl
    JOIN orders o ON o.id = pl.order_id WHERE o.sallaOrderId IS NOT NULL AND pl.is_active = 1`);
  console.log(JSON.stringify({products,variants,invalid:invalid[0],payment:links[0]}));
  if ([...products,...variants].some(row=>row.priceUnit !== 'minor' && Number(row.activeCount)>0)
    || Number(invalid[0].invalidCount)>0 || Number(links[0].conflictingSallaLinks)>0) {
    console.error('CATALOG_PRICE_REVIEW_REQUIRED'); process.exitCode=1;
  }
} catch { console.error('CATALOG_PRICE_PREFLIGHT_UNAVAILABLE'); process.exitCode=2; }
finally { await pool.end(); }
