import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { permissionProcedure, router } from "./_core/trpc";
import { checkRateLimit } from "./_core/rateLimiter";
import {
  testChatInput,
  testConversationId,
  testDealInput,
  testMessageInput,
  testSessionInput,
  quickPreviewInput,
} from "../shared/test-sari-workspace";
import {
  createTestSession,
  readTestSession,
  readTestTurn,
  saveOwnedTestDeal,
  saveOwnedTestMessage,
  TestWorkspaceError,
} from "./test-sari-store";
import { testMetricsInput } from "../shared/test-metrics-workspace";

async function run<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof TestWorkspaceError)
      throw new TRPCError({ code: error.code, message: error.message });
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "تعذر إكمال عملية جلسة الاختبار. تحقق من النتيجة قبل إعادة المحاولة.",
    });
  }
}
const manage = permissionProcedure("bot_settings.manage");
export function previewRateLimit(merchantId: number, userId: number) {
  if (!checkRateLimit(`test_sari:${merchantId}:${userId}`, 15, 60000).allowed)
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "حاول بعد قليل.",
    });
}
export const quickPreviewProcedure = manage
  .input(quickPreviewInput)
  .mutation(({ ctx, input }) =>
    run(async () => {
      previewRateLimit(ctx.merchantId, ctx.user.id);
      const { previewSari } = await import("./ai/sari-preview");
      return previewSari({
        merchantId: ctx.merchantId,
        userId: ctx.user.id,
        message: input.message,
        history: [],
        historyTruncated: false,
      });
    })
  );
export const testSariRouter = router({
  createConversation: manage
    .input(testSessionInput)
    .mutation(({ ctx, input }) =>
      run(() => createTestSession(ctx.merchantId, input))
    ),
  resetConversation: manage
    .input(testSessionInput)
    .mutation(({ ctx, input }) =>
      run(() => createTestSession(ctx.merchantId, input))
    ),
  getConversation: permissionProcedure("conversations.read")
    .input(z.object({ conversationId: testConversationId }).strict())
    .query(({ ctx, input }) =>
      run(() => readTestSession(ctx.merchantId, input.conversationId))
    ),
  saveMessage: manage
    .input(testMessageInput)
    .mutation(({ ctx, input }) =>
      run(() => saveOwnedTestMessage(ctx.merchantId, input))
    ),
  markAsDeal: manage
    .input(testDealInput)
    .mutation(({ ctx, input }) =>
      run(() => saveOwnedTestDeal(ctx.merchantId, input))
    ),
  sendMessage: manage.input(testChatInput).mutation(({ ctx, input }) =>
    run(async () => {
      previewRateLimit(ctx.merchantId, ctx.user.id);
      const turn = await readTestTurn(ctx.merchantId, input);
      const { previewSari } = await import("./ai/sari-preview");
      return previewSari({
        merchantId: ctx.merchantId,
        userId: ctx.user.id,
        message: input.message,
        ...turn,
      });
    })
  ),
  getMetrics: permissionProcedure("analytics.read")
    .input(testMetricsInput)
    .query(({ ctx, input }) =>
      run(async () => {
        const { calculateAllMetrics } = await import("./metrics");
        return calculateAllMetrics(ctx.merchantId, input.period);
      })
    ),
});
