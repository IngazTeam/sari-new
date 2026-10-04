import { useRef, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import {
  notificationDetail,
  notificationReceipt,
} from "@/lib/account-notifications-view";
import {
  NotificationFrame,
  NotificationState,
  useNotificationCopy,
  useNotificationLive,
  notificationQueryOptions,
  notificationDate,
} from "./AccountNotificationsPrimitives";
export function AccountNotificationView({
  actorId,
  id,
}: {
  actorId: number;
  id: number;
}) {
  const { c, locale } = useNotificationCopy(),
    live = useNotificationLive(),
    lock = useRef(false),
    utils = trpc.useUtils();
  const query = trpc.notifications.workspace.detail.useQuery(
      { id },
      notificationQueryOptions
    ),
    mutation = trpc.notifications.workspace.applyReviewed.useMutation({
      retry: false,
    });
  const [accepted, setAccepted] =
      useState<ReturnType<typeof notificationDetail>>(null),
    [review, setReview] = useState<NonNullable<
      NonNullable<ReturnType<typeof notificationDetail>>["record"]
    > | null>(null),
    [busy, setBusy] = useState(false),
    [blocked, setBlocked] = useState(false),
    [notice, setNotice] = useState<string | null>(null);
  const snapshot = query.error
      ? null
      : (accepted ?? notificationDetail(query.data, actorId, id)),
    row = snapshot?.record;
  const refresh = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setReview(null);
    setAccepted(null);
    try {
      const r = await query.refetch();
      if (!live()) return;
      const p = r.error ? null : notificationDetail(r.data, actorId, id);
      if (!p) throw Error("read");
      setAccepted(p);
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
  const apply = async (action: "read" | "delete") => {
    if (
      lock.current ||
      blocked ||
      !row ||
      query.isFetching ||
      (action === "delete" && !review)
    )
      return;
    lock.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const r = notificationReceipt(
        await mutation.mutateAsync({
          id,
          expectedRevision: (action === "delete" ? review! : row).revision,
          action,
          reviewed: true,
        }),
        actorId,
        id,
        action
      );
      if (!live()) return;
      if (!r) throw Error("receipt");
      setAccepted(r.detail);
      setReview(null);
      setNotice(action === "delete" ? c.deleted : c.readSaved);
      void Promise.resolve(
        utils.notifications.workspace.list.invalidate()
      ).catch(() => {});
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
    <NotificationFrame detail>
      <div className="an-toolbar">
        <span />
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {c.refresh}
        </Button>
      </div>
      {notice && (
        <p role="status" className={blocked ? "an-warning" : "an-notice"}>
          {notice}
        </p>
      )}
      {query.error ? (
        <WorkspaceState
          kind={workspaceFailureKind(query.error)}
          onRetry={() => void refresh()}
        />
      ) : query.isLoading || query.isFetching ? (
        <WorkspaceState kind="loading" />
      ) : !snapshot ? (
        <WorkspaceState kind="error" onRetry={() => void refresh()} />
      ) : !row ? (
        <section className="sw-panel">
          <p role="status">{c.missing}</p>
        </section>
      ) : (
        <article className="sw-panel an-detail">
          <div className="an-row-head">
            <NotificationState state={row.state} />
            <span>#{row.id}</span>
          </div>
          <h2>{row.title || c.unknownTitle}</h2>
          <p className="an-message">{row.message ?? c.unknownMessage}</p>
          <dl>
            <div>
              <dt>{c.type}</dt>
              <dd>{row.type ? c[row.type] : c.unknown}</dd>
            </div>
            <div>
              <dt>{c.date}</dt>
              <dd>
                {notificationDate(row.createdAt, locale, c.unknown)} · {c.utc}
              </dd>
            </div>
          </dl>
          {row.linkUnavailable && (
            <p className="an-warning">{c.linkUnavailable}</p>
          )}
          <div className="an-actions">
            {row.link && (
              <Link className="an-link" href={row.link}>
                {c.openLink}
              </Link>
            )}
            <Button
              disabled={busy || blocked || row.state === "read"}
              onClick={() => void apply("read")}
            >
              {c.markRead}
            </Button>
            <Button
              className="an-delete"
              variant="outline"
              disabled={busy || blocked}
              onClick={() => setReview(row)}
            >
              {c.delete}
            </Button>
          </div>
          {review && (
            <section className="an-review" aria-label={c.confirmDelete}>
              <h3>{c.confirmDelete}</h3>
              <p>{c.deleteHint}</p>
              <strong>{review.title || c.unknownTitle}</strong>
              <div className="an-actions">
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void apply("delete")}
                >
                  {c.confirmDelete}
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
        </article>
      )}
    </NotificationFrame>
  );
}
