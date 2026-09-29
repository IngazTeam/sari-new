import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useKnowledgePageIntakeCopy } from "@/hooks/useKnowledgePageIntakeCopy";
import {
  knowledgeCacheEpoch,
  readKnowledgeAttempt,
  rememberKnowledgeAttempt,
  forgetKnowledgeAttempt,
} from "@/lib/knowledge-workspace-cache";
import {
  pageUrlInput,
  type PageIntakeRead,
} from "../../../shared/knowledge-page-intake";
import { KnowledgeWorkspaceScope } from "./KnowledgeWorkspaceScope";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
export function KnowledgeWebsiteIntake() {
  return (
    <KnowledgeWorkspaceScope slot="website-intake">
      {key => <Workspace key={key} scope={key} />}
    </KnowledgeWorkspaceScope>
  );
}
function Workspace({ scope }: { scope: string }) {
  const c = useKnowledgePageIntakeCopy(),
    utils = trpc.useUtils();
  const permissions = trpc.sariBrain.pageWorkspace.useQuery(undefined, {
    retry: false,
  });
  const prepare = trpc.sariBrain.previewUrl.useMutation(),
    save = trpc.sariBrain.savePreviewedPage.useMutation();
  const [url, setUrl] = useState(""),
    [result, setResult] = useState<PageIntakeRead | null>(null),
    [id, setId] = useState<string | null>(null),
    [busy, setBusy] = useState(true),
    [open, setOpen] = useState(false),
    [ack, setAck] = useState(false),
    [error, setError] = useState(""),
    [indexing, setIndexing] = useState(false),
    [storage, setStorage] = useState(false);
  const alive = useRef(true),
    locked = useRef(false),
    epoch = useRef(knowledgeCacheEpoch());
  const current = () =>
    alive.current && epoch.current === knowledgeCacheEpoch();
  const canManage =
    !!permissions.data?.canManage &&
    !permissions.error &&
    !permissions.isLoading;
  const resolve = async (reference: string) => {
    const receipt = await utils.sariBrain.pageIntakeReceipt.fetch(
      { previewId: reference },
      { staleTime: 0 }
    );
    if (current()) {
      setResult(receipt);
      if ("pageId" in receipt) void utils.sariBrain.invalidate();
    }
    return receipt;
  };
  const recover = async (reference: string) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setAck(false);
    setError("");
    setResult(null);
    try {
      await resolve(reference);
    } catch {
      if (current()) setError(c.uncertain);
    } finally {
      locked.current = false;
      if (current()) setBusy(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    try {
      const prior = readKnowledgeAttempt(scope);
      if (prior) {
        setId(prior);
        void recover(prior);
      } else setBusy(false);
    } catch {
      setStorage(true);
      setError(c.storage);
      setBusy(false);
    }
    return () => {
      alive.current = false;
    };
  }, [scope]);
  const preview = async () => {
    if (locked.current || id || storage || !canManage) return;
    const input = pageUrlInput.safeParse({ url });
    if (!input.success) {
      setError(c.invalid);
      return;
    }
    locked.current = true;
    setBusy(true);
    setAck(false);
    setError("");
    setIndexing(false);
    try {
      const snapshot = await prepare.mutateAsync(input.data);
      if (!current()) return;
      try {
        rememberKnowledgeAttempt(scope, snapshot.previewId, epoch.current);
      } catch {
        setStorage(true);
        setError(c.storage);
        return;
      }
      setId(snapshot.previewId);
      setResult({ state: "review", preview: snapshot });
      setOpen(true);
    } catch (e: any) {
      if (current())
        setError(
          e?.message === "PAGE_EXISTS"
            ? c.exists
            : ["PREVIEW_LIMIT", "PAGE_LIMIT"].includes(e?.message)
              ? c.limit
              : c.failed
        );
    } finally {
      locked.current = false;
      if (current()) setBusy(false);
    }
  };
  const commit = async () => {
    if (
      locked.current ||
      !ack ||
      !canManage ||
      storage ||
      result?.state !== "review" ||
      !id
    )
      return;
    locked.current = true;
    setBusy(true);
    setAck(false);
    setError("");
    try {
      const receipt = await save.mutateAsync({
        previewId: id,
        acknowledged: true,
      });
      if (!current()) return;
      setResult(receipt);
      setIndexing(receipt.indexing === "unconfirmed");
      setOpen(false);
      void utils.sariBrain.invalidate();
    } catch (e: any) {
      if (current()) {
        setResult(null);
        try {
          const found = await resolve(id);
          if (current() && found.state === "review")
            setError(
              e?.message === "PAGE_EXISTS"
                ? c.exists
                : e?.message === "PAGE_LIMIT"
                  ? c.limit
                  : e?.data?.code === "CONFLICT"
                    ? c.conflict
                    : c.uncertain
            );
        } catch {
          if (current()) setError(c.uncertain);
        }
      }
    } finally {
      locked.current = false;
      if (current()) setBusy(false);
    }
  };
  const reset = () => {
    if (busy || !result) return;
    forgetKnowledgeAttempt(scope, id);
    setId(null);
    setResult(null);
    setOpen(false);
    setAck(false);
    setUrl("");
    setError("");
    setIndexing(false);
  };
  const review = result?.state === "review" ? result.preview : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{c.title}</CardTitle>
        <CardDescription>{c.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 min-w-0">
        {permissions.error ? (
          <div role="alert">
            <p>{c.permissionFailed}</p>
            <Button
              variant="outline"
              onClick={() => void permissions.refetch()}
            >
              {c.retry}
            </Button>
          </div>
        ) : (
          !canManage && !permissions.isLoading && <p>{c.readOnly}</p>
        )}
        {busy && <p role="status">{id ? c.checking : c.busy}</p>}
        {error && (
          <p role="alert" className="text-destructive break-words">
            {error}
          </p>
        )}
        {!id && (
          <form
            className="flex flex-wrap gap-3 items-end"
            onSubmit={e => {
              e.preventDefault();
              void preview();
            }}
          >
            <label className="min-w-0 flex-1 basis-60 space-y-2">
              {c.url}
              <Input
                dir="ltr"
                type="url"
                maxLength={1000}
                value={url}
                onChange={e => {
                  setUrl(e.target.value);
                  setError("");
                }}
                placeholder="https://example.com/shipping"
                disabled={busy || !canManage || storage}
              />
            </label>
            <Button
              type="submit"
              className="min-h-11"
              disabled={busy || !canManage || storage || !url.trim()}
            >
              {c.prepare}
            </Button>
          </form>
        )}
        {id && (
          <div className="space-y-3">
            {review && (
              <>
                <p>{c.effect}</p>
                <Button
                  disabled={busy}
                  onClick={() => {
                    setAck(false);
                    setOpen(true);
                  }}
                >
                  {c.open}
                </Button>
              </>
            )}
            {result && ["expired", "not_found"].includes(result.state) && (
              <p role="status">{c.expired}</p>
            )}
            {result && "pageId" in result && (
              <div role="status" className="space-y-2">
                <p>{c[result.state]}</p>
                <p>
                  {c.pageId}: {result.pageId} · {c.sectionId}:{" "}
                  {result.sectionId}
                </p>
                {indexing && <p>{c.indexing}</p>}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => void recover(id)}
              >
                {c.recover}
              </Button>
              {result && (
                <Button variant="outline" disabled={busy} onClick={reset}>
                  {c.another}
                </Button>
              )}
            </div>
          </div>
        )}
        <Dialog
          open={open}
          onOpenChange={value => {
            if (!busy) {
              setOpen(value);
              setAck(false);
            }
          }}
        >
          <DialogContent
            className="mw-form-dialog mw-team-dialog sm:max-w-3xl w-[calc(100%-1rem)] max-h-[90dvh] overflow-hidden flex flex-col p-0"
            onEscapeKeyDown={e => {
              if (busy) e.preventDefault();
            }}
            onPointerDownOutside={e => {
              if (busy) e.preventDefault();
            }}
          >
            <DialogHeader className="p-5 pb-0 pe-12 shrink-0">
              <DialogTitle>{c.review}</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto min-h-0 min-w-0 space-y-4 px-5 pb-3 [overflow-wrap:anywhere]">
              <DialogDescription>{c.effect}</DialogDescription>
              {error && (
                <p role="alert" className="text-destructive">
                  {error}
                </p>
              )}
              {review ? (
                <>
                  <h3 className="font-bold">{review.title}</h3>
                  <a
                    href={review.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    dir="ltr"
                    className="block text-primary underline"
                  >
                    {review.url}
                  </a>
                  <p>
                    {c.expires}: {new Date(review.expiresAt).toLocaleString()}
                  </p>
                  <h4 className="font-semibold">{c.fullText}</h4>
                  <div
                    className="whitespace-pre-wrap rounded-xl border p-3"
                    dir="auto"
                  >
                    {review.content}
                  </div>
                  <details>
                    <summary className="cursor-pointer min-h-11 font-semibold">
                      {c.advisory}
                    </summary>
                    <p>{c.advisoryHelp}</p>
                    {review.analysis ? (
                      <>
                        <p>{review.analysis.summary}</p>
                        {review.analysis.sections.map((s, i) => (
                          <div key={i} className="mt-3">
                            <h4>{s.title}</h4>
                            <ul className="list-disc ps-5">
                              {s.points.map((p, j) => (
                                <li key={j}>{p}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </>
                    ) : (
                      <p>{c.noAnalysis}</p>
                    )}
                  </details>
                  <label className="flex items-start gap-3 min-h-11">
                    <input
                      type="checkbox"
                      className="mt-1 size-5 shrink-0"
                      checked={ack}
                      disabled={busy || !canManage}
                      onChange={e => setAck(e.target.checked)}
                    />
                    <span>{c.acknowledge}</span>
                  </label>
                </>
              ) : (
                <p role="status">
                  {busy
                    ? c.checking
                    : result && "pageId" in result
                      ? c[result.state]
                      : c.expired}
                </p>
              )}
            </div>
            <footer className="border-t p-3 flex flex-wrap gap-2 shrink-0">
              <Button
                disabled={busy || !review || !ack || !canManage || storage}
                className="basis-full sm:basis-auto min-h-11"
                onClick={() => void commit()}
              >
                {busy ? c.busy : c.save}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setAck(false);
                }}
              >
                {c.close}
              </Button>
              {id && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void recover(id)}
                >
                  {c.recover}
                </Button>
              )}
            </footer>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
