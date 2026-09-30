import { useMemo, useState, useSyncExternalStore } from "react";
import {
  finances,
  orders,
  platforms,
  useOrderVersion,
} from "./order-preview-state";
// Prototype-only adapter. No fetch, server connection, payment or message provider.
const reads: Record<string, (input: any) => any> = {
  list: input => orders.workspace(input),
  detail: input => orders.detail(input.id),
  statusHistory: input => orders.history(input),
  statusReview: input => orders.review(input),
  statusReceipt: input => orders.receipt(input),
  getMarginPolicy: () => finances.policy(),
  previewCheckoutMargin: input => finances.preview(input),
  getCheckoutMarginException: input => finances.marginAudit(input.orderId),
  getCheckoutAttempts: input => finances.attempts(input.orderId),
  getCheckoutDiscountRelease: input => finances.discount(input.orderId),
  listZidReconciliations: input => platforms.listZid(input),
  checkoutEvidenceAccess: () => platforms.accessInfo(),
  listSallaCheckoutCarts: input => platforms.listCarts(input),
  listSallaCheckoutAudits: input => platforms.listAudits(input),
  listSallaCartProblems: input => platforms.listProblems(input),
};
const readVersions = new Map<string, number>();
const subscribers = new Map<string, Set<() => void>>();
function invalidate(name: string) {
  readVersions.set(name, (readVersions.get(name) ?? 0) + 1);
  subscribers.get(name)?.forEach(fn => fn());
}
function query(name: string) {
  return {
    useQuery: (input: any, options?: { enabled?: boolean }) => {
      const version = useOrderVersion(),
        key = JSON.stringify(input),
        enabled = options?.enabled !== false;
      const readVersion = useSyncExternalStore(
        fn => {
          if (!subscribers.has(name)) subscribers.set(name, new Set());
          subscribers.get(name)!.add(fn);
          return () => {
            subscribers.get(name)?.delete(fn);
          };
        },
        () => readVersions.get(name) ?? 0
      );
      const [manual, setManual] = useState<any>(null);
      const result = useMemo(() => {
        finances.sync();
        platforms.sync();
        if (!enabled)
          return manual?.key === key && manual?.version === version
            ? manual.result
            : { data: undefined, error: null };
        if (orders.mode === "loading") return { data: undefined, error: null };
        try {
          orders.access();
          return { data: reads[name](input), error: null };
        } catch (error) {
          return { data: undefined, error };
        }
      }, [version, readVersion, key, enabled, manual]);
      return {
        ...result,
        isLoading: enabled && orders.mode === "loading",
        isFetching: enabled && orders.mode === "loading",
        isError: !!result.error,
        isPaused: false,
        dataUpdatedAt: version * 100000 + readVersion,
        refetch: async () => {
          try {
            orders.access();
            const data = reads[name](input);
            if (enabled) invalidate(name);
            else setManual({ key, version, result: { data, error: null } });
            return { data, isError: false, error: null };
          } catch (error) {
            if (enabled) invalidate(name);
            else
              setManual({ key, version, result: { data: undefined, error } });
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
      invalidate: async () => invalidate(name),
    },
  ])
);
export const trpc = {
  botSettings: { getMarginPolicy: query("getMarginPolicy") },
  orders: {
    workspace,
    ...Object.fromEntries(
      Object.keys(reads)
        .filter(k => !Object.hasOwn(workspace, k))
        .map(k => [k, query(k)])
    ),
    reconcileZidCheckout: mutation(input => platforms.reconcileZid(input)),
    approveCheckoutInvoice: mutation(input => finances.approve(input)),
    releaseCheckoutDiscount: mutation(input => finances.release(input)),
    reconcileCheckoutAttempt: mutation(input => finances.reconcile(input)),
  },
  useUtils: () => ({
    orders: { ...utilities, workspace: utilities },
    client: {
      orders: {
        inspectSallaCheckoutEvidence: {
          query: async (input: any) => platforms.inspect(input),
        },
        saveSallaCheckoutAudit: {
          mutate: async (input: any) => platforms.saveAudit(input),
        },
        recoverSallaCart: {
          mutate: async (input: any) => platforms.recover(input),
        },
      },
    },
  }),
};
