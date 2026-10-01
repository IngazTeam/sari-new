import { createContext, useContext, useSyncExternalStore } from "react";
import { SalesPreviewModel, salesQueries } from "./sales-preview-model";
export const SalesPreviewContext = createContext<SalesPreviewModel | null>(
  null
);
function useQuery(
  name: (typeof salesQueries)[number],
  input: any,
  options?: { enabled?: boolean }
) {
  const model = useContext(SalesPreviewContext);
  if (!model) throw Error("Missing local sales model");
  useSyncExternalStore(model.subscribe, model.snapshot);
  if (options?.enabled === false)
    return {
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: async () => ({ data: undefined }),
    };
  return {
    ...model.read(name, input),
    refetch: () => model.refetch(name, input),
  };
}
export const trpc: any = {};
for (const query of salesQueries) {
  const [namespace, method] = query.split(".");
  trpc[namespace] ??= {};
  trpc[namespace][method] = {
    useQuery: (input: any, options: any) => useQuery(query, input, options),
  };
}
