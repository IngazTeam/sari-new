import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ChevronDown } from 'lucide-react';
import type { listSalesOfferAttempts } from "../../../server/ai/sales-offer-review";
import type { SalesOfferReviewOutcome } from "../../../server/ai/sales-offer-receipt-proof";

type Item = Awaited<ReturnType<typeof listSalesOfferAttempts>>["items"][number];

function OfferReviewCard({
  item,
  conversationId,
  canManage,
  refreshing,
  onSaved,
}: {
  item: Item;
  conversationId: number;
  canManage: boolean;
  refreshing: boolean;
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [note, setNote] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [notice, setNotice] = useState<SalesOfferReviewOutcome>();
  const mutation = trpc.conversations.reviewSalesOffer.useMutation({
    onSuccess: result => {
      setReviewed(false);
      setNote("");
      setNotice(result.outcome);
      onSaved();
    },
  });
  useEffect(() => {
    setReviewed(false);
    mutation.reset();
  }, [item.evidence, item.revision]);
  const states = {
    missing: t("merchantUx.offerReview.missing"),
    invalid: t("merchantUx.offerReview.invalid"),
    pending: t("merchantUx.offerReview.pending"),
    failed: t("merchantUx.offerReview.failed"),
    sent: t("merchantUx.offerReview.sent"),
    delivered: t("merchantUx.offerReview.delivered"),
    read: t("merchantUx.offerReview.read"),
  };
  const outcomes = {
    recorded: t("merchantUx.offerReview.recorded"),
    accepted_unprojected: t("merchantUx.offerReview.acceptedUnprojected"),
    failed: t("merchantUx.offerReview.reviewFailed"),
    unresolved: t("merchantUx.offerReview.unresolved"),
  };
  const date = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  const status =
    item.attemptState === "cancelled"
      ? t("merchantUx.offerReview.cancelled")
      : item.attemptState === "reserved"
        ? t("merchantUx.offerReview.reserved")
        : states[item.state];
  return (
    <article
      data-offer-id={item.id}
      className="min-w-0 space-y-3 rounded-md border bg-background p-3 text-sm [overflow-wrap:anywhere]"
    >
      <div className="space-y-1">
        <h4 className="font-semibold">
          {t("merchantUx.offerReview.attempt", { id: item.sourceMessageId })}
        </h4>
        <time className="text-muted-foreground" dateTime={item.createdAt}>
          {date(item.createdAt)}
        </time>
      </div>
      <p className="font-medium" data-offer-state={item.state}>
        {status}
      </p>
      {item.accepted && (
        <div
          data-offer-projection={
            item.projectionConflict
              ? "conflict"
              : item.projected
                ? "recorded"
                : "pending"
          }
          className="space-y-1"
        >
          {item.state === "failed" && (
            <p>{t("merchantUx.offerReview.priorAcceptance")}</p>
          )}
          <p>
            {item.projectionConflict
              ? t("merchantUx.offerReview.projectionConflict")
              : item.projected
                ? t("merchantUx.offerReview.projected")
                : t("merchantUx.offerReview.projectionPending")}
          </p>
        </div>
      )}
      <details data-offer-details>
        <summary className="flex min-h-11 cursor-pointer items-center font-medium">
          {t("merchantUx.offerReview.evidence")}
        </summary>
        <div
          tabIndex={0}
          className="max-h-64 space-y-3 overflow-y-auto rounded-md bg-muted/30 p-3"
        >
          <p className="font-medium">
            {t("merchantUx.offerReview.source", { id: item.sourceMessageId })}
          </p>
          <p className="whitespace-pre-wrap">
            {item.sourceText ?? t("merchantUx.offerReview.sourceUnavailable")}
          </p>
          <p className="font-medium">{t("merchantUx.offerReview.text")}</p>
          <p className="whitespace-pre-wrap">
            {item.text ?? t("merchantUx.offerReview.textUnavailable")}
          </p>
          {item.receipt && (
            <p>
              {t("merchantUx.offerReview.receipt")}{" "}
              <bdi className="font-mono text-xs">{item.receipt}</bdi>
            </p>
          )}
        </div>
      </details>
      {item.lastReview && (
        <div data-offer-last-review className="space-y-1 border-s-2 ps-3">
          <p>
            {t("merchantUx.offerReview.lastReview", {
              id: item.lastReview.actorUserId,
            })}{" "}
            ·{" "}
            <time dateTime={item.lastReview.at}>
              {date(item.lastReview.at)}
            </time>
          </p>
          <p>{outcomes[item.lastReview.outcome]}</p>
          <p className="whitespace-pre-wrap">{item.lastReview.note}</p>
        </div>
      )}
      {canManage ? (
        <div className="space-y-3">
          <label htmlFor={`offer-note-${item.id}`} className="block space-y-2">
            <span>{t("merchantUx.offerReview.note")}</span>
            <textarea
              id={`offer-note-${item.id}`}
              rows={3}
              maxLength={1000}
              value={note}
              disabled={mutation.isPending}
              onChange={event => {
                setNote(event.target.value);
                setReviewed(false);
                setNotice(undefined);
                mutation.reset();
              }}
              className="min-h-24 w-full rounded-md border bg-background p-3"
            />
          </label>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 leading-relaxed">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0"
              checked={reviewed}
              disabled={refreshing || mutation.isPending}
              onChange={event => setReviewed(event.target.checked)}
            />
            <span>{t("merchantUx.offerReview.attestation")}</span>
          </label>
          <Button
            data-offer-save
            className="h-auto min-h-11 w-full whitespace-normal"
            disabled={
              !reviewed ||
              note.trim().length < 3 ||
              refreshing ||
              mutation.isPending ||
              mutation.isError
            }
            onClick={() =>
              mutation.mutate({
                conversationId,
                attemptId: item.id,
                expectedRevision: item.revision,
                evidence: item.evidence,
                reviewed: true,
                note: note.trim(),
              })
            }
          >
            {mutation.isPending
              ? t("merchantUx.offerReview.saving")
              : t("merchantUx.offerReview.save")}
          </Button>
          {mutation.isError && (
            <div role="alert">
              <p>{t("merchantUx.offerReview.saveFailed")}</p>
              <Button
                className="mt-2 min-h-11"
                variant="outline"
                onClick={() => {
                  setReviewed(false);
                  mutation.reset();
                  onSaved();
                }}
              >
                {t("merchantUx.offerReview.refresh")}
              </Button>
            </div>
          )}
          {notice && (
            <p role="status" data-offer-saved>
              {outcomes[notice]}
            </p>
          )}
        </div>
      ) : (
        <p>{t("merchantUx.offerReview.readOnly")}</p>
      )}
    </article>
  );
}

export function SalesOfferReview({
  conversationId,
}: {
  conversationId: number;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false),
    [beforeSourceId, setBeforeSourceId] = useState<number>();
  useEffect(() => setBeforeSourceId(undefined), [conversationId]);
  const query = trpc.conversations.listSalesOfferAttempts.useQuery(
    { conversationId, beforeSourceId },
    { enabled: open, refetchInterval: open ? 15000 : false }
  );
  return (
    <details
      data-offer-panel
      className="min-w-0 rounded-lg border bg-muted/20 px-4"
      onToggle={event => setOpen(event.currentTarget.open)}
    >
      <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 py-2 font-semibold">
        <span>{t("merchantUx.offerReview.title")}</span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none ${open?'rotate-180':''}`}/>
      </summary>
      {open && (
        <section
          aria-label={t("merchantUx.offerReview.title")}
          className="min-w-0 space-y-3 pb-4"
        >
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("merchantUx.offerReview.scope")}
          </p>
          {query.isLoading ? (
            <p role="status">{t("merchantUx.offerReview.loading")}</p>
          ) : query.isError ? (
            <div role="alert">
              <p>{t("merchantUx.offerReview.loadFailed")}</p>
              <Button className="mt-2 min-h-11" onClick={() => query.refetch()}>
                {t("merchantUx.offerReview.refresh")}
              </Button>
            </div>
          ) : (
            query.data && (
              <>
                {query.data.items.length === 0 ? (
                  <p>{t("merchantUx.offerReview.empty")}</p>
                ) : (
                  <div className="max-h-[36rem] space-y-3 overflow-y-auto">
                    {query.data.items.map(item => (
                      <OfferReviewCard
                        key={`${conversationId}:${item.id}`}
                        item={item}
                        conversationId={conversationId}
                        canManage={query.data.canManage}
                        refreshing={query.isFetching}
                        onSaved={() => {
                          void query.refetch();
                        }}
                      />
                    ))}
                  </div>
                )}
                <nav
                  aria-label={t("merchantUx.offerReview.pages")}
                  className="flex flex-wrap gap-2"
                >
                  <Button
                    data-offer-refresh
                    variant="outline"
                    className="h-auto min-h-11 whitespace-normal"
                    disabled={query.isFetching}
                    onClick={() => {
                      setBeforeSourceId(undefined);
                      void query.refetch();
                    }}
                  >
                    {beforeSourceId
                      ? t("merchantUx.offerReview.latest")
                      : t("merchantUx.offerReview.refresh")}
                  </Button>
                  {query.data.nextCursor && (
                    <Button
                      data-offer-older
                      variant="outline"
                      className="h-auto min-h-11 whitespace-normal"
                      disabled={query.isFetching}
                      onClick={() => setBeforeSourceId(query.data!.nextCursor!)}
                    >
                      {t("merchantUx.offerReview.older")}
                    </Button>
                  )}
                </nav>
              </>
            )
          )}
        </section>
      )}
    </details>
  );
}
