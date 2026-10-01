import { useTranslation } from "react-i18next";
import { Loader2, CircleAlert, FileSearch } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const count = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;

// Old workers may omit parts of the report. Missing evidence must not become zero
// or a successful knowledge/indexing outcome.
export function readWebsiteAnalysisResult(value: unknown) {
  const data = record(value),
    crawl = record(data.crawlStats),
    sales = record(data.salesIntelSummary),
    evolution = record(data.knowledgeEvolution);
  return {
    title: typeof data.title === "string" ? data.title : "",
    score:
      typeof data.score === "number" &&
      Number.isFinite(data.score) &&
      data.score >= 0 &&
      data.score <= 100
        ? data.score
        : null,
    discovered: count(crawl.pagesDiscovered),
    attempted: count(crawl.pagesCrawled),
    read: count(crawl.pagesSuccess),
    mainWords: count(crawl.mainPageWords),
    totalWords: count(crawl.totalWords),
    sections: count(sales.totalSections),
    intel: typeof sales.hasIntel === "boolean" ? sales.hasIntel : null,
    opportunities:
      typeof sales.hasOpportunities === "boolean"
        ? sales.hasOpportunities
        : null,
    added: count(evolution.added),
    evolved: count(evolution.evolved),
    conflicts: count(evolution.conflicts),
    knowledgeIncomplete: !!data.knowledgeError,
  };
}

export type WebsiteAnalysisIssue =
  | "startUnconfirmed"
  | "failed"
  | "missing"
  | "unverified"
  | null;
export type WebsiteAnalysisDestination =
  | "pages"
  | "sections"
  | "conflicts"
  | "testing"
  | "settings";
export interface WebsiteAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: unknown | null;
  issue: WebsiteAnalysisIssue;
  pending: boolean;
  currentStep: string;
  progress: number;
  statusError: boolean;
  statusFetching: boolean;
  onReadStatus: () => void;
  onOpenDestination: (destination: WebsiteAnalysisDestination) => void;
}

export function WebsiteAnalysisDialog(props: WebsiteAnalysisDialogProps) {
  const { t, i18n } = useTranslation();
  const result =
    props.result == null ? null : readWebsiteAnalysisResult(props.result);
  const dir = i18n.dir();
  const display = (value: number | null) =>
    value === null ? "—" : new Intl.NumberFormat(i18n.language).format(value);
  const present = (value: boolean | null) =>
    value === null
      ? "—"
      : value
        ? t("websiteAnalysisUx.present")
        : t("websiteAnalysisUx.absent");
  const stages: Record<string, string> = {
    scraping: t("websiteAnalysisUx.scraping"),
    processing: t("websiteAnalysisUx.processing"),
    knowledge: t("websiteAnalysisUx.knowledge"),
    embedding: t("websiteAnalysisUx.embedding"),
  };
  const issues = {
    startUnconfirmed: t("websiteAnalysisUx.startUnconfirmed"),
    failed: t("websiteAnalysisUx.failed"),
    missing: t("websiteAnalysisUx.missing"),
    unverified: t("websiteAnalysisUx.unverified"),
  };
  const percent =
    Number.isFinite(props.progress) &&
    props.progress >= 0 &&
    props.progress <= 100
      ? props.progress
      : 0;
  const title = result
    ? t("websiteAnalysisUx.finished")
    : props.issue
      ? t("websiteAnalysisUx.needsReview")
      : t("websiteAnalysisUx.title");
  const open = (destination: WebsiteAnalysisDestination) => {
    props.onOpenChange(false);
    props.onOpenDestination(destination);
  };
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        dir={dir}
        closeLabel={t("websiteAnalysisUx.close")}
        className="sm:max-w-2xl max-h-[85vh] supports-[height:100dvh]:max-h-[85dvh] overflow-y-auto [&>[data-slot=dialog-close]]:right-auto [&>[data-slot=dialog-close]]:end-3"
      >
        <DialogHeader className="text-start sm:text-start pe-7">
          <DialogTitle className="flex items-center gap-2">
            <FileSearch
              className="size-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            {title}
          </DialogTitle>
          <DialogDescription>{t("websiteAnalysisUx.scope")}</DialogDescription>
        </DialogHeader>
        {props.issue && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-2"
          >
            <p className="font-medium">{issues[props.issue]}</p>
            <p className="text-sm text-muted-foreground">
              {t("websiteAnalysisUx.reviewBeforeRetry")}
            </p>
            {(props.issue === "startUnconfirmed" || props.issue === "unverified") && (
              <Button
                variant="outline"
                disabled={props.statusFetching}
                onClick={props.onReadStatus}
              >
                {t("websiteAnalysisUx.checkStatus")}
              </Button>
            )}
          </div>
        )}
        {!result && !props.issue && (
          <div
            className="rounded-xl border p-4 space-y-3"
            aria-busy={props.pending || props.statusFetching}
          >
            {props.statusError ? (
              <div role="alert" className="space-y-2">
                <p>{t("websiteAnalysisUx.statusError")}</p>
                <Button
                  variant="outline"
                  disabled={props.statusFetching}
                  onClick={props.onReadStatus}
                >
                  {t("websiteAnalysisUx.checkStatus")}
                </Button>
              </div>
            ) : (
              <>
                <p role="status" className="flex items-center gap-2">
                  <Loader2
                    className="size-4 motion-safe:animate-spin"
                    aria-hidden="true"
                  />
                  {props.pending
                    ? t("websiteAnalysisUx.requesting")
                    : stages[props.currentStep] ||
                      t("websiteAnalysisUx.waiting")}
                </p>
                <div
                  role="progressbar"
                  aria-label={t("websiteAnalysisUx.progress")}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent > 0 ? percent : undefined}
                  className="h-2 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {percent > 0
                    ? t("websiteAnalysisUx.reported", {
                        value: display(Math.round(percent)),
                      })
                    : t("websiteAnalysisUx.waiting")}
                </p>
              </>
            )}
            <p className="text-sm text-muted-foreground">
              {t("websiteAnalysisUx.backgroundHelp")}
            </p>
          </div>
        )}
        {result && (
          <div className="space-y-4">
            {result.title && (
              <p className="font-medium break-words" dir="auto">
                {result.title}
              </p>
            )}
            <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
              <p className="text-sm text-muted-foreground">
                {t("websiteAnalysisUx.siteScore")}
              </p>
              <p className="text-3xl font-semibold tabular-nums">
                <bdi dir="ltr">
                  {display(result.score)}
                  {result.score !== null && (
                    <span className="text-sm text-muted-foreground">
                      {" "}
                      / 100
                    </span>
                  )}
                </bdi>
              </p>
              <p className="text-sm text-muted-foreground">
                {t("websiteAnalysisUx.scoreHelp")}
              </p>
            </div>
            {result.knowledgeIncomplete && (
              <div
                role="alert"
                className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
              >
                <p className="flex items-center gap-2 font-medium">
                  <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
                  {t("websiteAnalysisUx.knowledgeIncomplete")}
                </p>
                <p className="text-sm mt-2">
                  {t("websiteAnalysisUx.partialHelp")}
                </p>
              </div>
            )}
            <section
              className="space-y-2"
              aria-label={t("websiteAnalysisUx.crawlTitle")}
            >
              <h3 className="font-semibold">
                {t("websiteAnalysisUx.crawlTitle")}
              </h3>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  [t("websiteAnalysisUx.discovered"), result.discovered],
                  [t("websiteAnalysisUx.attempted"), result.attempted],
                  [t("websiteAnalysisUx.read"), result.read],
                  [t("websiteAnalysisUx.mainWords"), result.mainWords],
                  [t("websiteAnalysisUx.totalWords"), result.totalWords],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg border p-3">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 text-lg font-semibold tabular-nums">
                      {display(value as number | null)}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="text-sm text-muted-foreground">
                {t("websiteAnalysisUx.crawlHelp")}
              </p>
            </section>
            <section
              className="space-y-2"
              aria-label={t("websiteAnalysisUx.knowledgeTitle")}
            >
              <h3 className="font-semibold">
                {t("websiteAnalysisUx.knowledgeTitle")}
              </h3>
              <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  [t("websiteAnalysisUx.added"), display(result.added)],
                  [t("websiteAnalysisUx.evolved"), display(result.evolved)],
                  [t("websiteAnalysisUx.conflicts"), display(result.conflicts)],
                  [t("websiteAnalysisUx.sections"), display(result.sections)],
                  [t("websiteAnalysisUx.intel"), present(result.intel)],
                  [
                    t("websiteAnalysisUx.opportunities"),
                    present(result.opportunities),
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border p-3">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="mt-1 font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-sm text-muted-foreground">
                {t("websiteAnalysisUx.snapshotHelp")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("websiteAnalysisUx.indexHelp")}
              </p>
            </section>
          </div>
        )}
        {(result || props.issue) && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => open("pages")}>
              {t("websiteAnalysisUx.openPages")}
            </Button>
            <Button variant="outline" onClick={() => open("sections")}>
              {t("websiteAnalysisUx.openSections")}
            </Button>
            <Button variant="outline" onClick={() => open("conflicts")}>
              {t("websiteAnalysisUx.openConflicts")}
            </Button>
            <Button variant="outline" onClick={() => open("testing")}>
              {t("websiteAnalysisUx.openTesting")}
            </Button>
            {props.issue && (
              <Button variant="outline" onClick={() => open("settings")}>
                {t("websiteAnalysisUx.openSettings")}
              </Button>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            {result || props.issue
              ? t("websiteAnalysisUx.close")
              : t("websiteAnalysisUx.background")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
