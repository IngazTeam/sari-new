import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { compatibleCohortInspection, compatibleCohortSourcePage, cohortSourceKey } from '@/lib/sales-cohort-inspection';
import type { CohortSource, CohortInspectionResult, ListSalesCohortSourcesInput } from '../../../shared/sales-cohort-inspection';
const options = { retry: false, refetchOnWindowFocus: false, staleTime: 0 } as const;
export function SalesCohortInspection({ protocolId, cohortDigest, active }: { protocolId: number; cohortDigest: string; active: boolean }) {
  const { t } = useTranslation(), id = useId(), [open, setOpen] = useState(false), [mounted, setMounted] = useState(false);
  return <div className="min-w-0 border-t pt-3"><Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" data-inspection-open aria-expanded={open} aria-controls={id} disabled={!active && !open}
    onClick={() => { setMounted(true); setOpen(value => !value); }}>{open ? t('merchantUx.cohortInspection.close') : t('merchantUx.cohortInspection.open')}</Button>
    <div id={id} hidden={!open}>{mounted && <InspectionPanel key={`${protocolId}:${cohortDigest}`} protocolId={protocolId} cohortDigest={cohortDigest} active={active && open} />}</div></div>;
}
function InspectionPanel({ protocolId, cohortDigest, active }: { protocolId: number; cohortDigest: string; active: boolean }) {
  const { t } = useTranslation(), id = useId(), heading = useRef<HTMLHeadingElement>(null);
  const [text, setText] = useState(''), [search, setSearch] = useState(''), [cursors, setCursors] = useState<Array<number | undefined>>([undefined]);
  const [selected, setSelected] = useState<CohortSource | null>(null), [result, setResult] = useState<CohortInspectionResult | null>(null), [failed, setFailed] = useState(false), [busy, setBusy] = useState(false), [readFailure, setReadFailure] = useState(false);
  const input: ListSalesCohortSourcesInput = { protocolId, cohortDigest, search, beforeId: cursors.at(-1), limit: 10 }, inputKey = JSON.stringify(input);
  const list = trpc.sariBrain.listSalesExperimentCohortSources.useQuery(input, { ...options, enabled: active });
  const inspect = trpc.sariBrain.inspectSalesExperimentCohort.useQuery({ protocolId, cohortDigest, conversationId: selected?.conversationId ?? 1,
    incomingMessageId: selected?.incomingMessageId ?? 1, expectedMessageDigest: selected?.messageDigest ?? '0'.repeat(64) }, { ...options, enabled: false });
  const readable = active && !readFailure && !list.isError && !list.isLoading && !list.isFetching && compatibleCohortSourcePage(list.data, input);
  const data = readable ? list.data : null, selectionKey = selected ? cohortSourceKey(selected) : '';
  const currentSelection = !!selected && !!data?.items.some(row => cohortSourceKey(row) === selectionKey), applied = text.trim() === search;
  const epoch = useRef(0), inFlight = useRef(false), latest = useRef({ active, inputKey, selectionKey, readable, applied });
  latest.current = { active, inputKey, selectionKey, readable, applied };
  const invalidate = () => { epoch.current++; setResult(null); setFailed(false); };
  useEffect(() => { invalidate(); }, [active, inputKey, readable, selectionKey, applied]);
  useEffect(() => { if (data && selected && !currentSelection) setSelected(null); }, [data?.listedAt, currentSelection]);
  useEffect(() => () => { epoch.current++; }, []);
  useEffect(() => { if (result) heading.current?.focus(); }, [result]);
  function navigate(next: Array<number | undefined>) { if (!readable || busy) return; invalidate(); setReadFailure(false); setSelected(null); setCursors(next); }
  async function refresh() {
    if (inFlight.current || !active) return; invalidate(); setSelected(null); inFlight.current = true; setBusy(true);
    try { const response = await list.refetch(); setReadFailure(response.isError || !compatibleCohortSourcePage(response.data, input)); }
    catch { setReadFailure(true); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function check() {
    if (inFlight.current || !readable || !currentSelection || !selected || !applied) return;
    invalidate(); const generation = epoch.current, source = selected, key = inputKey, expectedSelection = selectionKey;
    inFlight.current = true; setBusy(true);
    try {
      const response = await inspect.refetch();
      const now = latest.current;
      if (generation !== epoch.current || !now.active || !now.readable || !now.applied || now.inputKey !== key || now.selectionKey !== expectedSelection) return;
      if (response.isError || !compatibleCohortInspection(response.data, protocolId, cohortDigest, source)) { setFailed(true); return; }
      setResult(response.data);
    } catch { if (generation === epoch.current && latest.current.active) setFailed(true); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const labels = reasonLabels(t), types = { text: t('merchantUx.cohortInspection.text'), voice: t('merchantUx.cohortInspection.voice'), image: t('merchantUx.cohortInspection.image'), document: t('merchantUx.cohortInspection.document') };
  return <section data-inspection-panel className="mt-3 min-w-0 space-y-4 rounded-lg border p-3 sm:p-4 [overflow-wrap:anywhere]" aria-busy={busy || list.isFetching}>
    <h6 className="font-semibold">{t('merchantUx.cohortInspection.title')}</h6><p>{t('merchantUx.cohortInspection.scope')}</p>
    <form className="space-y-2" onSubmit={event => { event.preventDefault(); if (!active || busy || list.isFetching) return; invalidate(); setReadFailure(false); setSelected(null); setSearch(text.trim()); setCursors([undefined]); if (text.trim() === search && cursors.length === 1) void refresh(); }}>
      <label htmlFor={id} className="block font-medium">{t('merchantUx.cohortInspection.search')}</label><input id={id} data-inspection-search autoComplete="off" maxLength={100} className="min-h-11 w-full min-w-0 rounded-md border bg-background px-3 text-base" value={text} disabled={!active || busy} aria-describedby={`${id}-hint`} onChange={event => { invalidate(); setText(event.target.value); }} />
      <p id={`${id}-hint`} className="text-muted-foreground">{t('merchantUx.cohortInspection.searchHint')}</p><div className="flex flex-wrap gap-2">
        <Button type="submit" className="h-auto min-h-11 whitespace-normal" data-inspection-search-submit disabled={!active || busy || list.isFetching}>{t('merchantUx.cohortInspection.searchButton')}</Button>
        <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" data-inspection-refresh disabled={!active || busy || list.isFetching} onClick={() => void refresh()}>{t('merchantUx.cohortInspection.refresh')}</Button></div>
    </form>
    <p className="text-muted-foreground">{t('merchantUx.cohortInspection.order')}</p>
    {list.isLoading || list.isFetching ? <p role="status">{t('merchantUx.cohortInspection.loading')}</p> : !readable && <p role="alert" data-inspection-list-error>{t('merchantUx.cohortInspection.unavailable')}</p>}
    {data && <><p>{t('merchantUx.cohortInspection.page', { page: cursors.length })}</p>{!data.items.length && <p data-inspection-empty>{t('merchantUx.cohortInspection.empty')}</p>}
      <div className="space-y-3">{data.items.map(row => <article key={row.conversationId} data-inspection-source={row.conversationId} className="min-w-0 space-y-2 rounded-lg border p-3">
        <p dir="auto" className="font-medium">{row.customerName || t('merchantUx.cohortInspection.unnamed')}</p><p><bdi>{row.customerPhone}</bdi></p>
        <p className="font-medium">{t('merchantUx.cohortInspection.latest')} · {types[row.messageType]}</p>
        {row.messageType === 'text' ? <p dir="auto" className="whitespace-pre-wrap">{row.preview}</p> : <p>{t('merchantUx.cohortInspection.noMedia')}</p>}
        {row.previewTruncated && <p className="text-muted-foreground">{t('merchantUx.cohortInspection.truncated')}</p>}
        <p>{t('merchantUx.cohortInspection.received')}: <InspectionTime value={row.receivedAt} /></p>
        <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" data-inspection-select={row.conversationId} aria-pressed={selectionKey === cohortSourceKey(row)} disabled={busy || !applied}
          onClick={() => { invalidate(); setSelected(row); }}>{selectionKey === cohortSourceKey(row) ? t('merchantUx.cohortInspection.selected') : t('merchantUx.cohortInspection.select')}</Button>
      </article>)}</div>
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" data-inspection-previous disabled={busy || cursors.length < 2 || !applied} onClick={() => navigate(cursors.slice(0, -1))}>{t('merchantUx.cohortInspection.previous')}</Button>
        <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" data-inspection-next disabled={busy || !data.nextBeforeId || !applied} onClick={() => navigate([...cursors, data.nextBeforeId!])}>{t('merchantUx.cohortInspection.next')}</Button></div></>}
    <Button type="button" className="h-auto min-h-11 whitespace-normal" data-inspection-check disabled={!readable || !currentSelection || !applied || busy} onClick={() => void check()}>{t('merchantUx.cohortInspection.inspect')}</Button>
    {busy && selected && <p role="status">{t('merchantUx.cohortInspection.inspecting')}</p>}
    {failed && active && <p role="alert" data-inspection-failed>{t('merchantUx.cohortInspection.failed')}</p>}
    {result && readable && currentSelection && applied && <div data-inspection-result className="space-y-3 rounded-lg border p-3" role="status">
      <h6 ref={heading} tabIndex={-1} className="font-semibold focus-visible:outline">{result.qualifiesAtRead ? t('merchantUx.cohortInspection.qualifies') : t('merchantUx.cohortInspection.excluded')}</h6>
      <p>{t('merchantUx.cohortInspection.resultScope')}</p><p>{t('merchantUx.cohortInspection.inspected')}: <InspectionTime value={result.inspectedAt} /></p>
      <p>{t('merchantUx.cohortInspection.population')}: {result.population === 'new' ? t('merchantUx.cohortInspection.new') : t('merchantUx.cohortInspection.returning')}</p>
      {!!result.reasons.length && <><p className="font-medium">{t('merchantUx.cohortInspection.reasons')}</p><ul className="list-disc space-y-2 ps-5">{result.reasons.map(reason => <li data-inspection-reason={reason} key={reason}>{labels[reason]}</li>)}</ul></>}
      <details className="rounded-md border p-3"><summary className="min-h-11 cursor-pointer py-2">{t('merchantUx.cohortInspection.evidence')}</summary><p dir="ltr">{result.sourceDigest}</p></details>
    </div>}
  </section>;
}
function InspectionTime({ value }: { value: string }) {
  return <time dateTime={value} dir="ltr" className="flex flex-wrap gap-x-2"><span className="whitespace-nowrap">{value.slice(0, 10)}</span><span className="whitespace-nowrap">{value.slice(11, 19)}</span></time>;
}
function reasonLabels(t: ReturnType<typeof useTranslation>['t']) { return {
  unsupported_customer_identity: t('merchantUx.cohortInspection.unsupported_customer_identity'), excluded_customer: t('merchantUx.cohortInspection.excluded_customer'), inactive_conversation: t('merchantUx.cohortInspection.inactive_conversation'),
  human_takeover: t('merchantUx.cohortInspection.human_takeover'), before_handoff_boundary: t('merchantUx.cohortInspection.before_handoff_boundary'), superseded_inbound: t('merchantUx.cohortInspection.superseded_inbound'),
  excluded_deal_stage: t('merchantUx.cohortInspection.excluded_deal_stage'), unsupported_message_type: t('merchantUx.cohortInspection.unsupported_message_type'), message_length: t('merchantUx.cohortInspection.message_length'),
  required_term_missing: t('merchantUx.cohortInspection.required_term_missing'), population_mismatch: t('merchantUx.cohortInspection.population_mismatch'), invalid_source_time: t('merchantUx.cohortInspection.invalid_source_time'),
  message_outside_enrollment: t('merchantUx.cohortInspection.message_outside_enrollment'), inspection_outside_enrollment: t('merchantUx.cohortInspection.inspection_outside_enrollment'),
}; }
