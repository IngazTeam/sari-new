import {useEffect,useRef,useState} from 'react';
import {Link,useLocation,useSearch} from 'wouter';
import {useTranslation} from 'react-i18next';
import {Download,RefreshCw,Search,AlertCircle} from 'lucide-react';
import {trpc} from '@/lib/trpc';
import {campaignReportSchema,campaignReportExportSchema,campaignReportExportLimit,type CampaignReportSnapshot} from '@shared/campaign-report';
import {campaignReportNavigation,campaignReportSelectionKey} from '@/lib/campaign-report-navigation';
import {campaignHref} from '@/lib/campaign-navigation';
import {campaignReportLabels} from '@/lib/campaign-report-labels';
import {downloadCampaignReportCsv} from '@/lib/campaign-report-csv';
import {conversationMediaUrl} from '@/lib/conversation-message';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {WorkspaceState,workspaceFailureKind} from './WorkspaceState';
import '@/styles/campaign-workspace.css';
import '@/styles/campaign-report-workspace.css';

type ReportRow=CampaignReportSnapshot['rows'][number];
export function CampaignReportWorkspace({actorId,merchantId,campaignId}:{actorId:number;merchantId:number;campaignId:number}){
  const {t,i18n}=useTranslation(),label=campaignReportLabels(t),[pathname,navigate]=useLocation(),search=useSearch();
  const selection=campaignReportNavigation(campaignId,search),selectionKey=campaignReportSelectionKey(selection),recipient=selection.view==='recipients';
  const [edit,setEdit]=useState<{source:string;value:string}|null>(null),[busy,setBusy]=useState(false),[failure,setFailure]=useState(''),[notice,setNotice]=useState(''),[failedImage,setFailedImage]=useState<string|null>(null);
  const mounted=useRef(true),lock=useRef(false),scope=useRef('');scope.current=`${actorId}:${merchantId}:${selectionKey}`;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{setEdit(null);setFailure('');setNotice('');},[search]);
  const searchValue=edit?.source===search?edit.value:selection.search;
  useEffect(()=>{if(searchValue.trim()===selection.search)return;const timer=window.setTimeout(()=>navigate(campaignHref(pathname,search,{q:searchValue.trim(),page:null})),300);return()=>window.clearTimeout(timer);},[searchValue,selection.search,pathname,search,navigate]);
  const change=(patch:Record<string,string|number|null>)=>navigate(campaignHref(pathname,search,patch));
  const query=trpc.campaigns.reportWorkspace.useQuery(selection,{retry:false,staleTime:0,refetchOnMount:'always',refetchInterval:query=>query.state.data?.campaign.status==='sending'?10_000:false}),utils=trpc.useUtils();
  const parsed=campaignReportSchema.safeParse(query.data);
  const data=!query.error&&parsed.success&&parsed.data.actorId===actorId&&parsed.data.merchantId===merchantId&&campaignReportSelectionKey(parsed.data.selection)===selectionKey?parsed.data:null;
  const locale=i18n.language.startsWith('ar')?'ar-SA':'en-US',number=(value:number)=>value.toLocaleString(locale);
  const date=(value:string|null)=>{try{return value&&data?.timezone?new Intl.DateTimeFormat(locale,{calendar:'gregory',dateStyle:'medium',timeStyle:'short',timeZone:data.timezone}).format(new Date(value)):label('unknownDate');}catch{return label('unknownDate');}};
  const recipientNames={pending:label('pending'),processing:label('processing'),sent:label('sent'),failed:label('retrying'),suppressed:label('suppressed'),manual_review:label('manualReview')};
  const resultNames={pending:label('resultPending'),success:label('resultSuccess'),failed:label('resultFailed')};
  const names:Record<string,string>=recipient?recipientNames:resultNames;
  const reasons:Record<ReportRow['reason'],string>={none:label('reasonNone'),consent:label('reasonConsent'),quiet_hours:label('reasonQuiet'),capacity:label('reasonCapacity'),rate_limit:label('reasonRate'),inactive:label('reasonInactive'),acknowledged:label('reasonAcknowledged'),uncertain:label('reasonUncertain'),retry_exhausted:label('reasonExhausted'),unavailable:label('reasonUnavailable'),provider_rejected:label('reasonRejected'),other:label('reasonOther')};
  const lifecycle={draft:t('merchantUx.campaignWorkspace.draft'),scheduled:t('merchantUx.campaignWorkspace.scheduledStatus'),sending:t('merchantUx.campaignWorkspace.sending'),completed:t('merchantUx.campaignWorkspace.completedStatus'),failed:t('merchantUx.campaignWorkspace.failed')};
  const exportReport=async()=>{
    if(!data||busy||lock.current||query.isFetching||data.pagination.total>campaignReportExportLimit)return;
    const submitted=scope.current;lock.current=true;setBusy(true);setFailure('');setNotice('');
    try{
      const exported=await utils.campaigns.reportExport.fetch({id:campaignId,view:selection.view,status:selection.status,search:selection.search},{staleTime:0});
      if(!mounted.current||scope.current!==submitted)return;
      const verified=campaignReportExportSchema.safeParse(exported);
      if(!verified.success||verified.data.actorId!==actorId||verified.data.merchantId!==merchantId||campaignReportSelectionKey({...verified.data.selection,page:selection.page})!==selectionKey)throw Error('Unverified report export');
      downloadCampaignReportCsv(verified.data,{phone:label('phone'),name:label('name'),status:label('status'),reason:label('reason'),recordedAt:label('recordedAt'),acceptedAt:label('acceptedAt'),attempts:label('attempts'),quotaHeld:label('quotaHeld'),yes:label('yes'),no:label('no'),statusLabel:status=>names[status],reasonLabel:reason=>reasons[reason]});
      setNotice(label('exportStarted'));
    }catch(error){if(mounted.current&&scope.current===submitted){setFailure((error as {data?:{code?:string}})?.data?.code==='PAYLOAD_TOO_LARGE'?label('exportLimit',{limit:number(campaignReportExportLimit)}):label('exportFailed'));void query.refetch();}}
    finally{lock.current=false;if(mounted.current)setBusy(false);}
  };
  if(query.error)return <WorkspaceState kind={workspaceFailureKind(query.error)} onRetry={()=>{void query.refetch();}}/>;
  if(!data)return <WorkspaceState kind={query.isLoading||query.isFetching?'loading':'error'} onRetry={()=>{void query.refetch();}}/>;
  const {campaign,summary,pagination,rows}=data,filtered=!!selection.search||selection.status!=='all',image=conversationMediaUrl(campaign.imageUrl);
  const reset=()=>change({q:null,status:null,page:null});
  return <div className="campaign-workspace campaign-report-workspace" dir={i18n.language.startsWith('ar')?'rtl':'ltr'}>
    <nav className="cr-links"><Link href="/merchant/campaigns">{label('allCampaigns')}</Link><Link href={`/merchant/campaigns/${campaignId}`}>{label('details')}</Link></nav>
    <header className="cw-header"><div><p className="cw-eyebrow">{label('title')}</p><h1>{campaign.name}</h1><p>{label('description')}</p><p className="cw-muted">{label('checkedAt',{date:date(data.checkedAt)})}</p></div><div className="cw-header-actions"><Button variant="outline" disabled={query.isFetching||busy} onClick={()=>{void query.refetch();}}><RefreshCw aria-hidden="true"/>{label('refresh')}</Button><Button disabled={query.isFetching||busy||pagination.total>campaignReportExportLimit} onClick={()=>{void exportReport();}}><Download aria-hidden="true"/>{busy?label('exporting'):label('export')}</Button></div></header>
    <p className="cw-muted">{label('basis')}</p>
    {failure&&<p role="alert" className="cw-error">{failure}</p>}{notice&&<p role="status" className="cw-notice">{notice}</p>}
    {summary.recipients.total>0?<dl className="cw-summary"><div><dt>{label('allRecipients')}</dt><dd>{number(summary.recipients.total)}</dd></div><div><dt>{label('accepted')}</dt><dd>{number(summary.recipients.sent)}</dd></div><div><dt>{label('awaiting')}</dt><dd>{number(summary.recipients.pending+summary.recipients.processing+summary.recipients.failed)}</dd></div><div><dt>{label('needsReview')}</dt><dd>{number(summary.recipients.manualReview)}</dd></div></dl>:<p className="cw-muted">{label('emptyRecipientsHint')}</p>}
    {summary.recipients.manualReview>0&&<aside className="cw-review"><AlertCircle aria-hidden="true"/><div><h2>{label('reviewTitle')}</h2><p>{label('reviewHint',{count:summary.recipients.manualReview})}</p></div><Button variant="outline" onClick={()=>change({view:'recipients',status:'manual_review',q:null,page:null})}>{label('showReviews')}</Button></aside>}
    {summary.results.excludedLinks>0&&<p className="cw-error" role="alert">{label('inconsistent',{count:summary.results.excludedLinks})}</p>}
    <details className="cr-message"><summary>{label('message')}</summary><dl><div><dt>{label('campaignRecipients')}</dt><dd>{number(campaign.recipients)}</dd></div><div><dt>{label('campaignAccepted')}</dt><dd>{number(campaign.accepted)}</dd></div><div><dt>{label('currentStatus')}</dt><dd>{lifecycle[campaign.status]}</dd></div><div><dt>{label('created')}</dt><dd><time dateTime={campaign.createdAt}>{date(campaign.createdAt)}</time></dd></div>{campaign.scheduledAt&&<div><dt>{label('scheduled')}</dt><dd><time dateTime={campaign.scheduledAt}>{date(campaign.scheduledAt)}</time></dd></div>}</dl><p>{campaign.message}</p>{campaign.imageUrl&&(image&&failedImage!==image?<img src={image} alt={label('image')} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailedImage(image)}/>:<p className="cw-muted">{label('imageUnavailable')}</p>)}</details>
    <nav className="cw-tabs" aria-label={label('title')}><Button variant={recipient?'default':'ghost'} aria-current={recipient?'page':undefined} onClick={()=>change({view:'recipients',q:null,status:null,page:null})}>{label('recipients')}</Button><Button variant={!recipient?'default':'ghost'} aria-current={!recipient?'page':undefined} onClick={()=>change({view:'results',q:null,status:null,page:null})}>{label('results')}</Button></nav>
    <section className="cw-list" aria-busy={query.isFetching}><p className="cw-muted">{label(recipient?'recipientsHint':'resultsHint')}</p>
      {!recipient&&<dl className="cr-result-totals"><div><dt>{label('totalResults')}</dt><dd>{number(summary.results.total)}</dd></div><div><dt>{label('successResults')}</dt><dd>{number(summary.results.success)}</dd></div><div><dt>{label('failedResults')}</dt><dd>{number(summary.results.failed)}</dd></div><div><dt>{label('pendingResults')}</dt><dd>{number(summary.results.pending)}</dd></div><div><dt>{label('successRate')}</dt><dd>{summary.results.total?`${number(summary.results.successRate)}%`:'—'}</dd>{!summary.results.total&&<p className="cw-muted">{label('noSample')}</p>}</div></dl>}
      <div className="cw-filters"><label className="cw-search"><span>{label(recipient?'search':'searchResults')}</span><div><Search aria-hidden="true"/><input maxLength={200} value={searchValue} placeholder={label(recipient?'searchHint':'searchResultsHint')} onChange={event=>setEdit({source:search,value:event.target.value})}/></div></label><label><span>{label('status')}</span><select value={selection.status} onChange={event=>change({status:event.target.value,page:null})}><option value="all">{label('allStatuses')}</option>{Object.entries(names).map(([status,name])=><option key={status} value={status}>{name}</option>)}</select></label>{filtered&&<Button variant="ghost" onClick={reset}>{label('clear')}</Button>}</div>
      <div className="cw-list-heading"><p role="status">{label('matchCount',{count:pagination.total})}</p><p className={pagination.total>campaignReportExportLimit?'cw-error':'cw-muted'}>{label(pagination.total>campaignReportExportLimit?'exportLimit':'exportHint',{limit:number(campaignReportExportLimit)})}</p></div>
      {!rows.length?<div className="cw-empty"><h2>{label(selection.page>1?'outOfRange':filtered?'noMatches':recipient?'emptyRecipients':'emptyResults')}</h2><p>{label(filtered?'noMatchesHint':recipient?'emptyRecipientsHint':'emptyResultsHint')}</p>{selection.page>1?<Button onClick={()=>change({page:null})}>{label('first')}</Button>:filtered?<Button variant="outline" onClick={reset}>{label('clear')}</Button>:<Button variant="outline" onClick={()=>change({view:recipient?'results':'recipients',q:null,status:null,page:null})}>{label(recipient?'results':'recipients')}</Button>}</div>:
        <ul className="cr-records">{rows.map(row=><li key={row.id}><div className="cr-record-heading"><div><bdi dir="ltr">{row.phone}</bdi>{row.kind==='result'&&<p>{row.name??label('unnamed')}</p>}</div><Badge variant={row.status==='manual_review'?'outline':'secondary'}>{names[row.status]}</Badge></div><dl className="cr-record-info"><div className="cr-reason"><dt>{label('reason')}</dt><dd>{reasons[row.reason]}</dd></div><div><dt>{label(row.kind==='recipient'?'updatedAt':'recordedAt')}</dt><dd><time dateTime={row.recordedAt}>{date(row.recordedAt)}</time></dd></div>{row.kind==='recipient'&&<><div><dt>{label('attempts')}</dt><dd>{number(row.attempts)}</dd></div><div><dt>{label('quotaHeld')}</dt><dd>{label(row.quotaHeld?'yes':'no')}</dd></div>{row.acceptedAt&&<div><dt>{label('acceptedAt')}</dt><dd><time dateTime={row.acceptedAt}>{date(row.acceptedAt)}</time></dd></div>}</>}</dl></li>)}</ul>}
      {pagination.pages>0&&<nav className="cw-pagination" aria-label={label('title')}><Button variant="outline" disabled={selection.page<=1} onClick={()=>change({page:selection.page-1})}>{label('previous')}</Button><span>{label('page',{page:number(selection.page),pages:number(pagination.pages)})}</span><Button variant="outline" disabled={selection.page>=pagination.pages} onClick={()=>change({page:selection.page+1})}>{label('next')}</Button></nav>}
    </section>
  </div>;
}
