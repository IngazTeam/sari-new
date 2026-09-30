import { TRPCError } from "@trpc/server";
import { router, permissionProcedure } from "./_core/trpc";
import { hasPermission } from "./_core/permissions";
import { orderListInput, orderReadInput } from "../shared/order-workspace";
import { readOrderWorkspace, readOrderDetail } from "./order-workspace";
import {
  orderStatusIntent,
  orderStatusWrite,
  orderStatusReceiptInput,
  orderStatusHistoryInput,
} from "../shared/order-status-review";
import {
  reviewOrderStatus,
  writeOrderStatus,
  readOrderStatusReceipt,
  readOrderStatusHistory,
  OrderStatusConflict,
  OrderStatusUnavailable,
  OrderStatusPrecondition,
} from "./order-status-review";
async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof OrderStatusConflict)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Order review changed",
      });
    if (error instanceof OrderStatusUnavailable)
      throw new TRPCError({ code: "NOT_FOUND", message: "Order unavailable" });
    if (error instanceof OrderStatusPrecondition)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Order status requires a different review",
      });
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Orders unavailable",
    });
  }
}
export const orderWorkspaceRouter = router({
  statusReview: permissionProcedure("orders.manage")
    .input(orderStatusIntent)
    .query(({ ctx, input }) =>
      guarded(() => reviewOrderStatus(ctx.merchantId, ctx.user.id, input))
    ),
  statusWrite: permissionProcedure("orders.manage")
    .input(orderStatusWrite)
    .mutation(({ ctx, input }) =>
      guarded(() => writeOrderStatus(ctx.merchantId, ctx.user.id, input))
    ),
  statusReceipt: permissionProcedure("orders.manage")
    .input(orderStatusReceiptInput)
    .query(({ ctx, input }) =>
      guarded(() => readOrderStatusReceipt(ctx.merchantId, ctx.user.id, input))
    ),
  statusHistory: permissionProcedure("analytics.read")
    .input(orderStatusHistoryInput)
    .query(({ ctx, input }) =>
      guarded(() => readOrderStatusHistory(ctx.merchantId, input))
    ),
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
