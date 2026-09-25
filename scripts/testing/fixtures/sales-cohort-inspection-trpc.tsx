import { useEffect, useState } from 'react';
import { listSalesCohortSourcesInput, cohortInspectionReasons } from '../../../shared/sales-cohort-inspection';
import { inspectSalesCohortInput } from '../../../shared/sales-experiment-cohort';
const mode = new URL(location.href).searchParams.get('case')?.replace('inspection-', '') || 'ready';
const win = window as any, listeners = new Set<() => void>(), emit = () => listeners.forEach(fn => fn());
function row(id: number): any { return { conversationId: id, incomingMessageId: id * 10, customerName: `Customer ${id}`, customerPhone: `966500000${id}`, messageType: 'text',
  preview: 'أرغب في معرفة العرض المناسب لدورتي التدريبية.', previewTruncated: false, receivedAt: '2026-01-01T00:00:00.000Z', messageDigest: id.toString(16).padStart(64, '0') }; }
const rows = Array.from({ length: mode === 'empty' ? 0 : 23 }, (_, i) => row(45 - i));
if (mode === 'xss') { rows[0].customerName = '<img src=x onerror="window.__inspectionXss=1">' + 'Unbroken'.repeat(24); rows[0].preview = '<img src=x onerror="window.__inspectionXss=1">' + 'Unbroken'.repeat(30); }
if (mode === 'media') { rows[0].messageType = 'voice'; rows[0].preview = ''; }
if (mode === 'truncated') { rows[0].preview = '😀'.repeat(320); rows[0].previewTruncated = true; }
const state = { readError: false };
win.__inspectionChangeSource = () => { rows[0].preview = 'A changed stored message'; rows[0].messageDigest = 'f'.repeat(64); emit(); };
win.__inspectionReadError = () => { state.readError = true; emit(); };
win.__inspectionAddConversation = () => rows.unshift(row(46));
function page(raw: any) {
  const input = listSalesCohortSourcesInput.parse(raw), filtered = rows.filter(row => (!input.beforeId || row.conversationId < input.beforeId)
    && `${row.customerName} ${row.customerPhone}`.toLowerCase().includes(input.search.toLowerCase())), selected = filtered.slice(0, input.limit);
  const result = { ...input, beforeId: input.beforeId ?? null, listedAt: new Date().toISOString(), items: structuredClone(selected), nextBeforeId: filtered.length > selected.length ? selected.at(-1)!.conversationId : null, activationAllowed: false };
  if (mode === 'list-mismatch') result.cohortDigest = 'b'.repeat(64);
  return result;
}
export const salesCohortInspectionFixture = {
  listSalesExperimentCohortSources: { useQuery: (input: any, options: any) => {
    const [, tick] = useState(0), [fetching, setFetching] = useState(false), [recovered, setRecovered] = useState(false), key = JSON.stringify(input);
    useEffect(() => { const change = () => tick(n => n + 1); listeners.add(change); return () => { listeners.delete(change); }; }, []);
    useEffect(() => { if (options.enabled) win.__inspectionLists = [...(win.__inspectionLists || []), structuredClone(input)]; }, [key, options.enabled]);
    return { data: mode === 'loading' ? undefined : page(input), isLoading: mode === 'loading', isFetching: fetching || mode === 'fetching',
      isError: state.readError || mode === 'list-error' && !recovered,
      refetch: async () => {
        setFetching(true); try { await new Promise(resolve => setTimeout(resolve, 25)); if (mode === 'list-throw') throw Error('private read failure'); setRecovered(true); return { data: page(input), isError: state.readError }; }
        finally { setFetching(false); }
      } };
  } },
  inspectSalesExperimentCohort: { useQuery: (input: any, options: any) => {
    if (options.enabled !== false) throw Error('Inspection must be explicit');
    return { refetch: async () => {
      const request = inspectSalesCohortInput.parse(structuredClone(input)); win.__inspectionChecks = [...(win.__inspectionChecks || []), request];
      await new Promise(resolve => setTimeout(resolve, mode === 'slow' ? 400 : 25));
      if (mode === 'throw') throw Error('private upstream details'); if (mode === 'error') return { isError: true, data: undefined };
      const reasons = mode === 'excluded' ? [...cohortInspectionReasons] : mode === 'media' ? ['unsupported_message_type'] : [];
      const result: any = { protocolId: request.protocolId, cohortDigest: request.cohortDigest, conversationId: request.conversationId, incomingMessageId: request.incomingMessageId,
        messageDigest: request.expectedMessageDigest, sourceDigest: 'e'.repeat(64), inspectedAt: new Date().toISOString(), qualifiesAtRead: reasons.length === 0, reasons,
        population: mode === 'excluded' ? 'returning' : 'new', assignmentCreated: false, activationAllowed: false, scope: 'point_in_time_inspection' };
      if (mode === 'mismatch') result.incomingMessageId++; if (mode === 'unsafe') result.activationAllowed = true;
      if (mode === 'unknown-reason') { result.qualifiesAtRead = false; result.reasons = ['future_untranslated_reason']; }
      if (mode === 'contradiction') result.reasons = ['human_takeover'];
      return { isError: false, data: result };
    } };
  } },
};
