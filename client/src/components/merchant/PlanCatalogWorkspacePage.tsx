import { trpc } from "@/lib/trpc";
import { usageQueryOptions } from "@/lib/usage-workspace-view";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import { PlanCatalogWorkspace } from "./PlanCatalogWorkspace";
export function PlanCatalogWorkspacePage({
  view,
}: {
  view: "plans" | "compare" | "checkout";
}) {
  const user = trpc.auth.me.useQuery(undefined, usageQueryOptions);
  const merchant = trpc.merchants.workspaceIdentity.useQuery(undefined, {
    ...usageQueryOptions,
    enabled: !!user.data?.id && !user.error && !user.isFetching,
  });
  const refresh = () => {
      void user.refetch();
      void merchant.refetch();
    },
    error = user.error || merchant.error;
  if (error)
    return (
      <WorkspaceState kind={workspaceFailureKind(error)} onRetry={refresh} />
    );
  if (
    user.isLoading ||
    user.isFetching ||
    merchant.isLoading ||
    merchant.isFetching
  )
    return <WorkspaceState kind="loading" />;
  if (
    !user.data?.id ||
    !merchant.data?.id ||
    merchant.data.actorId !== user.data.id
  )
    return (
      <WorkspaceState
        kind={!user.data?.id ? "session" : "missing"}
        onRetry={refresh}
      />
    );
  return (
    <PlanCatalogWorkspace
      key={`${user.data.id}:${merchant.data.id}:${view}`}
      actorId={user.data.id}
      merchantId={merchant.data.id}
      view={view}
    />
  );
}
