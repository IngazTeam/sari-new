import { customers, useCustomerVersion } from "./customer-preview-state";
import type {
  CustomerListSelection,
  CustomerDetailSelection,
} from "../../../shared/customer-workspace";
function result<T>(data: T) {
  const code =
    customers.mode === "forbidden"
      ? "FORBIDDEN"
      : customers.mode === "session"
        ? "UNAUTHORIZED"
        : customers.mode === "error"
          ? "INTERNAL_SERVER_ERROR"
          : null;
  return {
    data,
    error: code ? { data: { code } } : null,
    isFetching: customers.mode === "loading",
    isLoading: false,
    fetchStatus: customers.mode === "offline" ? "paused" : "idle",
    dataUpdatedAt: customers.version,
    refetch: customers.refresh,
  };
}
export const trpc = {
  customers: {
    workspace: {
      list: {
        useQuery(input: CustomerListSelection) {
          useCustomerVersion();
          return result(customers.list(input));
        },
      },
      detail: {
        useQuery(input: CustomerDetailSelection) {
          useCustomerVersion();
          return result(customers.detail(input));
        },
      },
    },
    annotations: {
      read: {
        useQuery(input: { key: string; page: number }) {
          useCustomerVersion();
          return result(customers.read(input));
        },
      },
      write: {
        useMutation: () => ({
          mutateAsync: (input: unknown) => customers.write(input),
        }),
      },
    },
  },
  useUtils: () => ({
    customers: {
      workspace: {
        export: { fetch: (input: unknown) => customers.exportCsv(input) },
      },
      annotations: {
        receipt: {
          fetch: (input: { requestId: string }) =>
            customers.receipt(input.requestId),
        },
      },
    },
  }),
};
