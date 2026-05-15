/**
 * Diagnostic: Check knowledge_sections data in DB
 * Run: npx tsx check-sections.ts
 */
import * as db from './server/db';

async function main() {
  try {
    const pool = await db.getPool();
    if (!pool) { console.log('❌ No DB connection'); process.exit(1); }

    // 1. List all merchants with sections
    const [sectionCounts] = await pool.execute(`
      SELECT ks.merchant_id, m.business_name, COUNT(*) as section_count
      FROM knowledge_sections ks
      LEFT JOIN merchants m ON m.id = ks.merchant_id
      GROUP BY ks.merchant_id, m.business_name
      ORDER BY section_count DESC
    `);
    console.log('\n═══ Merchants with knowledge sections ═══');
    console.table(sectionCounts);

    // 2. Show all sections for each merchant
    const [allSections] = await pool.execute(`
      SELECT id, merchant_id, section_type, title, source, status, use_in_bot,
             LENGTH(content) as content_len, LENGTH(embedding) as embed_len
      FROM knowledge_sections 
      ORDER BY merchant_id, sort_order
    `);
    console.log('\n═══ All knowledge sections ═══');
    console.table(allSections);

    // 3. List all merchants
    const [merchants] = await pool.execute(`
      SELECT id, business_name, website_url
      FROM merchants 
      ORDER BY id
      LIMIT 20
    `);
    console.log('\n═══ All merchants ═══');
    console.table(merchants);

    // 4. Check website_analyses
    const [analyses] = await pool.execute(`
      SELECT id, merchant_id, url, title, overall_score, analyzed_at, status
      FROM website_analyses 
      ORDER BY analyzed_at DESC
      LIMIT 10
    `);
    console.log('\n═══ Recent website analyses ═══');
    console.table(analyses);

    process.exit(0);
  } catch (e: any) {
    console.error('Error:', e.message);
    process.exit(1);
  }
}

main();
