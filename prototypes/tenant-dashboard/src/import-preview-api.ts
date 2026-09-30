import {
  imports,
  advice,
  sheets,
  inventorySheets,
  exportSheets,
  useImportVersion,
} from "./import-preview-state";
function sheetQuery(
  read: () => unknown,
  enabled = true,
  store: { mode: string; refresh: () => Promise<void> } = sheets
) {
  useImportVersion();
  let data: unknown,
    error: unknown = null;
  if (enabled)
    try {
      data = read();
    } catch (reason) {
      error = reason;
    }
  return {
    data,
    error:
      enabled && store.mode === "readError"
        ? { data: { code: "INTERNAL_SERVER_ERROR" } }
        : error,
    isFetching: enabled && store.mode === "loading",
    isLoading: false,
    fetchStatus: store.mode === "offline" ? "paused" : "idle",
    dataUpdatedAt: imports.version,
    refetch: store.refresh,
  };
}
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
  sheets: {
    inventoryStatus: {
      useQuery: () => sheetQuery(exportSheets.status, true, exportSheets),
    },
    syncInventory: { useMutation: () => ({ mutateAsync: exportSheets.send }) },
  },
  products: {
    sheetInventory: {
      connection: {
        useQuery: () =>
          sheetQuery(inventorySheets.connection, true, inventorySheets),
      },
      list: {
        useQuery: (input: unknown, options?: { enabled?: boolean }) =>
          sheetQuery(
            () => inventorySheets.list(input),
            options?.enabled !== false,
            inventorySheets
          ),
      },
      read: {
        useQuery: (input: unknown, options?: { enabled?: boolean }) =>
          sheetQuery(
            () => inventorySheets.read(input),
            options?.enabled !== false,
            inventorySheets
          ),
      },
      prepare: {
        useMutation: () => ({ mutateAsync: inventorySheets.prepare }),
      },
      commit: { useMutation: () => ({ mutateAsync: inventorySheets.commit }) },
      discard: {
        useMutation: () => ({ mutateAsync: inventorySheets.discard }),
      },
    },
    sheetImport: {
      connection: { useQuery: () => sheetQuery(sheets.connection) },
      list: {
        useQuery: (input: unknown, options?: { enabled?: boolean }) =>
          sheetQuery(() => sheets.list(input), options?.enabled !== false),
      },
      read: {
        useQuery: (input: unknown, options?: { enabled?: boolean }) =>
          sheetQuery(() => sheets.read(input), options?.enabled !== false),
      },
      prepare: { useMutation: () => ({ mutateAsync: sheets.prepare }) },
      commit: { useMutation: () => ({ mutateAsync: sheets.commit }) },
      discard: { useMutation: () => ({ mutateAsync: sheets.discard }) },
    },
    fileAdvice: {
      start: { useMutation: () => ({ mutateAsync: advice.start }) },
      read: {
        useQuery: (input: unknown, options?: { enabled?: boolean }) => ({
          ...query(() => advice.read(input), options?.enabled !== false),
          refetch: advice.refresh,
        }),
      },
    },
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
    sheets: { inventoryStatus: { invalidate: async () => imports.changed() } },
    products: {
      sheetInventory: {
        read: {
          fetch: async (input: unknown) => {
            await inventorySheets.refresh();
            return inventorySheets.read(input);
          },
          invalidate: async () => imports.changed(),
        },
        receipt: { fetch: inventorySheets.receipt },
      },
      sheetImport: {
        read: {
          fetch: async (input: unknown) => {
            await sheets.refresh();
            return sheets.read(input);
          },
          invalidate: async () => imports.changed(),
        },
        receipt: { fetch: sheets.receipt },
      },
      fileAdvice: { read: { invalidate: async () => imports.changed() } },
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
