import { Bell } from "lucide-react";
import { Link } from "wouter";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import {
  notificationHref,
  notificationSnapshot,
} from "@/lib/account-notifications-view";
import {
  useNotificationCopy,
  notificationQueryOptions,
  notificationDate,
  NotificationState,
} from "./merchant/AccountNotificationsPrimitives";
export function NotificationBell() {
  const user = trpc.auth.me.useQuery(undefined, notificationQueryOptions);
  if (user.error || user.isLoading || user.isFetching || !user.data?.id)
    return null;
  return <AccountNotificationBell key={user.data.id} actorId={user.data.id} />;
}
export function AccountNotificationBell({ actorId }: { actorId: number }) {
  const { c, locale } = useNotificationCopy(),
    query = trpc.notifications.workspace.list.useQuery(
      { search: '', state: 'all', page: 1, pageSize: 25 },
      notificationQueryOptions
    );
  const snapshot =
      query.error || query.isFetching
        ? null
        : notificationSnapshot(query.data, actorId, {}),
    count = snapshot?.markAll.unreadCount;
  return (
    <DropdownMenu modal={false} dir={locale.startsWith("en") ? "ltr" : "rtl"} onOpenChange={open=>{if(open)void query.refetch();}}>
      <DropdownMenuTrigger asChild>
        <Button
          className="an-bell-trigger"
          type="button"
          variant="ghost"
          size="icon"
          aria-label={
            c.title + (count === undefined ? "" : ` · ${c.unread}: ${count}`)
          }
        >
          <Bell aria-hidden="true" />
          {count !== undefined && count > 0 && (
            <span className="an-bell-count" aria-hidden="true">
              {count > 99 ? "99+" : count}
            </span>
          )}
          {!query.isFetching && !snapshot && (
            <span className="an-bell-count" aria-hidden="true">
              !
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="an-bell-panel">
        <h2>{c.title}</h2>
        <p>{c.bellHint}</p>
        {query.isLoading || query.isFetching ? (
          <p role="status">{c.loading}</p>
        ) : !snapshot ? (
          <div role="alert">
            <p>{c.unavailable}</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              {c.refresh}
            </Button>
          </div>
        ) : snapshot.items.length === 0 ? (
          <p>{c.empty}</p>
        ) : (
          snapshot.items.slice(0, 5).map(row => (
            <DropdownMenuItem asChild key={row.id}>
              <Link
                className="an-bell-item"
                href={notificationHref({}, row.id)}
              >
                <NotificationState state={row.state} />
                <strong>{row.title || c.unknownTitle}</strong>
                <small>
                  {notificationDate(row.createdAt, locale, c.unknown)}
                </small>
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <div className="an-bell-footer">
          <DropdownMenuItem asChild>
            <Link className="an-link" href={notificationHref()}>
              {c.viewAll}
            </Link>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
