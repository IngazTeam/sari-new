import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { OrderStatusDraft } from "@/lib/order-status-cache";
import {
  manualOrderStatuses,
  type OrderStatusReview,
} from "@shared/order-status-review";
import { orderStatusLabels, orderMoney } from "./OrderReport";
export function OrderStatusForm({
  draft,
  change,
  review,
  consent,
  setConsent,
  prepare,
  save,
  busy,
  disabled,
  errors,
  currentStatus,
  orderNumber,
}: {
  draft: OrderStatusDraft;
  change: (v: OrderStatusDraft) => void;
  review: OrderStatusReview | null;
  consent: boolean;
  setConsent: (v: boolean) => void;
  prepare: () => void;
  save: () => void;
  busy: boolean;
  disabled: boolean;
  errors: string[];
  currentStatus?: string;
  orderNumber?: string | null;
}) {
  const { t, i18n } = useTranslation(),
    form = useRef<HTMLFormElement>(null);
  const ranks: Record<string, number> = {
    pending: 0,
    paid: 1,
    processing: 2,
    shipped: 3,
    delivered: 4,
  };
  const options = manualOrderStatuses.filter(
    status =>
      status === "cancelled" ||
      currentStatus === undefined ||
      ranks[status] > ranks[currentStatus]
  );
  useEffect(() => {
    form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);
  const error = (field: string) =>
    errors.includes(field) ? (
      <span className="ow-error" role="alert">
        {t("orderWorkspace.invalid")}
      </span>
    ) : null;
  return (
    <form
      ref={form}
      className="qt-panel ow-form"
      noValidate
      onSubmit={event => {
        event.preventDefault();
        prepare();
      }}
    >
      <h2>
        {t("orderWorkspace.statusChange")} ·{" "}
        <bdi>{orderNumber || `ORD-${draft.id}`}</bdi>
      </h2>
      <p className="ow-help">{t("orderWorkspace.statusHint")}</p>
      <label htmlFor="ow-status">
        {t("orderWorkspace.status")}
        <select
          id="ow-status"
          value={draft.status}
          disabled={disabled || busy}
          onChange={e =>
            change({
              ...draft,
              status: e.target.value as OrderStatusDraft["status"],
              reason: "",
              trackingNumber: "",
            })
          }
        >
          {options.map(status => (
            <option key={status} value={status}>
              {orderStatusLabels(t)[status]}
            </option>
          ))}
        </select>
        {error("status")}
      </label>
      {["shipped", "delivered"].includes(draft.status) && (
        <label htmlFor="ow-tracking">
          {t("orderWorkspace.tracking")}
          <input
            id="ow-tracking"
            dir="auto"
            value={draft.trackingNumber}
            maxLength={100}
            disabled={disabled || busy}
            aria-invalid={errors.includes("trackingNumber")}
            onChange={e => change({ ...draft, trackingNumber: e.target.value })}
          />
          {error("trackingNumber")}
        </label>
      )}
      {draft.status === "cancelled" && (
        <label htmlFor="ow-reason">
          {t("orderWorkspace.reason")}
          <textarea
            id="ow-reason"
            value={draft.reason}
            maxLength={500}
            disabled={disabled || busy}
            aria-invalid={errors.includes("reason")}
            onChange={e => change({ ...draft, reason: e.target.value })}
          />
          {error("reason")}
        </label>
      )}
      <label className="ow-check">
        <input
          type="checkbox"
          checked={draft.notify}
          disabled={disabled || busy}
          onChange={e => change({ ...draft, notify: e.target.checked })}
        />
        <span>
          {t("orderWorkspace.notify")}
          <small className="block ow-help">
            {t("orderWorkspace.notifyHint")}
          </small>
        </span>
      </label>
      <button type="submit" disabled={disabled || busy}>
        {t(busy ? "orderWorkspace.preparing" : "orderWorkspace.prepare")}
      </button>
      {review && (
        <section
          className="ow-review"
          aria-label={t("orderWorkspace.reviewTitle")}
        >
          <h3>{t("orderWorkspace.reviewTitle")}</h3>
          <strong>
            <bdi>{review.order.number || `ORD-${review.order.id}`}</bdi> ·{" "}
            {review.order.customerName}
          </strong>
          <p>
            {orderMoney(
              review.order.totalMinor,
              review.order.currency,
              i18n.language
            )}
          </p>
          <p>
            {t("orderWorkspace.fromTo", {
              from:
                orderStatusLabels(t)[
                  review.order.status as keyof ReturnType<
                    typeof orderStatusLabels
                  >
                ] || orderStatusLabels(t).unknown,
              to: orderStatusLabels(t)[draft.status],
            })}
          </p>
          {draft.trackingNumber && (
            <p>
              {t("ordersPage.trackingNumber")}:{" "}
              <bdi>{draft.trackingNumber}</bdi>
            </p>
          )}
          {draft.reason && <p>{draft.reason}</p>}
          {review.notification ? (
            <div>
              <strong>
                {t("orderWorkspace.notificationTo", {
                  phone: review.notification.customerPhone,
                })}
              </strong>
              <p>{review.notification.message}</p>
            </div>
          ) : (
            <p>{t("orderWorkspace.withoutNotification")}</p>
          )}
          <label className="ow-check">
            <input
              type="checkbox"
              checked={consent}
              disabled={disabled || busy}
              onChange={e => setConsent(e.target.checked)}
            />
            <span>{t("orderWorkspace.consent")}</span>
          </label>
          <button
            className="qt-primary"
            type="button"
            disabled={disabled || busy || !consent}
            onClick={save}
          >
            {t(busy ? "orderWorkspace.saving" : "orderWorkspace.save")}
          </button>
        </section>
      )}
    </form>
  );
}
