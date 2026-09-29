import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
type Row = inferRouterOutputs<AppRouter>["keywords"]["getById"];
type Status = Row["status"];
export function keywordSamples(value: string | null) {
  if (!value?.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every(item => typeof item === "string"))
      return parsed as string[];
  } catch {
    /* Legacy plain text remains reviewable. */
  }
  return [value];
}
export function KeywordReviewDialog({
  keywordId,
  merchantId,
  onClose,
  onChanged,
}: {
  keywordId: number;
  merchantId: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t, i18n } = useTranslation(),
    utils = trpc.useUtils();
  const update = trpc.keywords.updateStatus.useMutation(),
    remove = trpc.keywords.delete.useMutation();
  const [base, setBase] = useState<Row | null>(null),
    [latest, setLatest] = useState<Row | null>(null);
  const [draft, setDraft] = useState<Status>("new"),
    [busy, setBusy] = useState(true),
    [failure, setFailure] = useState("");
  const [conflict, setConflict] = useState(false),
    [missing, setMissing] = useState(false),
    [deleting, setDeleting] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [closing, setClosing] = useState(false);
  const [choice, setChoice] = useState<"" | "mine" | "latest">("");
  const alive = useRef(true),
    lock = useRef(false),
    writing = useRef(false),
    generation = useRef(0);
  const statusLabels: Record<Status, string> = {
    new: t("insightsWorkspace.new"),
    reviewed: t("insightsWorkspace.reviewed"),
    ignored: t("insightsWorkspace.ignored"),
    response_created: t("insightsWorkspace.responseCreated"),
  };
  const number = (value: number) =>
    new Intl.NumberFormat(
      i18n.language?.startsWith("en") ? "en-GB" : "ar-SA"
    ).format(value);
  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(
          i18n.language?.startsWith("en") ? "en-GB" : "ar-SA",
          { dateStyle: "medium", timeStyle: "short", calendar: "gregory" }
        ).format(new Date(value))
      : t("insightsWorkspace.unavailable");
  const errorCode = (error: unknown) =>
    (error as { data?: { code?: string } })?.data?.code;
  const dirty = !!base && draft !== base.status;
  const divergent =
    !!base &&
    !!latest &&
    draft !== base.status &&
    latest.status !== base.status &&
    draft !== latest.status;
  async function load(review = false) {
    if (lock.current) return;
    const token = ++generation.current;
    lock.current = true;
    setBusy(true);
    setFailure("");
    setLatest(null);
    setChoice("");
    setReviewed(false);
    try {
      const row = await utils.keywords.getById.fetch(
        { keywordId },
        { staleTime: 0 }
      );
      if (!alive.current || token !== generation.current) return;
      if (row.id !== keywordId || row.merchantId !== merchantId)
        throw Error("Scope mismatch");
      if (review) {
        setLatest(row);
        setConflict(true);
      } else {
        setBase(row);
        setDraft(row.status);
        setConflict(false);
      }
      setMissing(false);
    } catch (error) {
      if (!alive.current || token !== generation.current) return;
      setMissing(errorCode(error) === "NOT_FOUND");
      setFailure(
        t(
          errorCode(error) === "NOT_FOUND"
            ? "keywordReview.missing"
            : "keywordReview.readFailed"
        )
      );
    } finally {
      if (alive.current && token === generation.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      generation.current++;
      lock.current = false;
    };
  }, [keywordId, merchantId]);
  function close() {
    if (writing.current) return;
    if (dirty) {
      setClosing(true);
      return;
    }
    onClose();
  }
  function acceptLatest() {
    if (!latest || lock.current || missing || (divergent && !choice)) return;
    setDraft(
      divergent
        ? choice === "mine"
          ? draft
          : latest.status
        : draft === base?.status
          ? latest.status
          : draft
    );
    setBase(latest);
    setLatest(null);
    setConflict(false);
    setFailure("");
    setReviewed(false);
    setChoice("");
  }
  async function save(kind: "status" | "delete") {
    if (
      lock.current ||
      !base?.canManage ||
      conflict ||
      missing ||
      failure ||
      (kind === "delete" && !reviewed) ||
      (kind === "status" && !dirty)
    )
      return;
    const token = ++generation.current;
    lock.current = true;
    writing.current = true;
    setBusy(true);
    setFailure("");
    try {
      if (kind === "status") {
        const result = await update.mutateAsync({
          keywordId,
          expectedRevision: base.revision,
          status: draft,
        });
        if (!alive.current || token !== generation.current) return;
        if (
          !result.row ||
          result.row.id !== keywordId ||
          result.row.merchantId !== merchantId
        )
          throw Error("Scope mismatch");
        setBase({ ...result.row, canManage: base.canManage });
        setDraft(result.row.status);
      } else {
        const result = await remove.mutateAsync({
          keywordId,
          expectedRevision: base.revision,
          reviewed: true,
        });
        if (!alive.current || token !== generation.current) return;
        if (!("deleted" in result) || result.deleted !== true)
          throw Error("Delete not confirmed");
      }
      toast.success(
        t(kind === "status" ? "keywordReview.saved" : "keywordReview.deleted")
      );
      onChanged();
      setReviewed(false);
      if (kind === "delete") onClose();
    } catch (error) {
      if (!alive.current || token !== generation.current) return;
      setReviewed(false);
      const code = errorCode(error);
      if (code === "CONFLICT" || code === "NOT_FOUND") {
        setConflict(true);
        setLatest(null);
        setMissing(code === "NOT_FOUND");
      }
      setFailure(
        t(
          code === "NOT_FOUND"
            ? "keywordReview.missing"
            : code === "CONFLICT"
              ? "keywordReview.changed"
              : "keywordReview.writeFailed"
        )
      );
    } finally {
      if (alive.current && token === generation.current) {
        lock.current = false;
        writing.current = false;
        setBusy(false);
      }
    }
  }
  const record = (row: Row) => (
    <div className="min-w-0 space-y-4">
      <h3 className="font-semibold [overflow-wrap:anywhere]">{row.keyword}</h3>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">
            {t("keywordReview.category")}
          </dt>
          <dd>
            {
              {
                product: t("insightsWorkspace.product"),
                price: t("insightsWorkspace.price"),
                shipping: t("insightsWorkspace.shipping"),
                complaint: t("insightsWorkspace.complaint"),
                question: t("insightsWorkspace.question"),
                other: t("insightsWorkspace.other"),
              }[row.category]
            }
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("keywordReview.status")}</dt>
          <dd>{statusLabels[row.status]}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {t("keywordReview.frequency")}
          </dt>
          <dd>{number(row.frequency)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {t("keywordReview.reviewedAt")}
          </dt>
          <dd>{date(row.reviewedAt)}</dd>
        </div>
      </dl>
      <p className="text-xs leading-6 text-muted-foreground">
        {t("insightsWorkspace.seen", {
          first: date(row.firstSeenAt),
          last: date(row.lastSeenAt),
        })}
      </p>
      <section className="min-w-0 space-y-2">
        <h4 className="text-sm font-semibold">
          {t("insightsWorkspace.suggestedText")}
        </h4>
        <p className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">
          {row.suggestedResponse?.trim() || t("insightsWorkspace.noSuggestion")}
        </p>
        <p className="text-xs leading-6 text-muted-foreground">
          {t("insightsWorkspace.suggestionHelp")}
        </p>
      </section>
      <section className="min-w-0 space-y-2">
        <h4 className="text-sm font-semibold">{t("keywordReview.samples")}</h4>
        {keywordSamples(row.sampleMessages).length ? (
          <ul className="space-y-2">
            {keywordSamples(row.sampleMessages).map((sample, index) => (
              <li
                key={index}
                className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm leading-7 [overflow-wrap:anywhere]"
              >
                {sample}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("keywordReview.noSamples")}
          </p>
        )}
        <p className="text-xs leading-6 text-muted-foreground">
          {t("keywordReview.samplesHelp")}
        </p>
      </section>
    </div>
  );
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) close();
      }}
    >
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] max-w-2xl flex-col overflow-hidden p-0"
        closeLabel={t("common.close")}
        showCloseButton={!writing.current}
      >
        <DialogHeader className="shrink-0 px-5 pt-5 pe-12">
          <DialogTitle>{t("keywordReview.title")}</DialogTitle>
          <DialogDescription>
            {t("keywordReview.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 min-w-0 space-y-5 overflow-y-auto overscroll-contain p-5">
          {closing && (
            <section className="space-y-3 rounded-xl border p-4" role="alert">
              <p>{t("keywordReview.unsaved")}</p>
              <div className="flex flex-wrap gap-2">
                <Button className="min-h-11" onClick={() => setClosing(false)}>
                  {t("keywordReview.keepEditing")}
                </Button>
                <Button
                  className="min-h-11"
                  variant="outline"
                  onClick={onClose}
                >
                  {t("keywordReview.discard")}
                </Button>
              </div>
            </section>
          )}
          {busy && <p role="status">{t("common.loading")}</p>}
          {failure && (
            <p role="alert" className="text-sm leading-7 text-destructive">
              {failure}
            </p>
          )}
          {!base && !busy && !missing && (
            <Button className="min-h-11" onClick={() => void load()}>
              {t("keywordReview.retry")}
            </Button>
          )}
          {base && (
            <>
              {record(base)}
              {!base.canManage && (
                <p className="rounded-lg bg-muted p-3 text-sm">
                  {t("keywordReview.readOnly")}
                </p>
              )}
              {base.canManage && !missing && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="keyword-status">
                      {t("keywordReview.status")}
                    </Label>
                    <select
                      id="keyword-status"
                      className="min-h-11 w-full rounded-lg border bg-background px-3 text-base"
                      value={draft}
                      disabled={busy || !!latest}
                      onChange={event => {
                        setDraft(event.target.value as Status);
                        setReviewed(false);
                      }}
                    >
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs leading-6 text-muted-foreground">
                      {t("keywordReview.statusHelp")}
                    </p>
                  </div>
                  {deleting && (
                    <section className="space-y-3 rounded-xl border border-destructive/30 p-4">
                      <h3 className="font-semibold">
                        {t("keywordReview.deleteTitle")}
                      </h3>
                      <p className="text-sm leading-7">
                        {t("keywordReview.deleteHelp")}
                      </p>
                      <label className="flex min-h-11 items-start gap-3 text-sm leading-7">
                        <input
                          type="checkbox"
                          className="mt-1.5 h-5 w-5 shrink-0"
                          checked={reviewed}
                          disabled={busy || conflict || !!failure}
                          onChange={event => setReviewed(event.target.checked)}
                        />
                        <span>{t("keywordReview.deleteConfirm")}</span>
                      </label>
                    </section>
                  )}
                </>
              )}
              {(conflict || failure) && !missing && !latest && (
                <Button
                  variant="outline"
                  className="h-auto min-h-11 whitespace-normal"
                  disabled={busy}
                  onClick={() => void load(true)}
                >
                  {t("keywordReview.loadLatest")}
                </Button>
              )}
              {latest && (
                <section className="min-w-0 space-y-4 rounded-xl border p-4">
                  <h3 className="font-semibold">{t("keywordReview.latest")}</h3>
                  <p className="text-sm leading-7">
                    {t("keywordReview.latestHelp")}
                  </p>
                  {record(latest)}
                  {divergent && (
                    <fieldset className="space-y-2">
                      <legend>{t("keywordReview.chooseStatus")}</legend>
                      {(["mine", "latest"] as const).map(value => (
                        <label
                          key={value}
                          className="flex min-h-11 items-center gap-3 text-sm"
                        >
                          <input
                            type="radio"
                            name="keyword-choice"
                            value={value}
                            checked={choice === value}
                            onChange={() => setChoice(value)}
                          />
                          <span>
                            {t(
                              value === "mine"
                                ? "keywordReview.mine"
                                : "keywordReview.current"
                            )}
                            :{" "}
                            {
                              statusLabels[
                                value === "mine" ? draft : latest.status
                              ]
                            }
                          </span>
                        </label>
                      ))}
                    </fieldset>
                  )}
                  <Button
                    className="h-auto min-h-11 w-full whitespace-normal"
                    disabled={busy || (divergent && !choice)}
                    onClick={acceptLatest}
                  >
                    {t("keywordReview.acceptLatest")}
                  </Button>
                </section>
              )}
            </>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 border-t bg-background p-4">
          {base?.canManage && !missing && !closing && (
            <>
              {deleting ? (
                <>
                  <Button
                    variant="destructive"
                    className="min-h-11"
                    disabled={busy || conflict || !!failure || !reviewed}
                    onClick={() => void save("delete")}
                  >
                    {t("keywordReview.deleteAction")}
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11"
                    disabled={busy}
                    onClick={() => {
                      setDeleting(false);
                      setReviewed(false);
                    }}
                  >
                    {t("keywordReview.cancelDelete")}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    className="min-h-11"
                    disabled={busy || conflict || !!failure || !dirty}
                    onClick={() => void save("status")}
                  >
                    {t("keywordReview.save")}
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-11"
                    disabled={busy || conflict || !!failure}
                    onClick={() => {
                      setDeleting(true);
                      setReviewed(false);
                    }}
                  >
                    {t("keywordReview.deleteAction")}
                  </Button>
                </>
              )}
            </>
          )}
          <Button
            variant="outline"
            className="min-h-11"
            disabled={writing.current}
            onClick={close}
          >
            {t("common.close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
