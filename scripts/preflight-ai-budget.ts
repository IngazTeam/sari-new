import { closeDb } from '../server/db/connection';
import { inspectAiBudget } from '../server/ai/deployment-preflight';

try {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const result = await inspectAiBudget(process.argv.includes('--deployment'));
  console.log(JSON.stringify(result));
  if (!result.passed) process.exitCode = 1;
} catch {
  console.error('AI_BUDGET_PREFLIGHT_UNAVAILABLE');
  process.exitCode = 2;
} finally { await closeDb(); }
