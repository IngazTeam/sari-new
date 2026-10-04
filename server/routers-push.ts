import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, permissionProcedure, publicProcedure } from "./_core/trpc";
import { getVapidPublicKey } from "./_core/pushNotifications";
import {
  pushDeviceInput,
  pushSubscriptionInput,
  pushUnsubscribeInput,
  pushTestInput,
} from "../shared/push-workspace";
import {
  readPushWorkspace,
  subscribePushDevice,
  unsubscribePushDevice,
  testPushDevice,
} from "./push-workspace";
const procedure = permissionProcedure("settings.manage");
function scope(ctx: any) {
  if (!ctx.session?.sessionId)
    throw new TRPCError({ code: "UNAUTHORIZED", message: "push:session" });
  return {
    actorId: ctx.user.id,
    merchantId: ctx.merchantId,
    sessionId: ctx.session.sessionId,
  };
}
export const pushRouter = router({
  getVapidPublicKey: publicProcedure.query(() => ({
    publicKey: getVapidPublicKey(),
  })),
  workspace: procedure
    .input(pushDeviceInput)
    .query(({ ctx, input }) => readPushWorkspace(scope(ctx), input.deviceHash)),
  subscribe: procedure
    .input(pushSubscriptionInput)
    .mutation(({ ctx, input }) => subscribePushDevice(scope(ctx), input)),
  unsubscribe: procedure
    .input(pushUnsubscribeInput)
    .mutation(({ ctx, input }) => unsubscribePushDevice(scope(ctx), input)),
  sendTest: procedure
    .input(pushTestInput.optional())
    .mutation(({ ctx, input }) => {
      if (!input)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "push:review_device_required",
        });
      return testPushDevice(scope(ctx), input);
    }),
  getLogs: procedure
    .input(
      z.object({ limit: z.number().int().min(1).max(20).default(20) }).strict()
    )
    .query(async ({ ctx, input }) => {
      const data = await readPushWorkspace(scope(ctx), null);
      return data.logs
        .slice(0, input.limit)
        .map(l => ({ ...l, status: l.state, error: null }));
    }),
  getStats: procedure.query(async ({ ctx }) => {
    const d = await readPushWorkspace(scope(ctx), null);
    return {
      totalNotifications: d.counts.total,
      sentNotifications: d.counts.accepted,
      failedNotifications: d.counts.rejected,
      pendingNotifications: d.counts.unconfirmed,
    };
  }),
});
export type PushRouter = typeof pushRouter;
