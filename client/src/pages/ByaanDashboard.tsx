import { trpc } from "@/lib/trpc";
import { ByaanDataWorkspace } from "@/components/merchant/ByaanDataWorkspace";
import {
  WorkspaceState,
  workspaceFailureKind,
} from "@/components/merchant/WorkspaceState";
export default function ByaanDashboard() {
  const user = trpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  const merchant = trpc.merchants.getCurrent.useQuery(undefined, {
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
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
    merchant.isLoading ||
    (user.isFetching && !user.data) ||
    (merchant.isFetching && !merchant.data)
  )
    return <WorkspaceState kind="loading" />;
  if (!user.data?.id || !merchant.data?.id)
    return (
      <WorkspaceState
        kind={!user.data?.id ? "session" : "missing"}
        onRetry={refresh}
      />
    );
  return (
    <ByaanDataWorkspace
      key={user.data.id + ":" + merchant.data.id}
      actorId={user.data.id}
      merchantId={merchant.data.id}
    />
  );
}
