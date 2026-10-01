import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Brain,
  CalendarClock,
  FileText,
  Gauge,
  Globe,
  Lightbulb,
  MessageCircle,
  PieChart,
  TestTube,
  Wallet,
} from "lucide-react";

export const analyticsHubGroups = [
  {
    id: "store",
    cards: [
      { id: "overview", path: "/merchant/overview-analytics", icon: PieChart },
      { id: "sales", path: "/merchant/analytics", icon: BarChart3 },
      { id: "performance", path: "/merchant/performance-metrics", icon: Gauge },
      { id: "reports", path: "/merchant/weekly-reports", icon: FileText },
    ],
  },
  {
    id: "assistant",
    cards: [
      {
        id: "messages",
        path: "/merchant/advanced-analytics",
        icon: MessageCircle,
      },
      { id: "insights", path: "/merchant/insights", icon: Lightbulb },
      { id: "tests", path: "/merchant/try-sari-analytics", icon: TestTube },
      { id: "brain", path: "/merchant/sari-brain", icon: Brain },
    ],
  },
  {
    id: "manage",
    cards: [
      { id: "usage", path: "/merchant/usage", icon: Wallet },
      {
        id: "schedule",
        path: "/merchant/scheduled-reports",
        icon: CalendarClock,
      },
      { id: "website", path: "/merchant/website-analysis", icon: Globe },
    ],
  },
] as const;

export default function AnalyticsHub() {
  const { t, i18n } = useTranslation(),
    labels: Record<string, string> = {
      eyebrow: t("analyticsHubUx.eyebrow"),
      title: t("analyticsHubUx.title"),
      intro: t("analyticsHubUx.intro"),
      openReports: t("analyticsHubUx.openReports"),
      footer: t("analyticsHubUx.footer"),
      allTools: t("analyticsHubUx.allTools"),
      "groups.store.title": t("analyticsHubUx.groups.store.title"),
      "groups.store.help": t("analyticsHubUx.groups.store.help"),
      "groups.assistant.title": t("analyticsHubUx.groups.assistant.title"),
      "groups.assistant.help": t("analyticsHubUx.groups.assistant.help"),
      "groups.manage.title": t("analyticsHubUx.groups.manage.title"),
      "groups.manage.help": t("analyticsHubUx.groups.manage.help"),
      "cards.overview.title": t("analyticsHubUx.cards.overview.title"),
      "cards.overview.help": t("analyticsHubUx.cards.overview.help"),
      "cards.sales.title": t("analyticsHubUx.cards.sales.title"),
      "cards.sales.help": t("analyticsHubUx.cards.sales.help"),
      "cards.reports.title": t("analyticsHubUx.cards.reports.title"),
      "cards.reports.help": t("analyticsHubUx.cards.reports.help"),
      "cards.messages.title": t("analyticsHubUx.cards.messages.title"),
      "cards.messages.help": t("analyticsHubUx.cards.messages.help"),
      "cards.performance.title": t("analyticsHubUx.cards.performance.title"),
      "cards.performance.help": t("analyticsHubUx.cards.performance.help"),
      "cards.insights.title": t("analyticsHubUx.cards.insights.title"),
      "cards.insights.help": t("analyticsHubUx.cards.insights.help"),
      "cards.tests.title": t("analyticsHubUx.cards.tests.title"),
      "cards.tests.help": t("analyticsHubUx.cards.tests.help"),
      "cards.brain.title": t("analyticsHubUx.cards.brain.title"),
      "cards.brain.help": t("analyticsHubUx.cards.brain.help"),
      "cards.usage.title": t("analyticsHubUx.cards.usage.title"),
      "cards.usage.help": t("analyticsHubUx.cards.usage.help"),
      "cards.schedule.title": t("analyticsHubUx.cards.schedule.title"),
      "cards.schedule.help": t("analyticsHubUx.cards.schedule.help"),
      "cards.website.title": t("analyticsHubUx.cards.website.title"),
      "cards.website.help": t("analyticsHubUx.cards.website.help"),
    },
    label = (key: string) => labels[key],
    rtl = i18n.language.startsWith("ar"),
    Arrow = rtl ? ArrowLeft : ArrowRight;
  return (
    <div
      className="mw-analytics-hub min-w-0 space-y-8"
      dir={rtl ? "rtl" : "ltr"}
    >
      <header className="mw-page-heading">
        <div>
          <p className="mw-eyebrow">{label("eyebrow")}</p>
          <h1>{label("title")}</h1>
          <p>{label("intro")}</p>
        </div>
        <Link className="mw-link" href="/merchant/reports">
          {label("openReports")}
          <Arrow aria-hidden="true" />
        </Link>
      </header>
      {analyticsHubGroups.map(group => (
        <section
          key={group.id}
          aria-labelledby={"analytics-group-" + group.id}
          className="space-y-4"
        >
          <div>
            <h2
              id={"analytics-group-" + group.id}
              className="text-lg font-semibold"
            >
              {label("groups." + group.id + ".title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {label("groups." + group.id + ".help")}
            </p>
          </div>
          <div className={group.cards.length === 3 ? "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" : "grid grid-cols-1 gap-4 md:grid-cols-2"}>
            {group.cards.map(card => (
              <Link
                key={card.id}
                href={card.path}
                className="group flex min-w-0 items-start gap-4 rounded-xl border bg-card p-5 text-start transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <card.icon className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">
                    {label("cards." + card.id + ".title")}
                  </h3>
                  <p className="mt-2 break-words text-sm leading-6 text-muted-foreground">
                    {label("cards." + card.id + ".help")}
                  </p>
                </div>
                <Arrow
                  className="mt-2 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>
        </section>
      ))}
      <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-4">
        <p className="text-sm text-muted-foreground">{label("footer")}</p>
        <Link className="mw-link" href="/merchant/tools">
          {label("allTools")}
          <Arrow aria-hidden="true" />
        </Link>
      </footer>
    </div>
  );
}
