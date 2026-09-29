import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { merchantProcedure, permissionProcedure, router } from "./_core/trpc";
import { hasPermission } from "./_core/permissions";
import {
  quickResponseDraftSchema,
  quickResponsePatchSchema,
  quickResponseRevisionSchema,
} from "../shared/quick-response";
import {
  readQuickResponseWorkspace,
  writeQuickResponse,
  QuickResponseError,
} from "./quick-response-workspace";
async function guarded<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    throw new TRPCError({
      code:
        error instanceof QuickResponseError
          ? error.code
          : "INTERNAL_SERVER_ERROR",
      message:
        error instanceof QuickResponseError
          ? error.message
          : "Quick responses unavailable",
    });
  }
}
const write = permissionProcedure("bot_settings.manage");
export const quickResponsesRouter = router({
  workspace: merchantProcedure.query(({ ctx }) =>
    guarded(async () => ({
      ...(await readQuickResponseWorkspace(ctx.merchantId)),
      canManage: hasPermission(ctx.merchantRole, "bot_settings.manage"),
    }))
  ),
  list: merchantProcedure.query(({ ctx }) =>
    guarded(async () => (await readQuickResponseWorkspace(ctx.merchantId)).rows)
  ),
  getStats: merchantProcedure.query(({ ctx }) =>
    guarded(async () => {
      const { total, active, inactive } = await readQuickResponseWorkspace(
        ctx.merchantId
      );
      return { total, active, inactive };
    })
  ),
  create: write
    .input(
      quickResponseDraftSchema
        .extend({ expectedRevision: quickResponseRevisionSchema })
        .strict()
    )
    .mutation(({ ctx, input }) =>
      guarded(() => {
        const { expectedRevision, ...draft } = input;
        return writeQuickResponse(ctx.merchantId, {
          kind: "create",
          expectedRevision,
          draft,
        });
      })
    ),
  update: write
    .input(
      quickResponsePatchSchema
        .extend({
          id: z.number().int().positive(),
          expectedRevision: quickResponseRevisionSchema,
        })
        .strict()
    )
    .mutation(({ ctx, input }) =>
      guarded(() => {
        const { id, expectedRevision, ...patch } = input;
        return writeQuickResponse(ctx.merchantId, {
          kind: "update",
          id,
          expectedRevision,
          patch,
        });
      })
    ),
  delete: write
    .input(
      z
        .object({
          id: z.number().int().positive(),
          expectedRevision: quickResponseRevisionSchema,
        })
        .strict()
    )
    .mutation(({ ctx, input }) =>
      guarded(() =>
        writeQuickResponse(ctx.merchantId, { kind: "delete", ...input })
      )
    ),
});
export type QuickResponsesRouter = typeof quickResponsesRouter;
