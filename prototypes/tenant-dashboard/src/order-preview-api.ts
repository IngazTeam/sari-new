import { useMemo, useState } from "react";
import { orders, useOrderVersion } from "./order-preview-state";
// Prototype-only adapter. No fetch, server connection, payment or message provider.
const reads: Record<string, (input: any) => any> = {
  list: input => orders.workspace(input),
  detail: input => orders.detail(input.id),
  statusHistory: input => orders.history(input),
  statusReview: input => orders.review(input),
  statusReceipt: input => orders.receipt(input),
  // Financial/provider journeys get their own fixture pass next. These are explicit empty read examples.
  getCheckoutMarginException: () => null,
  getCheckoutAttempts: () => [],
  getCheckoutDiscountRelease: () => null,
  listZidReconciliations: () => ({
    items: [],
    nextCursor: null,
    canManage: orders.mode !== "viewer",
  }),
  checkoutEvidenceAccess: () => ({ merchantId: 9000064, canInspect: false }),
};
function query(name: string) {
  return {
    useQuery: (input: any, options?: { enabled?: boolean }) => {
      const version = useOrderVersion(),
        key = JSON.stringify(input),
        enabled = options?.enabled !== false;
      const result = useMemo(() => {
        if (!enabled || orders.mode === "loading")
          return { data: undefined, error: null };
        try {
          orders.access();
          return { data: reads[name](input), error: null };
        } catch (error) {
          return { data: undefined, error };
        }
      }, [version, key, enabled]);
      return {
        ...result,
        isLoading: enabled && orders.mode === "loading",
        isFetching: enabled && orders.mode === "loading",
        isError: !!result.error,
        isPaused: false,
        dataUpdatedAt: version,
        refetch: async () => {
          try {
            orders.access();
            const data = reads[name](input);
            orders.changed();
            return { data, isError: false, error: null };
          } catch (error) {
            orders.changed();
            return { data: undefined, isError: true, error };
          }
        },
      };
    },
  };
}
function mutation(action: (input: any) => any) {
  return {
    useMutation: (options?: any) => {
      const [state, setState] = useState<any>({
        isPending: false,
        isSuccess: false,
        isError: false,
      });
      const run = async (input: any) => {
        setState({ isPending: true, isSuccess: false, isError: false });
        try {
          const data = action(input);
          setState({ isPending: false, isSuccess: true, isError: false, data });
          options?.onSuccess?.(data);
          return data;
        } catch (error) {
          setState({
            isPending: false,
            isSuccess: false,
            isError: true,
            error,
          });
          options?.onError?.(error);
          throw error;
        }
      };
      return {
        ...state,
        mutateAsync: run,
        mutate: (input: any) => {
          void run(input).catch(() => {});
        },
        reset: () =>
          setState({ isPending: false, isSuccess: false, isError: false }),
      };
    },
  };
}
const notPrepared = () => {
  throw Object.assign(Error("This financial simulation is not prepared"), {
    data: { code: "PRECONDITION_FAILED" },
  });
};
const workspace = {
  list: query("list"),
  detail: query("detail"),
  statusHistory: query("statusHistory"),
  statusWrite: mutation(input => orders.write(input)),
};
const utilities = Object.fromEntries(
  Object.entries(reads).map(([name, read]) => [
    name,
    {
      fetch: async (input: any) => read(input),
      invalidate: async () => orders.changed(),
    },
  ])
);
export const trpc = {
  orders: {
    workspace,
    ...Object.fromEntries(
      Object.keys(reads)
        .filter(k => !Object.hasOwn(workspace, k))
        .map(k => [k, query(k)])
    ),
    reconcileZidCheckout: mutation(notPrepared),
    releaseCheckoutDiscount: mutation(notPrepared),
    reconcileCheckoutAttempt: mutation(notPrepared),
  },
  useUtils: () => ({ orders: { workspace: utilities } }),
};
