import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { collectUsageAlertEvidence } from "./notifications/usage-alert-evidence";
import { writeUsageAlert } from "./notifications/usage-alert-write";
const adminProcedure = protectedProcedure
  .use(({ ctx, next }) => {
    if (ctx.user.role !== "admin")
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Admin access required",
      });
    return next({ ctx });
  })
  .input(z.void());
async function readEvidence() {
  try {
    return await collectUsageAlertEvidence();
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Usage notification source unavailable",
    });
  }
}
type Evidence = Awaited<ReturnType<typeof readEvidence>>;
function coverage(evidence: Evidence) {
  const incompleteMerchants = evidence.checked.filter(
    row => !row.complete
  ).length;
  return {
    totalMerchants: evidence.totalMerchants,
    unavailableMerchants: evidence.unavailable,
    incompleteMerchants,
    complete: evidence.unavailable === 0 && incompleteMerchants === 0,
  };
}
async function dispatch(evidence: Evidence, kind: "trial" | "usage" | "both") {
  const notifications: number[] = [];
  let trialNotifications = 0,
    usageNotifications = 0;
  for (const row of evidence.checked) {
    const write = async (notice: Parameters<typeof writeUsageAlert>[2]) => {
      try {
        const id = await writeUsageAlert(row.ownerId, row.merchantId, notice);
        if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647)
          throw Error("Invalid receipt");
        notifications.push(id);
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Usage notification result unavailable; review before retrying",
        });
      }
    };
    if (kind !== "usage" && row.trialDays !== null) {
      await write({
        type: "warning",
        title: "انتهاء الفترة التجريبية قريباً",
        message: `المتجر رقم ${row.merchantId}: تنتهي الفترة التجريبية المسجلة خلال ${row.trialDays} أيام. راجع حالة الاشتراك والباقات المتاحة.`,
        link: "/merchant/subscription/plans",
      });
      trialNotifications++;
    }
    if (kind !== "trial")
      for (const alert of row.alerts) {
        const reached = alert.percentage >= 100;
        await write({
          type: reached ? "error" : "warning",
          title: reached
            ? `وصل العداد المسجل لحد ${alert.name}`
            : `اقتراب من حد ${alert.name}`,
          message: `المتجر رقم ${row.merchantId}: ${alert.name} ${alert.used}/${alert.limit}، بنسبة ${Math.round(alert.percentage)}% وفق قراءة الاشتراك. راجع الأرقام؛ هذا التنبيه ليس تفويضاً للتشغيل أو دليلاً على المبيعات.`,
          link: "/merchant/usage",
        });
        usageNotifications++;
      }
  }
  return {
    success: true as const,
    count: notifications.length,
    notifications,
    trialNotifications,
    usageNotifications,
    total: notifications.length,
    ...coverage(evidence),
  };
}
export const smartNotificationsRouter = router({
  sendTrialEndingNotifications: adminProcedure.mutation(async () =>
    dispatch(await readEvidence(), "trial")
  ),
  sendUsageLimitNotifications: adminProcedure.mutation(async () =>
    dispatch(await readEvidence(), "usage")
  ),
  scheduleSmartNotifications: adminProcedure.mutation(async () =>
    dispatch(await readEvidence(), "both")
  ),
  getNotificationStats: adminProcedure.query(async () => {
    const evidence = await readEvidence();
    let trialEndingSoon = 0,
      usageAbove90 = 0,
      usageAt100 = 0;
    for (const row of evidence.checked) {
      if (row.trialDays !== null) trialEndingSoon++;
      for (const alert of row.alerts) {
        if (alert.percentage >= 100) usageAt100++;
        else usageAbove90++;
      }
    }
    return {
      trialEndingSoon,
      usageAbove90,
      usageAt100,
      totalPending: trialEndingSoon + usageAbove90 + usageAt100,
      ...coverage(evidence),
    };
  }),
});
