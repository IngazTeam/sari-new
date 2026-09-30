import { TRPCError } from "@trpc/server";
import { router, permissionProcedure } from "./_core/trpc";
import { hasPermission } from "./_core/permissions";
import { orderListInput, orderReadInput } from "../shared/order-workspace";
import { readOrderWorkspace, readOrderDetail } from "./order-workspace";
async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Orders unavailable",
    });
  }
}
export const orderWorkspaceRouter = router({
  list: permissionProcedure("analytics.read")
    .input(orderListInput)
    .query(async ({ ctx, input }) => ({
      ...(await guarded(() => readOrderWorkspace(ctx.merchantId, input))),
      canManage: hasPermission(ctx.merchantRole, "orders.manage"),
    })),
  detail: permissionProcedure("analytics.read")
    .input(orderReadInput)
    .query(({ ctx, input }) =>
      guarded(() => readOrderDetail(ctx.merchantId, input.id))
    ),
});
