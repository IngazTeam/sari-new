import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { formatMinorMoney } from "@shared/product-money";
import type {
  OrderListRow,
  OrderWorkspace,
  OrderDetail,
} from "@shared/order-workspace";
export const orderStatusLabels = (t: TFunction) => ({
  pending: t("ordersPage.statusPending"),
  paid: t("ordersPage.statusPaid"),
  processing: t("ordersPage.statusProcessing"),
  shipped: t("ordersPage.statusShipped"),
  delivered: t("ordersPage.statusDelivered"),
  cancelled: t("ordersPage.statusCancelled"),
  unknown: t("orderWorkspace.unknown"),
});
export const orderPaymentLabels = (t: TFunction) => ({
  unpaid: t("orderWorkspace.unpaid"),
  paid: t("orderWorkspace.recordedPaid"),
  refunded: t("orderWorkspace.refunded"),
  unknown: t("orderWorkspace.unknown"),
});
export function orderMoney(
  n: number | null,
  currency: string,
  language: string
) {
  if (n === null || !["SAR", "USD"].includes(currency)) return "—";
  return formatMinorMoney(n, currency as "SAR" | "USD", language);
}
export function orderTime(value: string | null, language: string) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(language, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
    : "—";
}
export function OrderSummary({ data }: { data: OrderWorkspace }) {
  const { t, i18n } = useTranslation();
  return (
    <section
      className="qt-panel ow-summary"
      aria-label={t("orderWorkspace.summary")}
    >
      <div className="qt-section-heading">
        <h2>{t("orderWorkspace.summary")}</h2>
        <span>
          {t("orderWorkspace.sample", {
            count: data.filtered,
            total: data.total,
          })}
        </span>
      </div>
      <div className="qt-summary">
        <article>
          <span>{t("orderWorkspace.matching")}</span>
          <strong>{data.filtered}</strong>
        </article>
        {data.values.map(v => (
          <article key={v.currency}>
            <span>
              {t("orderWorkspace.storedValue", { currency: v.currency })}
            </span>
            <strong>
              {orderMoney(v.totalMinor, v.currency, i18n.language)}
            </strong>
            <small>{t("orderWorkspace.valueCount", { count: v.count })}</small>
            <p>
              {t("orderWorkspace.markedValue", {
                amount: orderMoney(
                  v.markedPaidMinor,
                  v.currency,
                  i18n.language
                ),
              })}
            </p>
            {v.excludedAmounts > 0 && (
              <small>
                {t("orderWorkspace.excluded", { count: v.excludedAmounts })}
              </small>
            )}
          </article>
        ))}
      </div>
      <p className="ow-help">{t("orderWorkspace.valueBasis")}</p>
      <details>
        <summary>{t("orderWorkspace.distribution")}</summary>
        <div className="ow-state-counts">
          <dl>
            {data.statuses.map(v => (
              <div key={v.status}>
                <dt>{orderStatusLabels(t)[v.status]}</dt>
                <dd>{v.count}</dd>
              </div>
            ))}
          </dl>
          <dl>
            {data.payments.map(v => (
              <div key={v.status}>
                <dt>{orderPaymentLabels(t)[v.status]}</dt>
                <dd>{v.count}</dd>
              </div>
            ))}
          </dl>
        </div>
      </details>
    </section>
  );
}
export function OrderList({
  rows,
  open,
}: {
  rows: OrderListRow[];
  open: (id: number) => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <ul className="qt-list ow-list">
      {rows.map(row => (
        <li key={row.id}>
          <button
            type="button"
            className="ow-open"
            onClick={() => open(row.id)}
            aria-label={t("orderWorkspace.openOrder", {
              number: row.number || `ORD-${row.id}`,
            })}
          >
            <span>
              <strong>
                <bdi>{row.number || `ORD-${row.id}`}</bdi>
              </strong>
              <small>{row.customerName}</small>
              <small>
                <bdi>{row.customerPhone}</bdi>
              </small>
            </span>
            <span>
              <strong>
                {orderMoney(row.totalMinor, row.currency, i18n.language)}
              </strong>
              <small>{orderTime(row.createdAt, i18n.language)}</small>
            </span>
            <span className="ow-badges">
              <span className="qt-status">
                {orderStatusLabels(t)[row.status]}
              </span>
              <span>{orderPaymentLabels(t)[row.paymentStatus]}</span>
              {row.checkoutReviewRequired && (
                <small>{t("orderWorkspace.invoiceNeedsReview")}</small>
              )}
              {row.externalReference && (
                <small>{t("orderWorkspace.externalOrder")}</small>
              )}
            </span>
            <span className="ow-open-label">{t("ordersPage.view")} ←</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
export function OrderDetailReport({ row }: { row: OrderDetail }) {
  const { t, i18n } = useTranslation(),
    show = (value: string | null) => value || "—";
  return (
    <div className="ow-detail">
      <section className="qt-panel">
        <div className="qt-section-heading">
          <h2>
            <bdi>{row.number || `ORD-${row.id}`}</bdi>
          </h2>
          <strong>
            {orderMoney(row.totalMinor, row.currency, i18n.language)}
          </strong>
        </div>
        <p className="ow-badges">
          <span className="qt-status">{orderStatusLabels(t)[row.status]}</span>
          <span>{orderPaymentLabels(t)[row.paymentStatus]}</span>
        </p>
        <p className="ow-help">{t("orderWorkspace.paymentBasis")}</p>
        <dl className="ow-fields">
          <div>
            <dt>{t("ordersPage.name")}</dt>
            <dd>{row.customerName}</dd>
          </div>
          <div>
            <dt>{t("ordersPage.phone")}</dt>
            <dd>
              <bdi>{row.customerPhone}</bdi>
            </dd>
          </div>
          <div>
            <dt>{t("ordersPage.email")}</dt>
            <dd>
              <bdi>{show(row.customerEmail)}</bdi>
            </dd>
          </div>
          <div>
            <dt>{t("orderWorkspace.city")}</dt>
            <dd>{show(row.city)}</dd>
          </div>
          <div>
            <dt>{t("ordersPage.address")}</dt>
            <dd>{show(row.address)}</dd>
          </div>
          <div>
            <dt>{t("ordersPage.trackingNumber")}</dt>
            <dd>
              <bdi>{show(row.trackingNumber)}</bdi>
            </dd>
          </div>
          <div>
            <dt>{t("ordersPage.orderDate")}</dt>
            <dd>{orderTime(row.createdAt, i18n.language)}</dd>
          </div>
          <div>
            <dt>{t("orderWorkspace.updated")}</dt>
            <dd>{orderTime(row.updatedAt, i18n.language)}</dd>
          </div>
        </dl>
        {row.externalReference && (
          <p>
            {t("orderWorkspace.externalReference")}{" "}
            <bdi>{row.externalReference}</bdi>
          </p>
        )}
        {!!row.truncatedFields.length && (
          <p role="alert">{t("orderWorkspace.clippedFields")}</p>
        )}
      </section>
      <section className="qt-panel">
        <h2>{t("ordersPage.products")}</h2>
        {row.items.length > 0 ? (
          <ol className="ow-items">
            {row.items.map((item, index) => (
              <li key={index}>
                <div>
                  <strong>{item.name || t("orderWorkspace.unknown")}</strong>
                  <p>
                    {t("ordersPage.quantity")}: {item.quantity ?? "—"}
                  </p>
                </div>
                <strong>
                  {orderMoney(item.totalMinor, row.currency, i18n.language)}
                </strong>
              </li>
            ))}
          </ol>
        ) : (
          <p>{t("orderWorkspace.noParsedItems")}</p>
        )}
        {row.itemsState !== "parsed" && (
          <p className="ow-help">
            {t(
              row.itemsState === "truncated"
                ? "orderWorkspace.clippedItems"
                : "orderWorkspace.legacyItems"
            )}
          </p>
        )}
        <details>
          <summary>{t("orderWorkspace.savedItems")}</summary>
          <pre dir="auto">{row.rawItems}</pre>
        </details>
      </section>
      <section className="qt-panel">
        <h2>{t("ordersPage.notes")}</h2>
        <p className="ow-preserve">{show(row.notes)}</p>
        {row.isGift && (
          <div className="ow-gift">
            <h3>{t("orderWorkspace.gift")}</h3>
            <p>{show(row.giftRecipientName)}</p>
            <p className="ow-preserve">{show(row.giftMessage)}</p>
          </div>
        )}
        <p className="ow-help">
          {t(
            row.reviewRequested
              ? "orderWorkspace.reviewRequested"
              : "orderWorkspace.reviewNotRequested"
          )}
          {row.reviewRequestedAt &&
            ` · ${orderTime(row.reviewRequestedAt, i18n.language)}`}
        </p>
        {row.discountCode && (
          <p>
            {t("orderWorkspace.discountCode")} <bdi>{row.discountCode}</bdi>
          </p>
        )}
        {(row.subtotalMinor !== null || row.discountMinor !== null) && (
          <dl className="ow-fields">
            <div>
              <dt>{t("orderWorkspace.subtotal")}</dt>
              <dd>
                {orderMoney(row.subtotalMinor, row.currency, i18n.language)}
              </dd>
            </div>
            <div>
              <dt>{t("orderWorkspace.discount")}</dt>
              <dd>
                {orderMoney(row.discountMinor, row.currency, i18n.language)}
              </dd>
            </div>
          </dl>
        )}
        {row.discountReleased && <p>{t("orderWorkspace.discountReleased")}</p>}
        {row.paymentUrl && (
          <details>
            <summary>{t("orderWorkspace.savedPaymentUrl")}</summary>
            <p className="ow-help">{t("orderWorkspace.paymentUrlHint")}</p>
            <code className="ow-preserve" dir="ltr">
              {row.paymentUrl}
            </code>
          </details>
        )}
      </section>
    </div>
  );
}
