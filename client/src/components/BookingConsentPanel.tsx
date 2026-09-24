import { useTranslation } from "react-i18next";
import type {
  BookingConsentReview,
  BookingConsentMessage,
} from "../../../shared/booking-consent-review";
export function BookingConsentPanel({
  data,
  loading,
  failed,
  fetching,
  reviewed,
  disabled,
  onReviewed,
  onRefresh,
  confirming,
}: {
  data: BookingConsentReview | undefined;
  loading: boolean;
  failed: boolean;
  fetching: boolean;
  reviewed: boolean;
  disabled: boolean;
  onReviewed: (value: boolean) => void;
  onRefresh: () => void;
  confirming: boolean;
}) {
  const { t, i18n } = useTranslation();
  const reasons = {
    missing: t("merchantUx.bookingConsent.missing"),
    integrity: t("merchantUx.bookingConsent.integrity"),
    source: t("merchantUx.bookingConsent.sourceInvalid"),
    terms: t("merchantUx.bookingConsent.termsChanged"),
    refused: t("merchantUx.bookingConsent.refused"),
    unavailable: t("merchantUx.bookingConsent.unavailable"),
    truncated: t("merchantUx.bookingConsent.truncated"),
  };
  const showMessage = (label: string, value: BookingConsentMessage | null) =>
    value && (
      <div className="min-w-0 space-y-1 rounded-md border p-3">
        <h5 className="font-medium">{label}</h5>
        <p dir="auto" className="whitespace-pre-wrap [overflow-wrap:anywhere]">
          {value.text}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("merchantUx.bookingConsent.messageId", { id: value.id })}
        </p>
        <time dateTime={value.at}>
          {new Intl.DateTimeFormat(i18n.language, {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Riyadh",
          }).format(new Date(value.at))}
        </time>
        {value.truncated && <p>{t("merchantUx.bookingConsent.truncated")}</p>}
      </div>
    );
  return (
    <section
      data-booking-consent
      className="min-w-0 space-y-3 rounded-lg border bg-muted/20 p-3"
    >
      <h4 className="font-semibold">{t("merchantUx.bookingConsent.title")}</h4>
      <p>{t("merchantUx.bookingConsent.scope")}</p>
      {loading ? (
        <p role="status">{t("merchantUx.bookingConsent.loading")}</p>
      ) : failed || !data ? (
        <p role="alert">{t("merchantUx.bookingConsent.failed")}</p>
      ) : data.state === "none" ? (
        <p>{t("merchantUx.bookingConsent.none")}</p>
      ) : (
        <>
          {data.agreementId && (
            <p>
              {t("merchantUx.bookingConsent.reference", {
                id: data.agreementId,
              })}
            </p>
          )}
          {data.state === "blocked" && (
            <p role="alert">
              {data.reason
                ? reasons[data.reason]
                : t("merchantUx.bookingConsent.failed")}
            </p>
          )}
          {data.terms && (
            <dl className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="min-w-0">
                <dt>{t("merchantUx.bookingConsent.service")}</dt>
                <dd dir="auto" className="[overflow-wrap:anywhere]">
                  {data.terms.serviceName}
                </dd>
              </div>
              {data.terms.staffName && (
                <div className="min-w-0">
                  <dt>{t("merchantUx.bookingConsent.staff")}</dt>
                  <dd dir="auto" className="[overflow-wrap:anywhere]">
                    {data.terms.staffName}
                  </dd>
                </div>
              )}
              <div>
                <dt>{t("merchantUx.bookingConsent.date")}</dt>
                <dd>
                  <bdi>
                    {data.terms.bookingDate} · {data.terms.startTime}–
                    {data.terms.endTime}
                  </bdi>
                </dd>
              </div>
              <div>
                <dt>{t("merchantUx.bookingConsent.amount")}</dt>
                <dd>
                  {new Intl.NumberFormat(i18n.language, {
                    style: "currency",
                    currency: data.terms.currency,
                  }).format(data.terms.amountMinor / 100)}
                </dd>
              </div>
            </dl>
          )}
          {data.offerText && (
            <details>
              <summary className="flex min-h-11 cursor-pointer items-center">
                {t("merchantUx.bookingConsent.offer")}
              </summary>
              <p
                data-booking-consent-offer
                dir="auto"
                className="whitespace-pre-wrap [overflow-wrap:anywhere]"
              >
                {data.offerText}
              </p>
            </details>
          )}
          {showMessage(t("merchantUx.bookingConsent.request"), data.source)}
          {showMessage(t("merchantUx.bookingConsent.approval"), data.consent)}
          {data.latest?.id !== data.consent?.id &&
            showMessage(t("merchantUx.bookingConsent.latest"), data.latest)}
          {data.refusal?.id !== data.latest?.id &&
            showMessage(
              t("merchantUx.bookingConsent.refusalMessage"),
              data.refusal
            )}
          {confirming && data.state === "ready" && (
            <label className="flex min-h-11 cursor-pointer items-start gap-2 py-2">
              <input
                data-booking-consent-attest
                type="checkbox"
                className="mt-1 size-5 shrink-0"
                checked={reviewed}
                disabled={disabled || fetching}
                onChange={e => onReviewed(e.target.checked)}
              />
              <span>{t("merchantUx.bookingConsent.attest")}</span>
            </label>
          )}
        </>
      )}
      <button
        data-booking-consent-refresh
        type="button"
        className="min-h-11 max-w-full rounded-md border px-3"
        disabled={disabled || fetching}
        onClick={onRefresh}
      >
        {t("merchantUx.bookingConsent.refresh")}
      </button>
    </section>
  );
}
