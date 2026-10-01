import { useTranslation } from "react-i18next";
import { RefreshCw, Files, Package, Globe, HelpCircle, BookOpen, Settings } from "lucide-react";
import { knowledgeSourceGroups } from "@shared/knowledge-source-groups";
import type { KnowledgeRemovalTarget } from "@shared/knowledge-source-removal";
import { trpc } from "@/lib/trpc";
import { KnowledgeWorkspaceScope } from "./KnowledgeWorkspaceScope";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "./ui/card";
import { Button } from "./ui/button";

export type KnowledgeGroupDestination = "documents" | "products" | "pages" | "faqs" | "sections" | "settings";
type Actions = {
  onManage: (destination: KnowledgeGroupDestination) => void;
  onRemove: (target: KnowledgeRemovalTarget) => void;
  onUpload: () => void;
};
export function KnowledgeSourceGroupsWorkspace(props: Actions & { active: boolean }) {
  return <KnowledgeWorkspaceScope slot="knowledge-source-groups">{key => <SourceGroups key={key} merchantId={Number(key.split(":")[1])} {...props} />}</KnowledgeWorkspaceScope>;
}
function SourceGroups({ active, merchantId, ...actions }: Actions & { active: boolean; merchantId: number }) {
  const query = trpc.sariBrain.getSources.useQuery(undefined, { enabled: active, retry: false, staleTime: 0 });
  return <KnowledgeSourceGroupsView {...actions} merchantId={merchantId} data={query.data}
    loading={query.isLoading || query.isFetching || !query.isFetchedAfterMount} error={query.isError}
    onRefresh={() => void query.refetch()} />;
}
export function KnowledgeSourceGroupsView({ merchantId, data, loading, error, onRefresh, onManage, onRemove, onUpload }: Actions & {
  merchantId: number; data: unknown; loading: boolean; error: boolean; onRefresh: () => void;
}) {
  const { t, i18n } = useTranslation();
  const parsed = knowledgeSourceGroups.safeParse(data);
  const value = !loading && !error && parsed.success && parsed.data.merchantId === merchantId ? parsed.data : null;
  const format = (value: string | null) => value ? new Intl.DateTimeFormat(i18n.language === "ar" ? "ar-SA" : "en-US", {
    calendar: "gregory", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(value)) : t("knowledgeGroupsUx.dateUnknown");
  const number = (count: number) => new Intl.NumberFormat(i18n.language).format(count);
  const groups = value ? [
    { key: "documents" as const, icon: Files, title: t("knowledgeGroupsUx.documents"), total: value.documents.total,
      note: t("knowledgeGroupsUx.documentsNote"), action: t("knowledgeGroupsUx.openDocuments"),
      stats: [[t("knowledgeGroupsUx.textReady"), value.documents.textReady], [t("knowledgeGroupsUx.emptyText"), value.documents.empty], [t("knowledgeGroupsUx.pending"), value.documents.pending], [t("knowledgeGroupsUx.processing"), value.documents.processing], [t("knowledgeGroupsUx.failed"), value.documents.failed]] as const,
      dates: [[t("knowledgeGroupsUx.latestUpload"), value.documents.latestUploadedAt]] as const,
      removal: value.documents.removalAnchorId ? {kind:"document",sourceId:value.documents.removalAnchorId} as KnowledgeRemovalTarget : null },
    { key: "products" as const, icon: Package, title: t("knowledgeGroupsUx.products"), total: value.products.total,
      note: t("knowledgeGroupsUx.productsNote"), action: t("knowledgeGroupsUx.openProducts"),
      stats: [[t("knowledgeGroupsUx.visible"),value.products.visible], [t("knowledgeGroupsUx.activeVisible"),value.products.activeVisible], [t("knowledgeGroupsUx.hidden"), value.products.total-value.products.visible]] as const,
      dates: [[t("knowledgeGroupsUx.latestChange"),value.products.latestModifiedAt]] as const,
      removal: value.products.total ? {kind:"products"} as KnowledgeRemovalTarget : null },
    { key: "pages" as const, icon: Globe, title: t("knowledgeGroupsUx.website"), total: value.website.pages,
      note: t("knowledgeGroupsUx.websiteNote"), action: t("knowledgeGroupsUx.openPages"),
      stats: [[t("knowledgeGroupsUx.analyses"),value.website.analyses], [t("knowledgeGroupsUx.enabledPages"),value.website.enabledPages], [t("knowledgeGroupsUx.pagesText"),value.website.pagesWithText]] as const,
      dates: [[t("knowledgeGroupsUx.latestAnalysis"),value.website.latestAnalysisAt], [t("knowledgeGroupsUx.latestPageChange"),value.website.latestPageUpdateAt]] as const,
      removal: value.website.removalAnchorId ? {kind:"website",sourceId:value.website.removalAnchorId} as KnowledgeRemovalTarget : null },
    { key: "faqs" as const, icon: HelpCircle, title: t("knowledgeGroupsUx.faqs"), total: value.faqs.total,
      note: t("knowledgeGroupsUx.faqsNote"), action: t("knowledgeGroupsUx.openFaqs"),
      stats: [[t("knowledgeGroupsUx.enabledFaqs"),value.faqs.enabled], [t("knowledgeGroupsUx.archived"),value.faqs.archived]] as const,
      dates: [[t("knowledgeGroupsUx.latestChange"),value.faqs.latestModifiedAt]] as const,
      removal: value.faqs.total ? {kind:"faqs"} as KnowledgeRemovalTarget : null },
    { key: "sections" as const, icon: BookOpen, title: t("knowledgeGroupsUx.sections"), total: value.sections.total,
      note: t("knowledgeGroupsUx.sectionsNote"), action: t("knowledgeGroupsUx.openSections"),
      stats: [[t("knowledgeGroupsUx.switchedOn"),value.sections.switchedOn]] as const,
      dates: [[t("knowledgeGroupsUx.latestChange"),value.sections.latestModifiedAt]] as const, removal: null },
    { key: "settings" as const, icon: Settings, title: t("knowledgeGroupsUx.settings"), total: null,
      note: t("knowledgeGroupsUx.settingsNote"), action: t("knowledgeGroupsUx.openSettings"), stats: [],
      dates: [[t("knowledgeGroupsUx.accountCreated"),value.settings.createdAt], [t("knowledgeGroupsUx.accountModified"),value.settings.modifiedAt]] as const, removal: null },
  ] : [];
  return <Card>
    <CardHeader className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><CardTitle>{t("knowledgeGroupsUx.title")}</CardTitle>
        <Button variant="outline" disabled={loading && !error} onClick={onRefresh}><RefreshCw className="h-4 w-4 me-2" />{t("knowledgeGroupsUx.refresh")}</Button></div>
      <CardDescription>{t("knowledgeGroupsUx.description")}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {error || (!loading && !value) ? <div role="alert" className="space-y-3 rounded-xl border p-4"><p>{t("knowledgeGroupsUx.error")}</p><Button variant="outline" onClick={onRefresh}>{t("knowledgeGroupsUx.retry")}</Button></div>
        : loading ? <p role="status">{t("knowledgeGroupsUx.loading")}</p>
        : <>
          <div className="grid gap-4 lg:grid-cols-2">
            {groups.map(group => <section key={group.key} aria-labelledby={`knowledge-group-${group.key}`} className="min-w-0 rounded-xl border p-4 sm:p-5 flex flex-col gap-4">
              <div className="flex items-start gap-3"><group.icon aria-hidden="true" className="h-5 w-5 shrink-0 text-primary mt-1" /><div className="min-w-0 flex-1"><h3 id={`knowledge-group-${group.key}`} className="font-semibold">{group.title}</h3>
                {group.total !== null ? <p className="mt-1 text-lg font-semibold">{t(group.key === "pages" ? "knowledgeGroupsUx.pageCount" : "knowledgeGroupsUx.storedCount", { count: group.total, formatted: number(group.total) })}</p> : <p className="mt-1 break-words [overflow-wrap:anywhere]">{value!.businessName}</p>}</div></div>
              <p className="text-sm text-muted-foreground">{group.note}</p>
              {group.stats.length > 0 && <dl className="grid grid-cols-2 gap-3 text-sm">{group.stats.map(([label,count]) => <div key={label} className="min-w-0 rounded-lg bg-muted/50 p-3"><dt className="text-muted-foreground">{label}</dt><dd className="font-semibold mt-1">{number(count)}</dd></div>)}</dl>}
              <dl className="space-y-2 text-xs text-muted-foreground">{group.dates.map(([label,date]) => <div key={label}><dt>{label}</dt><dd className="mt-1 break-words">{date ? <time dateTime={date}>{format(date)}</time> : format(null)}</dd></div>)}</dl>
              {group.key === "pages" && value!.website.pages > 0 && !group.removal && <p className="text-sm">{t("knowledgeGroupsUx.pagesOnly")}</p>}
              <div className="mt-auto flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => onManage(group.key)}>{group.action}</Button>
                {group.key === "documents" && <Button type="button" onClick={onUpload}>{t("knowledgeGroupsUx.upload")}</Button>}
                {group.removal && <Button type="button" variant="ghost" aria-label={t("knowledgeGroupsUx.removeNamed",{name:group.title})} onClick={() => onRemove(group.removal!)}>{t("knowledgeGroupsUx.remove")}</Button>}
              </div>
            </section>)}
          </div>
          <p className="text-xs text-muted-foreground">{t("knowledgeGroupsUx.scope")}</p>
        </>}
    </CardContent>
  </Card>;
}
