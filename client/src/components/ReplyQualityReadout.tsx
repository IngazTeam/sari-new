import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";
import type {
  QualityFlag,
  QualityReadout,
} from "../../../shared/quality-readout";

export function ReplyQualityReadout() {
  const [days, setDays] = useState(30);
  const query = trpc.sariBrain.getQualityDashboard.useQuery(
    { days },
    { retry: false }
  );
  return (
    <ReplyQualityReadoutView
      days={days}
      onDaysChange={setDays}
      data={query.data}
      loading={query.isFetching || query.isLoading}
      error={query.isError}
      onRefresh={() => void query.refetch()}
    />
  );
}
export interface ReplyQualityReadoutProps {
  days: number;
  onDaysChange: (days: number) => void;
  data?: QualityReadout;
  loading: boolean;
  error: boolean;
  onRefresh: () => void;
}
export function ReplyQualityReadoutView({
  days,
  onDaysChange,
  data,
  loading,
  error,
  onRefresh,
}: ReplyQualityReadoutProps) {
  const { t, i18n } = useTranslation();
  const number = (value: number | null) =>
    value === null
      ? "—"
      : new Intl.NumberFormat(i18n.language, {
          maximumFractionDigits: 1,
        }).format(value);
  const date = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value));
  const flag = (label: string, help: string, value: QualityFlag) => (
    <div className="rounded-xl border p-4 space-y-2 min-w-0">
      <dt className="font-medium">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">
        {number(value.rate)}
        {value.rate !== null ? "%" : ""}
      </dd>
      <p className="text-xs text-muted-foreground">
        {t("replyQualityUx.denominator", {
          yes: number(value.yes),
          known: number(value.yes + value.no),
          unknown: number(value.unknown),
        })}
      </p>
      <p className="text-sm text-muted-foreground">{help}</p>
    </div>
  );
  const trends = {
    insufficient: t("replyQualityUx.insufficient"),
    improving: t("replyQualityUx.improving"),
    declining: t("replyQualityUx.declining"),
    stable: t("replyQualityUx.stable"),
  };
  return (
    <Card className="min-w-0">
      <CardHeader className="space-y-3">
        <CardTitle>
          <h2>{t("replyQualityUx.title")}</h2>
        </CardTitle>
        <CardDescription>{t("replyQualityUx.scope")}</CardDescription>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-2 text-sm">
            {t("replyQualityUx.period")}
            <select
              className="rounded-lg border bg-background p-2 min-h-11"
              value={days}
              onChange={event => onDaysChange(Number(event.target.value))}
            >
              {[
                [7, t("replyQualityUx.days7")],
                [30, t("replyQualityUx.days30")],
                [90, t("replyQualityUx.days90")],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Button variant="outline" disabled={loading} onClick={onRefresh}>
            {t("replyQualityUx.refresh")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <p role="status">{t("replyQualityUx.loading")}</p>
        ) : error || !data ? (
          <div role="alert">
            <p>{t("replyQualityUx.error")}</p>
            <p className="text-sm text-muted-foreground">
              {t("replyQualityUx.retryHelp")}
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {t("replyQualityUx.range", {
                from: date(data.from),
                through: date(data.through),
              })}
            </p>
            <p className="text-2xl font-semibold">
              {t("replyQualityUx.total", { count: data.totalResponses })}
            </p>
            {data.totalResponses === 0 ? (
              <p role="status" className="rounded-xl border bg-muted/30 p-4">
                {t("replyQualityUx.empty")}
              </p>
            ) : (
              <>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border p-4 space-y-2">
                    <dt className="font-medium">
                      {t("replyQualityUx.duration")}
                    </dt>
                    <dd className="text-2xl font-semibold tabular-nums">
                      {number(data.avgResponseTimeMs)}
                      {data.avgResponseTimeMs !== null && (
                        <span className="text-sm">
                          {" "}
                          {t("replyQualityUx.ms")}
                        </span>
                      )}
                    </dd>
                    <p className="text-xs text-muted-foreground">
                      {t("replyQualityUx.timeSamples", {
                        count: data.responseTimeSamples,
                      })}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t("replyQualityUx.durationHelp")}
                    </p>
                  </div>
                  {flag(
                    t("replyQualityUx.cache"),
                    t("replyQualityUx.cacheHelp"),
                    data.cache
                  )}
                  {flag(
                    t("replyQualityUx.short"),
                    t("replyQualityUx.shortHelp"),
                    data.shortResponses
                  )}
                  {flag(
                    t("replyQualityUx.escalation"),
                    t("replyQualityUx.escalationHelp"),
                    data.escalation
                  )}
                </dl>
                <section className="rounded-xl border p-4 space-y-2">
                  <h3 className="font-semibold">
                    {t("replyQualityUx.trendTitle")}
                  </h3>
                  <p>{trends[data.trend.state]}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("replyQualityUx.trendHelp")}
                  </p>
                  <p className="text-sm">
                    {t("replyQualityUx.trendSamples", {
                      current: number(
                        data.trend.current.yes + data.trend.current.no
                      ),
                      previous: number(
                        data.trend.previous.yes + data.trend.previous.no
                      ),
                    })}
                  </p>
                </section>
                <section className="space-y-3">
                  <h3 className="font-semibold">
                    {t("replyQualityUx.sentimentTitle")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("replyQualityUx.sentimentHelp")}
                  </p>
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      [t("replyQualityUx.positive"), data.sentiment.positive],
                      [t("replyQualityUx.neutral"), data.sentiment.neutral],
                      [t("replyQualityUx.negative"), data.sentiment.negative],
                      [t("replyQualityUx.unknown"), data.sentiment.unknown],
                    ].map(([label, value]) => (
                      <div
                        key={String(label)}
                        className="rounded-lg border p-3"
                      >
                        <dt className="text-sm text-muted-foreground">
                          {label}
                        </dt>
                        <dd className="text-lg font-semibold">
                          {number(Number(value))}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
                <section className="space-y-3">
                  <h3 className="font-semibold">
                    {t("replyQualityUx.questions")}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("replyQualityUx.questionsHelp")}
                  </p>
                  {!data.questions.length ? (
                    <p>{t("replyQualityUx.noQuestions")}</p>
                  ) : (
                    <ol className="space-y-2">
                      {data.questions.map((q, index) => (
                        <li key={index}>
                          <details className="rounded-lg border p-3">
                            <summary className="cursor-pointer min-h-11 flex flex-wrap items-center gap-2">
                              <span
                                className="break-words min-w-0 flex-1"
                                dir="auto"
                              >
                                {q.text.length > 120
                                  ? q.text.slice(0, 120) + "…"
                                  : q.text}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                {t("replyQualityUx.occurrences", {
                                  count: q.count,
                                })}
                              </span>
                            </summary>
                            <p
                              className="whitespace-pre-wrap break-words mt-3"
                              dir="auto"
                            >
                              {q.text}
                            </p>
                          </details>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
                <details className="rounded-xl border p-4">
                  <summary className="cursor-pointer min-h-11 font-semibold">
                    {t("replyQualityUx.recent")}
                  </summary>
                  <p className="text-sm text-muted-foreground my-3">
                    {t("replyQualityUx.recentHelp")}
                  </p>
                  <ol className="space-y-3">
                    {data.recent.map(row => (
                      <li key={row.id} className="border-s-2 ps-3 space-y-2">
                        <p className="text-xs text-muted-foreground">
                          #{row.id} ·{" "}
                          <time dateTime={row.createdAt}>
                            {date(row.createdAt)}
                          </time>{" "}
                          UTC
                        </p>
                        <p className="break-words" dir="auto">
                          {row.question || "—"}
                        </p>
                        <blockquote
                          className="break-words text-sm text-muted-foreground"
                          dir="auto"
                        >
                          {row.response || "—"}
                        </blockquote>
                      </li>
                    ))}
                  </ol>
                </details>
              </>
            )}
          </>
        )}
        <p className="text-sm text-muted-foreground">
          {t("replyQualityUx.coverage")}
        </p>
      </CardContent>
    </Card>
  );
}
