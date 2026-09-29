import { messageLabels } from "@/lib/message-labels";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import {
  messageReport,
  messageExportBlob,
  type MessageSnapshot,
} from "@/lib/message-export";
import { formatProductPrice } from "@shared/product-money";
import type { MessageWorkspaceInput } from "@shared/message-workspace";

export function MessageWorkspace() {
  const { t, i18n } = useTranslation(),
    rtl = !i18n.language?.startsWith("en"),
    language = rtl ? "ar-SA" : "en-GB";
  const labels = messageLabels(t);
  const label = (key: keyof typeof labels) => labels[key];
  const [period, setPeriod] = useState<MessageWorkspaceInput["period"]>("30d"),
    [format, setFormat] = useState<"csv" | "xlsx" | "pdf">("xlsx"),
    [busy, setBusy] = useState(false),
    [refreshing, setRefreshing] = useState(false);
  const merchant = trpc.merchants.getCurrent.useQuery();
  const query = trpc.messageWorkspace.read.useQuery(
    { period },
    { staleTime: 0, refetchOnMount: "always" }
  );
  const live = useRef(true),
    exportLock = useRef(false),
    refreshLock = useRef(false),
    displayed = useRef<MessageSnapshot | undefined>(undefined),
    selection = useRef("");
  selection.current = JSON.stringify([merchant.data?.id, period]);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const data =
    query.data?.merchantId === merchant.data?.id &&
    query.data?.period === period
      ? query.data
      : undefined;
  const failed = query.error || merchant.error;
  displayed.current =
    !failed && !query.isFetching && !refreshing ? data : undefined;
  const number = (value: number) =>
    new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value);
  const ratio = (value: number | null) =>
    value === null ? label("unavailable") : number(value) + "%";
  const date = (value: string) =>
    new Intl.DateTimeFormat(language, {
      dateStyle: "medium",
      timeStyle: "short",
      calendar: "gregory",
      timeZone: "UTC",
    }).format(new Date(value));
  async function refresh() {
    if (refreshLock.current) return;
    refreshLock.current = true;
    setRefreshing(true);
    const started = selection.current;
    try {
      const result = await query.refetch();
      if (!live.current || selection.current !== started) return;
      if (
        result.error ||
        result.data?.merchantId !== merchant.data?.id ||
        result.data?.period !== period
      )
        throw Error("Unavailable");
      toast.success(label("refreshed"));
    } catch {
      if (live.current && selection.current === started)
        toast.error(label("refreshFailed"));
    } finally {
      refreshLock.current = false;
      if (live.current) setRefreshing(false);
    }
  }
  async function exportSnapshot() {
    const snapshot = displayed.current;
    if (!snapshot || exportLock.current) return;
    exportLock.current = true;
    setBusy(true);
    try {
      const blob = await messageExportBlob(
        messageReport(snapshot, t),
        format,
        rtl
      );
      if (!live.current || displayed.current !== snapshot) return;
      const url = URL.createObjectURL(blob),
        anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `sary-messages-${snapshot.merchantId}-${snapshot.period}.${format}`;
      anchor.hidden = true;
      document.body.append(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      toast.success(label("exportReady"));
    } catch {
      if (live.current && displayed.current === snapshot)
        toast.error(label("exportFailed"));
    } finally {
      exportLock.current = false;
      if (live.current) setBusy(false);
    }
  }
  const card = (title: string, value: string | number) => (
    <div key={title} className="min-w-0 rounded-xl border bg-card p-4">
      <p className="text-sm leading-6 text-muted-foreground">{title}</p>
      <p className="mt-2 text-2xl font-semibold [overflow-wrap:anywhere]">
        {typeof value === "number" ? number(value) : value}
      </p>
    </div>
  );
  function distribution(
    rows: { key: string; name: string; count: number; share: number | null }[]
  ) {
    return (
      <div className="space-y-4">
        {rows.map(row => (
          <div key={row.key} className="min-w-0">
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span>{row.name}</span>
              <span>
                {number(row.count)} · {ratio(row.share)}
              </span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-muted" aria-hidden="true">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${row.share ?? 0}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }
  function series(
    title: string,
    note: string,
    rows: { name: string; count: number }[]
  ) {
    const max = Math.max(1, ...rows.map(row => row.count));
    return (
      <section className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-5">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm leading-7 text-muted-foreground">{note}</p>
        </div>
        <div
          className="flex h-36 items-end gap-px rounded-lg bg-muted/30 px-2 pt-3"
          aria-hidden="true"
        >
          {rows.map(row => (
            <div
              key={row.name}
              className="min-w-0 flex-1 rounded-t bg-primary/80"
              style={{ height: `${(row.count / max) * 100}%` }}
              title={`${row.name}: ${row.count}`}
            />
          ))}
        </div>
        <details>
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
            {label("table")} · {rows.length}
          </summary>
          <div className="mt-2 max-h-80 overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-start">
                    {title === label("daily") ? label("date") : label("hour")}
                  </th>
                  <th className="p-3 text-end">{label("count")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.name} className="border-b last:border-0">
                    <th
                      scope="row"
                      className="p-3 text-start font-normal"
                      dir="ltr"
                    >
                      {row.name}
                    </th>
                    <td className="p-3 text-end">{number(row.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    );
  }
  return (
    <div
      className="min-w-0 space-y-5 [overflow-wrap:anywhere]"
      dir={rtl ? "rtl" : "ltr"}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{label("title")}</h1>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            {label("subtitle")}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
          <label className="min-w-0 flex-1 text-sm sm:flex-none">
            {label("period")}
            <select
              value={period}
              onChange={event => setPeriod(event.target.value as typeof period)}
              className="mt-1 block min-h-11 w-full rounded-lg border bg-background px-3 text-base sm:w-44"
            >
              {(["7d", "30d", "90d"] as const).map(p => (
                <option key={p} value={p}>
                  {label(
                    p === "7d" ? "days7" : p === "30d" ? "days30" : "days90"
                  )}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={query.isFetching || refreshing}
            onClick={() => void refresh()}
          >
            {label("refresh")}
          </Button>
        </div>
      </header>
      {failed ? (
        <WorkspaceState
          inline
          kind={workspaceFailureKind(failed)}
          onRetry={() => {
            void merchant.refetch();
            void refresh();
          }}
        />
      ) : !data ? (
        <WorkspaceState inline kind="loading" />
      ) : (
        <>
          <section className="rounded-xl border bg-card p-4 text-sm leading-7">
            <p>
              {label("from")}: {date(data.from)} · {label("through")}:{" "}
              {date(data.through)} UTC
            </p>
            <p className="text-muted-foreground">{label("windowNote")}</p>
            {(query.isFetching || refreshing) && (
              <p role="status">{label("loading")}</p>
            )}
          </section>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {card(label("total"), data.messages.total)}
            {card(label("incoming"), data.messages.incoming)}
            {card(label("outgoing"), data.messages.outgoing)}
            {card(
              label("activeConversations"),
              data.messages.activeConversations
            )}
          </div>
          {data.messages.total === 0 && (
            <p
              role="status"
              className="rounded-xl border border-dashed p-4 text-sm leading-7"
            >
              {label("empty")}
            </p>
          )}
          <Tabs defaultValue="messages" dir={rtl ? "rtl" : "ltr"}>
            <TabsList
              aria-label={label("tabs")}
              className="grid h-auto w-full grid-cols-3 gap-1 bg-muted/50 p-1"
            >
              <TabsTrigger
                value="messages"
                className="min-h-12 whitespace-normal px-2 text-xs sm:text-sm"
              >
                {label("messages")}
              </TabsTrigger>
              <TabsTrigger
                value="sentiment"
                className="min-h-12 whitespace-normal px-2 text-xs sm:text-sm"
              >
                {label("sentiment")}
              </TabsTrigger>
              <TabsTrigger
                value="products"
                className="min-h-12 whitespace-normal px-2 text-xs sm:text-sm"
              >
                {label("productsOrders")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="messages" className="mt-4 space-y-4">
              <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
                <h2 className="font-semibold">{label("types")}</h2>
                <p className="text-sm leading-7 text-muted-foreground">
                  {label("messageNote")}
                </p>
                {distribution(
                  data.messages.byType.map(row => ({
                    key: row.kind,
                    name: label(row.kind),
                    count: row.count,
                    share: row.share,
                  }))
                )}
              </section>
              <div className="grid gap-4 lg:grid-cols-2">
                {series(
                  label("daily"),
                  label("windowNote"),
                  data.daily.map(row => ({ name: row.date, count: row.count }))
                )}
                {series(
                  label("hourly"),
                  label("hourNote"),
                  data.hourly.map(row => ({
                    name: `${String(row.hour).padStart(2, "0")}:00`,
                    count: row.count,
                  }))
                )}
              </div>
            </TabsContent>
            <TabsContent value="sentiment" className="mt-4 space-y-4">
              <p className="rounded-xl bg-primary/5 p-4 text-sm leading-7">
                {label("sentimentNote")}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {card(label("classified"), data.sentiment.classified)}
                {card(label("unclassified"), data.sentiment.unclassified)}
                {card(
                  label("coverage"),
                  ratio(data.sentiment.classificationCoverage)
                )}
              </div>
              <section className="rounded-xl border bg-card p-4 sm:p-5">
                {distribution(
                  data.sentiment.distribution.map(row => ({
                    key: row.kind,
                    name: label(row.kind),
                    count: row.count,
                    share: row.share,
                  }))
                )}
              </section>
              <details className="rounded-xl border bg-card p-4">
                <summary className="min-h-11 cursor-pointer py-2 font-medium">
                  {label("confidence")}
                </summary>
                <p className="my-3 text-sm leading-7 text-muted-foreground">
                  {label("confidenceNote")}
                </p>
                <dl className="space-y-2 text-sm">
                  {[
                    [
                      label("averageConfidence"),
                      ratio(data.sentiment.confidence.average),
                    ],
                    [
                      label("validConfidence"),
                      number(data.sentiment.confidence.validCount),
                    ],
                    [
                      label("invalidConfidence"),
                      number(data.sentiment.confidence.invalidCount),
                    ],
                  ].map(([name, value]) => (
                    <div
                      key={name}
                      className="flex flex-wrap justify-between gap-2"
                    >
                      <dt>{name}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </TabsContent>
            <TabsContent value="products" className="mt-4 space-y-4">
              <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
                <h2 className="font-semibold">{label("products")}</h2>
                <p className="text-sm leading-7 text-muted-foreground">
                  {label("productNote")}
                </p>
                {data.products.rows.length ? (
                  data.products.rows.map(row => (
                    <article
                      key={row.productId}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0 flex-1 basis-40">
                        <h3 className="font-medium">{row.productName}</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatProductPrice(
                            row,
                            language,
                            label("priceReview")
                          )}
                        </p>
                      </div>
                      <p className="text-sm">
                        {label("mentions")}:{" "}
                        <strong>{number(row.mentionCount)}</strong>
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="text-sm">{label("noProducts")}</p>
                )}
              </section>
              <section className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
                <h2 className="font-semibold">{label("orders")}</h2>
                <p className="text-sm leading-7 text-muted-foreground">
                  {label("orderNote")}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {card(label("newConversations"), data.orderAssociation.total)}
                  {card(
                    label("matchedConversations"),
                    data.orderAssociation.positive
                  )}
                  {card(
                    label("associationShare"),
                    ratio(data.orderAssociation.ratio)
                  )}
                </div>
                <p className="text-sm">
                  {label("salesProficiency")}:{" "}
                  <strong>{label("unmeasured")}</strong>
                </p>
              </section>
            </TabsContent>
          </Tabs>
          <section className="flex flex-wrap items-end justify-between gap-4 rounded-xl border bg-card p-4">
            <div className="min-w-0 flex-1 basis-64">
              <h2 className="font-semibold">{label("export")}</h2>
              <p className="mt-1 text-sm leading-7 text-muted-foreground">
                {label("exportNote")}
              </p>
            </div>
            <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
              <label className="flex-1 text-sm sm:flex-none">
                {label("format")}
                <select
                  value={format}
                  disabled={busy}
                  onChange={event =>
                    setFormat(event.target.value as typeof format)
                  }
                  className="mt-1 block min-h-11 w-full rounded-lg border bg-background px-3 text-base"
                >
                  <option value="xlsx">Excel</option>
                  <option value="pdf">PDF</option>
                  <option value="csv">CSV</option>
                </select>
              </label>
              <Button
                className="min-h-11"
                disabled={busy || query.isFetching || refreshing}
                onClick={() => void exportSnapshot()}
              >
                {busy ? label("exporting") : label("export")}
              </Button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
