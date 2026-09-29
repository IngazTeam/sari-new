import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, Link } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import { KeywordReviewDialog } from "./KeywordReviewDialog";
import { InsightReportDetails } from "./InsightReportDetails";
import { insightCsv } from "@shared/insight-csv";
import type { InsightWorkspaceInput } from "@shared/insights-workspace";
type Tab = "keywords" | "reports" | "tests";

export function InsightsWorkspace() {
  const { t, i18n } = useTranslation(),
    [location] = useLocation();
  const [tab, setTab] = useState<Tab>(
    location.endsWith("/ab-tests") ? "tests" : "keywords"
  );
  const [input, setInput] = useState<InsightWorkspaceInput>({
    period: "30d",
    keywordPage: 1,
    reportPage: 1,
    testPage: 1,
  });
  const merchant = trpc.merchants.getCurrent.useQuery();
  const query = trpc.insights.workspace.useQuery(input, {
    refetchOnMount: "always",
    staleTime: 0,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [selectedKeyword, setSelectedKeyword] = useState<number | null>(null);
  const active = useRef(true),
    refreshLock = useRef(false),
    identity = useRef("");
  identity.current = JSON.stringify([merchant.data?.id, input]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(
    () => setTab(location.endsWith("/ab-tests") ? "tests" : "keywords"),
    [location]
  );
  const data =
    query.data?.merchantId === merchant.data?.id &&
    query.data?.period === input.period
      ? query.data
      : undefined;
  const language = i18n.language?.startsWith("en") ? "en-GB" : "ar-SA";
  const number = (value: number) =>
    new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(value);
  const date = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(language, {
          dateStyle: "medium",
          timeStyle: "short",
          calendar: "gregory",
        }).format(new Date(value))
      : t("insightsWorkspace.unavailable");
  const ratio = (value: number | null) =>
    value === null ? t("insightsWorkspace.unavailable") : number(value) + "%";
  const category = {
    product: t("insightsWorkspace.product"),
    price: t("insightsWorkspace.price"),
    shipping: t("insightsWorkspace.shipping"),
    complaint: t("insightsWorkspace.complaint"),
    question: t("insightsWorkspace.question"),
    other: t("insightsWorkspace.other"),
  };
  const status = {
    new: t("insightsWorkspace.new"),
    reviewed: t("insightsWorkspace.reviewed"),
    response_created: t("insightsWorkspace.responseCreated"),
    ignored: t("insightsWorkspace.ignored"),
    running: t("insightsWorkspace.running"),
    paused: t("insightsWorkspace.paused"),
    completed: t("insightsWorkspace.completed"),
  };
  async function refresh() {
    if (refreshLock.current) return;
    const started = identity.current;
    refreshLock.current = true;
    setRefreshing(true);
    try {
      const result = await query.refetch();
      if (!active.current || started !== identity.current) return;
      if (
        result.error ||
        result.data?.merchantId !== merchant.data?.id ||
        result.data?.period !== input.period
      )
        throw Error("Unavailable");
      toast.success(t("insightsWorkspace.refreshed"));
    } catch {
      if (active.current && started === identity.current)
        toast.error(t("insightsWorkspace.refreshFailed"));
    } finally {
      refreshLock.current = false;
      if (active.current) setRefreshing(false);
    }
  }
  function exportPage() {
    if (!data || query.isError || query.isFetching || refreshing) return;
    const metadata: [string, string][] = [
      ["period", data.period],
      ["from_utc", data.from],
      ["through_utc", data.through],
      ["scope", "displayed page only"],
    ];
    let rows: (string | number | null)[][];
    if (tab === "keywords")
      rows = [
        [
          "keyword",
          "category",
          "lifetime_frequency",
          "record_status",
          "suggested_text",
          "first_seen_utc",
          "last_seen_utc",
        ],
        ...data.keywords.rows.map(row => [
          row.keyword,
          row.category,
          row.frequency,
          row.status,
          row.suggestedResponse,
          row.firstSeenAt,
          row.lastSeenAt,
        ]),
      ];
    else if (tab === "reports")
      rows = [
        [
          "id",
          "week_start_utc",
          "week_end_utc",
          "total",
          "positive",
          "negative",
          "neutral",
          "unclassified",
          "positive_share_percent",
          "valid_sample",
          "email_record_flag",
        ],
        ...data.reports.rows.map(row => [
          row.id,
          row.weekStart,
          row.weekEnd,
          row.observation.total,
          row.observation.positive,
          row.observation.negative,
          row.observation.neutral,
          row.observation.unclassified,
          row.observation.positiveShare,
          String(row.observation.valid),
          String(row.emailMarkedSent),
        ]),
      ];
    else
      rows = [
        [
          "id",
          "name",
          "keyword",
          "status",
          "created_utc",
          "variant_a",
          "observations_a",
          "positive_flags_a",
          "ratio_a",
          "variant_b",
          "observations_b",
          "positive_flags_b",
          "ratio_b",
          "evidence",
          "activation_allowed",
        ],
        ...data.tests.rows.map(row => [
          row.id,
          row.name,
          row.keyword,
          row.status,
          row.createdAt,
          row.variantA.text,
          row.variantA.total,
          row.variantA.positive,
          row.variantA.ratio,
          row.variantB.text,
          row.variantB.total,
          row.variantB.positive,
          row.variantB.ratio,
          data.tests.evidenceKind,
          "false",
        ]),
      ];
    const blob = new Blob([insightCsv([...metadata, [], ...rows])], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob),
      anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sary-insights-${tab}-${data.period}-page-${data[tab].page}.csv`;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const paging = data?.[tab];
  const changePage = (page: number) =>
    setInput(old => ({
      ...old,
      [tab === "keywords"
        ? "keywordPage"
        : tab === "reports"
          ? "reportPage"
          : "testPage"]: page,
    }));
  return (
    <div className="mx-auto max-w-6xl space-y-6 py-4">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-bold">{t("insightsWorkspace.title")}</h1>
          <p className="max-w-2xl text-sm leading-7 text-muted-foreground">
            {t("insightsWorkspace.intro")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="min-h-11"
            disabled={refreshing || query.isFetching}
            onClick={() => void refresh()}
          >
            {t("insightsWorkspace.refresh")}
          </Button>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={
              !data ||
              query.isError ||
              query.isFetching ||
              refreshing ||
              !paging?.rows.length
            }
            onClick={exportPage}
          >
            {t("insightsWorkspace.export")}
          </Button>
        </div>
      </header>
      <fieldset className="min-w-0 space-y-2" disabled={refreshing}>
        <legend className="text-sm font-semibold">
          {t("insightsWorkspace.period")}
        </legend>
        <div className="flex flex-wrap gap-2">
          {(["7d", "30d", "90d"] as const).map(period => (
            <Button
              className="min-h-11"
              key={period}
              variant={input.period === period ? "default" : "outline"}
              aria-pressed={input.period === period}
              onClick={() =>
                setInput({ period, keywordPage: 1, reportPage: 1, testPage: 1 })
              }
            >
              {t("insightsWorkspace.days", {
                count: Number(period.slice(0, -1)),
              })}
            </Button>
          ))}
        </div>
      </fieldset>
      {query.isError ? (
        <WorkspaceState
          kind={workspaceFailureKind(query.error)}
          onRetry={() => void refresh()}
        />
      ) : !data ? (
        <p role="status">{t("common.loading")}</p>
      ) : (
        <>
          <p className="text-xs leading-6 text-muted-foreground">
            {t("insightsWorkspace.window", {
              from: date(data.from),
              to: date(data.through),
            })}
          </p>
          <Tabs
            value={tab}
            onValueChange={value => setTab(value as Tab)}
            className="space-y-4"
          >
            <TabsList className="grid h-auto w-full grid-cols-3 gap-1 bg-muted p-1">
              <TabsTrigger
                className="min-h-11 whitespace-normal text-xs sm:text-sm"
                value="keywords"
              >
                {t("insightsWorkspace.keywords")}
              </TabsTrigger>
              <TabsTrigger
                className="min-h-11 whitespace-normal text-xs sm:text-sm"
                value="reports"
              >
                {t("insightsWorkspace.reports")}
              </TabsTrigger>
              <TabsTrigger
                className="min-h-11 whitespace-normal text-xs sm:text-sm"
                value="tests"
              >
                {t("insightsWorkspace.tests")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="keywords" className="space-y-4">
              <p className="text-sm leading-7 text-muted-foreground">
                {t("insightsWorkspace.keywordHelp")}
              </p>
              <dl className="grid gap-3 sm:grid-cols-3">
                {[
                  [t("insightsWorkspace.unique"), data.keywords.total],
                  [t("insightsWorkspace.suggested"), data.keywords.suggested],
                  [
                    t("insightsWorkspace.marked"),
                    data.keywords.markedResponseCreated,
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border bg-card p-4">
                    <dt className="text-sm text-muted-foreground">{label}</dt>
                    <dd className="mt-2 text-2xl font-semibold">
                      {number(Number(value))}
                    </dd>
                  </div>
                ))}
              </dl>
              <section className="rounded-xl border bg-card p-4">
                <h2 className="font-semibold">
                  {t("insightsWorkspace.categories")}
                </h2>
                {data.keywords.categories.length ? (
                  <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                    {data.keywords.categories.map(row => (
                      <li key={row.category} className="min-w-0 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <span>{category[row.category]}</span>
                          <span className="tabular-nums">
                            {number(row.count)}
                          </span>
                        </div>
                        <progress
                          className="h-2 w-full"
                          aria-label={category[row.category]}
                          value={row.count}
                          max={data.keywords.total}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {t("insightsWorkspace.emptyKeywords")}
                  </p>
                )}
              </section>
              <div className="space-y-3">
                {data.keywords.rows.map(row => (
                  <article
                    key={row.id}
                    className="min-w-0 space-y-3 rounded-xl border bg-card p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h2 className="min-w-0 font-semibold [overflow-wrap:anywhere]">
                        {row.keyword}
                      </h2>
                      <span className="text-xs text-muted-foreground">
                        {category[row.category]} · {status[row.status]}
                      </span>
                    </div>
                    <p className="text-sm">
                      {t("insightsWorkspace.frequency", {
                        count: row.frequency,
                      })}
                    </p>
                    <p className="text-xs leading-6 text-muted-foreground">
                      {t("insightsWorkspace.seen", {
                        first: date(row.firstSeenAt),
                        last: date(row.lastSeenAt),
                      })}
                    </p>
                    <details>
                      <summary className="min-h-11 cursor-pointer py-3 text-sm">
                        {t("insightsWorkspace.suggestedText")}
                      </summary>
                      <p className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">
                        {row.suggestedResponse?.trim() ||
                          t("insightsWorkspace.noSuggestion")}
                      </p>
                      <p className="mt-3 text-xs leading-6 text-muted-foreground">
                        {t("insightsWorkspace.suggestionHelp")}
                      </p>
                    </details>
                    <Button
                      variant="outline"
                      className="min-h-11"
                      disabled={query.isFetching || refreshing}
                      onClick={() => setSelectedKeyword(row.id)}
                    >
                      {t("keywordReview.open")}
                    </Button>
                  </article>
                ))}
              </div>
              <Button asChild className="min-h-11" variant="outline">
                <Link href="/merchant/quick-responses">
                  {t("insightsWorkspace.manageResponses")}
                </Link>
              </Button>
            </TabsContent>
            <TabsContent value="reports" className="space-y-4">
              <p className="text-sm leading-7 text-muted-foreground">
                {t("insightsWorkspace.reportHelp")}
              </p>
              {data.reports.rows.length > 1 && (
                <figure className="space-y-4 rounded-xl border bg-card p-4">
                  <figcaption className="space-y-2">
                    <h2 className="font-semibold">
                      {t("insightsWorkspace.trend")}
                    </h2>
                    <p className="text-xs leading-6 text-muted-foreground">
                      {t("insightsWorkspace.trendHelp")}
                    </p>
                  </figcaption>
                  {[...data.reports.rows].reverse().map(row => (
                    <div className="space-y-2" key={row.id}>
                      <p className="text-xs leading-6">
                        {date(row.weekEnd)} · {t("insightsWorkspace.sample")}:{" "}
                        {number(row.observation.total)}
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          [
                            t("insightsWorkspace.positive"),
                            row.observation.positive,
                          ],
                          [
                            t("insightsWorkspace.neutral"),
                            row.observation.neutral,
                          ],
                          [
                            t("insightsWorkspace.negative"),
                            row.observation.negative,
                          ],
                        ].map(([label, value]) => (
                          <div key={label} className="min-w-0">
                            <span className="text-xs">
                              {label}: {number(Number(value))}
                            </span>
                            {row.observation.valid &&
                              row.observation.total > 0 && (
                                <progress
                                  className="h-2 w-full"
                                  aria-label={`${label} · ${date(row.weekEnd)}`}
                                  value={Number(value)}
                                  max={row.observation.total}
                                />
                              )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </figure>
              )}
              {!data.reports.rows.length ? (
                <p className="rounded-xl border p-6 text-sm">
                  {t("insightsWorkspace.emptyReports")}
                </p>
              ) : (
                data.reports.rows.map(row => (
                  <article
                    key={row.id}
                    className="min-w-0 space-y-4 rounded-xl border bg-card p-4"
                  >
                    <h2 className="font-semibold [overflow-wrap:anywhere]">
                      {t("insightsWorkspace.reportDates", {
                        from: date(row.weekStart),
                        to: date(row.weekEnd),
                      })}
                    </h2>
                    <div className="flex flex-wrap items-baseline gap-3">
                      <strong className="text-2xl">
                        {ratio(row.observation.positiveShare)}
                      </strong>
                      <span className="text-sm">
                        {t("insightsWorkspace.positiveShare")}
                      </span>
                    </div>
                    {!row.observation.valid && (
                      <p role="alert" className="text-sm text-destructive">
                        {t("insightsWorkspace.invalid")}
                      </p>
                    )}
                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                      {[
                        [t("insightsWorkspace.sample"), row.observation.total],
                        [
                          t("insightsWorkspace.positive"),
                          row.observation.positive,
                        ],
                        [
                          t("insightsWorkspace.neutral"),
                          row.observation.neutral,
                        ],
                        [
                          t("insightsWorkspace.negative"),
                          row.observation.negative,
                        ],
                        [
                          t("insightsWorkspace.unclassified"),
                          row.observation.unclassified,
                        ],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="min-w-0 rounded-lg bg-muted p-3"
                        >
                          <dt className="text-xs">{label}</dt>
                          <dd className="mt-1 font-semibold">
                            {value === null
                              ? t("insightsWorkspace.unavailable")
                              : number(Number(value))}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p className="text-xs leading-6 text-muted-foreground">
                      {t("insightsWorkspace.ratioHelp")}
                    </p>
                    <p className="text-xs leading-6 text-muted-foreground">
                      {t("insightsWorkspace.emailFlag", {
                        value: row.emailMarkedSent
                          ? t("insightsWorkspace.flagged")
                          : t("insightsWorkspace.notFlagged"),
                      })}
                    </p>
                    <InsightReportDetails
                      reportId={row.id}
                      merchantId={data.merchantId}
                    />
                  </article>
                ))
              )}
            </TabsContent>
            <TabsContent value="tests" className="space-y-4">
              <p className="rounded-xl border bg-card p-4 text-sm leading-7">
                {t("insightsWorkspace.testHelp")}
              </p>
              {!data.tests.rows.length ? (
                <p className="rounded-xl border p-6 text-sm">
                  {t("insightsWorkspace.emptyTests")}
                </p>
              ) : (
                data.tests.rows.map(row => (
                  <article
                    key={row.id}
                    className="min-w-0 space-y-4 rounded-xl border bg-card p-4"
                  >
                    <header className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="font-semibold [overflow-wrap:anywhere]">
                          {row.name}
                        </h2>
                        <p className="mt-2 text-sm [overflow-wrap:anywhere]">
                          {row.keyword}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {status[row.status]}
                      </span>
                    </header>
                    <p className="text-xs">
                      {t("insightsWorkspace.created", {
                        date: date(row.createdAt),
                      })}
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(
                        [
                          ["A", row.variantA],
                          ["B", row.variantB],
                        ] as const
                      ).map(([name, arm]) => (
                        <section
                          key={name}
                          className="min-w-0 space-y-3 rounded-lg border p-3"
                        >
                          <h3 className="font-semibold">
                            {t("insightsWorkspace.variant", { name })}
                          </h3>
                          <p className="whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">
                            {arm.text}
                          </p>
                          <p className="text-sm">
                            {t("insightsWorkspace.observations", {
                              total: arm.total,
                              positive: arm.positive,
                            })}
                          </p>
                          <p className="text-sm">
                            {t("insightsWorkspace.observationRatio", {
                              ratio: ratio(arm.ratio),
                            })}
                          </p>
                          {!arm.valid && (
                            <p
                              role="alert"
                              className="text-sm text-destructive"
                            >
                              {t("insightsWorkspace.invalid")}
                            </p>
                          )}
                        </section>
                      ))}
                    </div>
                    <p className="text-xs leading-6 text-muted-foreground">
                      {t("insightsWorkspace.selection", {
                        value:
                          row.storedSelection === "variant_a"
                            ? "A"
                            : row.storedSelection === "variant_b"
                              ? "B"
                              : t("insightsWorkspace.noSelection"),
                      })}
                    </p>
                  </article>
                ))
              )}
            </TabsContent>
          </Tabs>
          {paging && (
            <nav
              aria-label={t("insightsWorkspace.pagination")}
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <Button
                variant="outline"
                className="min-h-11"
                disabled={paging.page <= 1 || query.isFetching || refreshing}
                onClick={() => changePage(paging.page - 1)}
              >
                {t("common.previous")}
              </Button>
              <p className="text-sm">
                {t("insightsWorkspace.page", {
                  page: paging.page,
                  pages: paging.pages,
                  total: paging.total,
                })}
              </p>
              <Button
                variant="outline"
                className="min-h-11"
                disabled={
                  paging.page >= paging.pages || query.isFetching || refreshing
                }
                onClick={() => changePage(paging.page + 1)}
              >
                {t("common.next")}
              </Button>
            </nav>
          )}
        </>
      )}
      {selectedKeyword !== null && merchant.data?.id && (
        <KeywordReviewDialog
          key={`${merchant.data.id}:${selectedKeyword}`}
          keywordId={selectedKeyword}
          merchantId={merchant.data.id}
          onClose={() => setSelectedKeyword(null)}
          onChanged={() => {
            void query.refetch();
          }}
        />
      )}
    </div>
  );
}
