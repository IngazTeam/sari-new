import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import {z} from 'zod';
import {escalationReviewSnapshot,escalationReviewItem,escalationReviewResult} from '@shared/escalation-review';
type Item=z.infer<typeof escalationReviewItem>;

function RelayReview({ item, conversationId, canManage, refreshing, revision, note, setNote, onSaved, onRefresh }: {
  item: Item; conversationId: number; canManage: boolean; refreshing: boolean; revision:number; note:string; setNote:(note:string)=>void; onSaved:(note:string)=>void; onRefresh:()=>void;
}) {
  const { t, i18n } = useTranslation();
  const basis=JSON.stringify([item,canManage,note]);
  const [reviewBasis,setReviewBasis]=useState<string|null>(null),[blockedAt,setBlockedAt]=useState<number|null>(null);
  const [saving,setSaving]=useState(false),[notice,setNotice]=useState<z.infer<typeof escalationReviewResult>['outcome']|'error'|null>(null);
  const reviewed=reviewBasis===basis,blocked=blockedAt!==null&&revision<=blockedAt;
  const live=useRef(true),busy=useRef(false),latest=useRef(basis);latest.current=basis;
  const latestRevision=useRef(revision);latestRevision.current=revision;
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  const mutation=trpc.conversations.reviewEscalationRelay.useMutation({retry:false});
  const save=async()=>{
    if(busy.current||!canManage||refreshing||blocked||!reviewed||note.trim().length<3)return;
    busy.current=true;setSaving(true);setNotice(null);const expected=basis;
    try{
      const result=escalationReviewResult.parse(await mutation.mutateAsync({conversationId,relayId:item.id,expectedRevision:item.revision,evidence:item.evidence,reviewed:true,note:note.trim()}));
      if(!live.current||latest.current!==expected)return;
      setReviewBasis(null);setBlockedAt(latestRevision.current);setNotice(result.outcome);onSaved(note);
    }catch{if(live.current&&latest.current===expected){setReviewBasis(null);setBlockedAt(latestRevision.current);setNotice('error');}}
    finally{busy.current=false;if(live.current)setSaving(false);}
  };
  const states = { missing: t('merchantUx.relay.missing'), invalid: t('merchantUx.relay.invalid'), pending: t('merchantUx.relay.pending'),
    failed: t('merchantUx.relay.deliveryFailed'), accepted: t('merchantUx.relay.accepted'), delivered: t('merchantUx.relay.delivered'), read: t('merchantUx.relay.read') };
  const outcomes = { accepted: t('merchantUx.relay.recorded'), failed: t('merchantUx.relay.failedOutcome'), unresolved: t('merchantUx.relay.unresolved') };
  return <article data-relay-id={item.id} className="min-w-0 space-y-3 rounded-md border bg-background p-3 text-sm">
    <h4 className="font-semibold">{t('merchantUx.relay.attempt', { id: item.id })}</h4>
    <p className="font-medium" data-relay-state={item.state}>{states[item.state]}</p>
    <p className="text-muted-foreground">{t('merchantUx.relay.by', { phone: item.authorPhone.slice(-4) })} · <time dateTime={item.createdAt}>
      {new Intl.DateTimeFormat(i18n.language,{ dateStyle: 'medium',timeStyle: 'short' }).format(new Date(item.createdAt))}</time></p>
    <details>
      <summary className="flex min-h-11 cursor-pointer items-center">{t('merchantUx.relay.evidence')}</summary>
      <div tabIndex={0} className="max-h-64 space-y-3 overflow-y-auto rounded-md bg-muted/30 p-3 [overflow-wrap:anywhere]">
        <p className="font-medium">{t('merchantUx.relay.question', { id: item.sourceMessageId })}</p><p className="whitespace-pre-wrap">{item.question}</p>
        <p className="font-medium">{t('merchantUx.relay.reply')}</p><p className="whitespace-pre-wrap">{item.reply}</p>
      </div>
    </details>
    {item.lastReview && <div data-relay-review className="space-y-1 border-s-2 ps-3 [overflow-wrap:anywhere]">
      <p>{t('merchantUx.relay.lastReview',{ id: item.lastReview.actorUserId })} · <time dateTime={item.lastReview.at}>
        {new Intl.DateTimeFormat(i18n.language,{ dateStyle: 'medium',timeStyle: 'short' }).format(new Date(item.lastReview.at))}</time></p>
      <p>{outcomes[item.lastReview.outcome]}</p><p className="whitespace-pre-wrap">{item.lastReview.note}</p>
    </div>}
    {canManage ? <div className="space-y-3">
      <label htmlFor={`relay-note-${item.id}`} className="block space-y-2"><span>{t('merchantUx.relay.note')}</span>
        <textarea data-relay-note id={`relay-note-${item.id}`} value={note} maxLength={1000} rows={3} disabled={saving}
          onChange={event => { setNote(event.target.value); setReviewBasis(null); setNotice(null); }} className="min-h-24 w-full rounded-md border bg-background p-3" />
      </label>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 leading-relaxed">
        <input data-relay-reviewed type="checkbox" checked={reviewed} disabled={saving || refreshing || blocked} className="mt-1 h-5 w-5 shrink-0"
          onChange={event => setReviewBasis(event.target.checked?basis:null)} /><span>{t('merchantUx.relay.attestation')}</span>
      </label>
      <Button data-relay-save className="h-auto min-h-11 w-full whitespace-normal" disabled={!reviewed || note.trim().length < 3 || refreshing || saving || blocked}
        onClick={() => void save()}>
        {saving ? t('merchantUx.relay.saving') : t('merchantUx.relay.review')}</Button>
      {notice==='error' && <div role="alert"><p>{t('merchantUx.relay.saveFailed')}</p></div>}
      {blocked&&<Button data-relay-retry className="mt-2 h-auto min-h-11 whitespace-normal" disabled={refreshing||saving} variant="outline" onClick={() => {setReviewBasis(null);onRefresh();}}>{t('merchantUx.relay.refresh')}</Button>}
      {notice&&notice!=='error'&&<p role="status" data-relay-saved>{outcomes[notice]}</p>}
    </div> : <p>{t('merchantUx.relay.readOnly')}</p>}
  </article>;
}

type Scope={conversationId:number;merchantId:number;actorUserId:number;draftNotes?:Record<number,string>;onDraftNotesChange?:import('react').Dispatch<import('react').SetStateAction<Record<number,string>>>};
export function EscalationReconciliation(props:Scope){return <ScopedEscalation key={`${props.actorUserId}:${props.merchantId}:${props.conversationId}`} {...props}/>;}
function ScopedEscalation({conversationId,merchantId,actorUserId,draftNotes,onDraftNotesChange}:Scope){
  const {t}=useTranslation(),utils=trpc.useUtils();const [beforeId,setBeforeId]=useState<number>();
  const [localNotes,setLocalNotes]=useState<Record<number,string>>({});
  const notes=draftNotes??localNotes,setNotes=onDraftNotesChange??setLocalNotes;
  const query=trpc.conversations.escalationReviewSnapshot.useQuery({conversationId,beforeId},{retry:false,staleTime:0,refetchOnMount:'always',refetchInterval:15000});
  const parsed=escalationReviewSnapshot.safeParse(query.data);
  const matches=parsed.success&&parsed.data.merchantId===merchantId&&parsed.data.actorUserId===actorUserId&&parsed.data.conversationId===conversationId&&parsed.data.beforeId===(beforeId??null);
  const data=matches&&parsed.success&&!query.isError&&query.isFetchedAfterMount?parsed.data:null;
  const refresh=()=>{if(beforeId!==undefined)setBeforeId(undefined);else void query.refetch();};
  const saved=(id:number,note:string)=>{
    setNotes(current=>current[id]===note?{...current,[id]:''}:current);
    void query.refetch();void utils.conversations.listEscalationRelays.invalidate({conversationId});
    void utils.conversations.getMessages.invalidate({conversationId});void utils.conversations.messageHistory.invalidate({conversationId});
    void utils.conversations.getHandoff.invalidate({conversationId});void utils.conversations.handoffSnapshot.invalidate({conversationId});void utils.conversations.list.invalidate();
  };
  return <section aria-label={t('merchantUx.relay.title')} className="min-w-0 space-y-3 rounded-lg border bg-muted/20 p-4">
    <h3 className="font-semibold">{t('merchantUx.relay.title')}</h3><p className="text-sm leading-relaxed text-muted-foreground">{t('merchantUx.relay.scope')}</p>
    {query.isLoading||(!query.isFetchedAfterMount&&query.isFetching)?<p role="status">{t('merchantUx.relay.loading')}</p>:!data?<div role="alert">
      <p>{t('merchantUx.relay.loadFailed')}</p><Button data-relay-refresh className="mt-2 min-h-11" onClick={()=>void query.refetch()}>{t('merchantUx.relay.refresh')}</Button></div>
      : <>
        {query.isFetching&&<p role="status">{t('merchantUx.relay.loading')}</p>}
        {data.page.items.length===0?<p>{t('merchantUx.relay.empty')}</p>:<div className="max-h-[36rem] space-y-3 overflow-y-auto">
          {data.page.items.map(item=><RelayReview key={`${conversationId}:${item.id}`} item={item} conversationId={conversationId} note={notes[item.id]??''} setNote={note=>setNotes(current=>({...current,[item.id]:note}))} revision={query.dataUpdatedAt}
            canManage={data.canManage} refreshing={query.isFetching} onSaved={note=>saved(item.id,note)} onRefresh={()=>void query.refetch()}/>)}</div>}
        <div className="flex flex-wrap gap-2">
          <Button data-relay-refresh variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={query.isFetching} onClick={refresh}>{t('merchantUx.relay.refresh')}</Button>
          {data.page.nextCursor&&<Button data-relay-older variant="outline" className="min-h-11" disabled={query.isFetching} onClick={()=>setBeforeId(data.page.nextCursor!)}>{t('merchantUx.relay.older')}</Button>}
        </div>
      </>}
  </section>;
}
