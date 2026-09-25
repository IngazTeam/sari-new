import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { inferRouterInputs } from '@trpc/server';
import type { AppRouter } from '../../../server/routers';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';

type Cursor = NonNullable<inferRouterInputs<AppRouter>['sariBrain']['getLearningPolicyEvaluationHistory']['cursor']>;
const options = { retry: false, refetchOnWindowFocus: false, staleTime: 0 } as const;
function Disclosure({ title, kind, children }: { title: string; kind: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  return <details className="min-w-0 rounded-lg border p-3" data-policy-archive={kind} onToggle={event => { if (event.currentTarget.open) setMounted(true); }}>
    <summary className="min-h-11 cursor-pointer py-2 font-semibold">{title}</summary>{mounted && children}
  </details>;
}
function Frame({ query, active, page, next, back, reset, children }: {
  query: { isLoading: boolean; isError: boolean; isFetching: boolean; refetch: () => unknown }; active: boolean;
  page: number; next?: () => void; back?: () => void; reset: () => void; children: ReactNode;
}) {
  const { t } = useTranslation(), heading = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (!query.isLoading && !query.isFetching && page > 1) heading.current?.focus(); }, [page, query.isLoading, query.isFetching]);
  const navigation = () => <div className="flex flex-wrap gap-2" role="group" aria-label={t('merchantUx.policyEvaluation.archiveNavigation')}>
    <Button type="button" variant="outline" className="min-h-11" data-history-back disabled={!active || query.isFetching || !back} onClick={back}>{t('merchantUx.policyEvaluation.archivePrevious')}</Button>
    <Button type="button" variant="outline" className="min-h-11" data-history-next disabled={!active || query.isFetching || query.isError || !next} onClick={next}>{t('merchantUx.policyEvaluation.archiveNext')}</Button></div>;
  return <div className="min-w-0 space-y-3 pt-3 [overflow-wrap:anywhere]" aria-busy={query.isFetching}>
    <p className="text-xs text-muted-foreground">{t('merchantUx.policyEvaluation.archiveScope')}</p>
    <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="min-h-11 h-auto whitespace-normal" data-history-reset disabled={!active || query.isFetching} onClick={reset}>{t('merchantUx.policyEvaluation.archiveRefresh')}</Button>
      {query.isError && <Button type="button" variant="outline" className="min-h-11 h-auto whitespace-normal" data-history-retry disabled={!active || query.isFetching} onClick={() => void query.refetch()}>{t('merchantUx.policyEvaluation.refresh')}</Button>}</div>
    <p ref={heading} tabIndex={-1} className="focus-visible:outline" data-history-page aria-live="polite">{t('merchantUx.policyEvaluation.archivePage', { page })}</p>
    {navigation()}
    {query.isLoading && <p role="status">{t('merchantUx.policyEvaluation.loading')}</p>}
    {query.isError && <p role="alert" data-history-error>{t('merchantUx.policyEvaluation.archiveFailed')}</p>}
    {!query.isLoading && !query.isError && children}
    {navigation()}
  </div>;
}
function usePages() {
  const [positions, setPositions] = useState<Array<Cursor | null>>([null]);
  return { positions, cursor: positions.at(-1)!, next: (cursor: Cursor, first: Cursor | null) => setPositions(old => [...(old.length === 1 && old[0] === null ? [first] : old), cursor]),
    back: () => setPositions(old => old.slice(0, -1)), reset: () => setPositions([null]) };
}
function useDate() {
  const { t, i18n } = useTranslation();
  return (value: unknown) => { const date = new Date(String(value)); return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(i18n.language.startsWith('ar') ? 'ar-SA' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : t('merchantUx.policyReview.unknown'); };
}
export function LearningPolicyRunArchive({ proposalId, active, onSelect }: { proposalId: number; active: boolean; onSelect: (id: number) => void }) {
  const { t } = useTranslation();
  return <Disclosure title={t('merchantUx.policyEvaluation.archiveRuns')} kind="runs"><RunPages key={proposalId} proposalId={proposalId} active={active} onSelect={onSelect} /></Disclosure>;
}
function RunPages({ proposalId, active, onSelect }: { proposalId: number; active: boolean; onSelect: (id: number) => void }) {
  const { t } = useTranslation(), date = useDate(), pages = usePages();
  const query = trpc.sariBrain.getLearningPolicyEvaluationHistory.useQuery({ proposalId, cursor: pages.cursor }, options);
  const states: Record<string, string> = { running: t('merchantUx.policyEvaluation.running'), completed: t('merchantUx.policyEvaluation.completed'), cancelled: t('merchantUx.policyEvaluation.cancelled'), halted: t('merchantUx.policyEvaluation.halted') };
  return <Frame query={query} active={active} page={pages.positions.length}
    next={query.data?.nextCursor ? () => pages.next(query.data!.nextCursor!, query.data!.pageCursor) : undefined} back={pages.positions.length > 1 ? pages.back : undefined}
    reset={() => { pages.reset(); if (!pages.cursor) void query.refetch(); }}>
    {!query.data?.items.length && <p>{t('merchantUx.policyEvaluation.archiveEmpty')}</p>}
    {query.data?.items.map(row => <article key={row.runId} className="min-w-0 space-y-2 rounded-md border p-3" data-history-run={row.runId}>
      <p className="font-semibold">{t('merchantUx.policyEvaluation.run', { id: row.runId })} · {t('merchantUx.policyEvaluation.archiveVersion', { version: row.candidateVersion })}</p>
      <p>{states[row.state] || t('merchantUx.policyEvaluation.unsupported')}</p><p dir="auto">{row.provider === 'openai' ? 'OpenAI' : row.provider === 'zahypi' ? 'ZahyPi' : t('merchantUx.policyReview.unknown')} · {row.model}</p><p className="text-xs text-muted-foreground">{date(row.createdAt)}</p>
      <Button type="button" variant="outline" className="min-h-11 h-auto whitespace-normal" data-history-select={row.runId} disabled={!active || query.isFetching} onClick={event => { if (active && !query.isFetching) {
        const archive = event.currentTarget.closest<HTMLDetailsElement>('details[data-policy-archive="runs"]'); if (archive) archive.open = false;
        onSelect(row.runId);
      } }}>{t('merchantUx.policyEvaluation.archiveSelect')}</Button>
    </article>)}
  </Frame>;
}
export function LearningPolicyReviewArchive({ runId, active }: { runId: number; active: boolean }) {
  const { t } = useTranslation();
  return <Disclosure title={t('merchantUx.policyEvaluation.archiveReviews')} kind="reviews"><ReviewPages key={runId} runId={runId} active={active} /></Disclosure>;
}
function ReviewPages({ runId, active }: { runId: number; active: boolean }) {
  const { t } = useTranslation(), date = useDate(), pages = usePages(), [selected, setSelected] = useState<number | null>(null);
  const query = trpc.sariBrain.getLearningPolicyOutputReviewHistory.useQuery({ runId, cursor: pages.cursor }, options);
  const outcomes: Record<string, string> = { passed: t('merchantUx.policyEvaluation.passed'), failed: t('merchantUx.policyEvaluation.rejected'), inconclusive: t('merchantUx.policyEvaluation.inconclusive') };
  const change = (fn: () => void) => { setSelected(null); fn(); };
  return <Frame query={query} active={active} page={pages.positions.length}
    next={query.data?.nextCursor ? () => change(() => pages.next(query.data!.nextCursor!, query.data!.pageCursor)) : undefined} back={pages.positions.length > 1 ? () => change(pages.back) : undefined}
    reset={() => change(() => { pages.reset(); if (!pages.cursor) void query.refetch(); })}>
    {!query.data?.items.length && <p>{t('merchantUx.policyEvaluation.archiveEmpty')}</p>}
    {query.data?.items.map(row => <article key={row.id} className="min-w-0 space-y-2 rounded-md border p-3" data-history-review={row.id}>
      <p className="font-semibold">{t('merchantUx.policyReview.revision', { revision: row.revision })} · {outcomes[row.outcome]}</p>
      <p className="text-xs text-muted-foreground">{date(row.createdAt)} · {row.actorUserId ? t('merchantUx.policyReview.reviewer', { id: row.actorUserId }) : t('merchantUx.policyReview.removedReviewer')}</p>
      <p>{t('merchantUx.policyEvaluation.results', { passed: row.candidatePassed, total: row.totalCases, regressions: row.regressions })}</p>
      <Button type="button" variant="outline" className="min-h-11 h-auto whitespace-normal" data-history-record={row.id} disabled={!active || query.isFetching} onClick={() => setSelected(selected === row.id ? null : row.id)}>{selected === row.id ? t('merchantUx.policyEvaluation.archiveHide') : t('merchantUx.policyEvaluation.archiveRead')}</Button>
      {selected === row.id && <ReviewRecord key={row.id} runId={runId} reviewId={row.id} active={active} />}
    </article>)}
  </Frame>;
}
function ReviewRecord({ runId, reviewId, active }: { runId: number; reviewId: number; active: boolean }) {
  const { t } = useTranslation();
  const query = trpc.sariBrain.getLearningPolicyOutputReviewRecord.useQuery({ runId, reviewId }, options);
  const sectors: Record<string, string> = { general: t('merchantUx.policyEvaluation.general'), training: t('merchantUx.policyEvaluation.training'), recruitment: t('merchantUx.policyEvaluation.recruitment'), store: t('merchantUx.policyEvaluation.store') };
  const names: Record<string, string> = { need: t('merchantUx.policyReview.need'), comparison: t('merchantUx.policyReview.comparison'), price: t('merchantUx.policyReview.price'), consent: t('merchantUx.policyReview.consent'), refusal: t('merchantUx.policyReview.refusal'), truth: t('merchantUx.policyReview.truth'), handoff: t('merchantUx.policyReview.handoff'), injection: t('merchantUx.policyReview.injection') };
  const preferences: Record<string, string> = { baseline: t('merchantUx.policyEvaluation.preferBaseline'), candidate: t('merchantUx.policyEvaluation.preferCandidate'), tie: t('merchantUx.policyEvaluation.tie') };
  return <section className="min-w-0 space-y-3 border-t pt-3" data-history-detail aria-label={t('merchantUx.policyEvaluation.archiveRead')} aria-busy={query.isFetching}>
    {query.isLoading && <p role="status">{t('merchantUx.policyEvaluation.loading')}</p>}
    {query.isError && <p role="alert">{t('merchantUx.policyEvaluation.archiveFailed')}</p>}
    <Button type="button" variant="outline" className="min-h-11" data-history-detail-refresh disabled={!active || query.isFetching} onClick={() => void query.refetch()}>{t('merchantUx.policyEvaluation.refresh')}</Button>
    {!query.isError && query.data && <><p className="text-xs text-muted-foreground">{t('merchantUx.policyEvaluation.archiveScope')}</p>
      {query.data.review.cases.map((item: any) => <details key={item.caseId} className="min-w-0 rounded-md border p-3" data-history-case>
        <summary className="min-h-11 cursor-pointer py-2">{sectors[String(item.caseId).split(':')[0]]} · {names[String(item.caseId).split(':')[1]]}</summary>
        {(['baseline', 'candidate'] as const).map(arm => <div className="my-3 space-y-1" key={arm}><h6 className="font-semibold">{arm === 'baseline' ? t('merchantUx.policyEvaluation.baseline') : t('merchantUx.policyEvaluation.candidate')} · {item[arm].verdict === 'pass' ? t('merchantUx.policyEvaluation.pass') : t('merchantUx.policyEvaluation.fail')}</h6>
          <blockquote dir="auto" className="whitespace-pre-wrap">{String(item[arm].quote)}</blockquote><p dir="auto" className="whitespace-pre-wrap">{String(item[arm].reason)}</p></div>)}
        <p>{t('merchantUx.policyEvaluation.preference')}: {preferences[item.preference]}</p>
      </details>)}</>}
  </section>;
}
