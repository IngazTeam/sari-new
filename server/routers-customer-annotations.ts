import { TRPCError } from "@trpc/server";
import { permissionProcedure, router } from "./_core/trpc";
import { hasPermission } from "./_core/permissions";
import {
  customerAnnotationsInput,
  customerAnnotationWrite,
  customerAnnotationReceiptInput,
} from "../shared/customer-annotations";
import {
  readCustomerAnnotations,
  writeCustomerAnnotation,
  readCustomerAnnotationReceipt,
  CustomerAnnotationMissing,
  CustomerAnnotationForbidden,
  CustomerAnnotationConflict,
} from "./customer-annotations";
async function guarded<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    const code =
      error instanceof CustomerAnnotationMissing
        ? "NOT_FOUND"
        : error instanceof CustomerAnnotationForbidden
          ? "FORBIDDEN"
          : error instanceof CustomerAnnotationConflict
            ? "CONFLICT"
            : "INTERNAL_SERVER_ERROR";
    throw new TRPCError({
      code,
      message:
        code === "CONFLICT"
          ? "Customer annotation changed"
          : "Customer annotations unavailable",
    });
  }
}
export const customerAnnotationsRouter = router({
  read: permissionProcedure("conversations.read")
    .input(customerAnnotationsInput)
    .query(async ({ ctx, input }) => ({
      ...(await guarded(() => readCustomerAnnotations(ctx.merchantId, input))),
      canManage: hasPermission(ctx.merchantRole, "customers.manage"),
    })),
  write: permissionProcedure("customers.manage")
    .input(customerAnnotationWrite)
    .mutation(({ ctx, input }) =>
      guarded(() => writeCustomerAnnotation(ctx.merchantId, ctx.user.id, input))
    ),
  receipt: permissionProcedure("customers.manage")
    .input(customerAnnotationReceiptInput)
    .query(({ ctx, input }) =>
      guarded(() =>
        readCustomerAnnotationReceipt(ctx.merchantId, ctx.user.id, input)
      )
    ),
});
