import { trpc } from "@/lib/trpc";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import {
  PaymentHistoryList,
  PaymentHistoryRecord,
} from "./PaymentHistoryWorkspace";
export function PaymentHistoryPage({ recordId }: { recordId?: string }) {
  const user = trpc.auth.me.useQuery(undefined, {
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const merchant = trpc.merchants.workspaceIdentity.useQuery(undefined, {
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    enabled: !!user.data?.id && !user.error && !user.isFetching,
  });
  const error = user.error || merchant.error;
  if (error)
    return (
      <WorkspaceState
        kind={workspaceFailureKind(error)}
        onRetry={() => {
          void user.refetch();
          void merchant.refetch();
        }}
      />
    );
  if (
    user.isLoading ||
    user.isFetching ||
    merchant.isLoading ||
    merchant.isFetching
  )
    return <WorkspaceState kind="loading" />;
  if (!user.data?.id) return <WorkspaceState kind="session" />;
  if (!merchant.data?.id || merchant.data.actorId !== user.data.id)
    return <WorkspaceState kind="missing" />;
  const id =
    recordId === undefined
      ? undefined
      : /^[1-9]\d*$/.test(recordId) && Number(recordId) <= 2147483647
        ? Number(recordId)
        : null;
  if (id === null) return <WorkspaceState kind="missing" />;
  const scope = { actorId: user.data.id, merchantId: merchant.data.id };
  return id === undefined ? (
    <PaymentHistoryList
      key={`${scope.actorId}:${scope.merchantId}`}
      {...scope}
    />
  ) : (
    <PaymentHistoryRecord
      key={`${scope.actorId}:${scope.merchantId}:${id}`}
      {...scope}
      paymentId={id}
    />
  );
}
