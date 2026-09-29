import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { insightCsv } from "@shared/insight-csv";
import type { insightStoredList } from "@shared/insights-workspace";

export function InsightReportDetails({
  reportId,
  merchantId,
}: {
  reportId: number;
  merchantId: number;
}) {
  const { t } = useTranslation(),
    [open, setOpen] = useState(false);
  return (
    <details onToggle={event => setOpen(event.currentTarget.open)}>
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
        {t("insightReport.open")}
      </summary>
      {open && (
        <ReportContent
          key={`${merchantId}:${reportId}`}
          reportId={reportId}
          merchantId={merchantId}
        />
      )}
    </details>
  );
}
function ReportContent({
  reportId,
  merchantId,
}: {
  reportId: number;
  merchantId: number;
}) {
  const { t, i18n } = useTranslation();
  const query = trpc.insights.report.useQuery(
    { reportId },
    { refetchOnMount: "always", staleTime: 0 }
  );
  const data =
    query.data?.id === reportId && query.data?.merchantId === merchantId
      ? query.data
      : undefined;
  const locale = i18n.language?.startsWith("en") ? "en-GB" : "ar-SA";
  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
          calendar: "gregory",
        }).format(new Date(value))
      : t("insightsWorkspace.unavailable");
  function section(title: string, value: ReturnType<typeof insightStoredList>) {
    return (
      <section className="min-w-0 space-y-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {value.format === "legacy" ? (
          <>
            <p className="text-xs text-muted-foreground">
              {t("insightReport.legacyText")}
            </p>
            <p className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm leading-7 [overflow-wrap:anywhere]">
              {value.raw}
            </p>
          </>
        ) : value.items.length ? (
          <ul className="list-inside list-disc space-y-2 text-sm leading-7">
            {value.items.map((text, index) => (
              <li
                key={index}
                className="whitespace-pre-wrap [overflow-wrap:anywhere]"
              >
                {text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("insightReport.noText")}
          </p>
        )}
      </section>
    );
  }
  function download() {
    if (!data || query.isError || query.isFetching) return;
    const rows: (string | number | null)[][] = [
      ["report_id", data.id],
      ["evidence", data.evidenceKind],
      ["week_start_utc", data.weekStart],
      ["week_end_utc", data.weekEnd],
      ["created_utc", data.createdAt],
      ["total", data.observation.total],
      ["positive", data.observation.positive],
      ["negative", data.observation.negative],
      ["neutral", data.observation.neutral],
      ["unclassified", data.observation.unclassified],
      ["valid_sample", String(data.observation.valid)],
      ["positive_share_percent", data.observation.positiveShare],
      ["email_record_flag", String(data.emailMarkedSent)],
      ["email_flag_utc", data.emailSentAt],
      [
        "unverified_historical_positive_percentage",
        data.historicalValues.positivePercentage,
      ],
      [
        "unverified_historical_negative_percentage",
        data.historicalValues.negativePercentage,
      ],
      [
        "unverified_historical_sentiment_index",
        data.historicalValues.sentimentIndex,
      ],
    ];
    for (const [name, value] of [
      ["top_keywords", data.topKeywords],
      ["top_complaints", data.topComplaints],
      ["recommendations", data.recommendations],
    ] as const) {
      rows.push([name + "_format", value.format]);
      if (value.format === "legacy") rows.push([name + "_raw", value.raw]);
      else
        value.items.forEach((text, index) =>
          rows.push([name, index + 1, text])
        );
    }
    const url = URL.createObjectURL(
        new Blob([insightCsv(rows)], { type: "text/csv;charset=utf-8" })
      ),
      anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sary-insight-report-${data.id}.csv`;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (query.isError || (query.data && !data))
    return (
      <div role="alert" className="space-y-3 rounded-lg border p-4">
        <p>
          {t(
            (query.error as { data?: { code?: string } })?.data?.code ===
              "NOT_FOUND"
              ? "insightReport.missing"
              : "insightReport.failed"
          )}
        </p>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {t("keywordReview.retry")}
        </Button>
      </div>
    );
  if (!data || query.isFetching)
    return (
      <p role="status" className="py-3">
        {t("common.loading")}
      </p>
    );
  return (
    <div className="min-w-0 space-y-5 rounded-xl border p-4">
      <p className="text-sm leading-7 text-muted-foreground">
        {t("insightReport.evidence")}
      </p>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">
            {t("insightReport.created")}
          </dt>
          <dd>{date(data.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {t("insightReport.emailAt")}
          </dt>
          <dd>{date(data.emailSentAt)}</dd>
        </div>
      </dl>
      <p className="text-xs leading-6 text-muted-foreground">
        {t("insightsWorkspace.emailFlag", {
          value: data.emailMarkedSent
            ? t("insightsWorkspace.flagged")
            : t("insightsWorkspace.notFlagged"),
        })}
      </p>
      {section(t("insightReport.keywords"), data.topKeywords)}
      {section(t("insightReport.complaints"), data.topComplaints)}
      {section(t("insightReport.recommendations"), data.recommendations)}
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm">
          {t("insightReport.history")}
        </summary>
        <p className="text-xs leading-6 text-muted-foreground">
          {t("insightReport.historyHelp")}
        </p>
        <dl className="mt-3 grid gap-3 text-sm">
          {[
            [
              t("insightReport.oldPositive"),
              data.historicalValues.positivePercentage,
            ],
            [
              t("insightReport.oldNegative"),
              data.historicalValues.negativePercentage,
            ],
            [t("insightReport.oldIndex"), data.historicalValues.sentimentIndex],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{new Intl.NumberFormat(locale).format(Number(value))}</dd>
            </div>
          ))}
        </dl>
      </details>
      <Button
        variant="outline"
        className="h-auto min-h-11 whitespace-normal"
        onClick={download}
      >
        {t("insightReport.export")}
      </Button>
    </div>
  );
}
