import { products, useProductVersion } from "./product-preview-state";
function result(read: () => unknown, enabled = true) {
  useProductVersion();
  let data: unknown,
    error: unknown = null;
  if (enabled)
    try {
      data = read();
    } catch (reason) {
      error = reason;
    }
  const code =
    products.mode === "forbidden"
      ? "FORBIDDEN"
      : products.mode === "session"
        ? "UNAUTHORIZED"
        : products.mode === "error"
          ? "INTERNAL_SERVER_ERROR"
          : null;
  return {
    data,
    error: code ? { data: { code } } : error,
    isFetching: enabled && products.mode === "loading",
    isLoading: false,
    fetchStatus: products.mode === "offline" ? "paused" : "idle",
    dataUpdatedAt: products.version,
    refetch: products.refresh,
  };
}
export const trpc = {
  products: {
    list: { useQuery: (input: unknown) => result(() => products.list(input)) },
    editor: {
      read: {
        useQuery: (input: { id: number }, options?: { enabled?: boolean }) =>
          result(() => products.read(input), options?.enabled !== false),
      },
      deleteReview: {
        useQuery: (input: unknown) =>
          result(() => products.deleteReview(input)),
      },
      write: { useMutation: () => ({ mutateAsync: products.write }) },
      deleteWrite: {
        useMutation: () => ({ mutateAsync: products.deleteWrite }),
      },
    },
  },
  useUtils: () => ({
    products: {
      editor: {
        receipt: {
          fetch: (input: { requestId: string }) =>
            products.receipt(input.requestId, "editor"),
        },
        deleteReceipt: {
          fetch: (input: { requestId: string }) =>
            products.receipt(input.requestId, "delete"),
        },
      },
    },
  }),
};
