import { useEffect,useRef,useState } from 'react';
import { Link,useLocation,useSearch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Plus,RefreshCw,Search,ArrowUpRight,AlertCircle,Send,Trash2,FileText,Pencil } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { campaignWorkspaceSchema,type CampaignWorkspace } from '@shared/campaign-workspace';
import { campaignNavigation,campaignHref,campaignSelectionKey } from '@/lib/campaign-navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle } from '@/components/ui/dialog';
import { WorkspaceState,workspaceFailureKind } from './WorkspaceState';
import { CampaignPerformance } from './CampaignPerformance';
import '@/styles/campaign-workspace.css';

type Row=CampaignWorkspace['rows'][number];
type Action={type:'delete'|'review';row:Row;view:string};
export function CampaignListWorkspace({actorId,merchantId}:{actorId:number;merchantId:number}) {
  const {t,i18n}=useTranslation(),[pathname,navigate]=useLocation(),search=useSearch();
  const {selection,tab}=campaignNavigation(search),selectionKey=campaignSelectionKey(selection);
  const [searchEdit,setSearchEdit]=useState<{source:string;value:string}|null>(null);
  const searchValue=searchEdit?.source===search?searchEdit.value:selection.search;
  const [action,setAction]=useState<Action|null>(null),[reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[failure,setFailure]=useState('');
  const mounted=useRef(true),lock=useRef(false),view=useRef('');view.current=`${actorId}:${merchantId}:${pathname}:${search}`;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const change=(patch:Record<string,string|number|null>)=>navigate(campaignHref(pathname,search,patch));
  useEffect(()=>{setSearchEdit(null);setAction(null);setFailure('');setNotice('');},[search]);
  useEffect(()=>{
    if(searchValue.trim()===selection.search||busy)return;
    const timer=window.setTimeout(()=>navigate(campaignHref(pathname,search,{q:searchValue.trim(),page:null})),300);
    return()=>window.clearTimeout(timer);
  },[searchValue,selection.search,pathname,search,navigate,busy]);
  const query=trpc.campaigns.workspace.useQuery(selection,{retry:false,staleTime:0,refetchOnMount:'always',
    refetchInterval:query=>query.state.data?.summary.sending?10_000:false});
  const parsed=campaignWorkspaceSchema.safeParse(query.data);
  const matches=parsed.success&&parsed.data.actorId===actorId&&parsed.data.merchantId===merchantId&&campaignSelectionKey(parsed.data.selection)===selectionKey;
  const data=!query.error&&matches?parsed.data:undefined;
  const remove=trpc.campaigns.delete.useMutation(),review=trpc.campaigns.acknowledgeManualReview.useMutation();
  const utils=trpc.useUtils(),refresh=()=>{void query.refetch();void utils.campaigns.performanceSnapshot.invalidate();};
  const names={draft:t('merchantUx.campaignWorkspace.draft'),scheduled:t('merchantUx.campaignWorkspace.scheduledStatus'),sending:t('merchantUx.campaignWorkspace.sending'),completed:t('merchantUx.campaignWorkspace.completedStatus'),failed:t('merchantUx.campaignWorkspace.failed')};
  const locale=i18n.language.startsWith('ar')?'ar-SA':'en-US',number=(value:number)=>value.toLocaleString(locale);
  const date=(value:string|null)=>{
    if(!value||!data?.timezone)return t('merchantUx.campaignWorkspace.unknownDate');
    return new Intl.DateTimeFormat(locale,{calendar:'gregory',dateStyle:'medium',timeStyle:'short',timeZone:data.timezone}).format(new Date(value));
  };
  const opener=useRef<HTMLElement|null>(null);
  const open=(type:Action['type'],row:Row)=>{opener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setReviewed(false);setFailure('');setAction({type,row,view:view.current});};
  const current=action&&data?.rows.find(row=>row.id===action.row.id);
  const unchanged=!!action&&action.view===view.current&&!!current&&JSON.stringify(current)===JSON.stringify(action.row);
  const canConfirm=!!data?.canManage&&unchanged&&(action?.type!=='review'||reviewed)&&!query.isFetching&&!busy;
  const confirm=async()=>{
    if(!action||!canConfirm||lock.current)return;
    const submitted=action;lock.current=true;setBusy(true);setFailure('');
    try {
      if(submitted.type==='delete')await remove.mutateAsync({id:submitted.row.id});
      else await review.mutateAsync({id:submitted.row.id});
      if(mounted.current&&view.current===submitted.view){setAction(null);setNotice(submitted.type==='delete'?t('merchantUx.campaignWorkspace.deleteSuccess'):t('merchantUx.campaignWorkspace.reviewSuccess'));refresh();}
    }catch{
      if(mounted.current&&view.current===submitted.view){setFailure(t('merchantUx.campaignWorkspace.actionError'));setReviewed(false);refresh();}
    }finally{lock.current=false;if(mounted.current)setBusy(false);}
  };
  if(query.error)return <WorkspaceState kind={workspaceFailureKind(query.error)} onRetry={()=>{void query.refetch();}} />;
  if(!data)return <WorkspaceState kind={query.isLoading||query.isFetching?'loading':'error'} onRetry={()=>{void query.refetch();}} />;
  const filtered=!!selection.search||selection.status!=='all'||selection.needsReview;
  const reset=()=>change({q:null,status:null,page:null,review:null});
  return <div className="campaign-workspace" dir={i18n.language.startsWith('ar')?'rtl':'ltr'}>
    <header className="cw-header"><div><p className="cw-eyebrow">{t('merchantUx.campaignWorkspace.eyebrow')}</p><h1>{t('merchantUx.campaignWorkspace.title')}</h1><p>{t('merchantUx.campaignWorkspace.description')}</p></div>
      <div className="cw-header-actions"><Button variant="outline" disabled={query.isFetching||busy} onClick={refresh}><RefreshCw aria-hidden="true" />{t('merchantUx.campaignWorkspace.refresh')}</Button>
        {data.canManage&&<Button asChild><Link href="/merchant/campaigns/new"><Plus aria-hidden="true" />{t('merchantUx.campaignWorkspace.create')}</Link></Button>}</div></header>
    {!data.canManage&&<p className="cw-muted">{t('merchantUx.campaignWorkspace.readOnly')}</p>}
    {notice&&<p className="cw-notice" role="status">{notice}</p>}{failure&&!action&&<p className="cw-error" role="alert">{failure}</p>}
    <dl className="cw-summary">
      <div><dt>{t('merchantUx.campaignWorkspace.all')}</dt><dd>{number(data.summary.total)}</dd></div>
      <div><dt>{t('merchantUx.campaignWorkspace.active')}</dt><dd>{number(data.summary.sending+data.summary.scheduled)}</dd></div>
      <div><dt>{t('merchantUx.campaignWorkspace.drafts')}</dt><dd>{number(data.summary.draft)}</dd></div>
      <div><dt>{t('merchantUx.campaignWorkspace.completed')}</dt><dd>{number(data.summary.completed)}</dd></div>
    </dl>
    {data.needsReview>0&&<aside className="cw-review"><AlertCircle aria-hidden="true" /><div><h2>{t('merchantUx.campaignWorkspace.reviewTitle')}</h2><p>{t('merchantUx.campaignWorkspace.reviewHint',{count:data.needsReview})}</p></div><Button variant="outline" onClick={()=>change({review:1,status:null,page:null,tab:'list'})}>{t('merchantUx.campaignWorkspace.showReview')}</Button></aside>}
    <nav className="cw-tabs" aria-label={t('merchantUx.campaignWorkspace.title')}><Button variant={tab==='list'?'default':'ghost'} aria-current={tab==='list'?'page':undefined} onClick={()=>change({tab:'list'})}>{t('merchantUx.campaignWorkspace.list')}</Button><Button variant={tab==='performance'?'default':'ghost'} aria-current={tab==='performance'?'page':undefined} onClick={()=>change({tab:'performance'})}>{t('merchantUx.campaignWorkspace.performance')}</Button></nav>
    {tab==='performance'?<CampaignPerformance actorId={actorId} merchantId={merchantId} onRefresh={()=>{void query.refetch();}}/>:<section className="cw-list" aria-busy={query.isFetching}>
      <div className="cw-filters"><label className="cw-search"><span>{t('merchantUx.campaignWorkspace.search')}</span><div><Search aria-hidden="true" /><input maxLength={200} value={searchValue} placeholder={t('merchantUx.campaignWorkspace.searchHint')} onChange={event=>setSearchEdit({source:search,value:event.target.value})}/></div></label>
        <label><span>{t('merchantUx.campaignWorkspace.status')}</span><select value={selection.status} onChange={event=>change({status:event.target.value,page:null})}><option value="all">{t('merchantUx.campaignWorkspace.allStatuses')}</option>{Object.entries(names).map(([value,name])=><option key={value} value={value}>{name}</option>)}</select></label>
        <label className="cw-check"><input type="checkbox" checked={selection.needsReview} onChange={event=>change({review:event.target.checked?1:null,page:null})}/>{t('merchantUx.campaignWorkspace.reviewOnly')}</label>
        {filtered&&<Button variant="ghost" onClick={reset}>{t('merchantUx.campaignWorkspace.clear')}</Button>}</div>
      <div className="cw-list-heading"><p role="status">{t('merchantUx.campaignWorkspace.results',{count:data.pagination.total})}</p><p className="cw-muted">{t('merchantUx.campaignWorkspace.acceptanceHint')}</p></div>
      {!data.rows.length?<div className="cw-empty"><Send aria-hidden="true"/><h2>{selection.page>1?t('merchantUx.campaignWorkspace.outOfRange'):filtered?t('merchantUx.campaignWorkspace.noResults'):t('merchantUx.campaignWorkspace.empty')}</h2><p>{filtered?t('merchantUx.campaignWorkspace.noResultsHint'):t('merchantUx.campaignWorkspace.emptyHint')}</p>
        {selection.page>1?<Button onClick={()=>change({page:null})}>{t('merchantUx.campaignWorkspace.first')}</Button>:filtered?<Button variant="outline" onClick={reset}>{t('merchantUx.campaignWorkspace.clear')}</Button>:data.canManage?<Button asChild><Link href="/merchant/campaigns/new">{t('merchantUx.campaignWorkspace.create')}</Link></Button>:null}</div>:
        <ul className="cw-records">{data.rows.map(row=>{const queue=row.queue,done=queue?queue.total-queue.awaiting:0,editable=['draft','scheduled'].includes(row.status);return <li key={row.id} className="cw-record" data-campaign-id={row.id}>
          <div className="cw-record-title"><Link href={`/merchant/campaigns/${row.id}`}><h2>{row.name}</h2><ArrowUpRight aria-hidden="true"/></Link><Badge variant={row.status==='failed'?'destructive':'secondary'}>{names[row.status]}</Badge></div>
          <dl className="cw-record-stats"><div><dt>{t('merchantUx.campaignWorkspace.accepted')}</dt><dd>{number(row.accepted)}</dd></div><div><dt>{t('merchantUx.campaignWorkspace.recipients')}</dt><dd>{number(row.recipients)}</dd></div><div><dt>{row.scheduledAt?t('merchantUx.campaignWorkspace.scheduled'):t('merchantUx.campaignWorkspace.created')}</dt><dd><time dateTime={row.scheduledAt??row.createdAt}>{date(row.scheduledAt??row.createdAt)}</time></dd></div></dl>
          {queue&&queue.total>0?<div className="cw-progress"><p>{t('merchantUx.campaignWorkspace.processed',{done:number(done),total:number(queue.total)})}</p><progress max={queue.total} value={done} aria-label={t('merchantUx.campaignWorkspace.processed',{done:number(done),total:number(queue.total)})}/><div>{queue.awaiting>0&&<span>{t('merchantUx.campaignWorkspace.awaiting',{count:queue.awaiting})}</span>}{queue.suppressed>0&&<span>{t('merchantUx.campaignWorkspace.suppressed',{count:queue.suppressed})}</span>}{queue.needsReview>0&&<strong>{t('merchantUx.campaignWorkspace.reviewCount',{count:queue.needsReview})}</strong>}</div></div>:['sending','completed','failed'].includes(row.status)?<p className="cw-muted">{t('merchantUx.campaignWorkspace.noQueue')}</p>:null}
          <div className="cw-record-actions"><Button asChild variant="outline"><Link href={`/merchant/campaigns/${row.id}`}>{t('merchantUx.campaignWorkspace.details')}</Link></Button><Button asChild variant="ghost"><Link href={`/merchant/campaigns/${row.id}/report`}><FileText aria-hidden="true"/>{t('merchantUx.campaignWorkspace.report')}</Link></Button>
            {data.canManage&&editable&&<><Button asChild variant="ghost"><Link href={`/merchant/campaigns/${row.id}/edit`}><Pencil aria-hidden="true"/>{t('merchantUx.campaignWorkspace.edit')}</Link></Button><Button asChild variant="outline"><Link href={`/merchant/campaigns/${row.id}?review=send`} aria-label={`${t('merchantUx.campaignWorkspace.send')}: ${row.name}`}><Send aria-hidden="true"/>{t('merchantUx.campaignWorkspace.send')}</Link></Button><Button variant="ghost" disabled={busy||query.isFetching} aria-label={`${t('merchantUx.campaignWorkspace.remove')}: ${row.name}`} onClick={()=>open('delete',row)}><Trash2 aria-hidden="true"/>{t('merchantUx.campaignWorkspace.remove')}</Button></>}
            {data.canManage&&!!queue?.needsReview&&<Button variant="outline" disabled={busy||query.isFetching} aria-label={`${t('merchantUx.campaignWorkspace.review')}: ${row.name}`} onClick={()=>open('review',row)}>{t('merchantUx.campaignWorkspace.review')}</Button>}</div>
        </li>;})}</ul>}
      {data.pagination.pages>0&&<nav className="cw-pagination" aria-label={t('merchantUx.campaignWorkspace.list')}><Button variant="outline" disabled={selection.page<=1||busy} onClick={()=>change({page:selection.page-1})}>{t('merchantUx.campaignWorkspace.previous')}</Button><span>{t('merchantUx.campaignWorkspace.page',{page:number(selection.page),pages:number(data.pagination.pages)})}</span><Button variant="outline" disabled={selection.page>=data.pagination.pages||busy} onClick={()=>change({page:selection.page+1})}>{t('merchantUx.campaignWorkspace.next')}</Button></nav>}
    </section>}
    <Dialog open={!!action} onOpenChange={open=>{if(!open&&!busy){setAction(null);setFailure('');}}}><DialogContent closeLabel={t('merchantUx.campaignWorkspace.cancel')} className="cw-dialog" dir={i18n.language.startsWith('ar')?'rtl':'ltr'} onCloseAutoFocus={event=>{event.preventDefault();opener.current?.isConnected&&opener.current.focus();}}><DialogHeader><DialogTitle>{action?.type==='delete'?t('merchantUx.campaignWorkspace.deleteTitle',{name:action.row.name}):t('merchantUx.campaignWorkspace.reviewDialogTitle',{name:action?.row.name??''})}</DialogTitle><DialogDescription>{action?.type==='delete'?t('merchantUx.campaignWorkspace.deleteHint'):t('merchantUx.campaignWorkspace.reviewDialogHint')}</DialogDescription></DialogHeader>
      {action&&<Button asChild variant="outline"><Link href={`/merchant/campaigns/${action.row.id}${action.type==='review'?'/report':''}`}>{action.type==='review'?t('merchantUx.campaignWorkspace.report'):t('merchantUx.campaignWorkspace.details')}</Link></Button>}
      {!unchanged&&<p role="alert" className="cw-error">{t('merchantUx.campaignWorkspace.changed')}</p>}{failure&&<p role="alert" className="cw-error">{failure}</p>}
      {action?.type==='review'&&<label className="cw-check"><input type="checkbox" checked={reviewed} disabled={busy||!unchanged} onChange={event=>setReviewed(event.target.checked)}/>{t('merchantUx.campaignWorkspace.reviewed')}</label>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setAction(null)}>{t('merchantUx.campaignWorkspace.cancel')}</Button><Button variant={action?.type==='delete'?'destructive':'default'} disabled={!canConfirm} onClick={()=>{void confirm();}}>{action?.type==='delete'?t('merchantUx.campaignWorkspace.confirmDelete'):t('merchantUx.campaignWorkspace.confirmReview')}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
