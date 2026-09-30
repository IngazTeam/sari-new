import { useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import {
  customerDetailInput,
  customerDetailSchema,
} from "@shared/customer-workspace";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import { CustomerAnnotations } from "./CustomerAnnotations";
import {
  CustomerPagination,
  CustomerSources,
  customerDate,
  customerMoney,
  customerActivity,
} from "./CustomerWorkspaceView";
import "@/styles/customer-workspace.css";

export function CustomerDetailWorkspace({
  scope,
  customerKey,
  href = (p: string) => p,
}: {
  scope: string;
  customerKey: string;
  href?: (path: string) => string;
}) {
  const { t, i18n } = useTranslation(),
    locale = i18n.language?.startsWith("en") ? "en-GB" : "ar-SA",
    merchantId = Number(scope.split(":")[1]);
  const [tab, setTab] = useState<
      "overview" | "orders" | "conversations" | "annotations"
    >("overview"),
    [selection, setSelection] = useState(
      customerDetailInput.parse({ key: customerKey })
    );
  const query = trpc.customers.workspace.detail.useQuery(selection, {
      staleTime: 0,
      refetchOnMount: "always",
      retry: false,
    }),
    parsed = customerDetailSchema.safeParse(query.data);
  const data =
    parsed.success &&
    parsed.data.merchantId === merchantId &&
    JSON.stringify(parsed.data.selection) === JSON.stringify(selection)
      ? parsed.data
      : null;
  const ready =
      !!data &&
      !query.error &&
      !query.isFetching &&
      !query.isLoading &&
      query.fetchStatus !== "paused",
    row = ready ? data!.customer : null;
  const activity = customerActivity(t),
    kind = query.error
      ? workspaceFailureKind(query.error)
      : query.fetchStatus === "paused"
        ? "offline"
        : query.isFetching || query.isLoading
          ? "loading"
          : "error";
  const statuses: Record<string, string> = {
    pending: t("customerWorkspaceUx.pendingOrder"),
    paid: t("customerWorkspaceUx.paidOrder"),
    processing: t("customerWorkspaceUx.processingOrder"),
    shipped: t("customerWorkspaceUx.shippedOrder"),
    delivered: t("customerWorkspaceUx.deliveredOrder"),
    cancelled: t("customerWorkspaceUx.cancelledOrder"),
  };
  const payments: Record<string, string> = {
    unpaid: t("customerWorkspaceUx.unpaid"),
    paid: t("customerWorkspaceUx.paid"),
    refunded: t("customerWorkspaceUx.refunded"),
  };
  const conversations: Record<string, string> = {
    active: t("customerWorkspaceUx.activeConversation"),
    closed: t("customerWorkspaceUx.closedConversation"),
    archived: t("customerWorkspaceUx.archivedConversation"),
  };
  return (
    <section className="cw-workspace" dir={locale === "ar-SA" ? "rtl" : "ltr"}>
      <header className="cw-header">
        <div>
          <Link href={href("/merchant/customers")}>
            {t("customerWorkspaceUx.back")}
          </Link>
          <h1>{t("customerWorkspaceUx.detail")}</h1>
        </div>
        <button
          type="button"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {t("customerWorkspaceUx.refresh")}
        </button>
      </header>
      {!ready ? (
        <WorkspaceState
          inline
          kind={kind}
          onRetry={
            kind === "error" || kind === "offline"
              ? () => void query.refetch()
              : undefined
          }
        />
      ) : !row ? (
        <WorkspaceState
          inline
          kind="missing"
          title={t("customerWorkspaceUx.missing")}
          description={t("customerWorkspaceUx.missingBody")}
          action={
            <Link className="cw-button" href={href("/merchant/customers")}>
              {t("customerWorkspaceUx.back")}
            </Link>
          }
        />
      ) : (
        <>
          <section className="cw-panel">
            <div className="cw-header">
              <div>
                <h2>{row.name || t("customerWorkspaceUx.unnamed")}</h2>
                <bdi>{row.key}</bdi>
              </div>
              <span>{activity[row.activity]}</span>
            </div>
            <CustomerSources row={row} />
          </section>
          <div
            className="cw-tabs"
            role="group"
            aria-label={t("customerWorkspaceUx.detail")}
          >
            {(
              [
                ["overview", t("customerWorkspaceUx.overview")],
                ["orders", t("customerWorkspaceUx.orders")],
                ["conversations", t("customerWorkspaceUx.conversations")],
                ["annotations", t("customerWorkspaceUx.annotations")],
              ] as const
            ).map(([value, label]) => (
              <button
                type="button"
                key={value}
                aria-pressed={tab === value}
                onClick={() => setTab(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "overview" && (
            <>
              <section className="cw-panel">
                <h2>{t("customerWorkspaceUx.overview")}</h2>
                <dl className="cw-facts">
                  <div>
                    <dt>{t("customerWorkspaceUx.identifier")}</dt>
                    <dd>
                      <bdi>{row.key}</bdi>
                    </dd>
                  </div>
                  <div>
                    <dt>{t("customerWorkspaceUx.firstRecorded")}</dt>
                    <dd>
                      {customerDate(row.firstRecordedAt, locale) ||
                        t("customerWorkspaceUx.notRecorded")}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("customerWorkspaceUx.lastActivity")}</dt>
                    <dd>
                      {customerDate(row.lastInteractionAt, locale) ||
                        t("customerWorkspaceUx.notRecorded")}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("customerWorkspaceUx.allOrders")}</dt>
                    <dd>{row.orderCount.toLocaleString(locale)}</dd>
                  </div>
                  <div>
                    <dt>{t("customerWorkspaceUx.conversations")}</dt>
                    <dd>{row.conversationCount.toLocaleString(locale)}</dd>
                  </div>
                </dl>
              </section>
              <section className="cw-panel">
                <h2>{t("customerWorkspaceUx.moneyTitle")}</h2>
                <p>{t("customerWorkspaceUx.moneyBody")}</p>
                {!data!.amounts.length ? (
                  <p>{t("customerWorkspaceUx.noMoney")}</p>
                ) : (
                  <div className="cw-grid">
                    {data!.amounts.map(value => (
                      <section className="cw-panel" key={value.currency}>
                        <h3>
                          <bdi>
                            {customerMoney(
                              value.totalMinor,
                              value.currency,
                              locale
                            )}
                          </bdi>
                        </h3>
                        <p>
                          {t("customerWorkspaceUx.eligibleOrders", {
                            count: value.eligibleOrders,
                            excluded: value.excludedAmounts,
                          })}
                        </p>
                        <dl>
                          <dt>{t("customerWorkspaceUx.markedPaid")}</dt>
                          <dd>
                            <bdi>
                              {customerMoney(
                                value.markedPaidMinor,
                                value.currency,
                                locale
                              )}
                            </bdi>
                          </dd>
                        </dl>
                      </section>
                    ))}
                  </div>
                )}
              </section>
              <section className="cw-panel">
                <h2>{t("customerWorkspaceUx.loyalty")}</h2>
                {data!.loyalty.records === 0 ? (
                  <p>{t("customerWorkspaceUx.noLoyalty")}</p>
                ) : data!.loyalty.points === null ? (
                  <p>
                    {t("customerWorkspaceUx.loyaltyAmbiguous", {
                      count: data!.loyalty.records,
                    })}
                  </p>
                ) : (
                  <strong>{data!.loyalty.points.toLocaleString(locale)}</strong>
                )}
              </section>
              <details className="cw-panel">
                <summary>{t("customerWorkspaceUx.method")}</summary>
                <p>{t("customerWorkspaceUx.methodBody")}</p>
                <p>
                  {t("customerWorkspaceUx.snapshot", {
                    time: customerDate(data!.through, locale),
                  })}
                </p>
              </details>
            </>
          )}
          {tab === "orders" && (
            <section className="cw-panel">
              <div className="cw-header">
                <h2>{t("customerWorkspaceUx.orders")}</h2>
                <Link className="cw-button" href={href("/merchant/orders")}>
                  {t("customerWorkspaceUx.openOrders")}
                </Link>
              </div>
              {!data!.orders.rows.length ? (
                <p>{t("customerWorkspaceUx.noOrders")}</p>
              ) : (
                <div
                  className="cw-scroll"
                  role="region"
                  aria-label={t("customerWorkspaceUx.orders")}
                  tabIndex={0}
                >
                  <table>
                    <thead>
                      <tr>
                        {[
                          t("customerWorkspaceUx.reference"),
                          t("customerWorkspaceUx.amount"),
                          t("customerWorkspaceUx.status"),
                          t("customerWorkspaceUx.paymentStatus"),
                          t("customerWorkspaceUx.created"),
                        ].map(label => (
                          <th key={label} scope="col">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data!.orders.rows.map(order => (
                        <tr key={order.id}>
                          <td>
                            <bdi>{order.reference || "#" + order.id}</bdi>
                          </td>
                          <td>
                            <bdi>
                              {order.totalMinor === null
                                ? t("customerWorkspaceUx.invalidAmount")
                                : customerMoney(
                                    order.totalMinor,
                                    order.currency,
                                    locale
                                  )}
                            </bdi>
                          </td>
                          <td>{statuses[order.status] || order.status}</td>
                          <td>
                            {payments[order.paymentStatus] ||
                              order.paymentStatus}
                          </td>
                          <td>
                            {customerDate(order.createdAt, locale) ||
                              t("customerWorkspaceUx.notRecorded")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <CustomerPagination
                value={data!.orders.pagination}
                onPage={ordersPage =>
                  setSelection({ ...selection, ordersPage })
                }
              />
            </section>
          )}
          {tab === "conversations" && (
            <section className="cw-panel">
              <h2>{t("customerWorkspaceUx.conversations")}</h2>
              {!data!.conversations.rows.length ? (
                <p>{t("customerWorkspaceUx.noConversations")}</p>
              ) : (
                <ul className="cw-notes">
                  {data!.conversations.rows.map(conversation => (
                    <li key={conversation.id}>
                      <div className="cw-header">
                        <h3>
                          #{conversation.id} ·{" "}
                          {conversation.name ||
                            t("customerWorkspaceUx.unnamed")}
                        </h3>
                        <span>
                          {conversations[conversation.status] ||
                            conversation.status}
                        </span>
                      </div>
                      <bdi>{conversation.customerPhone}</bdi>
                      <p>
                        {t("customerWorkspaceUx.lastMessage")}:{" "}
                        {customerDate(conversation.lastMessageAt, locale) ||
                          t("customerWorkspaceUx.notRecorded")}
                      </p>
                      <Link
                        className="cw-button"
                        href={href(
                          "/merchant/conversations?phone=" +
                            encodeURIComponent(conversation.customerPhone)
                        )}
                      >
                        {t("customerWorkspaceUx.openConversations")}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <CustomerPagination
                value={data!.conversations.pagination}
                onPage={conversationsPage =>
                  setSelection({ ...selection, conversationsPage })
                }
              />
            </section>
          )}
          {tab === "annotations" && (
            <CustomerAnnotations
              key={scope + ":" + row.key}
              scope={scope}
              customerKey={row.key}
            />
          )}
        </>
      )}
    </section>
  );
}
