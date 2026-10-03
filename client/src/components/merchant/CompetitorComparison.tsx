import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { WorkspaceState, workspaceFailureKind } from "./WorkspaceState";
import {
  competitorComparisonOptions,
  competitorComparisonView,
} from "@shared/competitor-comparison";
import { competitorLabels } from "@/lib/competitor-workspace-labels";
import { competitorComparisonLabels } from "@/lib/competitor-comparison-labels";
type Pick = { id: number; name: string };
export function CompetitorComparison({
  actorId,
  merchantId,
}: {
  actorId: number;
  merchantId: number;
}) {
  const { t, i18n } = useTranslation(),
    c = competitorLabels(t),
    cc = competitorComparisonLabels(t),
    locale = i18n.language.startsWith("ar") ? "ar" : "en";
  const [source, setSource] = useState<"website" | "competitor">("website"),
    [query, setQuery] = useState(""),
    [draft, setDraft] = useState(""),
    [page, setPage] = useState(1);
  const [baseline, setBaseline] = useState<Pick | null>(null),
    [picked, setPicked] = useState<Pick[]>([]),
    [requested, setRequested] = useState<{
      analysisId: number;
      competitorIds: number[];
    } | null>(null);
  const selection = { source, query, page };
  const options = trpc.websiteAnalysis.competitorComparisonChoices.useQuery(
    selection,
    { retry: false, staleTime: 0, refetchOnMount: "always" }
  );
  const parsed = competitorComparisonOptions.safeParse(options.data);
  const choices =
    !options.error &&
    parsed.success &&
    parsed.data.actorId === actorId &&
    parsed.data.merchantId === merchantId &&
    JSON.stringify(parsed.data.selection) === JSON.stringify(selection) &&
    parsed.data.rows.every(r => r.status === "completed")
      ? parsed.data
      : null;
  const comparison = trpc.websiteAnalysis.competitorComparison.useQuery(
    requested || { analysisId: 1, competitorIds: [1] },
    {
      enabled: !!requested,
      retry: false,
      staleTime: 0,
      refetchOnMount: "always",
    }
  );
  const parsedView = competitorComparisonView.safeParse(comparison.data);
  const view =
    requested &&
    !comparison.error &&
    parsedView.success &&
    parsedView.data.actorId === actorId &&
    parsedView.data.merchantId === merchantId &&
    JSON.stringify(parsedView.data.selection) === JSON.stringify(requested)
      ? parsedView.data
      : null;
  const resultHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (view) resultHeading.current?.focus();
  }, [view?.revision]);
  const number = (n: number) =>
      n.toLocaleString(locale, { maximumFractionDigits: 2 }),
    date = (v: string | null) =>
      v
        ? new Intl.DateTimeFormat(locale, {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(v))
        : c.unknown;
  const select = (item: Pick, checked: boolean) => {
    setRequested(null);
    if (source === "website") {
      setBaseline(item);
      setSource("competitor");
      setQuery("");
      setDraft("");
      setPage(1);
    } else
      setPicked(old =>
        checked
          ? [...old.filter(r => r.id !== item.id), item].slice(0, 5)
          : old.filter(r => r.id !== item.id)
      );
  };
  return (
    <div className="cmp-comparison">
      <div className="cmp-selection-summary">
        <p>
          <strong>{cc.baseline}: </strong>
          {baseline?.name || cc.notSelected}
        </p>
        <p>
          <strong>{cc.selected}: </strong>
          {number(picked.length)} / 5
        </p>
        {!!picked.length && (
          <ul>
            {picked.map(item => (
              <li key={item.id}>
                <span>{item.name}</span>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPicked(old => old.filter(r => r.id !== item.id));
                    setRequested(null);
                  }}
                  aria-label={`${cc.unselect} ${item.name}`}
                >
                  {cc.unselect}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <details className="cmp-notes" open={!view}>
        <summary>{cc.choose}</summary>
        <div
          className="cmp-attempt-actions"
          role="group"
          aria-label={cc.choose}
        >
          {(["website", "competitor"] as const).map(value => (
            <Button
              key={value}
              variant={source === value ? "default" : "outline"}
              aria-pressed={source === value}
              onClick={() => {
                setSource(value);
                setQuery("");
                setDraft("");
                setPage(1);
              }}
            >
              {value === "website" ? cc.chooseBaseline : cc.chooseCompetitors}
            </Button>
          ))}
        </div>
        <form
          className="cmp-comparison-search"
          onSubmit={e => {
            e.preventDefault();
            setQuery(draft.trim());
            setPage(1);
          }}
        >
          <label htmlFor="competitor-comparison-search">{cc.search}</label>
          <input
            id="competitor-comparison-search"
            value={draft}
            maxLength={200}
            onChange={e => setDraft(e.target.value)}
          />
          <Button type="submit" variant="outline">
            {c.searchAction}
          </Button>
        </form>
        {options.isLoading ? (
          <WorkspaceState kind="loading" />
        ) : !choices ? (
          <WorkspaceState
            kind={workspaceFailureKind(options.error)}
            onRetry={() => void options.refetch()}
          />
        ) : (
          <>
            <p className="sc-muted">
              {c.matches}: {number(choices.matched)}
            </p>
            {!choices.rows.length ? (
              <p>{cc.noChoices}</p>
            ) : (
              <fieldset className="cmp-comparison-options">
                <legend>
                  {source === "website"
                    ? cc.chooseBaseline
                    : cc.chooseCompetitors}
                </legend>
                {choices.rows.map(item => {
                  const checked =
                    source === "website"
                      ? baseline?.id === item.id
                      : picked.some(r => r.id === item.id);
                  return (
                    <label key={item.id}>
                      <input
                        type={source === "website" ? "radio" : "checkbox"}
                        name="comparison-choice"
                        checked={checked}
                        disabled={
                          source === "competitor" &&
                          !checked &&
                          picked.length >= 5
                        }
                        onChange={e =>
                          select(
                            { id: item.id, name: item.name || `#${item.id}` },
                            e.target.checked
                          )
                        }
                      />
                      <span>
                        <strong>{item.name || `#${item.id}`}</strong>
                        <small>{date(item.analyzedAt || item.createdAt)}</small>
                      </span>
                    </label>
                  );
                })}
              </fieldset>
            )}
            {choices.pages > 1 && (
              <nav className="sc-pagination" aria-label={cc.choose}>
                <Button
                  variant="outline"
                  disabled={options.isFetching || choices.currentPage <= 1}
                  onClick={() => setPage(choices.currentPage - 1)}
                >
                  {c.previous}
                </Button>
                <span>
                  {number(choices.currentPage)} / {number(choices.pages)}
                </span>
                <Button
                  variant="outline"
                  disabled={
                    options.isFetching || choices.currentPage >= choices.pages
                  }
                  onClick={() => setPage(choices.currentPage + 1)}
                >
                  {c.next}
                </Button>
              </nav>
            )}
          </>
        )}
        <Button
          disabled={
            !baseline ||
            !picked.length ||
            options.isFetching ||
            comparison.isFetching
          }
          onClick={() => {
            if (baseline)
              setRequested({
                analysisId: baseline.id,
                competitorIds: picked.map(r => r.id),
              });
          }}
        >
          {cc.show}
        </Button>
      </details>
      {requested &&
        (comparison.isLoading ? (
          <WorkspaceState kind="loading" />
        ) : !view ? (
          <WorkspaceState
            kind={workspaceFailureKind(comparison.error)}
            onRetry={() => void comparison.refetch()}
          />
        ) : (
          <section className="cmp-comparison-result" aria-label={cc.result}>
            <h3 ref={resultHeading} tabIndex={-1}>
              {cc.result}
            </h3>
            <p>{cc.resultHelp}</p>
            <p>
              <strong>{cc.baseline}: </strong>
              {view.baseline.report.name ||
                `#${view.baseline.report.id}`} ·{" "}
              {date(
                view.baseline.report.analyzedAt ||
                  view.baseline.report.createdAt
              )}
            </p>
            <p className="sc-muted">{cc.noSales}</p>
            {view.competitors.map(item => (
              <article key={item.report.id} className="cmp-comparison-report">
                <h4>{item.report.name}</h4>
                <p className="sc-muted">
                  {date(item.report.analyzedAt || item.report.createdAt)}
                </p>
                {view.baseline.report.excludedProducts +
                  item.report.excludedProducts >
                  0 && (
                  <p>
                    {c.excluded}:{" "}
                    {number(
                      view.baseline.report.excludedProducts +
                        item.report.excludedProducts
                    )}
                  </p>
                )}
                <dl className="cmp-comparison-metrics">
                  {item.differences.map(metric => (
                    <div key={metric.metric}>
                      <dt>{c[metric.metric]}</dt>
                      <dd>
                        <span>
                          {cc.yours}:{" "}
                          {metric.baseline === null ? (
                            c.unknown
                          ) : (
                            <bdi>{number(metric.baseline)}</bdi>
                          )}
                        </span>
                        <span>
                          {cc.theirs}:{" "}
                          {metric.competitor === null ? (
                            c.unknown
                          ) : (
                            <bdi>{number(metric.competitor)}</bdi>
                          )}
                        </span>
                        <strong>
                          {cc.difference}:{" "}
                          {metric.difference === null ? (
                            c.unknown
                          ) : (
                            <bdi>
                              {metric.difference > 0 ? "+" : ""}
                              {number(metric.difference)}
                            </bdi>
                          )}
                        </strong>
                      </dd>
                    </div>
                  ))}
                </dl>
                <details className="cmp-notes">
                  <summary>{cc.prices}</summary>
                  <p>{cc.priceHelp}</p>
                  {[
                    { label: cc.yours, ...view.baseline },
                    { label: cc.theirs, ...item },
                  ].map(profile => (
                    <section key={profile.label} className="cmp-section">
                      <h4>{profile.label}</h4>
                      <p>
                        {c.products}: {number(profile.report.products)} ·{" "}
                        {c.unverified}:{" "}
                        {number(profile.pricing.unverifiedCount)}
                      </p>
                      {!profile.pricing.groups.length ? (
                        <p>{c.unknown}</p>
                      ) : (
                        profile.pricing.groups.map(group => (
                          <div className="cmp-currency" key={group.currency}>
                            <strong>
                              {group.currency} · {number(group.count)}
                            </strong>
                            <dl className="cmp-facts">
                              <div>
                                <dt>{c.minimum}</dt>
                                <dd>
                                  <bdi>{number(Number(group.minimum))}</bdi>
                                </dd>
                              </div>
                              <div>
                                <dt>{c.maximum}</dt>
                                <dd>
                                  <bdi>{number(Number(group.maximum))}</bdi>
                                </dd>
                              </div>
                              <div>
                                <dt>{c.average}</dt>
                                <dd>
                                  <bdi>{number(Number(group.average))}</bdi>
                                </dd>
                              </div>
                            </dl>
                          </div>
                        ))
                      )}
                    </section>
                  ))}
                </details>
              </article>
            ))}
            <Button
              variant="outline"
              disabled={comparison.isFetching}
              onClick={() => void comparison.refetch()}
            >
              {c.refresh}
            </Button>
          </section>
        ))}
    </div>
  );
}
