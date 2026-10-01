import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearch, useLocation } from "wouter";
import { ArrowLeft, ArrowRight, Plus } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { DashboardAnalytics } from "@/components/merchant/DashboardAnalytics";
import { AssistantScheduleStatus } from "@/components/merchant/AssistantScheduleStatus";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { TrialBanner } from "@/components/TrialBanner";
import { LearningEvidenceCard } from "@/components/LearningEvidenceCard";
import { QueryStateCard } from "@/components/QueryStateCard";
const freshRead = {
  staleTime: 0,
  refetchOnMount: "always" as const,
  retry: false,
};
function useLabels() {
  const { t, i18n } = useTranslation();
  return {
    label: (key: string, args: Record<string, unknown> = {}) =>
      t(`dashboardHomeUx.${key}`, args),
    i18n,
  };
}
function PanelError({ retry }: { retry: () => void }) {
  const { label } = useLabels();
  return (
    <div role="alert" className="mw-query-error">
      <p>{label("failed")}</p>
      <Button type="button" variant="outline" onClick={retry}>
        {label("retry")}
      </Button>
    </div>
  );
}
export default function MerchantDashboard() {
  const { label } = useLabels();
  const merchant = trpc.merchants.getCurrent.useQuery(undefined, freshRead);
  if (merchant.isLoading || merchant.isFetching) return <DashboardSkeleton />;
  if (merchant.isError || !merchant.data)
    return (
      <QueryStateCard
        kind="error"
        title={label("storeFailed")}
        description={label("storeHelp")}
        retryLabel={label("retry")}
        onRetry={() => void merchant.refetch()}
      />
    );
  return <DashboardContent key={merchant.data.id} merchant={merchant.data} />;
}
function DashboardContent({
  merchant,
}: {
  merchant: { id: number; businessName: string };
}) {
  const { label, i18n } = useLabels(),
    search = useSearch(),
    [, navigate] = useLocation();
  const requestedDays = Number(new URLSearchParams(search).get("days"));
  const days: 7 | 30 | 90 =
    requestedDays === 30 || requestedDays === 90 ? requestedDays : 7;
  const setDays = (value: string) => {
    const params = new URLSearchParams(search);
    params.set("days", value);
    navigate("/merchant/dashboard?" + params.toString());
  };
  const [quickOpen, setQuickOpen] = useState(false),
    [detailsOpen, setDetailsOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const onboarding = trpc.merchants.getOnboardingStatus.useQuery(
    undefined,
    freshRead
  );
  const summary = trpc.dashboard.workspace.useQuery({ days }, freshRead);
  const recent = trpc.conversations.listRecent.useQuery(
    { limit: 5 },
    freshRead
  );
  const count = trpc.conversations.count.useQuery(undefined, freshRead);
  const campaigns = trpc.campaigns.getStats.useQuery(undefined, freshRead);
  const reviews = trpc.reviews.getStats.useQuery(
    { merchantId: merchant.id },
    freshRead
  );
  const response = trpc.botSettings.shouldRespond.useQuery(
    undefined,
    freshRead
  );
  const onboardingStatus =
    !onboarding.isError && !onboarding.isFetching ? onboarding.data : undefined;
  const setupCompleted = onboardingStatus?.setupCompleted === true;
  const channelReady = onboardingStatus?.channelState === "connected";
  const locale = i18n.language.startsWith("ar") ? "ar-SA" : "en-GB",
    Arrow = i18n.dir() === "rtl" ? ArrowLeft : ArrowRight;
  const integer = (value: unknown) =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0
      ? value.toLocaleString(locale)
      : label("unavailable");
  const campaignsReady =
    !campaigns.isError && !campaigns.isFetching && campaigns.data;
  const reviewsReady = !reviews.isError && !reviews.isFetching && reviews.data;
  const reviewAverage =
    reviewsReady &&
    reviewsReady.totalReviews > 0 &&
    Number.isFinite(reviewsReady.averageRating) &&
    reviewsReady.averageRating >= 0 &&
    reviewsReady.averageRating <= 5
      ? reviewsReady.averageRating.toLocaleString(locale, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })
      : label("unavailable");
  return (
    <div className="mw-home" dir={i18n.dir()}>
      <header className="mw-page-heading">
        <div>
          <p className="mw-eyebrow">
            {new Date().toLocaleDateString(locale, {
              calendar: "gregory",
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
          <h1>{label("welcome", { name: merchant.businessName })}</h1>
          <p>{label("intro")}</p>
        </div>
        <div className="mw-page-actions">
          <label htmlFor="dashboard-period" className="sr-only">
            {label("period")}
          </label>
          <select
            id="dashboard-period"
            value={days}
            onChange={e => setDays(e.target.value)}
          >
            {[7, 30, 90].map(d => (
              <option key={d} value={d}>
                {label(d === 7 ? "week" : "days", { count: d })}
              </option>
            ))}
          </select>
          <Button ref={opener} onClick={() => setQuickOpen(true)}>
            <Plus aria-hidden="true" />
            {label("quick")}
          </Button>
        </div>
      </header>
      <TrialBanner />
      {onboarding.isFetching ? (
        <p role="status">{label("checkingSetup")}</p>
      ) : onboarding.isError || !onboardingStatus ? (
        <PanelError retry={() => void onboarding.refetch()} />
      ) : (
        !setupCompleted && (
          <section role="status" className="mw-attention">
            <div>
              <h2>{label("setup")}</h2>
              <p>{label("setupHelp")}</p>
            </div>
            <Link href="/merchant/setup-wizard" className="mw-link">
              {label("finishSetup")}
              <Arrow aria-hidden="true" />
            </Link>
          </section>
        )
      )}
      <section className="mw-attention" aria-label={label("next")}>
        <div>
          <h2>{label("next")}</h2>
          <p>{label("nextHelp")}</p>
        </div>
        <div className="mw-task-links">
          {[
            ["/merchant/conversations?needs_human=1", "human"],
            ["/merchant/products", "catalog"],
            ["/merchant/campaigns", "campaigns"],
          ].map(([path, text]) => (
            <Link href={path} key={path}>
              {label(text)}
              <Arrow aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
      <section className="mw-panel">
        <div className="mw-panel-header">
          <div>
            <h2>{label("brain")}</h2>
            <p>{label("brainHelp")}</p>
          </div>
        </div>
        <div className="mw-home-brain-links">
          {[
            ["overview", "results", "resultsHelp"],
            ["sources", "files", "filesHelp"],
            ["knowledge&pane=conflicts", "gaps", "gapsHelp"],
            ["sales", "sales", "salesHelp"],
          ].map(([view, title, help]) => (
            <Link key={view} href={"/merchant/sari-brain?view=" + view}>
              <strong>{label(title)}</strong>
              <span>{label(help)}</span>
              <Arrow aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
      <DashboardAnalytics
        merchantId={merchant.id}
        days={days}
        data={summary.data}
        loading={summary.isFetching}
        failed={summary.isError}
        onRetry={() => void summary.refetch()}
      />
      <div className="mw-home-grid">
        <section className="mw-panel space-y-4">
          <div className="mw-panel-header">
            <div>
              <h2>{label("assistant")}</h2>
              <p>{label("assistantHelp")}</p>
            </div>
            <Link href="/merchant/bot-settings" className="mw-link">
              {label("settings")}
            </Link>
          </div>
          <p role="status">
            {onboarding.isFetching
              ? label("checkingChannel")
              : !onboardingStatus
                ? label("unknownChannel")
                : channelReady
                  ? label("connected")
                  : label("notConnected")}
          </p>
          <AssistantScheduleStatus
            merchantId={merchant.id}
            data={response.data}
            loading={response.isFetching}
            failed={response.isError}
            onRefresh={() => void response.refetch()}
          />
          {count.isFetching ? (
            <p role="status">{label("loading")}</p>
          ) : count.isError || count.data === undefined ? (
            <PanelError retry={() => void count.refetch()} />
          ) : (
            <p>{label("conversationsCount", { count: integer(count.data) })}</p>
          )}
          <Button asChild>
            <Link href="/merchant/test-sari">{label("test")}</Link>
          </Button>
        </section>
        <section className="mw-panel">
          <div className="mw-panel-header">
            <div>
              <h2>{label("recent")}</h2>
              <p>{label("recentHelp")}</p>
            </div>
            <Link href="/merchant/conversations" className="mw-link">
              {label("allConversations")}
              <Arrow aria-hidden="true" />
            </Link>
          </div>
          {recent.isFetching ? (
            <p role="status">{label("loading")}</p>
          ) : recent.isError || !recent.data ? (
            <PanelError retry={() => void recent.refetch()} />
          ) : recent.data.length ? (
            <div className="mw-home-list">
              {recent.data.map(c => (
                <Link
                  key={c.id}
                  href={`/merchant/conversations?phone=${encodeURIComponent(c.customerPhone)}`}
                >
                  <div>
                    <p>{c.customerName || c.customerPhone}</p>
                    <small dir="ltr">{c.customerPhone}</small>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {label(
                      c.status === "active"
                        ? "active"
                        : c.status === "closed"
                          ? "closed"
                          : c.status === "archived"
                            ? "archived"
                            : "unknownStatus"
                    )}
                  </span>
                  <Arrow aria-hidden="true" className="h-4 w-4" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="mw-empty-inline">
              <p>{label("noConversations")}</p>
              <Link className="mw-link" href="/merchant/whatsapp-instances">
                {label("connect")}
              </Link>
            </div>
          )}
        </section>
      </div>
      <section className="mw-panel">
        <div className="mw-panel-header">
          <div>
            <h2>{label("relationships")}</h2>
            <p>{label("relationshipsHelp")}</p>
          </div>
        </div>
        <div className="mw-home-list">
          <Link href="/merchant/campaigns">
            <div>
              <p>{label("yourCampaigns")}</p>
              <small>{label("campaignsScope")}</small>
            </div>
            <strong>
              {campaigns.isFetching
                ? label("loading")
                : campaignsReady
                  ? integer(campaignsReady.totalCampaigns)
                  : label("unavailable")}
            </strong>
          </Link>
          <Link href="/merchant/reviews">
            <div>
              <p>{label("reviews")}</p>
              <small>
                {reviews.isFetching
                  ? label("loading")
                  : reviewsReady
                    ? reviewsReady.totalReviews
                      ? label("reviewsCount", {
                          count: integer(reviewsReady.totalReviews),
                        })
                      : label("noReviews")
                    : label("unavailable")}
              </small>
            </div>
            <strong>
              {reviews.isFetching ? label("loading") : reviewAverage}
            </strong>
          </Link>
        </div>
        {(campaigns.isError || reviews.isError) && (
          <PanelError
            retry={() => {
              void campaigns.refetch();
              void reviews.refetch();
            }}
          />
        )}
      </section>
      <details
        className="mw-panel"
        open={detailsOpen}
        onToggle={e => setDetailsOpen(e.currentTarget.open)}
      >
        <summary className="mw-detail-summary">{label("details")}</summary>
        {detailsOpen && <DashboardDetails />}
      </details>
      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent
          dir={i18n.dir()}
          closeLabel={label("close")}
          onCloseAutoFocus={e => {
            e.preventDefault();
            opener.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{label("quickTitle")}</DialogTitle>
            <DialogDescription>{label("quickHelp")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {[
              ["/merchant/conversations", "allConversations"],
              ["/merchant/products", "manageProducts"],
              ["/merchant/services/new", "newService"],
              ["/merchant/sales-hub", "newQuote"],
              ["/merchant/campaigns/new", "newCampaign"],
            ].map(([path, text]) => (
              <Button asChild variant="outline" key={path}>
                <Link href={path} onClick={() => setQuickOpen(false)}>
                  {label(text)}
                  <Arrow aria-hidden="true" />
                </Link>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
function DashboardDetails() {
  const { label, i18n } = useLabels();
  const [requested, setRequested] = useState(false);
  const sync = trpc.sariBrain.getIntegrationSyncStatus.useQuery(
    undefined,
    freshRead
  );
  // Generating suggestions may call a provider. Never start it merely by opening the dashboard.
  const insights = trpc.dashboard.getAiInsights.useQuery(undefined, {
    enabled: false,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const syncData = !sync.isError && !sync.isFetching ? sync.data : null;
  const syncDate = syncData?.lastSyncAt ? new Date(syncData.lastSyncAt) : null;
  const generate = () => {
    setRequested(true);
    void insights.refetch();
  };
  return (
    <div className="mt-5 space-y-5">
      <LearningEvidenceCard />
      <section className="space-y-3">
        <h2 className="font-semibold">{label("sync")}</h2>
        {sync.isFetching ? (
          <p role="status">{label("loading")}</p>
        ) : !syncData ? (
          <PanelError retry={() => void sync.refetch()} />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {syncDate && Number.isFinite(syncDate.getTime())
                ? label("lastSync", {
                    date: syncDate.toLocaleString(
                      i18n.language.startsWith("ar") ? "ar-SA" : "en-GB",
                      { dateStyle: "medium", timeStyle: "short" }
                    ),
                  })
                : label("noSyncTime")}
            </p>
            <p className="text-xs text-muted-foreground">
              {label("syncScope")}
            </p>
            {syncData.hasData && (
              <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
                {[
                  ["products", syncData.products],
                  ["faqs", syncData.faqs],
                  ["pages", syncData.discoveredPages],
                  ["sections", syncData.knowledgeSections],
                  ["customers", syncData.customers],
                ].map(([key, value]) => (
                  <div
                    className="rounded-lg border p-3 min-w-0"
                    key={String(key)}
                  >
                    <dt className="text-xs text-muted-foreground">
                      {label(String(key))}
                    </dt>
                    <dd className="mt-2 font-semibold">
                      {typeof value === "number" &&
                      Number.isSafeInteger(value) &&
                      value >= 0
                        ? value.toLocaleString(i18n.language)
                        : label("unavailable")}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        )}
        <Link className="mw-link" href="/merchant/sari-brain?view=sources">
          {label("manageKnowledge")}
        </Link>
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold">{label("suggestions")}</h2>
        <p className="text-sm text-muted-foreground">
          {label("suggestionsHelp")}
        </p>
        <Button
          variant="outline"
          onClick={generate}
          disabled={insights.isFetching}
        >
          {label(insights.isFetching ? "generating" : "generate")}
        </Button>
        {requested &&
          (insights.isFetching ? (
            <p role="status">{label("generating")}</p>
          ) : insights.isError || !insights.data ? (
            <PanelError retry={generate} />
          ) : insights.data.length ? (
            <div className="mw-tools-grid">
              {insights.data.map((insight, index) => (
                <article className="rounded-lg border p-4" key={index}>
                  <h3 className="text-sm font-semibold">{insight.title}</h3>
                  <p className="my-3 text-xs leading-6 text-muted-foreground">
                    {insight.body}
                  </p>
                  {insight.action?.href?.startsWith("/merchant/") &&
                    !/[\\\s]/.test(insight.action.href) && (
                      <Link className="mw-link" href={insight.action.href}>
                        {insight.action.label || label("more")}
                      </Link>
                    )}
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {label("noSuggestions")}
            </p>
          ))}
      </section>
    </div>
  );
}
