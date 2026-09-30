import { imports, useImportVersion } from "./import-preview-state";
function query(read: () => unknown, enabled = true) {
  useImportVersion();
  let data: unknown,
    error: unknown = null;
  if (enabled)
    try {
      data = read();
    } catch (reason) {
      error = reason;
    }
  const code =
    imports.mode === "error"
      ? "INTERNAL_SERVER_ERROR"
      : imports.mode === "forbidden"
        ? "FORBIDDEN"
        : imports.mode === "session"
          ? "UNAUTHORIZED"
          : null;
  return {
    data,
    error: enabled && code ? { data: { code } } : error,
    isFetching: enabled && imports.mode === "loading",
    isLoading: false,
    fetchStatus: imports.mode === "offline" ? "paused" : "idle",
    dataUpdatedAt: imports.version,
    refetch: imports.refresh,
  };
}
export const trpc = {
  products: {
    list: { useQuery: (input: unknown) => query(() => imports.list(input)) },
    importReview: {
      read: {
        useQuery: (input: unknown, options?: { enabled?: boolean }) =>
          query(() => imports.read(input), options?.enabled !== false),
      },
      prepare: { useMutation: () => ({ mutateAsync: imports.prepare }) },
      commit: { useMutation: () => ({ mutateAsync: imports.commit }) },
      discard: { useMutation: () => ({ mutateAsync: imports.discard }) },
    },
  },
  useUtils: () => ({
    products: {
      list: { invalidate: async () => {} },
      importReview: {
        read: {
          fetch: async (input: unknown) => imports.read(input),
          invalidate: async () => imports.changed(),
        },
        receipt: { fetch: imports.receipt },
      },
    },
  }),
};
