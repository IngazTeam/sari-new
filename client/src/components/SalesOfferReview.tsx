import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ChevronDown } from 'lucide-react';
import {z} from 'zod';
import {salesOfferReviewItem,salesOfferReviewSnapshot,salesOfferReviewResult,type salesOfferReviewOutcome} from '@shared/sales-offer-review';

type Item=z.infer<typeof salesOfferReviewItem>;
type SalesOfferReviewOutcome=z.infer<typeof salesOfferReviewOutcome>;

function OfferReviewCard({
  item,
  conversationId,
  canManage,
  refreshing,
  onSaved,
  onRefresh,
  note,
  setNote,
  revision,
}: {
  item: Item;
  conversationId: number;
  canManage: boolean;
  refreshing: boolean;
  onSaved: (note:string) => void;
  onRefresh:()=>void;
  note:string;
  setNote:(note:string)=>void;
  revision:number;
}) {
  const { t, i18n } = useTranslation();
  const basis=JSON.stringify([item,canManage,note]);
  const [reviewBasis,setReviewBasis]=useState<string|null>(null),[blockedAt,setBlockedAt]=useState<number|null>(null);
  const [saving,setSaving]=useState(false),[notice,setNotice]=useState<SalesOfferReviewOutcome|'error'|undefined>();
  const reviewed=reviewBasis===basis,blocked=blockedAt!==null&&revision<=blockedAt;
  const live=useRef(true),busy=useRef(false),latest=useRef(basis),latestRevision=useRef(revision);latest.current=basis;latestRevision.current=revision;
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  const mutation=trpc.conversations.reviewSalesOffer.useMutation({retry:false});
  const save=async()=>{
    if(busy.current||!canManage||refreshing||blocked||!reviewed||note.trim().length<3)return;
    busy.current=true;setSaving(true);setNotice(undefined);const expected=basis;
    try{
      const result=salesOfferReviewResult.parse(await mutation.mutateAsync({conversationId,attemptId:item.id,expectedRevision:item.revision,evidence:item.evidence,reviewed:true,note:note.trim()}));
      if(!live.current||latest.current!==expected)return;
      setReviewBasis(null);setBlockedAt(latestRevision.current);setNotice(result.outcome);onSaved(note);
    }catch{if(live.current&&latest.current===expected){setReviewBasis(null);setBlockedAt(latestRevision.current);setNotice('error');}}
    finally{busy.current=false;if(live.current)setSaving(false);}
  };
  const states = {
    missing: t("merchantUx.offerReview.missing"),
    invalid: t("merchantUx.offerReview.invalid"),
    pending: t("merchantUx.offerReview.pending"),
    failed: t("merchantUx.offerReview.failed"),
    sent: t("merchantUx.offerReview.sent"),
    delivered: t("merchantUx.offerReview.delivered"),
    read: t("merchantUx.offerReview.read"),
  };
  const outcomes = {
    recorded: t("merchantUx.offerReview.recorded"),
    accepted_unprojected: t("merchantUx.offerReview.acceptedUnprojected"),
    failed: t("merchantUx.offerReview.reviewFailed"),
    unresolved: t("merchantUx.offerReview.unresolved"),
  };
  const date = (value: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  const status =
    item.attemptState === "cancelled"
      ? t("merchantUx.offerReview.cancelled")
      : item.attemptState === "reserved"
        ? t("merchantUx.offerReview.reserved")
        : states[item.state];
  return (
    <article
      data-offer-id={item.id}
      className="min-w-0 space-y-3 rounded-md border bg-background p-3 text-sm [overflow-wrap:anywhere]"
    >
      <div className="space-y-1">
        <h4 className="font-semibold">
          {t("merchantUx.offerReview.attempt", { id: item.sourceMessageId })}
        </h4>
        <time className="text-muted-foreground" dateTime={item.createdAt}>
          {date(item.createdAt)}
        </time>
      </div>
      <p className="font-medium" data-offer-state={item.state}>
        {status}
      </p>
      {item.accepted && (
        <div
          data-offer-projection={
            item.projectionConflict
              ? "conflict"
              : item.projected
                ? "recorded"
                : "pending"
          }
          className="space-y-1"
        >
          {item.state === "failed" && (
            <p>{t("merchantUx.offerReview.priorAcceptance")}</p>
          )}
          <p>
            {item.projectionConflict
              ? t("merchantUx.offerReview.projectionConflict")
              : item.projected
                ? t("merchantUx.offerReview.projected")
                : t("merchantUx.offerReview.projectionPending")}
          </p>
        </div>
      )}
      <details data-offer-details>
        <summary className="flex min-h-11 cursor-pointer items-center font-medium">
          {t("merchantUx.offerReview.evidence")}
        </summary>
        <div
          tabIndex={0}
          className="max-h-64 space-y-3 overflow-y-auto rounded-md bg-muted/30 p-3"
        >
          <p className="font-medium">
            {t("merchantUx.offerReview.source", { id: item.sourceMessageId })}
          </p>
          <p className="whitespace-pre-wrap">
            {item.sourceText ?? t("merchantUx.offerReview.sourceUnavailable")}
          </p>
          <p className="font-medium">{t("merchantUx.offerReview.text")}</p>
          <p className="whitespace-pre-wrap">
            {item.text ?? t("merchantUx.offerReview.textUnavailable")}
          </p>
          {item.receipt && (
            <p>
              {t("merchantUx.offerReview.receipt")}{" "}
              <bdi className="font-mono text-xs">{item.receipt}</bdi>
            </p>
          )}
        </div>
      </details>
      {item.lastReview && (
        <div data-offer-last-review className="space-y-1 border-s-2 ps-3">
          <p>
            {t("merchantUx.offerReview.lastReview", {
              id: item.lastReview.actorUserId,
            })}{" "}
            ·{" "}
            <time dateTime={item.lastReview.at}>
              {date(item.lastReview.at)}
            </time>
          </p>
          <p>{outcomes[item.lastReview.outcome]}</p>
          <p className="whitespace-pre-wrap">{item.lastReview.note}</p>
        </div>
      )}
      {canManage ? (
        <div className="space-y-3">
          <label htmlFor={`offer-note-${item.id}`} className="block space-y-2">
            <span>{t("merchantUx.offerReview.note")}</span>
            <textarea
              id={`offer-note-${item.id}`}
              rows={3}
              maxLength={1000}
              value={note}
              data-offer-note
              disabled={saving}
              onChange={event => {
                setNote(event.target.value);
                setReviewBasis(null);
                setNotice(undefined);
              }}
              className="min-h-24 w-full rounded-md border bg-background p-3"
            />
          </label>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 leading-relaxed">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 shrink-0"
              checked={reviewed}
              data-offer-reviewed
              disabled={refreshing || saving || blocked}
              onChange={event => setReviewBasis(event.target.checked?basis:null)}
            />
            <span>{t("merchantUx.offerReview.attestation")}</span>
          </label>
          <Button
            data-offer-save
            className="h-auto min-h-11 w-full whitespace-normal"
            disabled={
              !reviewed ||
              note.trim().length < 3 ||
              refreshing ||
              saving ||
              blocked
            }
            onClick={() => void save()}
          >
            {saving
              ? t("merchantUx.offerReview.saving")
              : t("merchantUx.offerReview.save")}
          </Button>
          {notice==='error' && (
            <div role="alert">
              <p>{t("merchantUx.offerReview.saveFailed")}</p>
            </div>
          )}
          {blocked&&<Button
                data-offer-retry
                className="mt-2 min-h-11"
                variant="outline"
                disabled={refreshing||saving}
                onClick={() => {setReviewBasis(null);onRefresh();}}
              >
                {t("merchantUx.offerReview.refresh")}
              </Button>}
          {notice&&notice!=='error' && (
            <p role="status" data-offer-saved>
              {outcomes[notice]}
            </p>
          )}
        </div>
      ) : (
        <p>{t("merchantUx.offerReview.readOnly")}</p>
      )}
    </article>
  );
}

type OfferScope={conversationId:number;merchantId:number;actorUserId:number};
export function SalesOfferReview(props:OfferScope){
  return <ScopedOfferReview key={[props.actorUserId,props.merchantId,props.conversationId].join(':')} {...props}/>;
}
function ScopedOfferReview(props:OfferScope){
  const {t}=useTranslation();
  const [open,setOpen]=useState(false),[beforeSourceId,setBeforeSourceId]=useState<number>();
  const [notes,setNotes]=useState<Record<string,string>>({});
  return <details data-offer-panel open={open} className="min-w-0 rounded-lg border bg-muted/20 px-4" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 py-2 font-semibold">
      <span>{t('merchantUx.offerReview.title')}</span><ChevronDown aria-hidden="true" className={'h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none '+(open?'rotate-180':'')}/>
    </summary>
    {open&&<OfferBrowser {...props} beforeSourceId={beforeSourceId} setBeforeSourceId={setBeforeSourceId} notes={notes} setNotes={setNotes}/>}
  </details>;
}
function OfferBrowser({conversationId,merchantId,actorUserId,beforeSourceId,setBeforeSourceId,notes,setNotes}:OfferScope&{
  beforeSourceId:number|undefined;setBeforeSourceId:(value:number|undefined)=>void;notes:Record<string,string>;setNotes:Dispatch<SetStateAction<Record<string,string>>>;
}){
  const {t}=useTranslation(),utils=trpc.useUtils();
  const query=trpc.conversations.salesOfferReviewSnapshot.useQuery({conversationId,beforeSourceId},{retry:false,staleTime:0,refetchOnMount:'always',refetchInterval:15000});
  const parsed=salesOfferReviewSnapshot.safeParse(query.data);
  const matches=parsed.success&&parsed.data.merchantId===merchantId&&parsed.data.actorUserId===actorUserId&&parsed.data.conversationId===conversationId&&parsed.data.beforeSourceId===(beforeSourceId??null);
  const data=matches&&parsed.success&&!query.isError&&query.isFetchedAfterMount?parsed.data:null;
  const refresh=()=>{if(beforeSourceId!==undefined)setBeforeSourceId(undefined);else void query.refetch();};
  const saved=(id:string,note:string)=>{
    setNotes(current=>current[id]===note?{...current,[id]:''}:current);
    void query.refetch();void utils.conversations.listSalesOfferAttempts.invalidate({conversationId});
    void utils.conversations.getMessages.invalidate({conversationId});void utils.conversations.messageHistory.invalidate({conversationId});
    void utils.conversations.getHandoff.invalidate({conversationId});void utils.conversations.handoffSnapshot.invalidate({conversationId});void utils.conversations.list.invalidate();
  };
  return <section aria-label={t('merchantUx.offerReview.title')} className="min-w-0 space-y-3 pb-4">
    <p className="text-sm leading-relaxed text-muted-foreground">{t('merchantUx.offerReview.scope')}</p>
    {query.isLoading||(!query.isFetchedAfterMount&&query.isFetching)?<p role="status">{t('merchantUx.offerReview.loading')}</p>:!data?<div role="alert">
      <p>{t('merchantUx.offerReview.loadFailed')}</p><Button data-offer-refresh className="mt-2 min-h-11" onClick={()=>void query.refetch()}>{t('merchantUx.offerReview.refresh')}</Button>
    </div>:<>
      {query.isFetching&&<p role="status">{t('merchantUx.offerReview.loading')}</p>}
      {data.page.items.length===0?<p>{t('merchantUx.offerReview.empty')}</p>:<div className="max-h-[36rem] space-y-3 overflow-y-auto">
        {data.page.items.map(item=><OfferReviewCard key={item.id} item={item} conversationId={conversationId} canManage={data.canManage} refreshing={query.isFetching} revision={query.dataUpdatedAt}
          note={notes[item.id]??''} setNote={note=>setNotes(current=>({...current,[item.id]:note}))} onSaved={note=>saved(item.id,note)} onRefresh={()=>void query.refetch()}/>)}
      </div>}
      <nav aria-label={t('merchantUx.offerReview.pages')} className="flex flex-wrap gap-2">
        <Button data-offer-refresh variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={query.isFetching} onClick={refresh}>{beforeSourceId?t('merchantUx.offerReview.latest'):t('merchantUx.offerReview.refresh')}</Button>
        {data.page.nextCursor&&<Button data-offer-older variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={query.isFetching} onClick={()=>setBeforeSourceId(data.page.nextCursor!)}>{t('merchantUx.offerReview.older')}</Button>}
      </nav>
    </>}
  </section>;
}
