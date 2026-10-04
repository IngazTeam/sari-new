import {
  acquisitionInput, acquisitionSources, acquisitionBuckets, acquisitionWorkspaceSchema,
  type AcquisitionPeriod,
} from "../../shared/acquisition-workspace";
import { withMerchantOwnerSettings } from "../accounts/merchant-settings-authority";
import { subscriptionTimestamp } from "../../shared/subscription-usage";

function count(value: unknown): number {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value))) throw Error("acquisition:unavailable");
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw Error("acquisition:unavailable");
  return n;
}
export function projectAcquisition(actorId: number, merchantId: number, checkedAt: string, period: AcquisitionPeriod, rows: unknown) {
  if (!Array.isArray(rows) || rows.length > acquisitionBuckets.length) throw Error("acquisition:unavailable");
  const groups = rows.map(r => ({ source: r?.source, count: count(r?.record_count) }));
  if (groups.some(r => !acquisitionBuckets.includes(r.source)) || new Set(groups.map(r => r.source)).size !== groups.length) throw Error("acquisition:unavailable");
  groups.sort((a,b) => b.count - a.count || acquisitionBuckets.indexOf(a.source) - acquisitionBuckets.indexOf(b.source));
  const totalProfiles = groups.reduce((sum, r) => sum + r.count, 0);
  const otherProfiles = groups.find(r => r.source === "other")?.count ?? 0;
  const unattributedProfiles = groups.find(r => r.source === "unattributed")?.count ?? 0;
  return acquisitionWorkspaceSchema.parse({
    actorId, merchantId, checkedAt, timezone: "UTC", basis: "stored_profile_preference", period,
    since: period === "all" ? null : new Date(Date.parse(checkedAt) - (period === "30d" ? 30 : 90) * 86400000).toISOString(),
    totalProfiles, classifiedProfiles: totalProfiles - otherProfiles - unattributedProfiles, otherProfiles, unattributedProfiles,
    sources: groups.map(r => ({ ...r, sharePermille: Math.round(r.count / totalProfiles * 1000) })),
  });
}

/** Aggregate stored profile tags only. This does not infer referral, ad spend, ROI or sales quality. */
export async function readAcquisitionWorkspace(actorId: number, merchantId: number, input: unknown) {
  const { period } = acquisitionInput.parse(input);
  // All current member roles have analytics.read. Recheck live membership and both accounts under the read lock.
  return withMerchantOwnerSettings(actorId, merchantId, false, async tx => {
    const [clock] = await tx.execute<any[]>("SELECT UTC_TIMESTAMP(3) AS checked_at");
    const raw = Array.isArray(clock) && clock.length === 1 ? clock[0]?.checked_at : null;
    const stamp = raw instanceof Date ? raw.getTime() : subscriptionTimestamp(raw);
    if (stamp === null || !Number.isFinite(stamp)) throw Error("acquisition:unavailable");
    const checkedAt = new Date(stamp).toISOString();
    const since = period === "all" ? null : new Date(stamp - (period === "30d" ? 30 : 90) * 86400000).toISOString();
    const sqlDate = (v: string) => v.slice(0, 23).replace("T", " ");
    const [rows] = await tx.execute(`WITH selected AS (
      SELECT JSON_EXTRACT(CASE WHEN JSON_VALID(preferences) THEN preferences ELSE '{}' END, '$.acquisitionSource') AS raw_source
      FROM customer_profiles WHERE merchant_id=? AND created_at<=?${since ? " AND created_at>=?" : ""}
    ), normalized AS (
      SELECT CASE WHEN JSON_TYPE(raw_source)='STRING' THEN LOWER(TRIM(JSON_UNQUOTE(raw_source))) ELSE '' END AS value FROM selected
    ), classified AS (
      SELECT CAST(CASE WHEN value IN (${acquisitionSources.map(() => "?").join(",")}) THEN value
        WHEN value='' THEN 'unattributed' ELSE 'other' END AS CHAR CHARACTER SET utf8mb4) COLLATE utf8mb4_bin AS source FROM normalized
    ) SELECT source,COUNT(*) AS record_count FROM classified GROUP BY source`,
      [merchantId, sqlDate(checkedAt), ...(since ? [sqlDate(since)] : []), ...acquisitionSources]);
    return projectAcquisition(actorId, merchantId, checkedAt, period, rows);
  });
}
