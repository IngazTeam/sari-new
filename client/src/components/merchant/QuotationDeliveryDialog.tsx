import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "../../../../server/routers";
import type { inferRouterOutputs } from "@trpc/server";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import {
  readQuotationSendAttempt,
  rememberQuotationSendAttempt,
  type QuotationSendAttempt,
} from "@/lib/quotation-send-attempt";
import "@/styles/quotation-send.css";
type Outputs = inferRouterOutputs<AppRouter>["sariBrain"]["quotations"];
type Review = Outputs["prepareReview"];
type Receipt = NonNullable<Outputs["delivery"]>;
export function QuotationDeliveryDialog({
  quotationId,
  scope,
  onClose,
  onSaved,
}: {
  quotationId: number;
  scope: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation(),
    utils = trpc.useUtils(),
    language = i18n.language.startsWith("en") ? "en-GB" : "ar-SA";
  const [initial] = useState(() => {
    try {
      return {
        attempt: readQuotationSendAttempt(scope, quotationId),
        error: false,
      };
    } catch {
      return { attempt: {} as QuotationSendAttempt, error: true };
    }
  });
  const attempt = useRef(initial.attempt),
    epoch = useRef(knowledgeCacheEpoch()),
    mounted = useRef(true),
    lock = useRef(false),
    hydrated = useRef(false);
  const [account, setAccount] = useState(0),
    [template, setTemplate] = useState(0),
    [review, setReview] = useState<Review | null>(null),
    [delivery, setDelivery] = useState<Receipt | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [problem, setProblem] = useState(""),
    [storageError, setStorageError] = useState(initial.error),
    [clock, setClock] = useState(Date.now());
  const query = trpc.sariBrain.quotations.sendWorkspace.useQuery(
    { quotationId },
    { staleTime: 0, refetchOnMount: "always" }
  );
  const prepare = trpc.sariBrain.quotations.prepareReview.useMutation(),
    send = trpc.sariBrain.quotations.sendReviewed.useMutation();
  const owner = Number(scope.split(":")[1]),
    actor = Number(scope.split(":")[0]);
  const source =
    !query.error &&
    query.data?.merchantId === owner &&
    query.data.actorId === actor &&
    query.data.quotationId === quotationId
      ? query.data
      : undefined;
  useEffect(() => {
    mounted.current = true;
    const timer = window.setInterval(() => setClock(Date.now()), 15000);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (source && !query.isFetching && !hydrated.current) {
      hydrated.current = true;
      setAccount(
        source.accounts.find(a => a.primary)?.id ??
          (source.accounts.length === 1 ? source.accounts[0].id : 0)
      );
      setReview(source.review);
      setDelivery(source.delivery);
    }
  }, [source, query.isFetching]);
  const expired =
    !!review && (review.expired || clock >= Date.parse(review.expiresAt));
  const outcomes = {
    not_attempted: t("quotationSend.notAttempted"),
    unknown: t("quotationSend.unknown"),
    suppressed: t("quotationSend.suppressed"),
    rejected: t("quotationSend.rejected"),
    accepted: t("quotationSend.accepted"),
    delivered: t("quotationSend.delivered"),
    read: t("quotationSend.read"),
    failed: t("quotationSend.failed"),
  };
  const reasons = {
    managed: t("quotationSend.managed"),
    closed: t("quotationSend.closed"),
    expired: t("quotationSend.offerExpired"),
    phone: t("quotationSend.phoneInvalid"),
    legacy: t("quotationSend.legacy"),
    attempted: t("quotationSend.attempted"),
  };
  const providerName = (provider: string) =>
    provider === "meta_cloud"
      ? t("quotationSend.metaAccount")
      : provider === "mock"
        ? t("quotationSend.testAccount")
        : t("quotationSend.whatsappAccount");
  const saveAttempt = (value: QuotationSendAttempt) => {
    try {
      rememberQuotationSendAttempt(scope, quotationId, value, epoch.current);
      attempt.current = value;
    } catch (error) {
      setStorageError(true);
      throw error;
    }
  };
  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setProblem("");
    try {
      await action();
    } catch {
      if (mounted.current) setProblem(t("quotationSend.operationFailed"));
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const refresh = () =>
    run(async () => {
      const data = await query.refetch();
      if (
        data.error ||
        !data.data ||
        data.data.merchantId !== owner ||
        data.data.actorId !== actor
      )
        throw Error("Scope unavailable");
      let r = data.data.review,
        d = data.data.delivery;
      if (attempt.current.review) {
        const restored = await utils.sariBrain.quotations.review.fetch({
          requestId: attempt.current.review.requestId,
        });
        if (restored) r = restored;
      }
      if (attempt.current.delivery) {
        const restored = await utils.sariBrain.quotations.delivery.fetch({
          requestId: attempt.current.delivery.requestId,
        });
        if (restored) d = restored;
      }
      if (!mounted.current) return;
      setReview(r);
      setDelivery(d);
      setConfirmed(false);
      setClock(Date.now());
      onSaved();
    });
  const prepareReview = () =>
    run(async () => {
      if (
        !source ||
        query.isFetching ||
        source.reason ||
        !account ||
        storageError
      )
        return;
      const selection = {
        quotationId,
        expectedRevision: source.revision,
        instanceRecordId: account,
        templateId: template || null,
      };
      const previous = attempt.current.review;
      const input =
        previous &&
        Object.entries(selection).every(
          ([key, value]) => (previous as any)[key] === value
        )
          ? previous
          : { ...selection, requestId: crypto.randomUUID() };
      saveAttempt({ ...attempt.current, review: input });
      setConfirmed(false);
      const result = await prepare.mutateAsync(input);
      if (!mounted.current) return;
      if (
        result.merchantId !== owner ||
        result.actorId !== actor ||
        result.quotationId !== quotationId
      )
        throw Error("Scope changed");
      setReview(result);
      setClock(Date.now());
    });
  const submit = () =>
    run(async () => {
      if (
        !source ||
        query.isFetching ||
        !review ||
        expired ||
        !confirmed ||
        storageError ||
        source.reason
      )
        return;
      if (delivery && delivery.transport !== "not_attempted") return;
      const prior = attempt.current.delivery;
      const chosen =
        prior?.reviewId === review.id &&
        prior.snapshotHash === review.snapshotHash
          ? prior
          : delivery?.reviewId === review.id &&
              delivery.snapshotHash === review.snapshotHash
            ? {
                requestId: delivery.requestId,
                reviewId: review.id,
                snapshotHash: review.snapshotHash,
              }
            : {
                requestId: crypto.randomUUID(),
                reviewId: review.id,
                snapshotHash: review.snapshotHash,
              };
      saveAttempt({ ...attempt.current, delivery: chosen });
      setConfirmed(false);
      const result = await send.mutateAsync({ ...chosen, confirmed: true });
      if (!mounted.current) return;
      if (
        !result ||
        result.merchantId !== owner ||
        result.quotationId !== quotationId
      )
        throw Error("Receipt unavailable");
      setDelivery(result);
      onSaved();
    });
  const newReview = () => {
    if (busy || !source || source.reason || delivery?.state === "dispatching")
      return;
    try {
      saveAttempt({ delivery: attempt.current.delivery });
      setReview(null);
      setConfirmed(false);
      setProblem("");
    } catch {
      setProblem(t("quotationSend.storageError"));
    }
  };
  const money = (value: number, currency: string) =>
    `${new Intl.NumberFormat(language, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`;
  const frozen = busy || query.isFetching || storageError;
  const doc = review?.document.data;
  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="qsend-dialog"
        closeLabel={t("quotationSend.close")}
        dir={language === "ar-SA" ? "rtl" : "ltr"}
      >
        <DialogHeader>
          <DialogTitle>{t("quotationSend.title")}</DialogTitle>
          <DialogDescription>{t("quotationSend.subtitle")}</DialogDescription>
        </DialogHeader>
        <div className="qsend-body" aria-busy={busy || query.isFetching}>
          {query.error ? (
            <WorkspaceState
              inline
              kind={workspaceFailureKind(query.error)}
              onRetry={() => void refresh()}
            />
          ) : !source || query.isFetching ? (
            <WorkspaceState inline kind="loading" />
          ) : (
            <>
              {source.reason && (
                <p className="qsend-notice" role="status">
                  {reasons[source.reason as keyof typeof reasons]}
                </p>
              )}
              {delivery && (
                <section className="qsend-receipt" aria-live="polite">
                  <h2>{t("quotationSend.receipt")}</h2>
                  <strong>{outcomes[delivery.transport]}</strong>
                  <p dir="ltr">{delivery.recipient}</p>
                  {delivery.providerMessageId && (
                    <p>
                      {t("quotationSend.reference")}:{" "}
                      <bdi>{delivery.providerMessageId}</bdi>
                    </p>
                  )}
                  {delivery.preparationFailed && (
                    <p>{t("quotationSend.pdfFailed")}</p>
                  )}
                  {delivery.projection === "quote_changed" && (
                    <p>{t("quotationSend.projectionChanged")}</p>
                  )}
                </section>
              )}
              {!review ? (
                <section className="qsend-selection">
                  <label htmlFor="quote-send-account">
                    {t("quotationSend.account")}
                  </label>
                  <select
                    id="quote-send-account"
                    value={account}
                    onChange={e => setAccount(Number(e.target.value))}
                    disabled={frozen || !!source.reason}
                  >
                    <option value="0">
                      {t("quotationSend.chooseAccount")}
                    </option>
                    {source.accounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.label} · {providerName(a.provider)}
                      </option>
                    ))}
                  </select>
                  {!source.accounts.length && (
                    <p>{t("quotationSend.noAccount")}</p>
                  )}
                  <label htmlFor="quote-send-template">
                    {t("quotationSend.template")}
                  </label>
                  <select
                    id="quote-send-template"
                    value={template}
                    onChange={e => setTemplate(Number(e.target.value))}
                    disabled={frozen || !!source.reason}
                  >
                    <option value="0">{t("quotationSend.noTemplate")}</option>
                    {source.templates.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  <p>{t("quotationSend.templateHint")}</p>
                  {(source.accountsTruncated || source.templatesTruncated) && (
                    <p role="status">{t("quotationSend.truncated")}</p>
                  )}
                  <Button
                    onClick={() => void prepareReview()}
                    disabled={frozen || !!source.reason || !account}
                  >
                    {t("quotationSend.prepare")}
                  </Button>
                </section>
              ) : (
                doc && (
                  <section className="qsend-preview">
                    <div className="qsend-preview-heading">
                      <div>
                        <span>{t("quotationSend.document")}</span>
                        <h2>{doc.merchantName}</h2>
                        <p dir="ltr">{doc.merchantPhone}</p>
                      </div>
                      {review.document.logoDataUrl && (
                        <img
                          src={review.document.logoDataUrl}
                          alt={t("quotationSend.logo")}
                        />
                      )}
                    </div>
                    {review.document.logoOmitted && (
                      <p className="qsend-notice">
                        {t("quotationSend.logoOmitted")}
                      </p>
                    )}
                    <dl className="qsend-details">
                      <div>
                        <dt>{t("quotationSend.number")}</dt>
                        <dd>
                          <bdi>{doc.quotationNumber}</bdi>
                        </dd>
                      </div>
                      <div>
                        <dt>{t("quotationSend.customer")}</dt>
                        <dd>
                          {doc.customerName || "—"}
                          <br />
                          <bdi>{doc.customerPhone}</bdi>
                        </dd>
                      </div>
                      <div>
                        <dt>{t("quotationSend.account")}</dt>
                        <dd>
                          <bdi>{review.accountLabel}</bdi> ·{" "}
                          {providerName(review.provider)}
                        </dd>
                      </div>
                      <div>
                        <dt>{t("quotationSend.date")}</dt>
                        <dd>
                          <bdi>{doc.createdAt}</bdi>
                        </dd>
                      </div>
                      <div>
                        <dt>{t("quotationSend.validUntil")}</dt>
                        <dd>
                          <bdi>{doc.validUntil || "—"}</bdi>
                        </dd>
                      </div>
                    </dl>
                    <ol className="qsend-items">
                      {doc.items.map((item, index) => (
                        <li key={index}>
                          <div>
                            <strong>{item.name}</strong>
                            {item.description && <p>{item.description}</p>}
                          </div>
                          <dl>
                            <div>
                              <dt>{t("quotationSend.quantity")}</dt>
                              <dd>{item.quantity}</dd>
                            </div>
                            <div>
                              <dt>{t("quotationSend.unit")}</dt>
                              <dd>
                                <bdi>{money(item.unitPrice, doc.currency)}</bdi>
                              </dd>
                            </div>
                            <div>
                              <dt>{t("quotationSend.lineTotal")}</dt>
                              <dd>
                                <bdi>{money(item.total, doc.currency)}</bdi>
                              </dd>
                            </div>
                          </dl>
                        </li>
                      ))}
                    </ol>
                    <dl className="qsend-totals">
                      <div>
                        <dt>{t("quotationSend.subtotal")}</dt>
                        <dd>
                          <bdi>{money(doc.subtotal, doc.currency)}</bdi>
                        </dd>
                      </div>
                      <div>
                        <dt>
                          {t("quotationSend.tax")}
                          {doc.taxRate != null
                            ? ` (${Number((doc.taxRate * 100).toFixed(2))}%)`
                            : ""}
                        </dt>
                        <dd>
                          <bdi>{money(doc.taxAmount, doc.currency)}</bdi>
                        </dd>
                      </div>
                      <div>
                        <dt>{t("quotationSend.total")}</dt>
                        <dd>
                          <bdi>{money(doc.total, doc.currency)}</bdi>
                        </dd>
                      </div>
                    </dl>
                    <h3>{t("quotationSend.terms")}</h3>
                    <p className="qsend-copy">
                      {doc.termsText || t("quotationSend.noTerms")}
                    </p>
                    {doc.footerText && (
                      <>
                        <h3>{t("quotationSend.footer")}</h3>
                        <p className="qsend-copy">{doc.footerText}</p>
                      </>
                    )}
                    <h3>{t("quotationSend.caption")}</h3>
                    <p className="qsend-copy">{review.caption}</p>
                    <p className="qsend-notice">
                      {expired
                        ? t("quotationSend.reviewExpired")
                        : t("quotationSend.reviewTime", {
                            time: new Date(review.expiresAt).toLocaleTimeString(
                              language,
                              { hour: "2-digit", minute: "2-digit" }
                            ),
                          })}
                    </p>
                    {!source.reason && (
                      <Button
                        variant="outline"
                        onClick={newReview}
                        disabled={frozen || delivery?.state === "dispatching"}
                      >
                        {t("quotationSend.newReview")}
                      </Button>
                    )}
                  </section>
                )
              )}
            </>
          )}
          {storageError && (
            <p role="alert" className="qsend-notice">
              {t("quotationSend.storageError")}
            </p>
          )}
          {problem && (
            <p role="alert" className="qsend-notice">
              {problem}
            </p>
          )}
        </div>
        <footer className="qsend-footer">
          {review && !delivery?.providerMessageId && !source?.reason && (
            <label className="qsend-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={e => setConfirmed(e.target.checked)}
                disabled={frozen || expired}
              />
              <span>{t("quotationSend.confirm")}</span>
            </label>
          )}
          <div>
            <Button
              variant="outline"
              onClick={() => void refresh()}
              disabled={busy || query.isFetching}
            >
              {t("quotationSend.restore")}
            </Button>
            <Button
              onClick={() => void submit()}
              disabled={
                frozen ||
                !source ||
                !!source.reason ||
                !review ||
                expired ||
                !confirmed ||
                (!!delivery && delivery.transport !== "not_attempted")
              }
            >
              {busy
                ? t("quotationSend.working")
                : delivery?.transport === "not_attempted" &&
                    delivery.reviewId === review?.id
                  ? t("quotationSend.continue")
                  : t("quotationSend.send")}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
