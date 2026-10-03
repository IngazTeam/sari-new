import { useEffect, useRef, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { WorkspaceState, workspaceFailureKind } from './WorkspaceState';
import { orderNoticeLabels } from '@/lib/order-notice-workspace-labels';
import { orderNoticeNavigation, scopedOrderNoticeWorkspace, scopedOrderNoticeDetail } from '@/lib/order-notice-workspace';
import { catalogHref } from '@/lib/service-catalog-navigation';
import { orderNoticeStatus, orderNoticeState, orderNoticeEvidence, type OrderNoticeRow, type OrderNoticeWorkspace as NoticeWorkspace } from '@shared/order-notification-workspace';
import { saveOrderNoticeTemplateInput, saveOrderNoticeTemplateResult, acknowledgeOrderNoticesResult } from '@shared/order-notification-actions';
import { orderNotificationVariables, fillOrderNotificationTemplate } from '@shared/order-notification-template';
import '@/styles/service-catalog-workspace.css';
import '@/styles/order-notice-workspace.css';

type Template=NoticeWorkspace['templates'][number];
type Selected={kind:'template';status:string}|{kind:'notice';id:number};
export function OrderNoticeWorkspace({actorId,merchantId}:{actorId:number;merchantId:number}) {
  const {t,i18n}=useTranslation(),c=orderNoticeLabels(t),locale=i18n.language.startsWith('ar')?'ar':'en';
  const [path,navigate]=useLocation(),search=useSearch(),selection=orderNoticeNavigation(search),utils=trpc.useUtils();
  const history=new URLSearchParams(search).get('view')==='history';
  const query=trpc.orderNotifications.workspace.useQuery(selection,{retry:false,staleTime:0,refetchOnMount:'always'});
  const data=query.error?null:scopedOrderNoticeWorkspace(query.data,actorId,merchantId,selection);
  const saveMutation=trpc.orderNotifications.saveTemplate.useMutation({retry:false}),ackMutation=trpc.orderNotifications.acknowledgeReviewed.useMutation({retry:false});
  const [selected,setSelected]=useState<Selected|null>(null),[template,setTemplate]=useState<Template|null>(null),[row,setRow]=useState<OrderNoticeRow|null>(null);
  const [draft,setDraft]=useState(''),[enabled,setEnabled]=useState(false),[canManage,setCanManage]=useState(false),[confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false),[blocked,setBlocked]=useState(false),[failure,setFailure]=useState(''),[notice,setNotice]=useState(''),[fieldError,setFieldError]=useState('');
  const [searchDraft,setSearchDraft]=useState<string|null>(null);
  const alive=useRef(true),lock=useRef(false),epoch=useRef(0),scope=useRef(''),opener=useRef<HTMLElement|null>(null);
  const heading=useRef<HTMLHeadingElement>(null),dialogHeading=useRef<HTMLHeadingElement>(null),field=useRef<HTMLTextAreaElement>(null),feedback=useRef<HTMLParagraphElement>(null);
  scope.current=`${actorId}:${merchantId}:${search}:${locale}`;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;epoch.current++;};},[]);
  useEffect(()=>{epoch.current++;setSelected(null);setTemplate(null);setRow(null);setSearchDraft(null);},[search,locale]);
  useEffect(()=>{if(query.error){epoch.current++;setSelected(null);setTemplate(null);setRow(null);}},[query.error]);
  useEffect(()=>{if(!busy){if(fieldError)field.current?.focus();else if(failure||notice)feedback.current?.focus();}},[busy,fieldError,failure,notice]);
  const number=(n:number)=>n.toLocaleString(locale),change=(patch:Record<string,string|number|null>)=>navigate(catalogHref(path,search,patch));
  const statusText=(status:string|null)=>status&&orderNoticeStatus.safeParse(status).success?c[status as 'pending'|'paid'|'processing'|'shipped'|'delivered'|'cancelled']:c.legacy;
  const states={pending:c.queued,processing:c.working,sent:c.recordedSent,failed:c.retry,manual_review:c.manual,suppressed:c.suppressed,unknown:c.unknown};
  const evidence={unverified:c.unverified,accepted:c.accepted,delivered:c.receiptDelivered,read:c.read,failed:c.receiptFailed,simulated:c.simulated};
  const stamp=(v:string|null)=>v?new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):c.unknown;
  async function load(target:Selected,checking=false) {
    if(lock.current)return;lock.current=true;setBusy(true);setFailure('');setFieldError('');setNotice('');setConfirmed(false);setRow(null);setTemplate(null);setCanManage(false);
    const view=scope.current,token=++epoch.current;
    try {
      if(target.kind==='template') {
        const raw=await utils.orderNotifications.workspace.fetch(selection,{staleTime:0});
        if(!alive.current||scope.current!==view||epoch.current!==token)return;
        const current=scopedOrderNoticeWorkspace(raw,actorId,merchantId,selection),found=current?.templates.find(r=>r.status===target.status);
        if(!current||!found)throw Error();setTemplate(found);setDraft(found.template);setEnabled(found.enabled===true);setCanManage(current.canManage);
      } else {
        const raw=await utils.orderNotifications.detail.fetch({id:target.id},{staleTime:0});
        if(!alive.current||scope.current!==view||epoch.current!==token)return;
        const current=scopedOrderNoticeDetail(raw,actorId,merchantId,target.id);if(!current)throw Error();setRow(current.row);setCanManage(current.canManage);
      }
      setBlocked(false);if(checking)setNotice(c.checked);
    } catch(e) {if(alive.current&&scope.current===view&&epoch.current===token){setFailure((e as any)?.data?.code==='FORBIDDEN'?c.denied:c.failed);setBlocked(true);}}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  const open=(target:Selected)=>{opener.current=document.activeElement as HTMLElement;setSelected(target);setBlocked(false);void load(target);};
  const writable=!!data?.canManage&&canManage&&!busy&&!blocked&&!query.isFetching;
  const actionError=(error:unknown)=>{const code=(error as any)?.data?.code;setBlocked(true);setFailure(code==='CONFLICT'?c.stale:code==='FORBIDDEN'?c.denied:['NOT_FOUND','PRECONDITION_FAILED','BAD_REQUEST'].includes(code)?c.failed:c.uncertain);};
  async function save() {
    if(!writable||!template?.canonicalStatus||lock.current)return;
    const parsed=saveOrderNoticeTemplateInput.safeParse({status:template.canonicalStatus,revision:template.revision,template:draft,enabled});
    if(!parsed.success){setFieldError(c.fieldError);return;}
    const view=scope.current,token=epoch.current;lock.current=true;setBusy(true);setFailure('');setNotice('');setFieldError('');
    try {
      const raw=await saveMutation.mutateAsync(parsed.data);if(!alive.current||view!==scope.current||token!==epoch.current)return;
      const r=saveOrderNoticeTemplateResult.parse(raw);
      if(r.actorId!==actorId||r.merchantId!==merchantId||r.template.status!==parsed.data.status||r.template.template!==parsed.data.template||r.template.enabled!==parsed.data.enabled)throw Error();
      setTemplate(r.template);setDraft(r.template.template);setNotice(r.effect==='saved'?c.saved:c.already);void query.refetch();
    } catch(e){if(alive.current&&view===scope.current&&token===epoch.current)actionError(e);}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  async function acknowledge() {
    if(!writable||!row||!confirmed||row.integrity!=='linked'||!row.hasEvent||row.state!=='manual_review'||lock.current)return;
    const view=scope.current,token=epoch.current;lock.current=true;setBusy(true);setFailure('');setNotice('');
    try {
      const raw=await ackMutation.mutateAsync({records:[{id:row.id,revision:row.revision}]});if(!alive.current||view!==scope.current||token!==epoch.current)return;
      const r=acknowledgeOrderNoticesResult.parse(raw);if(r.actorId!==actorId||r.merchantId!==merchantId||r.acknowledgedIds.length!==1||r.acknowledgedIds[0]!==row.id)throw Error();
      setNotice(c.acknowledged);setRow(null);setBlocked(true);setConfirmed(false);void query.refetch();
    }catch(e){if(alive.current&&view===scope.current&&token===epoch.current)actionError(e);}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  let preview='';try{preview=fillOrderNotificationTemplate(draft,{customerName:c.sampleCustomer,storeName:c.sampleStore,orderNumber:'DEMO-1042',total:12500,currency:'SAR',trackingNumber:'DEMO-123'});}catch{}
  const close=()=>{if(!busy){epoch.current++;setSelected(null);setTemplate(null);setRow(null);}};
  return <div className="service-catalog order-notice-workspace" dir={locale==='ar'?'rtl':'ltr'}>
    <header className="sc-header"><div><p className="sc-eyebrow">{c.eyebrow}</p><h1 ref={heading} tabIndex={-1}>{c.title}</h1><p>{c.intro}</p></div><Button variant="outline" disabled={busy||query.isFetching} onClick={()=>void query.refetch()}><RefreshCw aria-hidden="true"/>{c.refresh}</Button></header>
    {query.error?<WorkspaceState inline kind={workspaceFailureKind(query.error)} onRetry={()=>void query.refetch()}/>:!data?<WorkspaceState inline kind={query.isFetching||query.isLoading?'loading':'error'} onRetry={()=>void query.refetch()}/>:<>
      {!data.canManage&&<p className="sc-muted">{c.readonly}</p>}
      <dl className="sc-summary"><div><dt>{c.total}</dt><dd>{number(data.stats.total)}</dd></div><div><dt>{c.review}</dt><dd>{number(data.stats.states.manual_review)}</dd></div><div><dt>{c.deliveredTotal}</dt><dd>{number(data.stats.evidence.delivered+data.stats.evidence.read)}</dd></div></dl>
      <p className="sc-muted">{c.statsHelp}</p><p className="sc-muted">{c.evidenceHelp}</p>
      <nav className="on-tabs" aria-label={c.title}><Button variant={history?'outline':'default'} aria-pressed={!history} disabled={busy} onClick={()=>change({view:null})}>{c.templates}</Button><Button variant={history?'default':'outline'} aria-pressed={history} disabled={busy} onClick={()=>change({view:'history'})}>{c.history}</Button></nav>
      {!history?<section aria-label={c.templates}><p className="sc-muted mb-4">{c.templateHelp}</p><div className="on-grid">{data.templates.map(r=><article className="on-card" key={r.status}>
        <div className="on-head"><h2>{statusText(r.canonicalStatus)}{!r.canonicalStatus&&<bdi> · {r.status}</bdi>}</h2><Badge variant="outline">{r.enabled===null?c.unknown:r.enabled?c.enabled:c.disabled}</Badge></div>
        <p className="on-excerpt">{r.template||c.unknown}</p>{!!r.issues.length&&<p className="sc-muted">{c.invalid}</p>}
        <p className="sc-muted">{c.updated}: {stamp(r.updatedAt)}</p><Button variant="outline" disabled={busy||query.isFetching} onClick={()=>open({kind:'template',status:r.status})}>{data.canManage&&r.canonicalStatus?c.edit:c.details}<span className="sr-only"> · {statusText(r.canonicalStatus)}</span></Button>
      </article>)}</div></section>:<section className="sc-list" aria-label={c.history} aria-busy={query.isFetching}>
        <form className="sc-filters" onSubmit={e=>{e.preventDefault();change({q:(searchDraft??selection.query).trim(),page:null});}}>
          <label className="sc-search"><span>{c.search}</span><input maxLength={100} placeholder={c.searchHint} value={searchDraft??selection.query} disabled={busy} onChange={e=>setSearchDraft(e.target.value)}/></label><Button variant="outline" type="submit" disabled={busy}>{c.searchAction}</Button>
          <label><span>{c.status}</span><select disabled={busy} value={selection.status??''} onChange={e=>change({status:e.target.value||null,page:null})}><option value="">{c.all}</option>{orderNoticeStatus.options.map(s=><option key={s} value={s}>{statusText(s)}</option>)}</select></label>
          <label><span>{c.state}</span><select disabled={busy} value={selection.state??''} onChange={e=>change({state:e.target.value||null,page:null})}><option value="">{c.all}</option>{orderNoticeState.options.map(s=><option key={s} value={s}>{states[s]}</option>)}</select></label>
          <label><span>{c.evidence}</span><select disabled={busy} value={selection.evidence??''} onChange={e=>change({evidence:e.target.value||null,page:null})}><option value="">{c.all}</option>{orderNoticeEvidence.options.map(s=><option key={s} value={s}>{evidence[s]}</option>)}</select></label>
          <label><span>{c.integrity}</span><select disabled={busy} value={selection.integrity} onChange={e=>change({integrity:e.target.value==='all'?null:e.target.value,page:null})}><option value="all">{c.all}</option><option value="linked">{c.linked}</option><option value="unlinked">{c.unlinked}</option></select></label>
          <label><span>{c.sort}</span><select disabled={busy} value={selection.sort} onChange={e=>change({sort:e.target.value==='newest'?null:e.target.value,page:null})}><option value="newest">{c.newest}</option><option value="oldest">{c.oldest}</option></select></label>
          {(selection.query||selection.status||selection.state||selection.evidence||selection.integrity!=='all')&&<Button type="button" variant="outline" disabled={busy} onClick={()=>change({q:null,status:null,state:null,evidence:null,integrity:null,page:null})}>{c.clear}</Button>}
        </form><p className="sc-results" aria-live="polite">{c.matches}: {number(data.matched)}</p>
        {!data.rows.length?<div className="sc-empty"><p>{data.stats.total?c.noResults:c.empty}</p></div>:<div className="on-grid">{data.rows.map(r=><article className="on-card" key={r.id}>
          <div className="on-head"><h2>{r.integrity==='linked'?r.order?.number||`${c.order} #${r.order?.id}`:c.unlinked}</h2><span><bdi>#{r.id}</bdi></span></div>
          <div className="on-badges"><Badge variant="outline">{states[r.state]}</Badge><Badge variant="outline">{evidence[r.evidence]}</Badge></div><p className="on-excerpt">{r.integrity==='linked'?r.message:c.referenceHelp}</p>
          <p className="sc-muted">{stamp(r.createdAt)}</p><Button variant="outline" disabled={busy||query.isFetching} onClick={()=>open({kind:'notice',id:r.id})}>{c.details}<span className="sr-only"> #{r.id}</span></Button>
        </article>)}</div>}
        {data.pages>1&&<nav className="sc-pagination" aria-label={c.history}><Button variant="outline" disabled={busy||query.isFetching||data.currentPage<=1} onClick={()=>change({page:data.currentPage-1})}>{c.previous}</Button><span>{c.page} {number(data.currentPage)} {c.of} {number(data.pages)}</span><Button variant="outline" disabled={busy||query.isFetching||data.currentPage>=data.pages} onClick={()=>change({page:data.currentPage+1})}>{c.next}</Button></nav>}
      </section>}
    </>}
    <Dialog open={!!selected&&!!data} onOpenChange={open=>{if(!open)close();}}><DialogContent className="sc-dialog on-dialog" dir={locale==='ar'?'rtl':'ltr'} closeLabel={c.close} showCloseButton={!busy}
      onInteractOutside={e=>{if(busy)e.preventDefault();}} onEscapeKeyDown={e=>{if(busy)e.preventDefault();}}
      onOpenAutoFocus={e=>{e.preventDefault();dialogHeading.current?.focus();}} onCloseAutoFocus={e=>{e.preventDefault();if(opener.current?.isConnected)opener.current.focus();else heading.current?.focus();}}>
      <DialogHeader><DialogTitle ref={dialogHeading} tabIndex={-1}>{selected?.kind==='template'?c.editTitle:c.detailTitle}</DialogTitle><DialogDescription>{selected?.kind==='template'?c.templateHelp:c.evidenceHelp}</DialogDescription></DialogHeader>
      {(failure||notice)&&<p ref={feedback} tabIndex={-1} role={failure?'alert':'status'} className="sc-feedback">{failure||notice}</p>}
      {busy&&!row&&!template?<WorkspaceState inline kind="loading"/>:template?<>
        <h3>{statusText(template.canonicalStatus)}</h3>{!!template.issues.length&&<p className="sc-muted">{c.invalid}</p>}{!template.canonicalStatus&&<p>{c.unsupported}</p>}
        <label htmlFor="on-message"><span id="on-message-label">{c.message}</span><textarea id="on-message" ref={field} rows={5} dir="auto" value={draft} disabled={!writable||!template.canonicalStatus} aria-labelledby="on-message-label" aria-invalid={!!fieldError} aria-describedby={fieldError?'on-error on-count':'on-count'} onChange={e=>{setDraft(e.target.value);setFieldError('');setNotice('');}}/>
          {fieldError&&<span id="on-error" className="text-destructive">{fieldError}</span>}<span id="on-count" className="sc-muted"><bdi>{number(draft.trim().length)} / {number(3500)}</bdi></span></label>
        <div><p className="sc-muted">{c.variables}</p><div className="on-variables">{orderNotificationVariables.map(v=><button type="button" key={v} disabled={!writable||!template.canonicalStatus} onClick={()=>{setDraft(old=>old+`{{${v}}}`);field.current?.focus();}}><bdi>{`{{${v}}}`}</bdi></button>)}</div></div>
        <label className="on-check"><input type="checkbox" checked={enabled} disabled={!writable||!template.canonicalStatus} onChange={e=>setEnabled(e.target.checked)}/><span>{c.enable}</span></label>
        <section aria-label={c.preview}><h3>{c.preview}</h3><p className="sc-muted">{c.previewHelp}</p><p className="on-preview" dir="auto">{preview||c.unknown}</p></section>
        {(!canManage||!data?.canManage)&&<p className="sc-muted">{c.readonly}</p>}
      </>:row?<>
        {row.integrity==='unlinked'?<p>{c.referenceHelp}</p>:<><div className="on-badges"><Badge variant="outline">{states[row.state]}</Badge><Badge variant="outline">{evidence[row.evidence]}</Badge></div><p className="on-preview" dir="auto">{row.message}</p>
          <dl className="on-facts">{[[c.order,row.order?.number||`#${row.order?.id}`],[c.phone,row.customerPhone],[c.status,statusText(row.status)],[c.created,stamp(row.createdAt)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd><bdi>{value||c.unknown}</bdi></dd></div>)}</dl>
          <details><summary>{c.recordDetails}</summary><dl className="on-facts">{[[c.attempts,row.attempts===null?c.unknown:number(row.attempts)],
            [c.provider,row.provider],[c.providerId,row.providerMessageId],[c.evidenceAt,stamp(row.evidenceAt)],[c.created,stamp(row.createdAt)],[c.updated,stamp(row.updatedAt)],[c.available,stamp(row.availableAt)],
            [c.claimed,stamp(row.claimedAt)],[c.sentAt,stamp(row.sentAt)],[c.reviewedAt,stamp(row.reviewedAt)],[c.reviewedBy,row.reviewedByUserId?`#${row.reviewedByUserId}`:null]].map(([label,value])=><div key={label}><dt>{label}</dt><dd><bdi>{value||c.unknown}</bdi></dd></div>)}</dl></details></>}
        {!!row.issues.length&&<p className="sc-muted">{c.invalid}</p>}<p className="sc-muted">{c.datesHelp}</p>
        {row.integrity==='linked'&&row.hasEvent&&row.state==='manual_review'&&data?.canManage&&canManage&&!blocked&&<><p>{c.acknowledgeHelp}</p><label className="on-check"><input type="checkbox" checked={confirmed} disabled={!writable} onChange={e=>setConfirmed(e.target.checked)}/><span>{c.confirm}</span></label></>}
      </>:null}
      <div className="on-footer"><Button variant="outline" disabled={busy} onClick={close}>{c.close}</Button>
        {selected&&(blocked||(!template&&!row))&&<Button variant="outline" disabled={busy} onClick={()=>void load(selected,true)}>{c.check}</Button>}
        {template?.canonicalStatus&&data?.canManage&&canManage&&!blocked&&<Button disabled={!writable} onClick={()=>void save()}>{busy?c.saving:c.save}</Button>}
        {row?.integrity==='linked'&&row.hasEvent&&row.state==='manual_review'&&data?.canManage&&canManage&&!blocked&&<Button disabled={!writable||!confirmed} onClick={()=>void acknowledge()}>{busy?c.saving:c.acknowledge}</Button>}
      </div>
    </DialogContent></Dialog>
  </div>;
}
