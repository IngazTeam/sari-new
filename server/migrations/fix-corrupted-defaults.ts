/**
 * Fix Corrupted Default Messages (bot_settings)
 * ═══════════════════════════════════════════════════════════
 * One-time migration to clean mojibake/double-encoded Arabic
 * in existing bot_settings rows.
 * 
 * Run: npx tsx server/migrations/fix-corrupted-defaults.ts
 * ═══════════════════════════════════════════════════════════
 */

import '../_core/loadEnv'; // Must be first — loads DATABASE_URL from .env
import { getPool } from '../db';

const CLEAN_WELCOME = 'مرحباً! أنا مساعدك الذكي. كيف أقدر أساعدك اليوم؟ 😊';
const CLEAN_OUT_OF_HOURS = 'شكراً لتواصلك! نحن حالياً خارج أوقات العمل. سنرد عليك في أقرب وقت ممكن ⏰';

// Mojibake patterns that indicate double-encoding corruption
const MOJIBAKE_PATTERNS = [
  /Ã/,      // Common double-UTF8
  /Â/,      // Common double-UTF8
  /â€/,     // Smart quotes corruption
  /Ø[§-¹]/, // Arabic byte sequences shown as Latin1
  /Ù[\x80-\x8F]/, // Arabic continuation bytes as Latin1
];

function isMojibake(text: string | null): boolean {
  if (!text) return false;
  return MOJIBAKE_PATTERNS.some(pattern => pattern.test(text));
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('Fix Corrupted Default Messages');
  console.log('═══════════════════════════════════════════════════\n');

  const pool = await getPool();
  if (!pool) {
    console.error('❌ Cannot connect to database');
    process.exit(1);
  }

  // Fetch all bot_settings rows
  const [rows] = await pool.execute(
    'SELECT id, merchant_id, welcome_message, out_of_hours_message FROM bot_settings'
  );

  const settings = rows as any[];
  console.log(`Found ${settings.length} bot_settings rows\n`);

  let fixedWelcome = 0;
  let fixedOOH = 0;

  for (const row of settings) {
    const updates: string[] = [];
    const params: any[] = [];

    if (isMojibake(row.welcome_message)) {
      updates.push('welcome_message = ?');
      params.push(CLEAN_WELCOME);
      fixedWelcome++;
      console.log(`  [M${row.merchant_id}] welcome_message corrupted: "${String(row.welcome_message).substring(0, 40)}..." → FIXED`);
    }

    if (isMojibake(row.out_of_hours_message)) {
      updates.push('out_of_hours_message = ?');
      params.push(CLEAN_OUT_OF_HOURS);
      fixedOOH++;
      console.log(`  [M${row.merchant_id}] out_of_hours_message corrupted: "${String(row.out_of_hours_message).substring(0, 40)}..." → FIXED`);
    }

    if (updates.length > 0) {
      params.push(row.id);
      await pool.execute(
        `UPDATE bot_settings SET ${updates.join(', ')} WHERE id = ?`,
        params
      );
    }
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`Results:`);
  console.log(`  welcome_message fixed:        ${fixedWelcome}/${settings.length}`);
  console.log(`  out_of_hours_message fixed:    ${fixedOOH}/${settings.length}`);
  console.log(`  Total unchanged:               ${settings.length - Math.max(fixedWelcome, fixedOOH)}`);
  console.log('═══════════════════════════════════════════════════');

  process.exit(0);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
