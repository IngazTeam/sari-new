import { useState } from 'react';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { WorkspaceState, workspaceFailureKind } from './WorkspaceState';
import { scopedScheduledHistory } from '@/lib/scheduled-workspace';
import type { ScheduledWorkspaceLabels } from '@/lib/scheduled-workspace-labels';
import type { ScheduledOccurrence } from '@shared/scheduled-message-evidence';
export function scheduledStamp(value: string | null, locale: string, zone: string | null, c: ScheduledWorkspaceLabels) {
  if (!value) return c.unknown;
  try { return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: zone ?? 'UTC' }).format(new Date(value)); } catch { return c.unknown; }
}
export function ScheduledOccurrenceView({ row, c, locale, zone }: { row: ScheduledOccurrence; c: ScheduledWorkspaceLabels; locale: string; zone: string | null }) {
  const status = { draft: c.campaignDraft, scheduled: c.campaignScheduled, sending: c.campaignSending, completed: c.campaignCompleted, failed: c.campaignFailed };
  return <article className="sm-occurrence">
    <h4>{c.runAt}: {scheduledStamp(row.dueAt, locale, zone, c)}</h4>
    {row.linkState !== 'verified' ? <p className="sc-muted">{row.linkState === 'missing' ? c.linkMissing : c.linkChanged}</p> : <>
      <p>{row.campaignState ? status[row.campaignState] : c.unknown}</p>
      <dl className="sm-facts">{[[c.recipients, row.recipients], [c.accepted, row.acceptedByProvider], [c.unconfirmed, row.unconfirmed], [c.needsAttention, row.needsReview]].map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{typeof value === 'number' ? value.toLocaleString(locale) : c.unknown}</dd></div>)}</dl>
      <Link className="sm-report" href={`/merchant/campaigns/${row.campaignId}/report`}>{c.report}</Link>
    </>}
    <p className="sc-muted">{c.expiresAt}: {scheduledStamp(row.expiresAt, locale, zone, c)}</p>
  </article>;
}
export function ScheduledMessageHistory({ actorId, merchantId, id, c, locale, zone }: { actorId: number; merchantId: number; id: number; c: ScheduledWorkspaceLabels; locale: string; zone: string | null }) {
  const [page, setPage] = useState(1);
  const query = trpc.scheduledMessages.history.useQuery({ id, page }, { retry: false, staleTime: 0, refetchOnMount: 'always' });
  const data = query.error ? null : scopedScheduledHistory(query.data, actorId, merchantId, id, page);
  return <section className="sm-history" aria-busy={query.isFetching}><div className="sm-history-heading"><h3>{c.history}</h3><Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>{c.refresh}</Button></div>
    <p className="sc-muted">{c.proofHelp}</p>
    {query.error ? <WorkspaceState inline kind={workspaceFailureKind(query.error)} onRetry={() => void query.refetch()} /> : !data ? <WorkspaceState inline kind={query.isFetching ? 'loading' : 'error'} onRetry={() => void query.refetch()} /> : <>
      {!data.rows.length ? <p>{c.noHistory}</p> : data.rows.map(row => <ScheduledOccurrenceView key={row.id} row={row} c={c} locale={locale} zone={zone} />)}
      {data.pages > 1 && <nav className="sc-pagination" aria-label={c.history}><Button variant="outline" disabled={query.isFetching || data.currentPage <= 1} onClick={() => setPage(data.currentPage - 1)}>{c.previous}</Button><span>{c.page} {data.currentPage.toLocaleString(locale)} {c.of} {data.pages.toLocaleString(locale)}</span><Button variant="outline" disabled={query.isFetching || data.currentPage >= data.pages} onClick={() => setPage(data.currentPage + 1)}>{c.next}</Button></nav>}
    </>}
  </section>;
}
