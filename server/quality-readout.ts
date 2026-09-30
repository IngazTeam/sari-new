import { sql } from "drizzle-orm";
import { getDb } from "./db/connection";
import { assertRuntimeSchema } from "./db/schema-readiness";
import {
  qualityReadoutInput,
  qualityFlag,
  qualityTrend,
  type QualityReadout,
} from "../shared/quality-readout";

/** A coherent, bounded snapshot of recorded generation attempts, not delivery or sales quality. */
export async function readQualityReadout(
  merchantId: number,
  days = 30,
  now = new Date()
): Promise<QualityReadout> {
  if (!Number.isSafeInteger(merchantId) || merchantId < 1)
    throw Error("Invalid merchant");
  const selection = qualityReadoutInput.parse({ days });
  if (!Number.isFinite(now.getTime())) throw Error("Invalid clock");
  await assertRuntimeSchema("quality readout", [
    { table: "sari_quality_metrics" },
  ]);
  const db = await getDb();
  if (!db) throw Error("Quality readout unavailable");
  const through = new Date(Math.floor(now.getTime() / 1000) * 1000),
    from = new Date(through.getTime() - selection.days * 86400000),
    week = new Date(through.getTime() - 7 * 86400000),
    fortnight = new Date(through.getTime() - 14 * 86400000);
  const time = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
  const n = (value: unknown) => {
    const result = Number(value);
    if (!Number.isSafeInteger(result) || result < 0)
      throw Error("Invalid quality aggregate");
    return result;
  };
  return db.transaction(
    async tx => {
      const rows = async (query: ReturnType<typeof sql>) =>
        (await tx.execute(query))[0] as unknown as Record<string, unknown>[];
      const [s] = await rows(sql`SELECT COUNT(*) total,
      COUNT(CASE WHEN response_time_ms>=0 THEN 1 END) time_samples,AVG(CASE WHEN response_time_ms>=0 THEN response_time_ms END) avg_time,
      COALESCE(SUM(was_cache_hit=1),0) cache_yes,COALESCE(SUM(was_cache_hit=0),0) cache_no,
      COALESCE(SUM(was_empty=1),0) short_yes,COALESCE(SUM(was_empty=0),0) short_no,
      COALESCE(SUM(was_escalated=1),0) escalation_yes,COALESCE(SUM(was_escalated=0),0) escalation_no,
      COALESCE(SUM(customer_sentiment IN ('positive','happy')),0) positive,
      COALESCE(SUM(customer_sentiment='neutral'),0) neutral,
      COALESCE(SUM(customer_sentiment IN ('negative','angry','frustrated','sad')),0) negative
      FROM sari_quality_metrics WHERE merchant_id=${merchantId} AND created_at>=${time(from)} AND created_at<${time(through)}`);
      if (!s) throw Error("Quality aggregate missing");
      const total = n(s.total),
        samples = n(s.time_samples),
        positive = n(s.positive),
        neutral = n(s.neutral),
        negative = n(s.negative);
      if (positive + neutral + negative > total)
        throw Error("Invalid sentiment aggregate");
      const questions =
        await rows(sql`SELECT MIN(question_text) text,COUNT(*) count FROM sari_quality_metrics
      WHERE merchant_id=${merchantId} AND created_at>=${time(from)} AND created_at<${time(through)} AND TRIM(question_text)<>''
      GROUP BY BINARY question_text ORDER BY count DESC,MIN(id) ASC LIMIT 5`);
      const recent =
        await rows(sql`SELECT id,LEFT(question_text,80) question,LEFT(response_text,80) response,created_at createdAt
      FROM sari_quality_metrics WHERE merchant_id=${merchantId} AND created_at>=${time(from)} AND created_at<${time(through)} ORDER BY created_at DESC,id DESC LIMIT 10`);
      const trends =
        await rows(sql`SELECT (created_at>=${time(week)}) current_week,COUNT(*) total,
      COALESCE(SUM(was_empty=1),0) yes,COALESCE(SUM(was_empty=0),0) no
      FROM sari_quality_metrics WHERE merchant_id=${merchantId} AND created_at>=${time(fortnight)} AND created_at<${time(through)} GROUP BY current_week`);
      const flags = (current: boolean) => {
        const row = trends.find(
          r => Number(r.current_week) === (current ? 1 : 0)
        );
        return row
          ? qualityFlag(n(row.total), n(row.yes), n(row.no))
          : qualityFlag(0, 0, 0);
      };
      const current = flags(true),
        previous = flags(false);
      const avg = samples ? Number(s.avg_time) : null;
      if (avg !== null && (!Number.isFinite(avg) || avg < 0))
        throw Error("Invalid response duration");
      return {
        days: selection.days,
        from: from.toISOString(),
        through: through.toISOString(),
        totalResponses: total,
        avgResponseTimeMs: avg === null ? null : Math.round(avg),
        responseTimeSamples: samples,
        cache: qualityFlag(total, n(s.cache_yes), n(s.cache_no)),
        shortResponses: qualityFlag(total, n(s.short_yes), n(s.short_no)),
        escalation: qualityFlag(total, n(s.escalation_yes), n(s.escalation_no)),
        sentiment: {
          positive,
          neutral,
          negative,
          unknown: total - positive - neutral - negative,
        },
        questions: questions.map(q => ({
          text: String(q.text),
          count: n(q.count),
        })),
        recent: recent.map(r => ({
          id: n(r.id),
          question: String(r.question),
          response: String(r.response),
          createdAt: new Date(r.createdAt as string | Date).toISOString(),
        })),
        trend: { state: qualityTrend(current, previous), current, previous },
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" }
  );
}
