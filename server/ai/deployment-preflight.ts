import { getPool } from '../db/connection';
import { getActiveModel, getZahyPiRuntimeMetadata } from '../db_ai_settings';
import { resolveZahyPiRuntimeConfig } from './zahypi-client';
import { readAiBudgetAdmin } from './budget-admin';

export async function inspectAiBudget(deployment = false) {
  const state = await readAiBudgetAdmin();
  // Deployment verifies the budget infrastructure without depending on
  // decryptable provider credentials. Administrators configure those in-app.
  const runtime = deployment
    ? await getZahyPiRuntimeMetadata()
    : await resolveZahyPiRuntimeConfig();
  const required = runtime.provider === 'zahypi'
    ? [['zahypi', runtime.model]]
    : Array.from(new Set(['gpt-4o', 'gpt-4o-mini', await getActiveModel()])).map(model => ['openai', model]);
  required.push(['openai', 'whisper-1'], ['openai', 'text-embedding-3-small']);
  const missing = required.filter(([provider, model]) => !state.prices.some(card => card.enabled
    && card.provider === provider && card.model === model && card.maxInputTokens > 0
    && (model === 'whisper-1' ? card.flatUsd > 0 : card.inputUsdPerMillion > 0 || card.outputUsdPerMillion > 0 || card.flatUsd > 0)));
  const pool = await getPool();
  if (!pool) throw new Error('Database unavailable');
  const [missingSubscriptions] = await pool.execute<any[]>(`SELECT COUNT(*) AS count FROM merchants m
    WHERE m.status = 'active' AND NOT EXISTS (SELECT 1 FROM merchant_subscriptions s
      WHERE s.id = m.current_subscription_id AND s.merchant_id = m.id AND s.status IN ('active','trial')
        AND s.start_date <= UTC_TIMESTAMP() AND s.end_date > UTC_TIMESTAMP()
        AND (s.status <> 'trial' OR s.trial_ends_at > UTC_TIMESTAMP()))`);
  const passed = state.configured && state.enabled && state.configuredLimitUsd === 100
    && (deployment || !runtime.enabled || missing.length === 0);
  return { passed, mode: deployment ? 'deployment' : 'ai-readiness',
    credentials: deployment ? 'managed-in-super-admin' : 'provider-resolution-checked',
    aiEnabled: runtime.enabled, provider: runtime.provider,
    globalDailyLimitUsd: state.configuredLimitUsd, missingPriceCards: missing,
    activeMerchantsWithoutEligibleSubscription: Number(missingSubscriptions[0]?.count ?? 0),
    unknownReservations: state.unknownCount };
}
