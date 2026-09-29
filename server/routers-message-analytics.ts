import { TRPCError } from "@trpc/server";
import { permissionProcedure, router } from "./_core/trpc";
import {
  legacyMessageRangeInput,
  legacyMessageLimitInput,
  legacyMessageDaysInput,
  legacyMessageWindow,
} from "../shared/message-analytics-legacy";
import {
  getMessageStats,
  getPeakHours,
  getTopProducts,
  getConversionRate,
  getDailyMessageCount,
} from "./message-analytics-legacy";
async function safeRead<T>(read: () => Promise<T>) {
  try {
    return await read();
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Message analytics unavailable",
    });
  }
}
const range = (input: Parameters<typeof legacyMessageWindow>[0]) => {
  const w = legacyMessageWindow(input);
  return [new Date(w.from), new Date(w.through)] as const;
};
const read = permissionProcedure("analytics.read");
const retired = () => {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      "افتح تحليلات الرسائل الجديدة وصدّر اللقطة التي راجعتها من الصفحة.",
  });
};
export const messageAnalyticsRouter = router({
  getMessageStats: read
    .input(legacyMessageRangeInput)
    .query(({ ctx, input }) =>
      safeRead(() => getMessageStats(ctx.merchantId, ...range(input)))
    ),
  getPeakHours: read
    .input(legacyMessageRangeInput)
    .query(({ ctx, input }) =>
      safeRead(() => getPeakHours(ctx.merchantId, ...range(input)))
    ),
  getTopProducts: read
    .input(legacyMessageLimitInput)
    .query(({ ctx, input }) =>
      safeRead(() => getTopProducts(ctx.merchantId, input.limit))
    ),
  getConversionRate: read
    .input(legacyMessageRangeInput)
    .query(({ ctx, input }) =>
      safeRead(() => getConversionRate(ctx.merchantId, ...range(input)))
    ),
  getDailyMessageCount: read
    .input(legacyMessageDaysInput)
    .query(({ ctx, input }) =>
      safeRead(() => getDailyMessageCount(ctx.merchantId, input.days))
    ),
  // A stale client must not regenerate an unreviewed, differently scoped report.
  exportPDF: read.input(legacyMessageRangeInput).mutation(retired),
  exportExcel: read.input(legacyMessageRangeInput).mutation(retired),
});
export type MessageAnalyticsRouter = typeof messageAnalyticsRouter;
