import {
  dashboardSourcesLabels,
  dashboardKnowledgeLabels,
} from "@/lib/dashboard-labels";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { dashboardSourcesSchema } from "@shared/dashboard-sources";
import { Button } from "@/components/ui/button";
export function DashboardSources({
  merchantId,
  data,
  loading,
  failed,
  onRefresh,
}: {
  merchantId: number;
  data: unknown;
  loading: boolean;
  failed: boolean;
  onRefresh: () => void;
}) {
  const { t, i18n } = useTranslation();
  const label = dashboardSourcesLabels(t),
    group = dashboardKnowledgeLabels(t);
  const parsed = dashboardSourcesSchema.safeParse(data);
  const snapshot =
    !loading &&
    !failed &&
    parsed.success &&
    parsed.data.merchantId === merchantId
      ? parsed.data
      : null;
  const locale = i18n.language.startsWith("ar") ? "ar-SA" : "en-GB";
  const number = (v: number) => v.toLocaleString(locale);
  const date = (value: string | null) =>
    value ? (
      <time dateTime={value}>
        {new Date(value).toLocaleString(locale, {
          calendar: "gregory",
          dateStyle: "medium",
          timeStyle: "short",
        })}
      </time>
    ) : (
      group("dateUnknown")
    );
  const groups = snapshot?.groups;
  return (
    <section className="space-y-4 min-w-0" aria-label={label("title")}>
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="font-semibold">{label("title")}</h2>
        <Button variant="outline" disabled={loading} onClick={onRefresh}>
          {label("refresh")}
        </Button>
      </div>
      {loading ? (
        <p role="status">{group("loading")}</p>
      ) : !snapshot ? (
        <div role="alert" className="space-y-3">
          <p>{group("error")}</p>
          <Button variant="outline" onClick={onRefresh}>
            {group("retry")}
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{label("scope")}</p>
          <p className="text-xs text-muted-foreground">
            {label("checked")} {date(snapshot.checkedAt)}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <section className="rounded-xl border p-4 space-y-3 min-w-0">
              <h3 className="font-semibold">
                {group("documents")} · {number(groups!.documents.total)}
              </h3>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {(
                  [
                    ["textReady", groups!.documents.textReady],
                    ["emptyText", groups!.documents.empty],
                    ["pending", groups!.documents.pending],
                    ["processing", groups!.documents.processing],
                    ["failed", groups!.documents.failed],
                  ] as const
                ).map(([key, value]) => (
                  <div key={String(key)}>
                    <dt className="text-xs text-muted-foreground">
                      {group(key)}
                    </dt>
                    <dd>{number(Number(value))}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-muted-foreground">
                {group("documentsNote")}
              </p>
              <p className="text-xs">
                {group("latestUpload")} ·{" "}
                {date(groups!.documents.latestUploadedAt)}
              </p>
              <Link
                className="mw-link"
                href="/merchant/sari-brain?view=sources"
              >
                {group("openDocuments")}
              </Link>
            </section>
            {(
              [
                {
                  key: "products",
                  total: groups!.products.total,
                  note: "productsNote",
                  metric: "activeVisible",
                  value: groups!.products.activeVisible,
                  path: "/merchant/products",
                  action: "openProducts",
                },
                {
                  key: "website",
                  total: groups!.website.pages,
                  note: "websiteNote",
                  metric: "enabledPages",
                  value: groups!.website.enabledPages,
                  path: "/merchant/sari-brain?view=knowledge&pane=pages",
                  action: "openPages",
                },
                {
                  key: "faqs",
                  total: groups!.faqs.total,
                  note: "faqsNote",
                  metric: "enabledFaqs",
                  value: groups!.faqs.enabled,
                  path: "/merchant/sari-brain?view=knowledge&pane=faq",
                  action: "openFaqs",
                },
                {
                  key: "sections",
                  total: groups!.sections.total,
                  note: "sectionsNote",
                  metric: "switchedOn",
                  value: groups!.sections.switchedOn,
                  path: "/merchant/sari-brain?view=knowledge&pane=sections",
                  action: "openSections",
                },
              ] as const
            ).map(item => (
              <section
                className="rounded-xl border p-4 space-y-3 min-w-0"
                key={item.key}
              >
                <h3 className="font-semibold">
                  {group(item.key)} · {number(item.total)}
                </h3>
                <p className="text-sm">
                  {group(item.metric)} · {number(item.value)}
                </p>
                <p className="text-xs text-muted-foreground leading-6">
                  {group(item.note)}
                </p>
                <Link className="mw-link" href={item.path}>
                  {group(item.action)}
                </Link>
              </section>
            ))}
            <section className="rounded-xl border p-4 space-y-3 min-w-0">
              <h3 className="font-semibold">{label(snapshot.audience.kind)}</h3>
              <p className="text-lg">{number(snapshot.audience.count)}</p>
              <p className="text-xs text-muted-foreground">
                {label(
                  snapshot.audience.kind === "trainees"
                    ? "traineesScope"
                    : "customersScope"
                )}
              </p>
              <Link href="/merchant/platform-integrations" className="mw-link">
                {label("integrations")}
              </Link>
            </section>
          </div>
          <section className="rounded-xl border p-4 space-y-3">
            <h3 className="font-semibold">{label("integration")}</h3>
            <p>
              {label(snapshot.integration.source)} ·{" "}
              {label(snapshot.integration.state)}
            </p>
            <p className="text-xs text-muted-foreground">
              {label("integrationScope")}
            </p>
            {snapshot.integration.records.length ? (
              <dl className="space-y-3 text-sm">
                {snapshot.integration.records.map(record => (
                  <div key={record.scope}>
                    <dt>{label(`sync_${record.scope}`)}</dt>
                    <dd>{date(record.at)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm">{label("noTime")}</p>
            )}
            <Link href="/merchant/platform-integrations" className="mw-link">
              {label("integrations")}
            </Link>
          </section>
        </>
      )}
    </section>
  );
}
