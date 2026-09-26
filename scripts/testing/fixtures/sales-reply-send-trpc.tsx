import { useEffect, useState } from 'react';
import type { ReplySendReceipt, ReplySendWorkspace } from '../../../shared/sales-reply-send';
import { replySendSubmitInput } from '../../../shared/sales-reply-send';
const win = window as any, mode = (new URL(location.href).searchParams.get('case') || '').replace('reply-send-', '');
const listeners = new Set<() => void>(), emit = () => listeners.forEach(fn => fn());
let saved: ReplySendReceipt | null = null, actor = 7, digest = 'a'.repeat(64), readable = true, allowed = true;
const text = mode === 'xss' ? '<img src=x onerror="window.__sendXss=1">' + 'LongText'.repeat(100) : 'يسعدني مساعدتك في اختيار العرض الأنسب. هل تفضّل أن أوضح لك تفاصيل الخيار الذي يناسب احتياجك؟';
function workspace(input: { generationId: number; instanceRecordId?: number }): ReplySendWorkspace {
  const p = { generationId: input.generationId, actorUserId: actor, instanceRecordId: input.instanceRecordId ?? 5,
    basisDigest: digest, recipient: '966500000988', responseText: text,
    checkedAt: '2026-01-01T00:00:00.000Z', expiresAt: mode === 'expired' ? '2026-01-02T00:00:00.000Z' : '2099-01-01T00:00:00.000Z' };
  const w: ReplySendWorkspace = { generationId: input.generationId, actorUserId: actor,
    accounts: mode === 'no-account' || saved ? [] : [{ id: 5, phoneNumber: '+966500000000', primary: true }, { id: 6, phoneNumber: null, primary: false }],
    accountsTruncated: false, preview: null, receipt: saved, stage: saved ? 'recorded' : input.instanceRecordId ? 'ready' : 'choose_account' };
  if (!allowed || mode === 'unavailable' || mode === 'no-account') w.stage = 'unavailable';
  if (mode === 'quota' && input.instanceRecordId) w.stage = 'capacity_unavailable';
  if (w.stage === 'ready') w.preview = p;
  if (mode === 'foreign') w.generationId++;
  if (mode === 'malformed') (w as any).token = 'private-token';
  return w;
}
export const replySendFixture = {
  getSalesReplySendWorkspace: { useQuery: (input: any) => {
    const [,tick] = useState(0), [fetching,setFetching] = useState(false);
    useEffect(() => { const f=()=>tick(v=>v+1);listeners.add(f);return()=>{listeners.delete(f);}; }, []);
    return { data: workspace(input), isLoading: mode==='loading', isError: !readable || mode==='read-error', isFetching: fetching || mode==='fetching',
      refetch: async()=>{win.__sendReads=(win.__sendReads||0)+1;setFetching(true);await new Promise(r=>setTimeout(r,25));setFetching(false);emit();return {data:workspace(input),error:!readable || mode==='read-error'?Error('private status'):null};} };
  } },
  submitSalesReplySend: { useMutation: () => ({ mutateAsync: async(raw: any) => {
    win.__sendWrites=[...(win.__sendWrites||[]),structuredClone(raw)]; const v=replySendSubmitInput.parse(raw);
    await new Promise(r=>setTimeout(r,mode==='slow'?400:25));
    if(mode==='outage')throw Error('private connection');
    saved={generationId:v.generationId,actorUserId:actor,instanceRecordId:v.instanceRecordId,basisDigest:v.basisDigest,recipient:'966500000988',responseText:text,
      deliveryId:41,requestId:v.requestId,authorizedAt:'2026-09-26T00:00:00.000Z',transport:['not_attempted','unknown-status','suppressed','rejected','delivered','read','failed'].includes(mode)?(mode==='unknown-status'?'unknown':mode) as any:'accepted',exposureRecorded:false};emit();
    if(mode==='unknown')throw Error('private lost acknowledgement');
    if(mode.startsWith('mismatch-')) { const r:any=structuredClone(saved);r[mode.replace('mismatch-','')]=mode==='mismatch-recipient'?'966500000999':999;return r; }
    return saved;
  } }) },
};
win.__sendChange = (kind: string) => { if(kind==='actor')actor++;if(kind==='basis')digest='b'.repeat(64);if(kind==='permission')allowed=false;if(kind==='error')readable=false;emit(); };
