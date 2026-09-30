import {
  products,
  categories,
  details,
  useProductVersion,
} from "./product-preview-state";
function detailResult(input: { productId: number }) {
  useProductVersion();
  let data: unknown,
    error: unknown = null;
  try {
    data = details.read(input);
  } catch (reason) {
    error = reason;
  }
  const loading = details.mode === "loading" || products.mode === "loading",
    paused = details.mode === "offline" || products.mode === "offline";
  return {
    data,
    error,
    isLoading: loading,
    isFetching: loading,
    fetchStatus: paused ? "paused" : "idle",
    refetch: details.refresh,
  };
}
function categoryResult() {
  useProductVersion();
  let data: unknown,
    error: unknown = null;
  try {
    data = categories.read();
  } catch (reason) {
    error = reason;
  }
  return {
    data,
    error,
    isLoading: categories.mode === "loading",
    isFetching: categories.mode === "loading",
    fetchStatus: categories.mode === "offline" ? "paused" : "idle",
    refetch: categories.refresh,
  };
}
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
    details: {
      read: { useQuery: detailResult },
      write: { useMutation: () => ({ mutateAsync: details.write }) },
    },
    categories: {
      read: { useQuery: categoryResult },
      write: { useMutation: () => ({ mutateAsync: categories.write }) },
    },
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
      details: {
        receipt: {
          fetch: (input: { requestId: string }) =>
            details.receipt(input.requestId),
        },
      },
      categories: {
        receipt: {
          fetch: (input: { requestId: string }) =>
            categories.receipt(input.requestId),
        },
      },
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
