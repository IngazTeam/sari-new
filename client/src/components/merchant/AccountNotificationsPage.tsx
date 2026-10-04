import { useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import { notificationQueryOptions } from "./AccountNotificationsPrimitives";
import { AccountNotificationsList } from "./AccountNotificationsList";
import { AccountNotificationView } from "./AccountNotificationView";
export function AccountNotificationsPage() {
  const user = trpc.auth.me.useQuery(undefined, notificationQueryOptions),
    p = new URLSearchParams(useSearch()),
    id = p.get("notification");
  if (user.error)
    return (
      <WorkspaceState
        kind={workspaceFailureKind(user.error)}
        onRetry={() => void user.refetch()}
      />
    );
  if (user.isLoading || user.isFetching)
    return <WorkspaceState kind="loading" />;
  if (!user.data?.id) return <WorkspaceState kind="session" />;
  if (id !== null && (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647))
    return <WorkspaceState kind="missing" />;
  return id !== null ? (
    <AccountNotificationView
      key={`${user.data.id}:${id}`}
      actorId={user.data.id}
      id={Number(id)}
    />
  ) : (
    <AccountNotificationsList key={user.data.id} actorId={user.data.id} />
  );
}
