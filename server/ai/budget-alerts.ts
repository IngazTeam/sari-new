import type { PoolConnection } from 'mysql2/promise';
import { getPool } from '../db/connection';
import { assertRuntimeSchema } from '../db/schema-readiness';
import { assertAiBudgetAdmin } from './price-admin';
import { aiBudgetAlertsOutput } from '../../shared/ai-budget-alert-contract';

export async function assertAiBudgetAlertSchema() {
  await assertRuntimeSchema('AI budget alerts', [{ table: 'ai_budget_alerts',
    columns: ['period_start', 'threshold_percent', 'limit_micro_usd', 'spent_micro_usd', 'reserved_micro_usd', 'observed_at'],
    uniqueIndexes: [{ name: 'PRIMARY', columns: ['period_start', 'threshold_percent'] }],
    checkConstraints: ['chk_ai_budget_alert_threshold', 'chk_ai_budget_alert_limit'],
  }]);
}

/** Called inside the ledger transaction, with the global period already locked.
 * An immutable row is the internal notification; no external transport or customer data. */
export async function recordAiBudgetAlerts(connection: Pick<PoolConnection, 'execute'>, period: string) {
  await connection.execute(`INSERT INTO ai_budget_alerts
    (period_start,threshold_percent,limit_micro_usd,spent_micro_usd,reserved_micro_usd,observed_at)
    SELECT p.period_start,t.threshold_percent,LEAST(p.limit_micro_usd,b.daily_limit_micro_usd),
      p.spent_micro_usd,p.reserved_micro_usd,UTC_TIMESTAMP(3)
    FROM ai_budget_periods p INNER JOIN ai_budget_policies b ON b.scope_key=p.scope_key
    CROSS JOIN (SELECT 70 AS threshold_percent UNION ALL SELECT 90) t
    WHERE p.scope_key='global' AND p.period_start=?
      AND LEAST(p.limit_micro_usd,b.daily_limit_micro_usd)>0
      AND (CAST(p.spent_micro_usd AS DECIMAL(30,0))+p.reserved_micro_usd)*100
        >= CAST(LEAST(p.limit_micro_usd,b.daily_limit_micro_usd) AS DECIMAL(30,0))*t.threshold_percent
    ON DUPLICATE KEY UPDATE threshold_percent=ai_budget_alerts.threshold_percent`, [period]);
}

/** Recovers an already-high current period after deployment or a policy reduction. */
export async function captureCurrentAiBudgetAlerts() {
  const pool = await getPool(); if (!pool) throw Error('AI budget alerts unavailable');
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const [rows] = await c.execute<any[]>(`SELECT DATE_FORMAT(period_start,'%Y-%m-%d') AS period
      FROM ai_budget_periods WHERE scope_key='global' AND period_start=UTC_DATE() FOR UPDATE`);
    if (rows[0]) await recordAiBudgetAlerts(c, rows[0].period);
    await c.commit();
  } catch (error) { await c.rollback(); throw error; }
  finally { c.release(); }
}

export async function readAiBudgetAlerts(actorId: number) {
  const pool = await getPool(); if (!pool) throw Error('AI budget alerts unavailable');
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    await assertAiBudgetAdmin(c, actorId, true);
    const [clock] = await c.execute<any[]>("SELECT DATE_FORMAT(UTC_DATE(),'%Y-%m-%d') AS period");
    const period = clock[0].period;
    const [rows] = await c.execute<any[]>(`SELECT b.enabled,
      LEAST(b.daily_limit_micro_usd,COALESCE(p.limit_micro_usd,b.daily_limit_micro_usd)) AS limit_micro_usd,
      COALESCE(p.spent_micro_usd,0) AS spent_micro_usd,COALESCE(p.reserved_micro_usd,0) AS reserved_micro_usd
      FROM ai_budget_policies b LEFT JOIN ai_budget_periods p ON p.scope_key=b.scope_key AND p.period_start=?
      WHERE b.scope_key='global'`, [period]);
    const [events] = await c.execute<any[]>(`SELECT DATE_FORMAT(period_start,'%Y-%m-%d') AS period,threshold_percent,
      limit_micro_usd,spent_micro_usd,reserved_micro_usd,DATE_FORMAT(observed_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS observed_at
      FROM ai_budget_alerts WHERE period_start BETWEEN DATE_SUB(?,INTERVAL 6 DAY) AND ?
      ORDER BY period_start DESC,threshold_percent DESC LIMIT 14`, [period, period]);
    const row = rows[0], limit = Number(row?.limit_micro_usd ?? 0);
    const spent = Number(row?.spent_micro_usd ?? 0), reserved = Number(row?.reserved_micro_usd ?? 0);
    const used = spent + reserved;
    const result = aiBudgetAlertsOutput.parse({ period, configured: !!row, enabled: Number(row?.enabled) === 1,
      limitUsd: limit / 1_000_000, spentUsd: spent / 1_000_000, reservedUsd: reserved / 1_000_000,
      level: !row ? 0 : used >= limit ? 100 : used * 100 >= limit * 90 ? 90 : used * 100 >= limit * 70 ? 70 : 0,
      events: events.map(e => ({ period: e.period, threshold: Number(e.threshold_percent),
        limitUsd: Number(e.limit_micro_usd) / 1_000_000, spentUsd: Number(e.spent_micro_usd) / 1_000_000,
        reservedUsd: Number(e.reserved_micro_usd) / 1_000_000, observedAt: e.observed_at })),
    });
    await c.commit(); return result;
  } catch (error) { await c.rollback(); throw error; }
  finally { c.release(); }
}

export async function startAiBudgetAlertWorker() {
  await assertAiBudgetAlertSchema();
  let stopped = false, active: Promise<unknown> | undefined;
  const tick = () => {
    if (stopped || active) return;
    active = captureCurrentAiBudgetAlerts().catch(() => console.error('[AiBudgetAlerts] Capture deferred'))
      .finally(() => { active = undefined; });
  };
  const timer = setInterval(tick, 60_000); timer.unref(); tick();
  return async () => { stopped = true; clearInterval(timer); await active; };
}
