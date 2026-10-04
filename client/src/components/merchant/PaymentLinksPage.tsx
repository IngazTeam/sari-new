import { useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import { PaymentLinksList, PaymentLinkView } from "./PaymentLinksWorkspace";
import { PaymentLinkCreate } from "./PaymentLinkCreate";
export function PaymentLinksPage() {
  const p = new URLSearchParams(useSearch());
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
  const scope = { actorId: user.data.id, merchantId: merchant.data.id },
    key = `${scope.actorId}:${scope.merchantId}`,
    raw = p.get("link");
  if (
    (p.has("create") && p.get("create") !== "1") ||
    (p.has("create") && p.has("link")) ||
    (raw !== null && (!/^[1-9]\d*$/.test(raw) || Number(raw) > 2147483647))
  )
    return <WorkspaceState kind="missing" />;
  return raw !== null ? (
    <PaymentLinkView key={`${key}:${raw}`} {...scope} linkId={Number(raw)} />
  ) : p.has("create") ? (
    <PaymentLinkCreate key={`${key}:create`} {...scope} />
  ) : (
    <PaymentLinksList key={key} {...scope} />
  );
}
