import { getPool } from "../db/connection";
import { readUsageWorkspace } from "../accounts/usage-workspace";
import {
  usageWorkspaceSchema,
  type UsageWorkspace,
} from "../../shared/usage-workspace";

const names = {
  conversations: "المحادثات",
  messages: "الرسائل",
  voiceMessages: "الرسائل الصوتية",
} as const;
export function usageAlertEvidence(snapshot: UsageWorkspace) {
  const current = ["active", "trial"].includes(snapshot.subscription.state);
  const uncertain = ["ambiguous", "unknown"].includes(
    snapshot.subscription.state
  );
  const unknownMetrics: string[] = [];
  const alerts = current
    ? Object.entries(names).flatMap(([key, name]) => {
        const quota = snapshot.quotas[key as keyof typeof names];
        if (quota.used === null || quota.unlimited === null) {
          unknownMetrics.push(key);
          return [];
        }
        if (
          quota.unlimited ||
          quota.limit === null ||
          quota.percentage === null ||
          quota.percentage < 90
        )
          return [];
        return [
          {
            key,
            name,
            used: quota.used,
            limit: quota.limit,
            percentage: quota.percentage,
          },
        ];
      })
    : [];
  const remaining = snapshot.subscription.endDate
    ? Date.parse(snapshot.subscription.endDate) - Date.parse(snapshot.checkedAt)
    : NaN;
  const trialDays =
    snapshot.subscription.state === "trial" &&
    remaining > 0 &&
    remaining <= 3 * 86400000
      ? Math.ceil(remaining / 86400000)
      : null;
  return {
    alerts,
    trialDays,
    complete: !uncertain && unknownMetrics.length === 0,
    unknownMetrics,
  };
}

/** Internal admin batch reader. Owner IDs come only from the merchant table;
 * each snapshot rechecks the current merchant and owner's live authority. */
export async function collectUsageAlertEvidence() {
  const pool = await getPool();
  if (!pool) throw Error("usage_alerts:unavailable");
  const [raw] = await pool.execute<any[]>(
    "SELECT id,userId FROM merchants WHERE status='active' ORDER BY id"
  );
  if (
    !Array.isArray(raw) ||
    raw.some(
      row =>
        ![row.id, row.userId].every(
          n => Number.isSafeInteger(n) && n > 0 && n <= 2147483647
        )
    ) ||
    new Set(raw.map(row => row.id)).size !== raw.length
  )
    throw Error("usage_alerts:unavailable");
  const checked = [];
  let unavailable = 0;
  for (const row of raw) {
    try {
      const snapshot = usageWorkspaceSchema.parse(
        await readUsageWorkspace(row.userId, row.id)
      );
      if (snapshot.actorId !== row.userId || snapshot.merchantId !== row.id)
        throw Error("usage_alerts:scope");
      checked.push({
        merchantId: row.id,
        ownerId: row.userId,
        ...usageAlertEvidence(snapshot),
      });
    } catch {
      unavailable++;
    }
  }
  return { checked, unavailable, totalMerchants: raw.length };
}
