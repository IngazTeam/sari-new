import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { reportWorkbook, type ReportDocument } from "@/lib/report-export";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { WorkspaceState } from "@/components/merchant/WorkspaceState";

type Kind = "sales" | "customers" | "conversations";
type Period = "day" | "week" | "month" | "year";
const finite = (n: unknown) => (Number.isFinite(Number(n)) ? Number(n) : 0);

export default function Reports() {
  const { t, i18n } = useTranslation();
  const [kind, setKind] = useState<Kind>("sales");
  const [period, setPeriod] = useState<Period>("month");
  const [currency, setCurrency] = useState<"SAR" | "USD">("SAR");
  const [exporting, setExporting] = useState(false);
  const [printReport, setPrintReport] = useState<ReportDocument | null>(null);
  const sales = trpc.reports.getSalesReport.useQuery({ period, currency });
  const customers = trpc.reports.getCustomersReport.useQuery({ period });
  const conversations = trpc.reports.getConversationsReport.useQuery({
    period,
  });
  const query =
    kind === "sales" ? sales : kind === "customers" ? customers : conversations;
  const ready = !query.isFetching && !query.isError && !!query.data;
  const periods = [
    { id: "day", label: t("reportWorkspaceUx.day") },
    { id: "week", label: t("reportWorkspaceUx.week") },
    { id: "month", label: t("reportWorkspaceUx.month") },
    { id: "year", label: t("reportWorkspaceUx.year") },
  ];
  const kinds = [
    { id: "sales", label: t("reportWorkspaceUx.sales") },
    { id: "customers", label: t("reportWorkspaceUx.customers") },
    { id: "conversations", label: t("reportWorkspaceUx.conversations") },
  ];
  const money = (n: unknown) =>
    n == null
      ? t("reportWorkspaceUx.unmeasured")
      : new Intl.NumberFormat(i18n.language, {
          style: "currency",
          currency,
        }).format(finite(n) / 100);
  const number = (n: unknown) =>
    new Intl.NumberFormat(i18n.language).format(finite(n));
  const percent = (n: unknown) =>
    n == null ? t("reportWorkspaceUx.unmeasured") : `${number(n)}%`;
  const evidence =
    kind === "sales" && sales.data
      ? t("reportWorkspaceUx.salesEvidence", {
          ...sales.data.productSample,
          excludedAmounts: sales.data.excludedAmounts,
          previousExcludedAmounts: sales.data.previousExcludedAmounts,
        })
      : kind === "customers" && customers.data
        ? t("reportWorkspaceUx.customerEvidence", {
            count: customers.data.unknownPhoneConversations,
          })
        : kind === "conversations" && conversations.data
          ? t("reportWorkspaceUx.conversationEvidence", {
              count: conversations.data.invalidPurchaseCounters,
            })
          : "";
  const report: ReportDocument = {
    title: kinds.find(k => k.id === kind)!.label,
    period: `${periods.find(p => p.id === period)!.label} · ${query.data?.from || ""} — ${query.data?.through || ""} (UTC)`,
    note:
      (kind === "sales"
        ? t("reportWorkspaceUx.salesNote", { currency })
        : kind === "customers"
          ? t("reportWorkspaceUx.customersNote")
          : t("reportWorkspaceUx.conversationsNote")) +
      " " +
      evidence,
    metrics:
      kind === "sales"
        ? [
            {
              label: t("reportWorkspaceUx.revenue"),
              value: money(sales.data?.totalRevenue),
            },
            {
              label: t("reportWorkspaceUx.orders"),
              value: finite(sales.data?.totalOrders),
            },
            {
              label: t("reportWorkspaceUx.average"),
              value: money(sales.data?.averageOrderValue),
            },
            {
              label: t("reportWorkspaceUx.markedPaid"),
              value: money(sales.data?.markedPaidMinor),
            },
            {
              label: t("reportWorkspaceUx.amountSample"),
              value: `${sales.data?.validAmountOrders ?? 0} / ${sales.data?.totalOrders ?? 0}`,
            },
            {
              label: t("reportWorkspaceUx.totalConversations"),
              value: sales.data?.totalConversations ?? 0,
            },
            {
              label: t("reportWorkspaceUx.orderRatio"),
              value: percent(sales.data?.conversionRate),
            },
            {
              label: t("reportWorkspaceUx.growth"),
              value: sales.data?.growthAvailable
                ? percent(sales.data.growth)
                : t("reportWorkspaceUx.unavailable"),
            },
          ]
        : kind === "customers"
          ? [
              {
                label: t("reportWorkspaceUx.totalCustomers"),
                value: finite(customers.data?.totalCustomers),
              },
              {
                label: t("reportWorkspaceUx.newCustomers"),
                value: finite(customers.data?.newCustomers),
              },
              {
                label: t("reportWorkspaceUx.activeCustomers"),
                value: finite(customers.data?.activeCustomers),
              },
              {
                label: t("reportWorkspaceUx.activeRatio"),
                value: percent(customers.data?.retentionRate),
              },
            ]
          : [
              {
                label: t("reportWorkspaceUx.totalConversations"),
                value: finite(conversations.data?.totalConversations),
              },
              {
                label: t("reportWorkspaceUx.responseTime"),
                value: t("reportWorkspaceUx.unmeasured"),
              },
              {
                label: t("reportWorkspaceUx.satisfaction"),
                value: t("reportWorkspaceUx.unmeasured"),
              },
              {
                label: t("reportWorkspaceUx.purchaseRatio"),
                value: percent(conversations.data?.conversionRate),
              },
            ],
    tableTitle:
      kind === "sales"
        ? t("reportWorkspaceUx.topProducts")
        : kind === "customers"
          ? t("reportWorkspaceUx.topCustomers")
          : t("reportWorkspaceUx.topTopics"),
    columns:
      kind === "sales"
        ? [
            t("reportWorkspaceUx.product"),
            t("reportWorkspaceUx.quantity"),
            t("reportWorkspaceUx.revenue"),
          ]
        : kind === "customers"
          ? [
              t("reportWorkspaceUx.customer"),
              t("reportWorkspaceUx.phone"),
              t("reportWorkspaceUx.purchases"),
              t("reportWorkspaceUx.recordedSpend"),
            ]
          : [t("reportWorkspaceUx.topic")],
    rows:
      kind === "sales"
        ? (sales.data?.topProducts || []).map(p => [
            p.name,
            p.quantity,
            money(p.revenue),
          ])
        : kind === "customers"
          ? (customers.data?.topCustomers || []).map(c => [
              c.customerName || t("reportWorkspaceUx.unnamed"),
              c.customerPhone,
              c.purchaseCount,
              c.totalSpent == null
                ? t("reportWorkspaceUx.unmeasured")
                : number(c.totalSpent),
            ])
          : [],
  };
  async function exportExcel() {
    if (!ready || exporting) return;
    setExporting(true);
    try {
      const buffer = await reportWorkbook(report, i18n.dir() === "rtl");
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(buffer)], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        })
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `sary-${kind}-${period}-${currency}.xlsx`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(t("reportWorkspaceUx.downloadStarted"));
    } catch {
      toast.error(t("reportWorkspaceUx.exportFailed"));
    } finally {
      setExporting(false);
    }
  }
  function print() {
    if (!ready) return;
    setPrintReport(report);
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }
  function content(doc: ReportDocument) {
    return (
      <>
        <h2 className="text-xl font-semibold">{doc.title}</h2>
        <p className="text-sm text-muted-foreground">
          {doc.period} · {doc.note}
        </p>
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {doc.metrics.map(m => (
            <Card key={m.label}>
              <CardContent className="space-y-3 p-5">
                <dt className="text-sm text-muted-foreground">{m.label}</dt>
                <dd className="text-2xl font-semibold break-words">
                  {m.value}
                </dd>
              </CardContent>
            </Card>
          ))}
        </dl>
        <Card>
          <CardContent className="space-y-4 p-5">
            <h3 className="font-semibold">{doc.tableTitle}</h3>
            {doc.rows.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <thead>
                    <tr>
                      {doc.columns.map(c => (
                        <th
                          key={c}
                          scope="col"
                          className="border-b p-3 text-start"
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {doc.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j} className="border-b p-3 break-words">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>
                {doc.columns.length === 1
                  ? t("reportWorkspaceUx.topicsUnavailable")
                  : t("reportWorkspaceUx.noRows")}
              </p>
            )}
          </CardContent>
        </Card>
      </>
    );
  }
  return (
    <div className="container space-y-6 py-6">
      <header>
        <h1 className="text-3xl font-bold">{t("reportWorkspaceUx.title")}</h1>
        <p className="mt-2 text-muted-foreground">
          {t("reportWorkspaceUx.subtitle")}
        </p>
      </header>
      <nav className="mw-feature-nav" aria-label={t("reportWorkspaceUx.title")}>
        {kinds.map(k => (
          <Button
            key={k.id}
            variant={kind === k.id ? "secondary" : "ghost"}
            aria-pressed={kind === k.id}
            onClick={() => setKind(k.id as Kind)}
          >
            {k.label}
          </Button>
        ))}
      </nav>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
        <div className="space-y-2">
          <Label htmlFor="report-period">{t("reportWorkspaceUx.period")}</Label>
          <select
            id="report-period"
            className="block h-10 rounded-md border bg-background px-3"
            value={period}
            onChange={e => setPeriod(e.target.value as Period)}
          >
            {periods.map(p => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        {kind === "sales" && (
          <div className="space-y-2">
            <Label htmlFor="report-currency">
              {t("reportWorkspaceUx.currency")}
            </Label>
            <select
              id="report-currency"
              className="block h-10 rounded-md border bg-background px-3"
              value={currency}
              onChange={e => setCurrency(e.target.value as "SAR" | "USD")}
            >
              <option value="SAR">SAR</option>
              <option value="USD">USD</option>
            </select>
          </div>
        )}
        <Button
          variant="outline"
          disabled={!ready || exporting}
          onClick={exportExcel}
        >
          {exporting
            ? t("reportWorkspaceUx.exporting")
            : t("reportWorkspaceUx.excel")}
        </Button>
        <Button
          variant="outline"
          disabled={!ready || exporting}
          onClick={print}
        >
          {t("reportWorkspaceUx.print")}
        </Button>
      </div>
      {query.isError ? (
        <WorkspaceState kind="error" onRetry={() => void query.refetch()} />
      ) : query.isFetching || !query.data ? (
        <p role="status">{t("reportWorkspaceUx.loading")}</p>
      ) : (
        <section className="space-y-5" aria-live="polite">
          {content(report)}
        </section>
      )}
      {printReport &&
        createPortal(
          <div className="sary-report-print space-y-5" dir={i18n.dir()}>
            {content(printReport)}
          </div>,
          document.body
        )}
    </div>
  );
}
