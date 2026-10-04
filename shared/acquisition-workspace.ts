import { z } from "zod";

export const acquisitionSources = [
  "instagram", "snapchat", "twitter", "tiktok", "facebook", "youtube",
  "google_ads", "ad_general", "direct", "google", "referral", "ads", "whatsapp",
] as const;
export const acquisitionBuckets = [...acquisitionSources, "other", "unattributed"] as const;
export const acquisitionPeriods = ["all", "30d", "90d"] as const;
export const acquisitionInput = z.object({
  period: z.enum(acquisitionPeriods).default("all"),
}).strict().default({ period: "all" });
const id = z.number().int().positive().max(2147483647);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const acquisitionWorkspaceSchema = z.object({
  actorId: id, merchantId: id, checkedAt: z.string().datetime(), timezone: z.literal("UTC"),
  basis: z.literal("stored_profile_preference"),
  period: z.enum(acquisitionPeriods), since: z.string().datetime().nullable(),
  totalProfiles: count, classifiedProfiles: count, otherProfiles: count, unattributedProfiles: count,
  sources: z.array(z.object({ source: z.enum(acquisitionBuckets), count: count.positive(), sharePermille: z.number().int().min(0).max(1000) }).strict()).max(acquisitionBuckets.length),
}).strict().superRefine((v, ctx) => {
  if (!Number.isFinite(Date.parse(v.checkedAt))) {
    ctx.addIssue({ code: "custom", message: "Invalid acquisition clock" });
    return;
  }
  const total = v.sources.reduce((sum, r) => sum + r.count, 0);
  const expectedSince = v.period === "all" ? null : new Date(Date.parse(v.checkedAt) - (v.period === "30d" ? 30 : 90) * 86400000).toISOString();
  if (!Number.isSafeInteger(total) || total !== v.totalProfiles || new Set(v.sources.map(r => r.source)).size !== v.sources.length ||
      v.otherProfiles !== (v.sources.find(r => r.source === "other")?.count ?? 0) ||
      v.unattributedProfiles !== (v.sources.find(r => r.source === "unattributed")?.count ?? 0) ||
      v.classifiedProfiles !== total - v.otherProfiles - v.unattributedProfiles || v.since !== expectedSince ||
      v.sources.some(r => r.sharePermille !== Math.round(r.count / total * 1000)))
    ctx.addIssue({ code: "custom", message: "Inconsistent acquisition evidence" });
});
export type AcquisitionWorkspace = z.infer<typeof acquisitionWorkspaceSchema>;
export type AcquisitionPeriod = typeof acquisitionPeriods[number];
