import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import { useKnowledgePageCopy } from "@/hooks/useKnowledgePageCopy";
import { safePageUrl, type PageReview } from "../../../shared/knowledge-pages";
import { KnowledgeWorkspaceScope } from "./KnowledgeWorkspaceScope";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
export function KnowledgeWebsiteWorkspace() {
  return (
    <KnowledgeWorkspaceScope slot="website-pages">
      {key => <Workspace key={key} />}
    </KnowledgeWorkspaceScope>
  );
}
function Workspace() {
  const c = useKnowledgePageCopy(),
    { t } = useTranslation(),
    utils = trpc.useUtils();
  const [search, setSearch] = useState(""),
    [filters, setFilters] = useState({
      search: "",
      state: "all" as "all" | "enabled" | "paused" | "inactive" | "empty",
      page: 1,
    });
  const list = trpc.sariBrain.pageWorkspace.useQuery(filters, { retry: false });
  const mutation = trpc.sariBrain.changeWorkspacePage.useMutation();
  const [selected, setSelected] = useState<number | null>(null),
    [review, setReview] = useState<PageReview | null>(null),
    [action, setAction] = useState<"" | "enable" | "pause" | "delete">(""),
    [ack, setAck] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const locked = useRef(false),
    alive = useRef(true),
    epoch = useRef(knowledgeCacheEpoch());
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const current = () =>
    alive.current && epoch.current === knowledgeCacheEpoch();
  const open = async (id: number) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setSelected(id);
    setReview(null);
    setAck(false);
    setAction("");
    setError("");
    setMessage("");
    try {
      const result = await utils.sariBrain.pageReview.fetch(
        { id },
        { staleTime: 0 }
      );
      if (current()) setReview(result);
    } catch (e: any) {
      if (current())
        setError(e?.data?.code === "NOT_FOUND" ? c.missing : c.reviewFailed);
    } finally {
      locked.current = false;
      if (current()) setBusy(false);
    }
  };
  const apply = async () => {
    if (
      locked.current ||
      !review ||
      !ack ||
      !action ||
      !list.data?.canManage ||
      list.error ||
      review.duplicateCount ||
      (action === "enable" && !review.canEnable)
    )
      return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await mutation.mutateAsync({
        id: review.page.id,
        expectedRevision: review.revision,
        action,
        acknowledged: true,
      });
      if (!current()) return;
      setSelected(null);
      setReview(null);
      setMessage(c.savedMessage);
      // Each workspace re-reads its own state; a failed refresh is never an empty list.
      void utils.sariBrain.invalidate();
    } catch (e: any) {
      if (current()) {
        setReview(null);
        setError(e?.data?.code === "CONFLICT" ? c.conflict : c.uncertain);
      }
    } finally {
      locked.current = false;
      if (current()) {
        setAck(false);
        setAction("");
        setBusy(false);
      }
    }
  };
  const url = (value: string) => {
    const safe = safePageUrl(value);
    return safe ? (
      <a
        className="block break-all text-sm text-primary underline"
        href={safe}
        target="_blank"
        rel="noopener noreferrer"
        dir="ltr"
      >
        {value}
      </a>
    ) : (
      <p className="break-all text-sm" dir="ltr">
        {value}
      </p>
    );
  };
  const text = (value: string) => (
    <div
      className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-7"
      dir="auto"
    >
      {value || c.empty}
    </div>
  );
  const state = (value: string) => c[value as keyof typeof c] || value;
  return (
    <Card className="min-w-0" data-knowledge-pages>
      <CardHeader>
        <CardTitle>{c.title}</CardTitle>
        <CardDescription>{c.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 min-w-0">
        <p className="text-sm text-muted-foreground">{c.scope}</p>
        {message && <p role="status">{message}</p>}
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={e => {
            e.preventDefault();
            setFilters({ ...filters, search, page: 1 });
          }}
        >
          <label className="min-w-0 flex-1 basis-52 text-sm">
            {c.search}
            <Input
              value={search}
              maxLength={200}
              onChange={e => setSearch(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {c.filter}
            <select
              className="h-11 rounded-md border bg-background px-3"
              value={filters.state}
              onChange={e =>
                setFilters({
                  ...filters,
                  state: e.target.value as typeof filters.state,
                  page: 1,
                })
              }
            >
              {(["all", "enabled", "paused", "inactive", "empty"] as const).map(
                s => (
                  <option key={s} value={s}>
                    {c[s]}
                  </option>
                )
              )}
            </select>
          </label>
          <Button type="submit" className="min-h-11">
            {c.searchButton}
          </Button>
        </form>
        {list.isLoading ? (
          <p role="status">{c.loading}</p>
        ) : list.error ? (
          <div role="alert" className="space-y-3">
            <p>{c.loadFailed}</p>
            <Button variant="outline" onClick={() => void list.refetch()}>
              {c.retry}
            </Button>
          </div>
        ) : list.data ? (
          <>
            <dl className="grid grid-cols-2 gap-3">
              {[
                [c.saved, list.data.saved],
                [c.enabledCount, list.data.enabled],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border p-3">
                  <dt className="text-sm">{label}</dt>
                  <dd className="text-2xl font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
            {!list.data.canManage && <p>{c.readOnly}</p>}
            <div className="grid gap-3 lg:grid-cols-2">
              {list.data.items.map(p => (
                <article
                  key={p.id}
                  className="min-w-0 rounded-xl border p-4 space-y-3"
                >
                  <h3 className="font-semibold break-words [overflow-wrap:anywhere]">
                    {p.title}
                  </h3>
                  {url(p.url)}
                  <p className="text-sm">
                    #{p.id} · {state(p.state)}
                  </p>
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => void open(p.id)}
                    disabled={busy}
                    aria-label={`${c.review}: ${p.title}`}
                  >
                    {c.review}
                  </Button>
                </article>
              ))}
            </div>
            {!list.data.items.length && <p>{c.noPages}</p>}
            <nav
              className="flex flex-wrap items-center gap-3"
              aria-label={c.title}
            >
              <Button
                variant="outline"
                disabled={list.data.page <= 1}
                onClick={() =>
                  setFilters({ ...filters, page: list.data!.page - 1 })
                }
              >
                {c.previous}
              </Button>
              <span className="text-sm">
                {t("merchantUx.knowledgePages.pagination", {
                  page: list.data.page,
                  pages: list.data.totalPages,
                  total: list.data.total,
                })}
              </span>
              <Button
                variant="outline"
                disabled={list.data.page >= list.data.totalPages}
                onClick={() =>
                  setFilters({ ...filters, page: list.data!.page + 1 })
                }
              >
                {c.next}
              </Button>
            </nav>
          </>
        ) : null}
        <Dialog
          open={selected !== null}
          onOpenChange={o => {
            if (!o && !locked.current) {
              setSelected(null);
              setReview(null);
              setAck(false);
            }
          }}
        >
          <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto [overflow-wrap:anywhere]">
            <DialogHeader>
              <DialogTitle>{c.reviewTitle}</DialogTitle>
              <DialogDescription>{c.scopeWarning}</DialogDescription>
            </DialogHeader>
            {error && <p role="alert">{error}</p>}
            {busy && !review && <p role="status">{c.reviewLoading}</p>}
            {review && (
              <div className="min-w-0 space-y-5">
                <div>
                  <h3 className="font-semibold">{review.page.title}</h3>
                  {url(review.page.url)}
                  <p>
                    #{review.page.id} · {state(review.page.state)}
                  </p>
                </div>
                <section className="space-y-2">
                  <h3 className="font-semibold">{c.content}</h3>
                  {text(review.page.content)}
                </section>
                <section className="space-y-3">
                  <h3 className="font-semibold">{c.linked}</h3>
                  <p className="text-sm text-muted-foreground">{c.linksHelp}</p>
                  <h4>
                    {c.sections} ({review.sections.length})
                  </h4>
                  {!review.sections.length && <p>{c.noLinked}</p>}
                  {review.sections.map(r => (
                    <article
                      key={r.id}
                      className="rounded-lg border p-3 space-y-2"
                    >
                      <h5>
                        {r.title} · #{r.id}
                      </h5>
                      <p className="text-sm">{state(r.state)}</p>
                      {text(r.content)}
                    </article>
                  ))}
                  <h4>
                    {c.faqs} ({review.faqs.length})
                  </h4>
                  {!review.faqs.length && <p>{c.noLinked}</p>}
                  {review.faqs.map(r => (
                    <article
                      key={r.id}
                      className="rounded-lg border p-3 space-y-2"
                    >
                      <h5>
                        {r.question} · #{r.id}
                      </h5>
                      <p className="text-sm">
                        {r.enabled ? c.enabled : c.paused}
                      </p>
                      {text(r.answer)}
                    </article>
                  ))}
                </section>
                {!!review.duplicateCount && <p role="alert">{c.duplicates}</p>}
                {!review.canEnable && <p>{c.blocked}</p>}
                {list.data?.canManage && !list.error && (
                  <fieldset
                    disabled={busy || !!review.duplicateCount}
                    className="space-y-3 border-t pt-4"
                  >
                    <label className="grid gap-2">
                      {c.action}
                      <select
                        className="w-full min-h-11 rounded-md border bg-background px-2 text-sm"
                        value={action}
                        onChange={e => {
                          setAction(e.target.value as typeof action);
                          setAck(false);
                        }}
                      >
                        <option value="">{c.choose}</option>
                        <option value="enable" disabled={!review.canEnable}>
                          {c.enable}
                        </option>
                        <option value="pause">{c.pause}</option>
                        <option value="delete">{c.delete}</option>
                      </select>
                    </label>
                    <label className="flex min-h-11 items-start gap-3 text-sm">
                      <input
                        className="mt-1 h-5 w-5 shrink-0"
                        type="checkbox"
                        checked={ack}
                        disabled={!action}
                        onChange={e => setAck(e.target.checked)}
                      />
                      {c.acknowledge}
                    </label>
                    <Button
                      className="min-h-11 w-full sm:w-auto"
                      variant={action === "delete" ? "destructive" : "default"}
                      disabled={!action || !ack || busy}
                      onClick={() => void apply()}
                    >
                      {busy ? c.applying : c.apply}
                    </Button>
                  </fieldset>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => selected && void open(selected)}
              >
                {c.refreshReview}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setSelected(null);
                  setReview(null);
                  setAck(false);
                }}
              >
                {c.close}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
