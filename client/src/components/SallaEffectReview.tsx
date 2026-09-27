import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { sallaEffectListInput, sallaEffectPage, sallaEffectAuditPage, sallaEffectAuditItem,
  type sallaEffectItem, type sallaEffectCheckInput } from '@shared/salla-effect-review';

type Item = z.infer<typeof sallaEffectItem>;
type Check = z.infer<typeof sallaEffectCheckInput>;
function EffectDetails({item}:{item:Item}) {
  const {t,i18n}=useTranslation();
  const labels={owner_notice:t('merchantUx.sallaEffects.owner'),merchant_notice:t('merchantUx.sallaEffects.merchant'),sheets:t('merchantUx.sallaEffects.sheets')};
  const states={pending:t('merchantUx.sallaEffects.pending'),processing:t('merchantUx.sallaEffects.processing'),dispatching:t('merchantUx.sallaEffects.dispatching'),accepted:t('merchantUx.sallaEffects.accepted'),review:t('merchantUx.sallaEffects.review')};
  const guidance={queued:t('merchantUx.sallaEffects.queued'),preparing:t('merchantUx.sallaEffects.preparing'),preparation_expired:t('merchantUx.sallaEffects.preparationExpired'),in_flight:t('merchantUx.sallaEffects.inFlight'),outcome_unknown:t('merchantUx.sallaEffects.unknown'),accepted:t('merchantUx.sallaEffects.acceptedHint'),review_before_send:t('merchantUx.sallaEffects.beforeSend')};
  const channels={owner:t('merchantUx.sallaEffects.ownerChannel'),email:t('merchantUx.sallaEffects.emailChannel'),push:t('merchantUx.sallaEffects.pushChannel')};
  const results={accepted:t('merchantUx.sallaEffects.allAccepted'),partial:t('merchantUx.sallaEffects.partial'),unknown:t('merchantUx.sallaEffects.noticeUnknown'),not_accepted:t('merchantUx.sallaEffects.notAccepted')};
  const targetStates={ready:t('merchantUx.sallaEffects.targetReady'),dispatching:t('merchantUx.sallaEffects.targetSending'),accepted:t('merchantUx.sallaEffects.targetAccepted'),rejected:t('merchantUx.sallaEffects.targetRejected'),unknown:t('merchantUx.sallaEffects.targetUnknown'),blocked:t('merchantUx.sallaEffects.targetBlocked'),disabled:t('merchantUx.sallaEffects.targetDisabled'),unconfigured:t('merchantUx.sallaEffects.targetUnconfigured'),unavailable:t('merchantUx.sallaEffects.targetUnavailable')};
  return <>
    <h3 className="font-semibold">{labels[item.kind]}</h3><p>{t('merchantUx.sallaEffects.reference',{id:item.id,order:item.orderId})}</p>
    <p className="font-medium">{states[item.state]}</p><p>{item.notice?results[item.notice.result]:guidance[item.diagnostic]}</p>
    {item.notice&&<div data-notice-evidence className="space-y-2 rounded-md border p-3">
      <p className="font-medium">{t('merchantUx.sallaEffects.recipientResults')}</p>
      <ol tabIndex={0} className="max-h-80 space-y-2 overflow-y-auto" aria-label={t('merchantUx.sallaEffects.recipientResults')}>
        {item.notice.targets.map((target,index)=><li key={index} data-notice-target className="flex flex-wrap justify-between gap-2 border-b py-2"><span>{t('merchantUx.sallaEffects.recipientNumber',{number:index+1})} · {channels[target.channel]}</span><span>{targetStates[target.state]}</span></li>)}
      </ol><p className="text-muted-foreground">{t('merchantUx.sallaEffects.receiptScope')}</p>
    </div>}
    {!item.contextValid&&<p className="rounded-md border border-amber-500/50 p-2" data-salla-effect-context>{t('merchantUx.sallaEffects.changed')}</p>}
    <p className="text-muted-foreground">{t('merchantUx.sallaEffects.attempts',{count:item.attempts})}</p>
    <p className="text-muted-foreground">{t('merchantUx.sallaEffects.updated')}: <time dateTime={item.updatedAt}>{new Intl.DateTimeFormat(i18n.language,{dateStyle:'medium',timeStyle:'short'}).format(new Date(item.updatedAt))}</time></p>
  </>;
}
function EffectBrowser() {
  const {t,i18n}=useTranslation(),utils=trpc.useUtils();
  const [history,setHistory]=useState(false),[beforeId,setBeforeId]=useState<number>();
  const [order,setOrder]=useState(''),[state,setState]=useState(''),[kind,setKind]=useState('');
  const [filters,setFilters]=useState<z.infer<typeof sallaEffectListInput>>({});
  const [filterError,setFilterError]=useState(false),[reasons,setReasons]=useState<Record<number,Check['reason']|''>>({});
  const [notice,setNotice]=useState(''),[blockedAt,setBlockedAt]=useState<number>();
  const pending=useRef(new Map<number,Check>()),busy=useRef(false);
  const mutation=trpc.salla.checkEffect.useMutation({retry:false});
  const actions=trpc.salla.listEffects.useQuery({...filters,beforeId},{enabled:!history,retry:false,staleTime:0,trpc:{abortOnUnmount:true}});
  const audits=trpc.salla.listEffectReviews.useQuery({orderId:filters.orderId,beforeId},{enabled:history,retry:false,staleTime:0,trpc:{abortOnUnmount:true}});
  const query=history?audits:actions,page=sallaEffectPage.safeParse(actions.data),audit=sallaEffectAuditPage.safeParse(audits.data);
  const loading=query.isFetching||query.isLoading||query.isPaused,valid=history?audit.success:page.success;
  const cursor=history?(audit.success?audit.data.nextCursor:null):(page.success?page.data.nextCursor:null);
  const blocked=blockedAt!==undefined&&actions.dataUpdatedAt<=blockedAt;
  const check=async(item:Item)=>{
    const reason=reasons[item.id];if(!reason||busy.current||loading||blocked)return;
    busy.current=true;setNotice('');
    const input=pending.current.get(item.id)??{effectId:item.id,requestId:crypto.randomUUID(),reason};pending.current.set(item.id,input);
    try {
      const saved=sallaEffectAuditItem.parse(await mutation.mutateAsync(input));
      if(saved.effect.id!==item.id||saved.effect.orderId!==item.orderId||saved.reason!==input.reason)throw Error('Unexpected review');
      pending.current.delete(item.id);setNotice(t('merchantUx.sallaEffects.saved',{id:saved.id}));setBlockedAt(undefined);
      await Promise.all([utils.salla.listEffects.invalidate(),utils.salla.listEffectReviews.invalidate()]);
    } catch {setBlockedAt(actions.dataUpdatedAt);setNotice(t('merchantUx.sallaEffects.saveFailed'));}
    finally{busy.current=false;}
  };
  const refresh=()=>{if(beforeId!==undefined)setBeforeId(undefined);else void query.refetch();};
  const control='min-h-11 w-full min-w-0 rounded-md border bg-background px-3';
  return <div className="space-y-4 p-4 text-sm" data-salla-effect-browser>
    <p>{t('merchantUx.sallaEffects.scope')}</p>
    <div className="flex flex-wrap gap-2">
      <Button data-effect-tab="actions" className="h-auto min-h-11 whitespace-normal" aria-pressed={!history} variant={history?'outline':'default'} disabled={mutation.isPending} onClick={()=>{setHistory(false);setBeforeId(undefined);setNotice('');}}>{t('merchantUx.sallaEffects.effects')}</Button>
      <Button data-effect-tab="history" className="h-auto min-h-11 whitespace-normal" aria-pressed={history} variant={history?'default':'outline'} disabled={mutation.isPending} onClick={()=>{setHistory(true);setBeforeId(undefined);setNotice('');}}>{t('merchantUx.sallaEffects.history')}</Button>
    </div>
    <form className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={e=>{e.preventDefault();
      const parsed=sallaEffectListInput.safeParse({orderId:order?Number(order):undefined,state:state||undefined,kind:kind||undefined});
      if(!parsed.success||!!order&&!/^[0-9]+$/.test(order)){setFilterError(true);return;}setFilterError(false);setFilters(parsed.data);setBeforeId(undefined);setNotice('');
    }}>
      <label>{t('merchantUx.sallaEffects.order')}<input data-effect-order className={control} inputMode="numeric" value={order} placeholder={t('merchantUx.sallaEffects.all')} disabled={mutation.isPending} onChange={e=>setOrder(e.target.value)}/></label>
      {!history&&<><label>{t('merchantUx.sallaEffects.state')}<select data-effect-state className={control} value={state} disabled={mutation.isPending} onChange={e=>setState(e.target.value)}>
        <option value="">{t('merchantUx.sallaEffects.all')}</option><option value="pending">{t('merchantUx.sallaEffects.pending')}</option><option value="processing">{t('merchantUx.sallaEffects.processing')}</option><option value="dispatching">{t('merchantUx.sallaEffects.dispatching')}</option><option value="accepted">{t('merchantUx.sallaEffects.accepted')}</option><option value="review">{t('merchantUx.sallaEffects.review')}</option>
      </select></label><label>{t('merchantUx.sallaEffects.kind')}<select data-effect-kind className={control} value={kind} disabled={mutation.isPending} onChange={e=>setKind(e.target.value)}>
        <option value="">{t('merchantUx.sallaEffects.all')}</option><option value="owner_notice">{t('merchantUx.sallaEffects.owner')}</option><option value="merchant_notice">{t('merchantUx.sallaEffects.merchant')}</option><option value="sheets">{t('merchantUx.sallaEffects.sheets')}</option>
      </select></label></>}
      <Button data-effect-apply type="submit" className="h-auto min-h-11 self-end whitespace-normal" disabled={mutation.isPending}>{t('merchantUx.sallaEffects.apply')}</Button>
    </form>
    {filterError&&<p role="alert" data-effect-filter-error>{t('merchantUx.sallaEffects.invalidFilter')}</p>}
    {loading?<p role="status" data-effect-loading>{t('merchantUx.sallaEffects.loading')}</p>:query.isError?<p role="alert" data-effect-error>{t('merchantUx.sallaEffects.failed')}</p>:!valid?<p role="alert" data-effect-error>{t('merchantUx.sallaEffects.invalid')}</p>:
      <div className="grid min-w-0 gap-3 md:grid-cols-2" data-effect-results>
        {history&&audit.success?(audit.data.items.length?audit.data.items.map(v=><article key={v.id} data-effect-audit={v.id} className="min-w-0 space-y-2 rounded-lg border p-4 [overflow-wrap:anywhere]">
          <p className="font-medium">{t('merchantUx.sallaEffects.reviewer',{id:v.id,user:v.reviewerUserId})}</p>
          <p>{v.reason==='delivery_check'?t('merchantUx.sallaEffects.delivery'):t('merchantUx.sallaEffects.incident')}</p>
          <p>{t('merchantUx.sallaEffects.observed')}: <time dateTime={v.observedAt}>{new Intl.DateTimeFormat(i18n.language,{dateStyle:'medium',timeStyle:'short'}).format(new Date(v.observedAt))}</time></p>
          <EffectDetails item={v.effect}/>
        </article>):<p>{t('merchantUx.sallaEffects.emptyHistory')}</p>):page.success&&(page.data.items.length?page.data.items.map(item=><article data-effect-row={item.id} key={item.id} className="min-w-0 space-y-2 rounded-lg border p-4 [overflow-wrap:anywhere]">
          <EffectDetails item={item}/>
          <label className="block">{t('merchantUx.sallaEffects.reason')}<select data-effect-reason className={control} value={reasons[item.id]||''} disabled={mutation.isPending||pending.current.has(item.id)} onChange={e=>setReasons(v=>({...v,[item.id]:e.target.value as Check['reason']}))}>
            <option value="">{t('merchantUx.sallaEffects.chooseReason')}</option><option value="delivery_check">{t('merchantUx.sallaEffects.delivery')}</option><option value="incident_review">{t('merchantUx.sallaEffects.incident')}</option>
          </select></label>
          <Button data-effect-check className="h-auto min-h-11 w-full whitespace-normal" disabled={!reasons[item.id]||mutation.isPending||blocked} onClick={()=>void check(item)}>{mutation.isPending?t('merchantUx.sallaEffects.checking'):t('merchantUx.sallaEffects.check')}</Button>
        </article>):<p>{t('merchantUx.sallaEffects.empty')}</p>)}
      </div>}
    {notice&&<p role="status" data-effect-notice>{notice}</p>}
    <div className="flex flex-wrap gap-2">
      <Button data-effect-refresh variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={query.isFetching||mutation.isPending} onClick={refresh}>{beforeId?t('merchantUx.sallaEffects.latest'):t('merchantUx.sallaEffects.refresh')}</Button>
      {!loading&&!query.isError&&cursor&&<Button data-effect-older variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={mutation.isPending} onClick={()=>setBeforeId(cursor)}>{t('merchantUx.sallaEffects.older')}</Button>}
    </div>
    <p className="text-muted-foreground">{t('merchantUx.sallaEffects.historyScope')}</p>
  </div>;
}
export function SallaEffectReview() {
  const {t}=useTranslation(),[open,setOpen]=useState(false);
  const access=trpc.salla.effectReviewAccess.useQuery(undefined,{retry:false,staleTime:0});
  if(access.isError||!access.data?.canReview)return null;
  return <details data-salla-effect-review className="min-w-0 rounded-xl border bg-background" onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer p-4 font-semibold">{t('merchantUx.sallaEffects.title')}</summary>
    {open&&<EffectBrowser/>}
  </details>;
}
