import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { knowledgeCacheEpoch } from "@/lib/knowledge-workspace-cache";
import {
  customerListInput,
  customerListSchema,
  customerExportInput,
} from "@shared/customer-workspace";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import {
  CustomerPagination,
  CustomerSources,
  customerActivity,
  customerDate,
} from "./CustomerWorkspaceView";
import "@/styles/customer-workspace.css";

export function CustomerListWorkspace({
  scope,
  href = (p: string) => p,
}: {
  scope: string;
  href?: (path: string) => string;
}) {
  const { t, i18n } = useTranslation(),
    utils = trpc.useUtils(),
    language = i18n.language?.startsWith("en") ? "en" : "ar",
    locale = language === "en" ? "en-GB" : "ar-SA",
    merchantId = Number(scope.split(":")[1]);
  const [selection, setSelection] = useState(customerListInput.parse({})),
    [search, setSearch] = useState(""),
    [exporting, setExporting] = useState(false),
    [notice, setNotice] = useState("");
  const alive = useRef(true),
    epoch = useRef(knowledgeCacheEpoch()),
    exportLock = useRef(false),
    exportKey = useRef("");
  const query = trpc.customers.workspace.list.useQuery(selection, {
      staleTime: 0,
      refetchOnMount: "always",
      retry: false,
    }),
    parsed = customerListSchema.safeParse(query.data);
  const data =
    parsed.success &&
    parsed.data.merchantId === merchantId &&
    JSON.stringify(parsed.data.selection) === JSON.stringify(selection)
      ? parsed.data
      : null;
  const ready =
    !!data &&
    !query.error &&
    !query.isFetching &&
    !query.isLoading &&
    query.fetchStatus !== "paused";
  exportKey.current = ready
    ? JSON.stringify([scope, selection, language, query.dataUpdatedAt])
    : "";
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      exportKey.current = "";
    };
  }, []);
  useEffect(() => {
    setNotice("");
  }, [selection, language]);
  const activity = customerActivity(t);
  async function download() {
    if (!ready || !data?.canManage || exportLock.current) return;
    exportLock.current = true;
    setExporting(true);
    setNotice("");
    const key = exportKey.current;
    try {
      const input = customerExportInput.parse({
        search: selection.search,
        activity: selection.activity,
        language,
      });
      const result = await utils.customers.workspace.export.fetch(input, {
        staleTime: 0,
      });
      if (
        !alive.current ||
        epoch.current !== knowledgeCacheEpoch() ||
        key !== exportKey.current
      )
        return;
      if (
        result.merchantId !== merchantId ||
        JSON.stringify(result.selection) !== JSON.stringify(input) ||
        result.count < 0 ||
        result.count > result.limit
      )
        throw Error("Export snapshot mismatch");
      const url = URL.createObjectURL(
          new Blob([result.data], { type: result.mimeType })
        ),
        anchor = document.createElement("a");
      try {
        anchor.href = url;
        anchor.download = result.filename;
        document.body.appendChild(anchor);
        anchor.click();
      } finally {
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      setNotice(
        t("customerWorkspaceUx.exportStarted", { count: result.count })
      );
    } catch (error) {
      if (alive.current && key === exportKey.current)
        setNotice(
          t(
            (error as any)?.data?.code === "PRECONDITION_FAILED"
              ? "customerWorkspaceUx.exportLimit"
              : "customerWorkspaceUx.exportFailed"
          )
        );
    } finally {
      exportLock.current = false;
      if (alive.current) setExporting(false);
    }
  }
  return (
    <section className="cw-workspace" dir={language === "ar" ? "rtl" : "ltr"}>
      <header className="cw-header">
        <div>
          <h1>{t("customerWorkspaceUx.title")}</h1>
          <p>{t("customerWorkspaceUx.intro")}</p>
        </div>
        <div className="cw-actions">
          <button
            type="button"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {t("customerWorkspaceUx.refresh")}
          </button>
          <button
            type="button"
            className="cw-primary"
            disabled={!ready || !data?.canManage || exporting}
            onClick={() => void download()}
          >
            {t(
              exporting
                ? "customerWorkspaceUx.exporting"
                : "customerWorkspaceUx.export"
            )}
          </button>
        </div>
      </header>
      <form
        className="cw-filters"
        onSubmit={event => {
          event.preventDefault();
          setSelection({ ...selection, search: search.trim(), page: 1 });
        }}
      >
        <label className="cw-search">
          {t("customerWorkspaceUx.search")}
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            maxLength={120}
            type="search"
          />
        </label>
        <label>
          {t("customerWorkspaceUx.activity")}
          <select
            value={selection.activity}
            onChange={event =>
              setSelection({
                ...selection,
                activity: event.target.value as typeof selection.activity,
                page: 1,
              })
            }
          >
            <option value="all">{t("customerWorkspaceUx.all")}</option>
            {Object.entries(activity).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">{t("customerWorkspaceUx.searchAction")}</button>
        <button
          type="button"
          onClick={() => {
            setSearch("");
            setSelection(customerListInput.parse({}));
          }}
        >
          {t("customerWorkspaceUx.clear")}
        </button>
      </form>
      {notice && (
        <p className="cw-notice" role="status">
          {notice}
        </p>
      )}
      {!ready ? (
        <WorkspaceState
          inline
          kind={
            query.error
              ? workspaceFailureKind(query.error)
              : query.fetchStatus === "paused"
                ? "offline"
                : query.isFetching || query.isLoading
                  ? "loading"
                  : "error"
          }
          onRetry={
            query.isFetching ||
            query.isLoading ||
            (query.error &&
              !["error", "offline"].includes(workspaceFailureKind(query.error)))
              ? undefined
              : () => void query.refetch()
          }
        />
      ) : (
        <>
          <dl className="cw-summary">
            <div>
              <dt>{t("customerWorkspaceUx.total")}</dt>
              <dd>{data!.totals.all.toLocaleString(locale)}</dd>
            </div>
            <div>
              <dt>{t("customerWorkspaceUx.activeCount")}</dt>
              <dd>{data!.totals.active.toLocaleString(locale)}</dd>
            </div>
            <div>
              <dt>{t("customerWorkspaceUx.newMonth")}</dt>
              <dd>
                {data!.totals.firstRecordedThisMonth.toLocaleString(locale)}
              </dd>
            </div>
          </dl>
          <details className="cw-panel">
            <summary>{t("customerWorkspaceUx.method")}</summary>
            <p>{t("customerWorkspaceUx.methodBody")}</p>
            <p>
              {t("customerWorkspaceUx.excluded", {
                empty: data!.totals.excludedEmptyIdentifiers,
                invalid: data!.totals.excludedInvalidIdentifiers,
              })}
            </p>
            <p>{t("customerWorkspaceUx.exportNote")}</p>
            <p>
              {t("customerWorkspaceUx.snapshot", {
                time: customerDate(data!.through, locale),
              })}
            </p>
          </details>
          {!data!.canManage && <p>{t("customerWorkspaceUx.readOnly")}</p>}
          {!data!.rows.length ? (
            <div className="cw-panel">
              <h2>{t("customerWorkspaceUx.empty")}</h2>
              <p>{t("customerWorkspaceUx.emptyBody")}</p>
            </div>
          ) : (
            <ul className="cw-list">
              {data!.rows.map(row => (
                <li key={row.key}>
                  <div>
                    <h2>
                      <Link
                        href={href(
                          "/merchant/customers/" + encodeURIComponent(row.key)
                        )}
                      >
                        {row.name || t("customerWorkspaceUx.unnamed")}
                      </Link>
                    </h2>
                    <bdi>{row.key}</bdi>
                    <CustomerSources row={row} />
                  </div>
                  <dl>
                    <div>
                      <dt>{t("customerWorkspaceUx.conversations")}</dt>
                      <dd>{row.conversationCount}</dd>
                    </div>
                    <div>
                      <dt>{t("customerWorkspaceUx.orders")}</dt>
                      <dd>{row.orderCount}</dd>
                    </div>
                    <div>
                      <dt>{activity[row.activity]}</dt>
                      <dd>
                        {customerDate(row.lastInteractionAt, locale) ||
                          t("customerWorkspaceUx.notRecorded")}
                      </dd>
                    </div>
                  </dl>
                  <Link
                    className="cw-button"
                    href={href(
                      "/merchant/customers/" + encodeURIComponent(row.key)
                    )}
                  >
                    {t("customerWorkspaceUx.open")}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <CustomerPagination
            value={data!.pagination}
            onPage={page => setSelection({ ...selection, page })}
          />
        </>
      )}
    </section>
  );
}
