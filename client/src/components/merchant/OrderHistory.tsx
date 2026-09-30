import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { orderStatusLabels, orderTime } from "./OrderReport";
export function OrderHistory({
  merchantId,
  orderId,
}: {
  merchantId: number;
  orderId: number;
}) {
  const { t, i18n } = useTranslation(),
    [cursors, setCursors] = useState<number[]>([]),
    beforeId = cursors[cursors.length - 1];
  const query = trpc.orders.workspace.statusHistory.useQuery(
    { id: orderId, beforeId },
    { staleTime: 0, refetchOnMount: "always" }
  );
  useEffect(() => setCursors([]), [orderId, merchantId]);
  const data =
    !query.error &&
    !query.isFetching &&
    query.data?.merchantId === merchantId &&
    query.data.orderId === orderId &&
    query.data.beforeId === (beforeId ?? null)
      ? query.data
      : undefined;
  return (
    <section className="qt-panel">
      <div className="qt-section-heading">
        <h2>{t("orderWorkspace.history")}</h2>
        <button
          type="button"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
        >
          {t("orderWorkspace.refresh")}
        </button>
      </div>
      <p className="ow-help">{t("orderWorkspace.historyHint")}</p>
      {query.error || (!query.isFetching && !query.isLoading && !data) ? (
        <p role="alert">{t("orderWorkspace.historyFailed")}</p>
      ) : !data ? (
        <p role="status">{t("merchantUx.knowledgeDraft.loading")}</p>
      ) : data.items.length ? (
        <ol className="ow-history">
          {data.items.map(({ id, receipt }) => (
            <li key={id}>
              <strong>
                {t("orderWorkspace.fromTo", {
                  from: orderStatusLabels(t)[receipt.from],
                  to: orderStatusLabels(t)[receipt.status],
                })}
              </strong>
              <time dateTime={receipt.committedAt}>
                {orderTime(receipt.committedAt, i18n.language)}
              </time>
              {receipt.reason && (
                <p className="ow-preserve">{receipt.reason}</p>
              )}
              {receipt.trackingNumber && (
                <p>
                  {t("ordersPage.trackingNumber")}:{" "}
                  <bdi>{receipt.trackingNumber}</bdi>
                </p>
              )}
              <p className="ow-help">
                {t(
                  receipt.notificationQueued
                    ? "orderWorkspace.queued"
                    : "orderWorkspace.savedWithoutNotification"
                )}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p>{t("orderWorkspace.noHistory")}</p>
      )}
      <div className="qt-pagination">
        <button
          type="button"
          disabled={!cursors.length || query.isFetching}
          onClick={() => setCursors(v => v.slice(0, -1))}
        >
          {t("merchantUx.actions.previousPage")}
        </button>
        <button
          type="button"
          disabled={!data?.next}
          onClick={() => {
            if (data?.next) setCursors(v => [...v, data.next!]);
          }}
        >
          {t("orderWorkspace.more")}
        </button>
      </div>
    </section>
  );
}
