import { TRPCError } from "@trpc/server";
import { permissionProcedure, router } from "./_core/trpc";
import {
  customerListInput,
  customerDetailInput,
  customerExportInput,
} from "../shared/customer-workspace";
import {
  readCustomerList,
  readCustomerDetail,
  exportCustomerWorkspace,
  CustomerExportLimit,
} from "./customer-workspace";
import { customerAnnotationsRouter } from "./routers-customer-annotations";
import { hasPermission } from "./_core/permissions";

export const customersRouter = router({
  annotations: customerAnnotationsRouter,
  workspace: router({
    export: permissionProcedure("customers.manage")
      .input(customerExportInput)
      .query(async ({ ctx, input }) => {
        try {
          return await exportCustomerWorkspace(ctx.merchantId, input);
        } catch (error) {
          throw new TRPCError({
            code:
              error instanceof CustomerExportLimit
                ? "PRECONDITION_FAILED"
                : "INTERNAL_SERVER_ERROR",
            message: "Customer export unavailable",
          });
        }
      }),
    list: permissionProcedure("conversations.read")
      .input(customerListInput)
      .query(async ({ ctx, input }) => {
        try {
          return {
            ...(await readCustomerList(ctx.merchantId, input)),
            canManage: hasPermission(ctx.merchantRole, "customers.manage"),
          };
        } catch {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Customers unavailable",
          });
        }
      }),
    detail: permissionProcedure("conversations.read")
      .input(customerDetailInput)
      .query(async ({ ctx, input }) => {
        try {
          return await readCustomerDetail(ctx.merchantId, input);
        } catch {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Customer unavailable",
          });
        }
      }),
  }),
});

export type CustomersRouter = typeof customersRouter;
