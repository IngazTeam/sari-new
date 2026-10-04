import { trpc } from "@/lib/trpc";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import { UsageWorkspace } from "./UsageWorkspace";
import { usageQueryOptions, type UsageView } from "@/lib/usage-workspace-view";
export function UsageWorkspacePage({
  defaultView,
}: {
  defaultView: UsageView;
}) {
  const user = trpc.auth.me.useQuery(undefined, usageQueryOptions);
  const merchant = trpc.merchants.workspaceIdentity.useQuery(undefined, {
    ...usageQueryOptions,
    enabled: !!user.data?.id && !user.error && !user.isFetching,
  });
  const error = user.error || merchant.error;
  const refresh = () => {
    void user.refetch();
    void merchant.refetch();
  };
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
    <UsageWorkspace
      key={`${user.data.id}:${merchant.data.id}`}
      actorId={user.data.id}
      merchantId={merchant.data.id}
      defaultView={defaultView}
    />
  );
}
