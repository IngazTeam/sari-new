import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { permissionProcedure, router } from "./_core/trpc";
import { hasPermission } from "./_core/permissions";
import {
  keywordId,
  keywordPageInput,
  keywordListInput,
  keywordStatusInput,
  keywordDeleteInput,
} from "../shared/keyword-review";
import {
  readKeywordRecords,
  readKeywordRecord,
  writeKeywordRecord,
  KeywordReviewError,
} from "./keyword-review";
const read = permissionProcedure("analytics.read"),
  write = permissionProcedure("bot_settings.manage");
async function guarded<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    throw new TRPCError({
      code:
        error instanceof KeywordReviewError
          ? error.code
          : "INTERNAL_SERVER_ERROR",
      message:
        error instanceof KeywordReviewError
          ? error.message
          : "Keywords unavailable",
    });
  }
}
export const keywordsRouter = router({
  getStats: read
    .input(keywordListInput)
    .query(({ ctx, input }) =>
      guarded(() => readKeywordRecords(ctx.merchantId, input))
    ),
  getNew: read
    .input(keywordPageInput)
    .query(({ ctx, input }) =>
      guarded(() =>
        readKeywordRecords(ctx.merchantId, { ...input, status: "new" })
      )
    ),
  getById: read
    .input(z.object({ keywordId }).strict())
    .query(({ ctx, input }) =>
      guarded(async () => ({
        ...(await readKeywordRecord(ctx.merchantId, input.keywordId)),
        canManage: hasPermission(ctx.merchantRole, "bot_settings.manage"),
      }))
    ),
  // A GET only returns stored suggestions. Refreshing analytics must not purchase an LLM call.
  getSuggested: read.query(({ ctx }) =>
    guarded(async () =>
      (
        await readKeywordRecords(
          ctx.merchantId,
          { status: "new", minFrequency: 3, limit: 10, page: 1 },
          true
        )
      ).map(row => ({
        id: row.id,
        keyword: row.keyword,
        suggestedResponse: row.suggestedResponse,
        category: row.category,
        confidence: null,
        source: "saved_unverified_suggestion" as const,
        revision: row.revision,
      }))
    )
  ),
  updateStatus: write
    .input(keywordStatusInput)
    .mutation(({ ctx, input }) =>
      guarded(() =>
        writeKeywordRecord(ctx.merchantId, { kind: "status", ...input })
      )
    ),
  delete: write
    .input(keywordDeleteInput)
    .mutation(({ ctx, input }) =>
      guarded(() =>
        writeKeywordRecord(ctx.merchantId, { kind: "delete", ...input })
      )
    ),
});
export type KeywordsRouter = typeof keywordsRouter;
