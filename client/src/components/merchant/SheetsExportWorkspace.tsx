import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { usageQueryOptions } from "@/lib/usage-workspace-view";
import { sheetsExportLabels } from "@/lib/sheets-export-labels";
import { sheetsSettingsView } from "@shared/sheets-settings";
import { sheetsConversationExportReceipt } from "@shared/sheets-conversation-export";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import "@/styles/sheets-data-workspace.css";

export function SheetsExportPage() {
  const user = trpc.auth.me.useQuery(undefined, usageQueryOptions);
  const identity = trpc.merchants.workspaceIdentity.useQuery(undefined, {
    ...usageQueryOptions,
    enabled: !!user.data?.id && !user.error && !user.isFetching,
  });
  const error = user.error || identity.error;
  const refresh = () => {
    void user.refetch();
    void identity.refetch();
  };
  if (error)
    return (
      <WorkspaceState kind={workspaceFailureKind(error)} onRetry={refresh} />
    );
  if (
    user.isLoading ||
    user.isFetching ||
    identity.isLoading ||
    identity.isFetching
  )
    return <WorkspaceState kind="loading" />;
  if (
    !user.data?.id ||
    !identity.data?.id ||
    identity.data.actorId !== user.data.id
  )
    return (
      <WorkspaceState
        kind={!user.data?.id ? "session" : "missing"}
        onRetry={refresh}
      />
    );
  return (
    <ExportWorkspace
      key={user.data.id + ":" + identity.data.id}
      actorId={user.data.id}
      merchantId={identity.data.id}
    />
  );
}
type Choice = {
  id: number;
  customerName: string | null;
  customerPhone: string;
};
type Review = { rows: Choice[]; sheetId: string };
function ExportWorkspace({
  actorId,
  merchantId,
}: {
  actorId: number;
  merchantId: number;
}) {
  const { t, i18n } = useTranslation(),
    c = sheetsExportLabels(t);
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(""),
    [draft, setDraft] = useState("");
  const [selected, setSelected] = useState<Choice[]>([]),
    [review, setReview] = useState<Review | null>(null);
  const [running, setRunning] = useState(false),
    [locked, setLocked] = useState(false);
  const [notice, setNotice] = useState<{
    kind: "accepted" | "uncertain" | "empty" | "rejected";
    messages?: number;
    conversations?: number;
  } | null>(null);
  const busy = useRef(false),
    alive = useRef(true),
    trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const connection = trpc.sheets.getStatus.useQuery(
    undefined,
    usageQueryOptions
  );
  const inbox = trpc.conversations.list.useQuery(
    { page, pageSize: 25, search },
    usageQueryOptions
  );
  const mutation = trpc.sheets.exportConversations.useMutation();
  const status = sheetsSettingsView.safeParse(connection.data);
  const destination =
    status.success &&
    status.data.actorId === actorId &&
    status.data.merchantId === merchantId
      ? status.data
      : null;
  const raw = inbox.data;
  const rows =
    raw &&
    raw.merchantId === merchantId &&
    raw.page === page &&
    raw.pageSize === 25 &&
    Number.isSafeInteger(raw.total) &&
    raw.total >= 0 &&
    raw.totalPages === Math.ceil(raw.total / 25) &&
    Array.isArray(raw.items) &&
    raw.items.length <= 25 &&
    new Set(raw.items.map(row => row.id)).size === raw.items.length &&
    raw.items.every(
      row =>
        row.merchantId === merchantId &&
        Number.isSafeInteger(row.id) &&
        row.id > 0 &&
        typeof row.customerPhone === "string" &&
        (row.customerName === null || typeof row.customerName === "string")
    )
      ? raw
      : null;
  const error = connection.error || inbox.error;
  const loading =
    connection.isLoading ||
    connection.isFetching ||
    inbox.isLoading ||
    inbox.isFetching;
  const ready = !error && !loading && !!rows && !!destination;
  const linked =
    ready && destination?.state === "ready" && !!destination.spreadsheetId;
  const current = useRef({ ready, sheetId: destination?.spreadsheetId });
  current.current = { ready, sheetId: destination?.spreadsheetId };
  const disabled = running || locked || !!review;
  const refresh = () => {
    void connection.refetch();
    void inbox.refetch();
  };
  const toggle = (row: Choice, checked: boolean) =>
    setSelected(prev =>
      checked
        ? prev.some(item => item.id === row.id)
          ? prev
          : [...prev, row].slice(0, 100)
        : prev.filter(item => item.id !== row.id)
    );
  const allPage =
    !!rows?.items.length &&
    rows.items.every(row => selected.some(item => item.id === row.id));
  const pageAdds =
    rows?.items.filter(row => !selected.some(item => item.id === row.id)) ?? [];
  const confirm = async () => {
    if (
      !review ||
      busy.current ||
      locked ||
      !current.current.ready ||
      current.current.sheetId !== review.sheetId
    )
      return;
    const snapshot = review;
    busy.current = true;
    setRunning(true);
    setNotice(null);
    try {
      const result = await mutation.mutateAsync({
        conversationIds: snapshot.rows.map(row => row.id),
        reviewed: true,
        expectedSpreadsheetId: snapshot.sheetId,
      });
      if (!alive.current) return;
      if (result.success === false) {
        setNotice({ kind: "empty" });
        setReview(null);
        return;
      }
      const receipt = sheetsConversationExportReceipt.parse(result);
      if (
        receipt.actorId !== actorId ||
        receipt.merchantId !== merchantId ||
        receipt.spreadsheetId !== snapshot.sheetId ||
        receipt.conversationCount !== snapshot.rows.length
      )
        throw Error("Unconfirmed receipt");
      setNotice({
        kind: "accepted",
        messages: receipt.messageCount,
        conversations: receipt.conversationCount,
      });
      setLocked(true);
      setSelected([]);
      setReview(null);
    } catch (failure) {
      if (!alive.current) return;
      const code = (failure as { data?: { code?: string } })?.data?.code;
      const rejected =
        !!code &&
        [
          "FORBIDDEN",
          "UNAUTHORIZED",
          "BAD_REQUEST",
          "TOO_MANY_REQUESTS",
        ].includes(code);
      setNotice({ kind: rejected ? "rejected" : "uncertain" });
      setLocked(!rejected);
      setReview(null);
    } finally {
      busy.current = false;
      if (alive.current) setRunning(false);
    }
  };
  return (
    <section
      className="sd-workspace"
      dir={i18n.language.startsWith("ar") ? "rtl" : "ltr"}
    >
      <header className="sd-header">
        <div>
          <p className="sd-eyebrow">{c.eyebrow}</p>
          <h1>{c.title}</h1>
          <p>{c.description}</p>
        </div>
        <Link className="sd-button" href="/merchant/sheets/reports">
          {c.reports}
        </Link>
      </header>
      {error ? (
        <WorkspaceState
          inline
          kind={workspaceFailureKind(error)}
          onRetry={refresh}
        />
      ) : loading ? (
        <WorkspaceState inline kind="loading" />
      ) : !ready ? (
        <WorkspaceState inline kind="error" onRetry={refresh} />
      ) : (
        <>
          <section className="sd-card">
            <div className="sd-heading">
              <h2>{c.destination}</h2>
              <Link className="sd-button" href="/merchant/sheets/settings">
                {c.settings}
              </Link>
            </div>
            <p>{linked ? c.linked : c.unlinked}</p>
            {destination?.spreadsheetId && (
              <p className="sd-id">
                <bdi>{destination.spreadsheetId}</bdi>
              </p>
            )}
            <p className="sd-muted">{c.limits}</p>
          </section>
          {notice && (
            <section className="sd-card sd-result" role="status">
              <h2>{c.result}</h2>
              <p>{c[notice.kind]}</p>
              {notice.kind === "accepted" && (
                <p>
                  {c.conversations}: {notice.conversations} · {c.messages}:{" "}
                  {notice.messages}
                </p>
              )}
              {locked && (
                <>
                  <p>{c.noRetry}</p>
                  <button
                    className="sd-button"
                    type="button"
                    onClick={() => {
                      setLocked(false);
                      setNotice(null);
                      setSelected([]);
                    }}
                  >
                    {c.newSelection}
                  </button>
                </>
              )}
            </section>
          )}
          <div className="sd-grid">
            <section className="sd-card">
              <div className="sd-heading">
                <h2>{c.conversations}</h2>
                <span>
                  {c.results}: {rows!.total}
                </span>
              </div>
              <form
                className="sd-search"
                onSubmit={event => {
                  event.preventDefault();
                  setPage(1);
                  setSearch(draft.trim());
                }}
              >
                <label htmlFor="sd-search">
                  {c.search}
                  <input
                    id="sd-search"
                    type="search"
                    maxLength={200}
                    value={draft}
                    disabled={running || !!review}
                    onChange={event => setDraft(event.target.value)}
                    placeholder={c.searchHint}
                  />
                </label>
                <button
                  type="submit"
                  className="sd-button"
                  disabled={running || !!review}
                >
                  {c.find}
                </button>
              </form>
              {rows!.items.length ? (
                <>
                  <label className="sd-check sd-page-check">
                    <input
                      type="checkbox"
                      checked={allPage}
                      disabled={
                        disabled ||
                        (!allPage && selected.length + pageAdds.length > 100)
                      }
                      onChange={event => {
                        if (event.target.checked)
                          setSelected(prev => [...prev, ...pageAdds]);
                        else
                          setSelected(prev =>
                            prev.filter(
                              item =>
                                !rows!.items.some(row => row.id === item.id)
                            )
                          );
                      }}
                    />
                    <span>
                      {c.selectPage} ({rows!.items.length})
                    </span>
                  </label>
                  <ul className="sd-conversations">
                    {rows!.items.map(row => (
                      <li key={row.id}>
                        <label className="sd-check">
                          <input
                            type="checkbox"
                            checked={selected.some(item => item.id === row.id)}
                            disabled={
                              disabled ||
                              (selected.length >= 100 &&
                                !selected.some(item => item.id === row.id))
                            }
                            onChange={event =>
                              toggle(row, event.target.checked)
                            }
                          />
                          <span>
                            <strong>{row.customerName || c.unnamed}</strong>
                            <bdi>{row.customerPhone}</bdi>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="sd-empty">
                  {search ? c.noResults : c.inboxEmpty}
                </p>
              )}
              <nav className="sd-pagination" aria-label={c.pagination}>
                <button
                  type="button"
                  className="sd-button"
                  disabled={page === 1 || running || !!review}
                  onClick={() => setPage(value => value - 1)}
                >
                  {c.previous}
                </button>
                <span>
                  {c.page} {page} / {Math.max(1, rows!.totalPages)}
                </span>
                <button
                  type="button"
                  className="sd-button"
                  disabled={page >= rows!.totalPages || running || !!review}
                  onClick={() => setPage(value => value + 1)}
                >
                  {c.next}
                </button>
              </nav>
            </section>
            <aside className="sd-card sd-selection">
              <div className="sd-heading">
                <h2>
                  {c.selected} ({selected.length}/100)
                </h2>
                <button
                  type="button"
                  className="sd-button"
                  disabled={disabled || !selected.length}
                  onClick={() => setSelected([])}
                >
                  {c.clear}
                </button>
              </div>
              <p className="sd-muted">{c.selectionHint}</p>
              <ul className="sd-selected-list">
                {selected.map(row => (
                  <li key={row.id}>
                    <span>
                      <strong>{row.customerName || c.unnamed}</strong>
                      <bdi>{row.customerPhone}</bdi>
                    </span>
                    <button
                      type="button"
                      className="sd-button"
                      disabled={disabled}
                      aria-label={
                        c.remove + " " + (row.customerName || row.customerPhone)
                      }
                      onClick={() => toggle(row, false)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              {!selected.length && <p>{c.selectHint}</p>}
              <button
                type="button"
                className="sd-button sd-primary"
                disabled={disabled || !selected.length || !linked}
                onClick={event => {
                  trigger.current = event.currentTarget;
                  setReview({
                    rows: selected.map(row => ({ ...row })),
                    sheetId: destination!.spreadsheetId!,
                  });
                }}
              >
                {c.review}
              </button>
            </aside>
          </div>
        </>
      )}
      <Dialog
        open={!!review && ready}
        onOpenChange={open => {
          if (!open && !running) setReview(null);
        }}
      >
        <DialogContent
          className="sd-dialog"
          dir={i18n.language.startsWith("ar") ? "rtl" : "ltr"}
          closeLabel={c.close}
          showCloseButton={!running}
          onEscapeKeyDown={event => {
            if (running) event.preventDefault();
          }}
          onPointerDownOutside={event => {
            if (running) event.preventDefault();
          }}
          onCloseAutoFocus={event => {
            if (trigger.current?.isConnected) {
              event.preventDefault();
              trigger.current.focus();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{c.review}</DialogTitle>
            <DialogDescription>{c.reviewHint}</DialogDescription>
          </DialogHeader>
          {review && (
            <>
              <p>
                {c.destination}: <bdi className="sd-id">{review.sheetId}</bdi>
              </p>
              <p>
                {c.selected}: {review.rows.length}
              </p>
              <ul className="sd-review-list">
                {review.rows.map(row => (
                  <li key={row.id}>
                    <strong>{row.customerName || c.unnamed}</strong>
                    <bdi>{row.customerPhone}</bdi>
                  </li>
                ))}
              </ul>
              <p className="sd-warning">{c.privacy}</p>
            </>
          )}
          <DialogFooter>
            <button
              type="button"
              className="sd-button"
              disabled={running || !ready}
              onClick={() => setReview(null)}
            >
              {c.cancel}
            </button>
            <button
              type="button"
              className="sd-button sd-primary"
              disabled={
                running ||
                !linked ||
                review?.sheetId !== destination?.spreadsheetId
              }
              onClick={() => void confirm()}
            >
              {running ? c.working : c.confirm}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
