import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import {
  knowledgeRemovalReview,
  knowledgeRemovalReceipt,
  knowledgeRemovalWrite,
  type KnowledgeRemovalTarget,
  type KnowledgeRemovalReview,
  type KnowledgeRemovalReceipt,
} from "@shared/knowledge-source-removal";
import { trpc } from "@/lib/trpc";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import {
  readRemovalAttempt,
  rememberRemovalAttempt,
  forgetRemovalAttempt,
  removalIdentity,
  type RemovalAttempt,
} from "@/lib/knowledge-removal-attempt";
import { KnowledgeWorkspaceScope } from "./KnowledgeWorkspaceScope";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

type RemovalApi = {
  review: (target: KnowledgeRemovalTarget) => Promise<unknown>;
  send: (
    input: ReturnType<typeof knowledgeRemovalWrite.parse>
  ) => Promise<unknown>;
  receipt: (input: { requestId: string }) => Promise<unknown>;
  changed: () => void;
};
export function KnowledgeRemovalWorkspace({
  target,
  onClose,
}: {
  target: KnowledgeRemovalTarget | null;
  onClose: () => void;
}) {
  const utils = trpc.useUtils(),
    mutation = trpc.sariBrain.removeSources.useMutation({ retry: false });
  return (
    <KnowledgeWorkspaceScope slot="knowledge-removal">
      {scopeKey => (
        <KnowledgeRemovalView
          key={scopeKey}
          scopeKey={scopeKey}
          target={target}
          onClose={onClose}
          api={{
            review: input =>
              utils.sariBrain.reviewSourceRemoval.fetch(input, {
                staleTime: 0,
                retry: false,
              }),
            send: mutation.mutateAsync,
            receipt: input =>
              utils.sariBrain.sourceRemovalReceipt.fetch(input, {
                staleTime: 0,
                retry: false,
              }),
            changed: () => {
              void utils.sariBrain.invalidate();
              void utils.knowledgeDocs.invalidate();
              void utils.products.invalidate();
            },
          }}
        />
      )}
    </KnowledgeWorkspaceScope>
  );
}
export function KnowledgeRemovalView({
  scopeKey,
  target,
  onClose,
  api,
}: {
  scopeKey: string;
  target: KnowledgeRemovalTarget | null;
  onClose: () => void;
  api: RemovalApi;
}) {
  const { t, i18n } = useTranslation(),
    identity = removalIdentity(scopeKey);
  const [saved] = useState(() => {
    try {
      return { attempt: readRemovalAttempt(scopeKey), error: false };
    } catch {
      return { attempt: null, error: true };
    }
  });
  const [attempt, setAttempt] = useState<RemovalAttempt | null>(saved.attempt);
  const [storageError, setStorageError] = useState(saved.error);
  const [review, setReview] = useState<KnowledgeRemovalReview | null>(null);
  const [result, setResult] = useState<KnowledgeRemovalReceipt | null>(null);
  const [open, setOpen] = useState(Boolean(target));
  const [busy, setBusy] = useState<"review" | "send" | "receipt" | null>(null);
  const [issue, setIssue] = useState<
    | "read"
    | "uncertain"
    | "missing"
    | "conflict"
    | "blocked"
    | "forbidden"
    | null
  >(null);
  const [confirmation, setConfirmation] = useState(""),
    [ack, setAck] = useState(false),
    [attempted, setAttempted] = useState(false);
  const mounted = useRef(true),
    epoch = useRef(knowledgeCacheEpoch()),
    sequence = useRef(0),
    locked = useRef(false),
    apiRef = useRef(api);
  apiRef.current = api;
  const active = () =>
    mounted.current && epoch.current === knowledgeCacheEpoch();
  const labels = useRemovalLabels();
  const choice = JSON.stringify(target);
  const lastTarget = useRef(target || saved.attempt?.review.target || null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      sequence.current++;
    };
  }, []);
  useEffect(() => {
    if (target) {
      lastTarget.current = target;
      setOpen(true);
      setResult(null);
      if (!attempt && !storageError) void refresh(target);
    }
  }, [choice]);
  useEffect(() => {
    if (!attempt && !busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [attempt, busy]);
  function resetConsent() {
    setConfirmation("");
    setAck(false);
    setAttempted(false);
  }
  async function refresh(selected = target || lastTarget.current) {
    if (!selected || locked.current || !active() || attempt || storageError)
      return;
    const token = ++sequence.current;
    setBusy("review");
    setReview(null);
    setIssue(null);
    resetConsent();
    try {
      const value = knowledgeRemovalReview.parse(
        await apiRef.current.review(selected)
      );
      if (
        value.merchantId !== identity.merchantId ||
        value.actorId !== identity.actorId ||
        JSON.stringify(value.target) !== JSON.stringify(selected)
      )
        throw Error("Unexpected review");
      if (active() && sequence.current === token) setReview(value);
    } catch {
      if (active() && sequence.current === token) setIssue("read");
    } finally {
      if (active() && sequence.current === token) setBusy(null);
    }
  }
  function accepted(raw: unknown, pending: RemovalAttempt) {
    const value = knowledgeRemovalReceipt.parse(raw);
    if (
      value.merchantId !== identity.merchantId ||
      value.actorId !== identity.actorId ||
      value.requestId !== pending.requestId ||
      value.revision !== pending.review.revision ||
      JSON.stringify(value.target) !== JSON.stringify(pending.review.target) ||
      JSON.stringify(value.counts) !== JSON.stringify(pending.review.counts) ||
      JSON.stringify(value.related) !== JSON.stringify(pending.review.related)
    )
      throw Error("Unexpected receipt");
    if (!active()) return;
    setResult(value);
    setIssue(null);
    setAttempt(null);
    setReview(null);
    resetConsent();
    try {
      forgetRemovalAttempt(scopeKey, pending.requestId, epoch.current);
    } catch {
      setStorageError(true);
    }
    apiRef.current.changed();
  }
  async function checkReceipt() {
    if (!attempt || locked.current || !active()) return;
    locked.current = true;
    setBusy("receipt");
    setIssue(null);
    resetConsent();
    try {
      const value = await apiRef.current.receipt({
        requestId: attempt.requestId,
      });
      if (!active()) return;
      if (value === null) setIssue("missing");
      else accepted(value, attempt);
    } catch {
      if (active()) setIssue("uncertain");
    } finally {
      locked.current = false;
      if (active()) setBusy(null);
    }
  }
  async function send() {
    if (locked.current || busy || storageError || !active()) return;
    const basis = attempt?.review || review;
    setAttempted(true);
    if (
      !basis ||
      basis.blockers.length ||
      confirmation.trim() !== basis.businessName ||
      !ack
    )
      return;
    const pending = attempt || {
      requestId: crypto.randomUUID(),
      review: basis,
    };
    locked.current = true;
    try {
      rememberRemovalAttempt(scopeKey, pending, epoch.current);
    } catch {
      setStorageError(true);
      locked.current = false;
      return;
    }
    setAttempt(pending);
    setBusy("send");
    setIssue(null);
    try {
      accepted(
        await apiRef.current.send(
          knowledgeRemovalWrite.parse({
            requestId: pending.requestId,
            target: basis.target,
            expectedRevision: basis.revision,
            confirmation,
            acknowledged: true,
          })
        ),
        pending
      );
    } catch (error) {
      if (active()) {
        const code = (error as { data?: { code?: string } })?.data?.code;
        if (code === "CONFLICT" || code === "PRECONDITION_FAILED") {
          // The server answered after acquiring the same merchant lock. This exact request was not accepted.
          try {
            forgetRemovalAttempt(scopeKey, pending.requestId, epoch.current);
            setAttempt(null);
          } catch {
            setStorageError(true);
          }
          setReview(null);
          setIssue(code === "CONFLICT" ? "conflict" : "blocked");
        } else
          setIssue(
            code === "FORBIDDEN" || code === "UNAUTHORIZED"
              ? "forbidden"
              : "uncertain"
          );
        resetConsent();
      }
    } finally {
      locked.current = false;
      if (active()) setBusy(null);
    }
  }
  const basis = attempt?.review || review;
  const close = () => {
    if (busy === "send" || busy === "receipt") return;
    sequence.current++;
    setBusy(null);
    setOpen(false);
    setReview(null);
    resetConsent();
    onClose();
  };
  return (
    <>
      {(attempt || storageError) && !open && (
        <div
          role="status"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 space-y-3"
        >
          <p>{t("knowledgeRemovalUx.pendingNotice")}</p>
          <Button variant="outline" onClick={() => setOpen(true)}>
            {t("knowledgeRemovalUx.openRecovery")}
          </Button>
        </div>
      )}
      <Dialog
        open={open}
        onOpenChange={value => {
          if (!value) close();
        }}
      >
        <DialogContent
          className="sm:max-w-2xl max-h-[85dvh] overflow-y-auto"
          showCloseButton={busy !== "send" && busy !== "receipt"}
          closeLabel={t("knowledgeRemovalUx.close")}
          dir={i18n.dir()}
        >
          <DialogHeader className="text-start sm:text-start">
            <DialogTitle className="px-7">
              {t("knowledgeRemovalUx.title")}
            </DialogTitle>
            <DialogDescription>
              {t("knowledgeRemovalUx.intro")}
            </DialogDescription>
          </DialogHeader>
          {storageError && (
            <p
              role="alert"
              className="rounded-xl border border-destructive p-4"
            >
              {t("knowledgeRemovalUx.storageError")}
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => {
                  if (!active()) return;
                  try {
                    const restored = readRemovalAttempt(scopeKey);
                    setAttempt(restored);
                    if (restored) lastTarget.current = restored.review.target;
                    setStorageError(false);
                    resetConsent();
                  } catch {
                    setStorageError(true);
                  }
                }}
              >
                {t("knowledgeRemovalUx.storageRetry")}
              </Button>
            </p>
          )}
          {busy && (
            <p role="status" className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {labels.busy[busy]}
            </p>
          )}
          {issue && (
            <div
              role="alert"
              className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"
            >
              {labels.issue[issue]}
            </div>
          )}
          {result ? (
            <div className="space-y-4" role="status">
              <CheckCircle2 className="h-8 w-8 text-primary" />
              <h3 className="font-semibold">
                {t("knowledgeRemovalUx.completed")}
              </h3>
              <p>{t("knowledgeRemovalUx.receiptSaved")}</p>
              <p className="break-all text-xs" dir="ltr">
                {result.requestId}
              </p>
              <p>
                {new Date(result.completedAt).toLocaleString(i18n.language)}
              </p>
              <RemovalCounts counts={result.counts} />
              <Button onClick={close}>{t("knowledgeRemovalUx.close")}</Button>
            </div>
          ) : (
            <>
              {basis && (
                <div className="space-y-4">
                  <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
                    <p className="font-semibold break-words [overflow-wrap:anywhere]">
                      {basis.businessName}
                    </p>
                    <p>{labels.target[basis.target.kind]}</p>
                    {attempt && (
                      <p className="text-sm">
                        {t("knowledgeRemovalUx.previousReview")}
                      </p>
                    )}
                  </div>
                  <RemovalCounts counts={basis.counts} />
                  <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm flex gap-2">
                    <AlertTriangle className="h-5 w-5 shrink-0" />
                    {t("knowledgeRemovalUx.permanent")}
                  </p>
                  {Object.values(basis.related).some(n => n > 0) && (
                    <details className="rounded-xl border p-4">
                      <summary className="cursor-pointer font-medium">
                        {t("knowledgeRemovalUx.relatedTitle")}
                      </summary>
                      <dl className="mt-3 space-y-2">
                        {Object.entries(basis.related)
                          .filter(([, n]) => n > 0)
                          .map(([key, n]) => (
                            <div
                              className="flex items-start justify-between gap-3 text-sm"
                              key={key}
                            >
                              <dt>{labels.related[key]}</dt>
                              <dd className="shrink-0 font-semibold">
                                {n.toLocaleString(i18n.language)}
                              </dd>
                            </div>
                          ))}
                      </dl>
                    </details>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {t("knowledgeRemovalUx.cacheEffect")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("knowledgeRemovalUx.preserved")}
                  </p>
                  {basis.blockers.map(reason => (
                    <p
                      role="alert"
                      className="rounded-xl border p-3"
                      key={reason}
                    >
                      {labels.blocker[reason]}
                    </p>
                  ))}
                  {attempt && (
                    <div className="rounded-xl border border-amber-300 p-4 space-y-3">
                      <p className="text-sm">
                        {t("knowledgeRemovalUx.recoveryHelp")}
                      </p>
                      <p className="break-all text-xs" dir="ltr">
                        {attempt.requestId}
                      </p>
                      <Button
                        variant="outline"
                        disabled={Boolean(busy)}
                        onClick={() => void checkReceipt()}
                      >
                        {t("knowledgeRemovalUx.checkReceipt")}
                      </Button>
                    </div>
                  )}
                  {basis.blockers.length === 0 && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="removal-confirmation">
                          {t("knowledgeRemovalUx.confirmName")}
                        </Label>
                        <Input
                          id="removal-confirmation"
                          autoComplete="off"
                          value={confirmation}
                          disabled={Boolean(busy) || storageError}
                          onChange={e => setConfirmation(e.target.value)}
                          aria-invalid={
                            attempted &&
                            confirmation.trim() !== basis.businessName
                          }
                          aria-describedby="removal-name-help"
                        />
                        <p
                          id="removal-name-help"
                          className="text-sm text-muted-foreground"
                        >
                          {t("knowledgeRemovalUx.nameHelp", {
                            name: basis.businessName,
                          })}
                        </p>
                      </div>
                      <label className="flex items-start gap-3 rounded-xl border p-3 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          className="mt-1 h-5 w-5 shrink-0 accent-primary"
                          checked={ack}
                          disabled={Boolean(busy) || storageError}
                          onChange={e => setAck(e.target.checked)}
                        />
                        <span>{t("knowledgeRemovalUx.acknowledge")}</span>
                      </label>
                      {attempted &&
                        (!ack ||
                          confirmation.trim() !== basis.businessName) && (
                          <p role="alert" className="text-sm text-destructive">
                            {t("knowledgeRemovalUx.confirmError")}
                          </p>
                        )}
                      <Button
                        type="button"
                        variant="destructive"
                        className="w-full sm:w-auto"
                        disabled={Boolean(busy) || storageError}
                        onClick={() => void send()}
                      >
                        {attempt
                          ? t("knowledgeRemovalUx.resume")
                          : t("knowledgeRemovalUx.approve")}
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {!attempt && !storageError && !busy && (
                <Button variant="outline" onClick={() => void refresh()}>
                  {t("knowledgeRemovalUx.refresh")}
                </Button>
              )}
              <Button
                variant="ghost"
                disabled={busy === "send" || busy === "receipt"}
                onClick={close}
              >
                {t("knowledgeRemovalUx.close")}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
function RemovalCounts({
  counts,
}: {
  counts: KnowledgeRemovalReview["counts"];
}) {
  const { i18n } = useTranslation();
  const labels = useRemovalLabels();
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {Object.entries(counts).map(([key, n]) => (
        <div key={key} className="rounded-xl border p-3">
          <dt className="text-sm text-muted-foreground">{labels.count[key]}</dt>
          <dd className="mt-1 text-xl font-semibold">
            {n.toLocaleString(i18n.language)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function useRemovalLabels(): Record<
  "busy" | "issue" | "target" | "related" | "blocker" | "count",
  Record<string, string>
> {
  const { t } = useTranslation();
  return {
    busy: {
      review: t("knowledgeRemovalUx.busy.review"),
      send: t("knowledgeRemovalUx.busy.send"),
      receipt: t("knowledgeRemovalUx.busy.receipt"),
    },
    issue: {
      read: t("knowledgeRemovalUx.issue.read"),
      uncertain: t("knowledgeRemovalUx.issue.uncertain"),
      missing: t("knowledgeRemovalUx.issue.missing"),
      conflict: t("knowledgeRemovalUx.issue.conflict"),
      blocked: t("knowledgeRemovalUx.issue.blocked"),
      forbidden: t("knowledgeRemovalUx.issue.forbidden"),
    },
    target: {
      all: t("knowledgeRemovalUx.target.all"),
      document: t("knowledgeRemovalUx.target.document"),
      website: t("knowledgeRemovalUx.target.website"),
      products: t("knowledgeRemovalUx.target.products"),
      faqs: t("knowledgeRemovalUx.target.faqs"),
    },
    related: {
      documentReviews: t("knowledgeRemovalUx.related.documentReviews"),
      documentReceipts: t("knowledgeRemovalUx.related.documentReceipts"),
      websitePreviews: t("knowledgeRemovalUx.related.websitePreviews"),
      websiteImportReviews: t(
        "knowledgeRemovalUx.related.websiteImportReviews"
      ),
      sectionHistory: t("knowledgeRemovalUx.related.sectionHistory"),
      productOptions: t("knowledgeRemovalUx.related.productOptions"),
      productVariants: t("knowledgeRemovalUx.related.productVariants"),
      loyaltyLinks: t("knowledgeRemovalUx.related.loyaltyLinks"),
      competitorLinks: t("knowledgeRemovalUx.related.competitorLinks"),
      websiteInsights: t("knowledgeRemovalUx.related.websiteInsights"),
      extractedProducts: t("knowledgeRemovalUx.related.extractedProducts"),
      faqPageLinks: t("knowledgeRemovalUx.related.faqPageLinks"),
    },
    blocker: {
      running_intake: t("knowledgeRemovalUx.blocker.running_intake"),
      external_catalog: t("knowledgeRemovalUx.blocker.external_catalog"),
      missing_source: t("knowledgeRemovalUx.blocker.missing_source"),
      empty: t("knowledgeRemovalUx.blocker.empty"),
      foreign_relationship: t(
        "knowledgeRemovalUx.blocker.foreign_relationship"
      ),
    },
    count: {
      documents: t("knowledgeRemovalUx.count.documents"),
      products: t("knowledgeRemovalUx.count.products"),
      analyses: t("knowledgeRemovalUx.count.analyses"),
      pages: t("knowledgeRemovalUx.count.pages"),
      faqs: t("knowledgeRemovalUx.count.faqs"),
      sections: t("knowledgeRemovalUx.count.sections"),
    },
  };
}
