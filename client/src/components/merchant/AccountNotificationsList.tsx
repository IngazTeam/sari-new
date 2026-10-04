import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { Bell, RefreshCw, CheckCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import {
  notificationFilters,
  notificationHref,
  notificationSnapshot,
} from "@/lib/account-notifications-view";
import {
  accountNotificationsInput,
  accountNotificationsReadAllResult,
} from "@shared/account-notifications-workspace";
import {
  NotificationFrame,
  NotificationState,
  useNotificationCopy,
  useNotificationLive,
  notificationQueryOptions,
  notificationDate,
} from "./AccountNotificationsPrimitives";
export function AccountNotificationsList({ actorId }: { actorId: number }) {
  const { c, locale } = useNotificationCopy(),
    search = useSearch(),
    [, navigate] = useLocation(),
    live = useNotificationLive(),
    lock = useRef(false),
    utils = trpc.useUtils();
  const f = notificationFilters(search),
    filter = f.success ? f.data : null;
  const seed = () => {
    const p = new URLSearchParams(search);
    return {
      search: p.get("search") ?? "",
      state: p.get("state") ?? "all",
      pageSize: p.get("pageSize") ?? "25",
    };
  };
  const [draft, setDraft] = useState(seed),
    [invalid, setInvalid] = useState(false),
    [review, setReview] = useState<
      NonNullable<ReturnType<typeof notificationSnapshot>>["markAll"] | null
    >(null),
    [busy, setBusy] = useState(false),
    [blocked, setBlocked] = useState(false),
    [notice, setNotice] = useState<string | null>(null);
  const query = trpc.notifications.workspace.list.useQuery(filter ?? {}, {
      ...notificationQueryOptions,
      enabled: !!filter,
    }),
    mutation = trpc.notifications.workspace.readAllReviewed.useMutation({
      retry: false,
    });
  const [accepted, setAccepted] = useState<{
      key: string;
      data: NonNullable<ReturnType<typeof notificationSnapshot>>;
    } | null>(null),
    key = JSON.stringify(filter);
  const snapshot = query.error
    ? null
    : accepted?.key === key
      ? accepted.data
      : notificationSnapshot(query.data, actorId, filter);
  useEffect(() => {
    setDraft(seed());
    setInvalid(false);
    setReview(null);
    setAccepted(null);
  }, [search]);
  const refresh = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setReview(null);
    setAccepted(null);
    try {
      const r = await query.refetch();
      if (!live()) return;
      const p = r.error ? null : notificationSnapshot(r.data, actorId, filter);
      if (!p) throw Error("read");
      setAccepted({ key, data: p });
      setBlocked(false);
      setNotice(null);
    } catch {
      if (live()) {
        setBlocked(true);
        setNotice(c.readFailed);
      }
    } finally {
      lock.current = false;
      if (live()) setBusy(false);
    }
  };
  const markAll = async () => {
    const proof = review;
    if (
      lock.current ||
      blocked ||
      !review ||
      !proof?.throughId ||
      !proof.unreadCount ||
      query.isFetching
    )
      return;
    lock.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const r = accountNotificationsReadAllResult.parse(
        await mutation.mutateAsync({
          throughId: proof.throughId,
          unreadCount: proof.unreadCount,
          expectedRevision: proof.revision,
          reviewed: true,
        })
      );
      if (!live()) return;
      if (
        r.actorId !== actorId ||
        r.throughId !== proof.throughId ||
        r.changed !== proof.unreadCount
      )
        throw Error("receipt");
      setReview(null);
      setAccepted(null);
      setNotice(c.bulkSaved);
      await utils.notifications.workspace.invalidate();
    } catch (error: any) {
      if (live()) {
        setBlocked(true);
        setReview(null);
        setNotice(
          error?.data?.code === "CONFLICT" ? c.changed : c.actionUnknown
        );
      }
    } finally {
      lock.current = false;
      if (live()) setBusy(false);
    }
  };
  return (
    <NotificationFrame>
      <form
        className="sw-panel an-filters"
        noValidate
        onSubmit={e => {
          e.preventDefault();
          const p = accountNotificationsInput.safeParse({
            ...draft,
            page: 1,
            pageSize: Number(draft.pageSize),
          });
          if (!p.success) {
            setInvalid(true);
            return;
          }
          setInvalid(false);
          navigate(notificationHref(p.data));
        }}
      >
        <label htmlFor="an-search">
          {c.search}
          <input
            id="an-search"
            maxLength={100}
            value={draft.search}
            placeholder={c.searchHint}
            onChange={e => {
              setDraft({ ...draft, search: e.target.value });
              setInvalid(false);
            }}
          />
        </label>
        <label htmlFor="an-state">
          {c.state}
          <select
            id="an-state"
            value={draft.state}
            onChange={e => setDraft({ ...draft, state: e.target.value })}
          >
            {(["all", "unread", "read", "unknown"] as const).map(s => (
              <option key={s} value={s}>
                {c[s]}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="an-size">
          {c.pageSize}
          <select
            id="an-size"
            value={draft.pageSize}
            onChange={e => setDraft({ ...draft, pageSize: e.target.value })}
          >
            <option value="25">25</option>
            <option value="50">50</option>
          </select>
        </label>
        <Button type="submit" disabled={busy}>
          {c.apply}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setDraft({ search: "", state: "all", pageSize: "25" });
            setInvalid(false);
            navigate(notificationHref());
          }}
        >
          {c.reset}
        </Button>
        {(!filter || invalid) && (
          <p role="alert" className="an-warning">
            {c.filterError}
          </p>
        )}
      </form>
      {notice && (
        <p role="status" className={blocked ? "an-warning" : "an-notice"}>
          {notice}
        </p>
      )}
      {filter &&
        (query.error ? (
          <WorkspaceState
            kind={workspaceFailureKind(query.error)}
            onRetry={() => void refresh()}
          />
        ) : query.isLoading || query.isFetching ? (
          <WorkspaceState kind="loading" />
        ) : !snapshot ? (
          <WorkspaceState kind="error" onRetry={() => void refresh()} />
        ) : (
          <>
            <div className="an-toolbar">
              <p>
                {c.filtered} ·{" "}
                <strong>
                  {new Intl.NumberFormat(locale).format(snapshot.totals.total)}
                </strong>
              </p>
              <div className="an-actions">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void refresh()}
                >
                  <RefreshCw aria-hidden="true" />
                  {c.refresh}
                </Button>
                <Button
                  disabled={busy || blocked || !snapshot.markAll.unreadCount}
                  onClick={() => setReview(snapshot.markAll)}
                >
                  <CheckCheck aria-hidden="true" />
                  {c.markAll}
                </Button>
              </div>
            </div>
            {review && (
              <section className="an-review" aria-label={c.bulkTitle}>
                <h2>
                  {c.bulkTitle} ·{" "}
                  {new Intl.NumberFormat(locale).format(
                    review.unreadCount
                  )}
                </h2>
                <p>{c.bulkHint}</p>
                <div className="an-actions">
                  <Button disabled={busy} onClick={() => void markAll()}>
                    {c.confirmAll}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => setReview(null)}
                  >
                    {c.cancel}
                  </Button>
                </div>
              </section>
            )}
            <div className="an-counts">
              {(["unread", "read", "unknown"] as const).map(s => (
                <div key={s}>
                  <span>{c[s]}</span>
                  <strong>
                    {new Intl.NumberFormat(locale).format(snapshot.totals[s])}
                  </strong>
                </div>
              ))}
            </div>
            <section className="sw-panel an-inbox">
              {snapshot.items.length === 0 ? (
                <div className="an-empty">
                  <Bell aria-hidden="true" />
                  <h2>{c.empty}</h2>
                  <p>{c.emptyHint}</p>
                </div>
              ) : (
                <ul className="an-list">
                  {snapshot.items.map(row => (
                    <li key={row.id} className={"an-row an-row-" + row.state}>
                      <div className="an-row-head">
                        <NotificationState state={row.state} />
                        <time dateTime={row.createdAt ?? undefined}>
                          {notificationDate(row.createdAt, locale, c.unknown)}
                        </time>
                      </div>
                      <Link
                        className="an-row-link"
                        href={notificationHref(filter, row.id)}
                      >
                        <h2>{row.title || c.unknownTitle}</h2>
                        <p>{row.message ?? c.unknownMessage}</p>
                        <span>
                          {c.details} <span aria-hidden="true">↗</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <nav className="an-pagination" aria-label={c.page}>
                <Button
                  variant="outline"
                  disabled={busy || filter.page <= 1}
                  onClick={() =>
                    navigate(
                      notificationHref({ ...filter, page: filter.page - 1 })
                    )
                  }
                >
                  {c.previous}
                </Button>
                <span>
                  {c.page} {new Intl.NumberFormat(locale).format(filter.page)}
                </span>
                <Button
                  variant="outline"
                  disabled={busy || !snapshot.hasNext || filter.page >= 10000}
                  onClick={() =>
                    navigate(
                      notificationHref({ ...filter, page: filter.page + 1 })
                    )
                  }
                >
                  {c.next}
                </Button>
              </nav>
              <p className="an-muted">
                {c.checkedAt}:{" "}
                {notificationDate(snapshot.checkedAt, locale, c.unknown)} ·{" "}
                {c.utc}
              </p>
            </section>
          </>
        ))}
    </NotificationFrame>
  );
}
