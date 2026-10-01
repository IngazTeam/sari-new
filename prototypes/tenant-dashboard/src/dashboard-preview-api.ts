import { createContext, useContext, useSyncExternalStore } from "react";
import {
  DashboardPreviewModel,
  dashboardQueries,
} from "./dashboard-preview-model";
export const DashboardPreviewContext =
  createContext<DashboardPreviewModel | null>(null);
function useQuery(name: (typeof dashboardQueries)[number], input: any) {
  const model = useContext(DashboardPreviewContext);
  if (!model) throw Error("Missing dashboard simulation");
  useSyncExternalStore(model.subscribe, model.snapshot);
  return {
    ...model.read(name, input),
    refetch: () => model.refetch(name, input),
  };
}
export const trpc: any = {};
for (const query of dashboardQueries) {
  const [namespace, method] = query.split(".");
  trpc[namespace] ??= {};
  trpc[namespace][method] = {
    useQuery: (input: any) => useQuery(query, input),
  };
}
