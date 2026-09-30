import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import type {
  SectionListItem,
  SectionReview,
} from "@shared/knowledge-sections";
import { KnowledgeWorkspaceScope } from "./KnowledgeWorkspaceScope";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

type Kind = "sales_intel" | "opportunities";
export type SalesSectionList = {
  items: SectionListItem[];
  page: number;
  totalPages: number;
  total: number;
};
export function SalesKnowledgeReadout({
  active,
  onManage,
}: {
  active: boolean;
  onManage: () => void;
}) {
  return (
    <KnowledgeWorkspaceScope slot="sales-knowledge-readout">
      {scope => (
        <div key={scope} className="space-y-5">
          <SalesKnowledgeGroup
            kind="sales_intel"
            active={active}
            onManage={onManage}
          />
          <SalesKnowledgeGroup
            kind="opportunities"
            active={active}
            onManage={onManage}
          />
        </div>
      )}
    </KnowledgeWorkspaceScope>
  );
}
function SalesKnowledgeGroup({
  kind,
  active,
  onManage,
}: {
  kind: Kind;
  active: boolean;
  onManage: () => void;
}) {
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<number | null>(null);
  const list = trpc.sariBrain.sectionWorkspace.useQuery(
    { type: kind, state: "all", search: "", page },
    { enabled: active, retry: false, staleTime: 0 }
  );
  const detail = trpc.sariBrain.sectionReview.useQuery(
    { id: selected ?? 1 },
    { enabled: active && selected !== null, retry: false, staleTime: 0 }
  );
  return (
    <SalesKnowledgeGroupView
      kind={kind}
      data={list.data}
      loading={list.isLoading || list.isFetching}
      error={list.isError}
      selected={selected}
      detail={detail.data}
      detailLoading={detail.isLoading || detail.isFetching}
      detailError={detail.isError}
      onPage={next => {
        setSelected(null);
        setPage(next);
      }}
      onOpen={setSelected}
      onRefresh={() => {
        setSelected(null);
        void list.refetch();
      }}
      onRefreshDetail={() => void detail.refetch()}
      onManage={onManage}
    />
  );
}
export function SalesKnowledgeGroupView({
  kind,
  data,
  loading,
  error,
  selected,
  detail,
  detailLoading,
  detailError,
  onPage,
  onOpen,
  onRefresh,
  onRefreshDetail,
  onManage,
}: {
  kind: Kind;
  data?: SalesSectionList;
  loading?: boolean;
  error?: boolean;
  selected: number | null;
  detail?: SectionReview;
  detailLoading?: boolean;
  detailError?: boolean;
  onPage: (page: number) => void;
  onOpen: (id: number | null) => void;
  onRefresh: () => void;
  onRefreshDetail: () => void;
  onManage: () => void;
}) {
  const { t, i18n } = useTranslation();
  const states = {
    eligible: t("salesKnowledgeUx.eligible"),
    unverified: t("salesKnowledgeUx.unverified"),
    pending: t("salesKnowledgeUx.pending"),
    paused: t("salesKnowledgeUx.paused"),
    expired: t("salesKnowledgeUx.expired"),
    excluded: t("salesKnowledgeUx.excluded"),
  };
  const sources = {
    website: t("salesKnowledgeUx.website"),
    document: t("salesKnowledgeUx.document"),
    manual: t("salesKnowledgeUx.manual"),
    ai_evolved: t("salesKnowledgeUx.aiEvolved"),
    byaan_sync: t("salesKnowledgeUx.byaan"),
  };
  const injection = {
    fact: t("salesKnowledgeUx.fact"),
    behavior: t("salesKnowledgeUx.behavior"),
    none: t("salesKnowledgeUx.none"),
  };
  const unknown = t("salesKnowledgeUx.unknown");
  return (
    <Card dir={i18n.dir()} className="min-w-0">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle>
            <h2>
              {t(
                kind === "sales_intel"
                  ? "salesKnowledgeUx.salesTitle"
                  : "salesKnowledgeUx.opportunitiesTitle"
              )}
            </h2>
          </CardTitle>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={loading}
            onClick={onRefresh}
          >
            {t("salesKnowledgeUx.refresh")}
          </Button>
        </div>
        <CardDescription className="leading-6">
          {t(
            kind === "sales_intel"
              ? "salesKnowledgeUx.salesHelp"
              : "salesKnowledgeUx.opportunitiesHelp"
          )}
        </CardDescription>
        <p className="text-sm text-muted-foreground leading-6">
          {t("salesKnowledgeUx.scope")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p role="alert">{t("salesKnowledgeUx.readError")}</p>
        ) : loading ? (
          <p role="status">{t("salesKnowledgeUx.loading")}</p>
        ) : !data ? (
          <p role="status">{t("salesKnowledgeUx.notLoaded")}</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {t("salesKnowledgeUx.count", { count: data.total })}
            </p>
            {!data.items.length ? (
              <p
                role="status"
                className="rounded-xl border border-dashed p-5 text-muted-foreground"
              >
                {t("salesKnowledgeUx.empty")}
              </p>
            ) : (
              <ul className="space-y-3">
                {data.items.map(row => {
                  const open = selected === row.id;
                  const confirmed =
                    detail?.section.id === row.id &&
                    detail.section.sectionType === kind;
                  const shown =
                    open && confirmed && !detailLoading && !detailError
                      ? detail!.section
                      : row;
                  return (
                    <li
                      key={row.id}
                      className="rounded-xl border p-4 space-y-3 min-w-0"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold [overflow-wrap:anywhere]">
                            {shown.title || t("salesKnowledgeUx.untitled")}
                          </h3>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t("salesKnowledgeUx.reference", { id: row.id })}
                          </p>
                        </div>
                        <Badge
                          variant="secondary"
                          className="whitespace-normal"
                        >
                          {states[shown.state] || unknown}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {t("salesKnowledgeUx.source", {
                          source:
                            sources[shown.source as keyof typeof sources] ||
                            unknown,
                        })}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 h-auto whitespace-normal"
                        aria-expanded={open}
                        aria-controls={`sales-section-${row.id}`}
                        onClick={() => onOpen(open ? null : row.id)}
                      >
                        {t(
                          open
                            ? "salesKnowledgeUx.close"
                            : "salesKnowledgeUx.open"
                        )}
                      </Button>
                      {open && (
                        <section
                          id={`sales-section-${row.id}`}
                          className="rounded-lg bg-muted/40 p-3 sm:p-4 space-y-3 min-w-0"
                          aria-label={t("salesKnowledgeUx.content")}
                        >
                          {detailLoading ? (
                            <p role="status">{t("salesKnowledgeUx.loading")}</p>
                          ) : detailError || !confirmed ? (
                            <div role="alert" className="space-y-3">
                              <p>{t("salesKnowledgeUx.detailError")}</p>
                              <Button
                                type="button"
                                variant="outline"
                                className="min-h-11"
                                onClick={onRefreshDetail}
                              >
                                {t("salesKnowledgeUx.retryDetail")}
                              </Button>
                            </div>
                          ) : (
                            <>
                              <p className="text-sm">
                                {t("salesKnowledgeUx.injection", {
                                  mode:
                                    injection[
                                      detail!.section
                                        .injectAs as keyof typeof injection
                                    ] || unknown,
                                })}
                              </p>
                              <p className="text-sm">
                                {t("salesKnowledgeUx.botFlag", {
                                  value: detail!.section.useInBot
                                    ? t("salesKnowledgeUx.on")
                                    : t("salesKnowledgeUx.off"),
                                })}
                              </p>
                              <p className="text-sm">
                                {t("salesKnowledgeUx.expiry", {
                                  value:
                                    detail!.section.validUntil ||
                                    t("salesKnowledgeUx.noExpiry"),
                                })}
                              </p>
                              {detail!.section.sourceUrl && (
                                <p className="text-sm [overflow-wrap:anywhere]">
                                  {t("salesKnowledgeUx.sourceReference")}{" "}
                                  <bdi>{detail!.section.sourceUrl}</bdi>
                                </p>
                              )}
                              <p
                                dir="auto"
                                className="whitespace-pre-wrap leading-7 [overflow-wrap:anywhere]"
                              >
                                {detail!.section.content ||
                                  t("salesKnowledgeUx.noContent")}
                              </p>
                              {detail!.section.summary && (
                                <details>
                                  <summary className="min-h-11 cursor-pointer">
                                    {t("salesKnowledgeUx.summary")}
                                  </summary>
                                  <p
                                    dir="auto"
                                    className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]"
                                  >
                                    {detail!.section.summary}
                                  </p>
                                </details>
                              )}
                            </>
                          )}
                        </section>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {data.totalPages > 1 && (
              <nav
                className="flex flex-wrap items-center justify-between gap-3"
                aria-label={t("salesKnowledgeUx.pagination")}
              >
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={data.page <= 1}
                  onClick={() => onPage(data.page - 1)}
                >
                  {t("salesKnowledgeUx.previous")}
                </Button>
                <span className="text-sm">
                  {t("salesKnowledgeUx.page", {
                    page: data.page,
                    total: data.totalPages,
                  })}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  disabled={data.page >= data.totalPages}
                  onClick={() => onPage(data.page + 1)}
                >
                  {t("salesKnowledgeUx.next")}
                </Button>
              </nav>
            )}
          </>
        )}
        <Button
          type="button"
          variant="outline"
          className="min-h-11 h-auto whitespace-normal"
          onClick={onManage}
        >
          {t("salesKnowledgeUx.manage")}
        </Button>
      </CardContent>
    </Card>
  );
}
