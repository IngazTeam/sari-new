import { z } from "zod";
const id = z.number().int().positive().max(2147483647);
const count = z.number().int().nonnegative().safe();
export function usageQuota(used: unknown, limit: unknown, resource = false) {
  const current =
    typeof used === "number" && Number.isSafeInteger(used) && used >= 0
      ? used
      : null;
  const maximum =
    typeof limit === "number" && Number.isSafeInteger(limit) && limit >= -1
      ? limit
      : null;
  const unlimited =
    maximum === null
      ? null
      : maximum === -1 || (resource && maximum === 999999);
  const finite = unlimited === false ? maximum : null;
  return {
    used: current,
    limit: finite,
    unlimited,
    remaining:
      current !== null && finite !== null
        ? Math.max(0, finite - current)
        : null,
    percentage:
      current !== null && finite !== null
        ? finite === 0
          ? current
            ? 100
            : 0
          : Math.min(100, (current / finite) * 100)
        : null,
  };
}
export const usageQuotaSchema = z
  .object({
    used: count.nullable(),
    limit: count.nullable(),
    unlimited: z.boolean().nullable(),
    remaining: count.nullable(),
    percentage: z.number().min(0).max(100).nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const calculated = usageQuota(
      value.used,
      value.unlimited === true
        ? -1
        : value.unlimited === false
          ? value.limit
          : null
    );
    if (JSON.stringify(value) !== JSON.stringify(calculated))
      ctx.addIssue({ code: "custom", message: "Inconsistent usage metric" });
  });
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const usageWorkspaceSchema = z
  .object({
    actorId: id,
    merchantId: id,
    checkedAt: z.string().datetime(),
    timezone: z.literal("UTC"),
    subscription: z
      .object({
        state: z.enum([
          "none",
          "active",
          "trial",
          "expired",
          "ambiguous",
          "unknown",
        ]),
        id: id.nullable(),
        planId: id.nullable(),
        nameAr: z.string().max(255).nullable(),
        nameEn: z.string().max(255).nullable(),
        billingCycle: z.enum(["monthly", "yearly"]).nullable(),
        startDate: z.string().datetime().nullable(),
        endDate: z.string().datetime().nullable(),
        lastResetAt: z.string().datetime().nullable(),
        limitsSource: z.enum(["plan", "trial", "unknown"]),
      })
      .strict(),
    quotas: z
      .object({
        conversations: usageQuotaSchema,
        messages: usageQuotaSchema,
        voiceMessages: usageQuotaSchema,
      })
      .strict(),
    resources: z
      .object({
        customers: usageQuotaSchema,
        whatsappNumbers: usageQuotaSchema,
        products: usageQuotaSchema,
      })
      .strict(),
    activity: z
      .object({
        month,
        from: z.string().datetime(),
        to: z.string().datetime(),
        campaigns: count,
        outgoingMessages: count,
      })
      .strict(),
    history: z
      .array(
        z.object({ month, campaigns: count, outgoingMessages: count }).strict()
      )
      .length(6),
  })
  .strict()
  .superRefine((value, ctx) => {
    const now = new Date(value.checkedAt);
    if (!Number.isFinite(now.getTime()) || value.history.length !== 6) return;
    const expected = Array.from({ length: 6 }, (_, i) =>
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + i, 1))
        .toISOString()
        .slice(0, 7)
    );
    if (
      value.history.some((row, i) => row.month !== expected[i]) ||
      value.activity.month !== expected[5] ||
      value.activity.to !== value.checkedAt ||
      value.activity.from !== expected[5] + "-01T00:00:00.000Z" ||
      value.activity.campaigns !== value.history[5].campaigns ||
      value.activity.outgoingMessages !== value.history[5].outgoingMessages
    )
      ctx.addIssue({ code: "custom", message: "Inconsistent usage period" });
  });
export type UsageWorkspace = z.infer<typeof usageWorkspaceSchema>;
