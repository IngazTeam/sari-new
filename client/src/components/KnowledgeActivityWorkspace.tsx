import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, RefreshCw } from "lucide-react";
import { knowledgeActivityPage } from "@shared/knowledge-activity";
import { trpc } from "@/lib/trpc";
import { KnowledgeWorkspaceScope } from "./KnowledgeWorkspaceScope";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";

export function KnowledgeActivityWorkspace({ active }: { active: boolean }) {
  return (
    <KnowledgeWorkspaceScope slot="knowledge-activity">
      {scopeKey => (
        <ActivitySource
          key={scopeKey}
          merchantId={Number(scopeKey.split(":")[1])}
          active={active}
        />
      )}
    </KnowledgeWorkspaceScope>
  );
}
function ActivitySource({
  merchantId,
  active,
}: {
  merchantId: number;
  active: boolean;
}) {
  const [filter, setFilter] = useState("all"),
    [page, setPage] = useState(1);
  const query = trpc.sariBrain.getActivityLog.useQuery(
    { page, pageSize: 10, actionType: filter },
    { enabled: active, retry: false, staleTime: 0 }
  );
  return (
    <KnowledgeActivityView
      merchantId={merchantId}
      data={query.data}
      loading={
        query.isLoading || query.isFetching || !query.isFetchedAfterMount
      }
      error={query.isError}
      filter={filter}
      onFilter={next => {
        setFilter(next);
        setPage(1);
      }}
      onPage={setPage}
      onRefresh={() => void query.refetch()}
    />
  );
}
export function KnowledgeActivityView({
  merchantId,
  data,
  loading,
  error,
  filter,
  onFilter,
  onPage,
  onRefresh,
}: {
  merchantId: number;
  data: unknown;
  loading: boolean;
  error: boolean;
  filter: string;
  onFilter: (next: string) => void;
  onPage: (next: number) => void;
  onRefresh: () => void;
}) {
  const { t, i18n } = useTranslation(),
    labels = useActivityLabels();
  const [custom, setCustom] = useState(""),
    [jump, setJump] = useState("");
  const parsed = knowledgeActivityPage.safeParse(data);
  const current =
    parsed.success &&
    parsed.data.merchantId === merchantId &&
    parsed.data.filter === (filter === "all" ? null : filter)
      ? parsed.data
      : null;
  const ready = !loading && !error && current !== null;
  const failed = error || (!loading && !current);
  const validJump =
    /^[1-9]\d*$/.test(jump) &&
    Number.isSafeInteger(Number(jump)) &&
    Number(jump) <= Math.min(current?.totalPages || 0, 100000);
  const types = Array.from(
    new Set([
      ...Object.keys(labels),
      ...(ready ? current.actionTypes : []),
      ...(filter !== "all" ? [filter] : []),
    ])
  );
  const actionLabel = (action: string) =>
    labels[action] || t("knowledgeActivityUx.otherType", { action });
  const stamp = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(i18n.language, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZoneName: "short",
        }).format(new Date(value))
      : t("knowledgeActivityUx.unknownDate");
  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {t("knowledgeActivityUx.title")}
            </CardTitle>
            <CardDescription>{t("knowledgeActivityUx.help")}</CardDescription>
          </div>
          <Button variant="outline" disabled={loading} onClick={onRefresh}>
            <RefreshCw className="h-4 w-4 me-2" />
            {t("knowledgeActivityUx.refresh")}
          </Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="knowledge-activity-filter">
            {t("knowledgeActivityUx.filter")}
          </Label>
          <select
            id="knowledge-activity-filter"
            className="w-full rounded-lg border bg-background p-3 text-base"
            value={filter}
            onChange={e => onFilter(e.target.value)}
          >
            <option value="all">{t("knowledgeActivityUx.all")}</option>
            {types.map(type => (
              <option value={type} key={type}>
                {actionLabel(type)}
              </option>
            ))}
          </select>
        </div>
        {filter !== "all" && (
          <Button
            className="self-start"
            variant="ghost"
            onClick={() => onFilter("all")}
          >
            {t("knowledgeActivityUx.clearFilter")}
          </Button>
        )}
        {ready && current.actionTypesTruncated && (
          <div className="rounded-xl border p-4 space-y-3">
            <p role="status" className="text-sm">
              {t("knowledgeActivityUx.typesLimit")}
            </p>
            <Label htmlFor="knowledge-activity-custom">
              {t("knowledgeActivityUx.customType")}
            </Label>
            <Input
              id="knowledge-activity-custom"
              value={custom}
              onChange={e => setCustom(e.target.value)}
              aria-invalid={custom.length > 100}
            />
            {custom.length > 100 && (
              <p role="alert" className="text-sm text-destructive">
                {t("knowledgeActivityUx.typeTooLong")}
              </p>
            )}
            <Button
              variant="outline"
              disabled={!custom || custom.length > 100}
              onClick={() => onFilter(custom)}
            >
              {t("knowledgeActivityUx.applyType")}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {failed ? (
          <div role="alert" className="rounded-xl border p-4 space-y-3">
            <p>{t("knowledgeActivityUx.error")}</p>
            <Button variant="outline" disabled={loading} onClick={onRefresh}>
              {t("knowledgeActivityUx.retry")}
            </Button>
          </div>
        ) : loading ? (
          <p role="status">{t("knowledgeActivityUx.loading")}</p>
        ) : ready ? (
          <>
            <p role="status" className="text-sm text-muted-foreground">
              {t("knowledgeActivityUx.total", { count: current.total })}
            </p>
            {current.items.length ? (
              <ol className="space-y-3">
                {current.items.map(item => (
                  <li
                    key={item.id}
                    className="min-w-0 rounded-xl border p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <Badge
                        variant="secondary"
                        className="whitespace-normal break-words [overflow-wrap:anywhere]"
                      >
                        {actionLabel(item.actionType)}
                      </Badge>
                      <time
                        className="text-xs text-muted-foreground"
                        dateTime={item.createdAt || undefined}
                      >
                        {stamp(item.createdAt)}
                      </time>
                    </div>
                    <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm leading-7">
                      {item.description ||
                        t("knowledgeActivityUx.noDescription")}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="rounded-xl border border-dashed p-6 text-center space-y-3">
                <p className="font-medium">
                  {filter === "all"
                    ? t("knowledgeActivityUx.empty")
                    : t("knowledgeActivityUx.noMatches")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("knowledgeActivityUx.emptyHelp")}
                </p>
              </div>
            )}
            {current.totalPages > 0 && (
              <nav
                aria-label={t("knowledgeActivityUx.pagination")}
                className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
              >
                <Button
                  variant="outline"
                  disabled={current.page <= 1}
                  onClick={() => onPage(current.page - 1)}
                >
                  {t("knowledgeActivityUx.previous")}
                </Button>
                <p className="text-sm">
                  {t("knowledgeActivityUx.page", {
                    page: current.page,
                    total: current.totalPages,
                  })}
                </p>
                <Button
                  variant="outline"
                  disabled={current.page >= current.totalPages}
                  onClick={() => onPage(current.page + 1)}
                >
                  {t("knowledgeActivityUx.next")}
                </Button>
              </nav>
            )}
            {current.totalPages > 1 && (
              <form
                className="space-y-2"
                onSubmit={e => {
                  e.preventDefault();
                  if (validJump) {
                    onPage(Number(jump));
                    setJump("");
                  }
                }}
              >
                <Label htmlFor="knowledge-activity-page">
                  {t("knowledgeActivityUx.jumpLabel")}
                </Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    id="knowledge-activity-page"
                    className="w-28"
                    inputMode="numeric"
                    value={jump}
                    aria-invalid={Boolean(jump) && !validJump}
                    placeholder={String(current.page)}
                    onChange={e => setJump(e.target.value)}
                  />
                  <Button type="submit" variant="outline" disabled={!validJump}>
                    {t("knowledgeActivityUx.jump")}
                  </Button>
                </div>
                {Boolean(jump) && !validJump && (
                  <p role="alert" className="text-sm text-destructive">
                    {t("knowledgeActivityUx.jumpError", {
                      total: Math.min(current.totalPages, 100000),
                    })}
                  </p>
                )}
              </form>
            )}
            <p className="text-xs text-muted-foreground">
              {t("knowledgeActivityUx.scope")}
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
function useActivityLabels(): Record<string, string> {
  const { t } = useTranslation();
  return {
    section_created: t("knowledgeActivityUx.section_created"),
    section_updated: t("knowledgeActivityUx.section_updated"),
    section_deleted: t("knowledgeActivityUx.section_deleted"),
    website_import_apply: t("knowledgeActivityUx.website_import_apply"),
    website_page_enable: t("knowledgeActivityUx.website_page_enable"),
    website_page_pause: t("knowledgeActivityUx.website_page_pause"),
    website_page_delete: t("knowledgeActivityUx.website_page_delete"),
    quotation_create_saved: t("knowledgeActivityUx.quotation_create_saved"),
    quotation_created: t("knowledgeActivityUx.quotation_created"),
    quotation_status_saved: t("knowledgeActivityUx.quotation_status_saved"),
    quotation_target_saved: t("knowledgeActivityUx.quotation_target_saved"),
    quotation_template_saved: t("knowledgeActivityUx.quotation_template_saved"),
    quotation_updated: t("knowledgeActivityUx.quotation_updated"),
    target_set: t("knowledgeActivityUx.target_set"),
    settings_changed: t("knowledgeActivityUx.settings_changed"),
    products_imported: t("knowledgeActivityUx.products_imported"),
    file_approved: t("knowledgeActivityUx.file_approved"),
    knowledge_ingested: t("knowledgeActivityUx.approved"),
    content_analyzed: t("knowledgeActivityUx.analyzed"),
    file_uploaded: t("knowledgeActivityUx.uploaded"),
    website_analyzed: t("knowledgeActivityUx.websiteAnalyzed"),
    document_deleted: t("knowledgeActivityUx.documentsDeleted"),
    products_deleted: t("knowledgeActivityUx.productsDeleted"),
    website_deleted: t("knowledgeActivityUx.websiteDeleted"),
    faqs_deleted: t("knowledgeActivityUx.faqsDeleted"),
    brain_reset: t("knowledgeActivityUx.reset"),
    faq_created: t("knowledgeActivityUx.faqCreated"),
    faq_updated: t("knowledgeActivityUx.faqUpdated"),
    faq_deleted: t("knowledgeActivityUx.faqDeleted"),
    conflict_reviewed: t("knowledgeActivityUx.conflictReviewed"),
    website_page_created: t("knowledgeActivityUx.pageCreated"),
    knowledge_intake_recovered: t("knowledgeActivityUx.intakeRecovered"),
    knowledge_document_failed: t("knowledgeActivityUx.documentFailed"),
    knowledge_document_uncertain: t("knowledgeActivityUx.documentUncertain"),
  };
}
