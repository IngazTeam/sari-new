import { getPool, closeDb } from '../server/db/connection';
import { getActiveModel } from '../server/db_ai_settings';
import { resolveZahyPiRuntimeConfig } from '../server/ai/zahypi-client';
import { readAiBudgetAdmin } from '../server/ai/budget-admin';

try {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
  const state = await readAiBudgetAdmin();
  const runtime = await resolveZahyPiRuntimeConfig();
  const required = runtime.provider === 'zahypi'
    ? [['zahypi', runtime.model]]
    : [...new Set(['gpt-4o', 'gpt-4o-mini', await getActiveModel()])].map(model => ['openai', model]);
  required.push(['openai', 'whisper-1'], ['openai', 'text-embedding-3-small']);
  const missing = required.filter(([provider, model]) => !state.prices.some(card => card.enabled
    && card.provider === provider && card.model === model && card.maxInputTokens > 0
    && (model === 'whisper-1' ? card.flatUsd > 0 : card.inputUsdPerMillion > 0 || card.outputUsdPerMillion > 0 || card.flatUsd > 0)));
  const pool = (await getPool())!;
  const [missingSubscriptions] = await pool.execute<any[]>(`SELECT COUNT(*) AS count FROM merchants m
    WHERE m.status = 'active' AND NOT EXISTS (SELECT 1 FROM merchant_subscriptions s
      WHERE s.id = m.current_subscription_id AND s.merchant_id = m.id AND s.status IN ('active','trial')
        AND s.start_date <= UTC_TIMESTAMP() AND s.end_date > UTC_TIMESTAMP()
        AND (s.status <> 'trial' OR s.trial_ends_at > UTC_TIMESTAMP()))`);
  const passed = state.configured && state.enabled && state.configuredLimitUsd === 100
    && (!runtime.enabled || missing.length === 0);
  console.log(JSON.stringify({ passed, aiEnabled: runtime.enabled, provider: runtime.provider,
    globalDailyLimitUsd: state.configuredLimitUsd, missingPriceCards: missing,
    activeMerchantsWithoutEligibleSubscription: Number(missingSubscriptions[0]?.count ?? 0),
    unknownReservations: state.unknownCount }));
  if (!passed) process.exitCode = 1;
} catch {
  console.error('AI_BUDGET_PREFLIGHT_UNAVAILABLE');
  process.exitCode = 2;
} finally { await closeDb(); }
