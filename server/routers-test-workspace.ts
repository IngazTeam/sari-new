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
} from "../shared/test-sari-workspace";
import {
  createTestSession,
  readTestSession,
  saveOwnedTestDeal,
  saveOwnedTestMessage,
  TestWorkspaceError,
} from "./test-sari-store";
import { getDb } from "./db/connection";

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
      await readTestSession(ctx.merchantId, input.conversationId);
      if (
        !checkRateLimit(`test_sari:${ctx.merchantId}:${ctx.user.id}`, 15, 60000)
          .allowed
      )
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "حاول بعد قليل.",
        });
      const { chatWithSari } = await import("./ai/sari-personality");
      // Test-table IDs are NOT production conversation IDs. Do not cross those namespaces.
      const response = await chatWithSari({
        merchantId: ctx.merchantId,
        customerPhone: "test-playground",
        customerName: "عميل تجريبي",
        message: input.message,
      });
      return { response };
    })
  ),
  getMetrics: permissionProcedure("conversations.read")
    .input(
      z.object({ period: z.enum(["day", "week", "month"]).default("day") })
    )
    .query(({ ctx, input }) =>
      run(async () => {
        if (!(await getDb())) throw new Error("Database unavailable");
        const { calculateAllMetrics } = await import("./metrics");
        return calculateAllMetrics(ctx.merchantId, input.period);
      })
    ),
});
