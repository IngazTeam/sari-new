import {useEffect,useRef,useState} from 'react';
import {Link,useLocation,useSearch} from 'wouter';
import {useTranslation} from 'react-i18next';
import {RefreshCw,Send,FileText,Pencil} from 'lucide-react';
import {trpc} from '@/lib/trpc';
import {campaignDetailsSchema} from '@shared/campaign-details';
import {withCampaignOptOutNotice} from '@shared/campaign-message';
import {campaignDetailsLabels} from '@/lib/campaign-details-labels';
import {conversationMediaUrl} from '@/lib/conversation-message';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {WorkspaceState,workspaceFailureKind} from './WorkspaceState';
import '@/styles/campaign-workspace.css';
import '@/styles/campaign-details-workspace.css';

export function CampaignDetailsWorkspace({actorId,merchantId,campaignId}:{actorId:number;merchantId:number;campaignId:number}){
  const {t,i18n}=useTranslation(),label=campaignDetailsLabels(t),[pathname]=useLocation(),search=useSearch();
  const [reviewed,setReviewed]=useState<string|null>(null),[busy,setBusy]=useState(false),[failure,setFailure]=useState(''),[notice,setNotice]=useState(''),[failedImage,setFailedImage]=useState<string|null>(null);
  const mounted=useRef(true),lock=useRef(false),scope=useRef(''),opener=useRef<HTMLElement|null>(null);scope.current=`${actorId}:${merchantId}:${campaignId}:${pathname}:${search}`;
  const reviewTitle=useRef<HTMLHeadingElement|null>(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{setReviewed(null);setFailure('');setNotice('');},[search]);
  const query=trpc.campaigns.detailsWorkspace.useQuery({id:campaignId},{retry:false,staleTime:0,refetchOnMount:'always',refetchInterval:query=>query.state.data?.campaign.status==='sending'?10_000:false});
  const mutation=trpc.campaigns.send.useMutation(),utils=trpc.useUtils();
  const parsed=campaignDetailsSchema.safeParse(query.data),data=!query.error&&parsed.success&&parsed.data.actorId===actorId&&parsed.data.merchantId===merchantId&&parsed.data.campaign.id===campaignId?parsed.data:null;
  const locale=i18n.language.startsWith('ar')?'ar-SA':'en-US',number=(n:number)=>n.toLocaleString(locale);
  const date=(value:string|null)=>{try{return value&&data?.timezone?new Intl.DateTimeFormat(locale,{calendar:'gregory',dateStyle:'medium',timeStyle:'short',timeZone:data.timezone}).format(new Date(value)):label('unknownDate');}catch{return label('unknownDate');}};
  const names={draft:t('merchantUx.campaignWorkspace.draft'),scheduled:t('merchantUx.campaignWorkspace.scheduledStatus'),sending:t('merchantUx.campaignWorkspace.sending'),completed:t('merchantUx.campaignWorkspace.completedStatus'),failed:t('merchantUx.campaignWorkspace.failed')};
  const campaign=data?.campaign,editable=!!campaign&&['draft','scheduled'].includes(campaign.status),image=conversationMediaUrl(campaign?.imageUrl);
  const outgoing=withCampaignOptOutNotice(campaign?.message??''),limit=campaign?.imageUrl?1024:4096;
  const contentValid=!!campaign?.message.trim()&&outgoing.length<=limit,imageValid=!campaign?.imageUrl||!!image&&failedImage!==image;
  const canSend=!!data?.canManage&&editable&&data.audience.status==='valid'&&data.excludedRecipients===0&&contentValid&&imageValid;
  const unchanged=!!reviewed&&reviewed===campaign?.definitionKey;
  const refresh=()=>{void query.refetch();void utils.campaigns.workspace.invalidate();void utils.campaigns.performanceSnapshot.invalidate();};
  const confirm=async()=>{
    if(!canSend||!unchanged||query.isFetching||busy||lock.current)return;
    const submitted=scope.current,definition=reviewed!;lock.current=true;setBusy(true);setFailure('');setNotice('');
    try{
      const result=await mutation.mutateAsync({id:campaignId,expectedDefinition:definition});
      if(!mounted.current||scope.current!==submitted)return;
      if(result.success!==true||!Number.isSafeInteger(result.totalRecipients)||result.totalRecipients<=0)throw Error('Unverified admission result');
      setReviewed(null);setNotice(label('sent'));refresh();
    }catch(error){if(mounted.current&&scope.current===submitted){setFailure((error as{data?:{code?:string}})?.data?.code==='CONFLICT'?label('changed'):label('sendFailed'));void query.refetch();}}
    finally{lock.current=false;if(mounted.current)setBusy(false);}
  };
  if(query.error)return <WorkspaceState kind={workspaceFailureKind(query.error)} onRetry={()=>{void query.refetch();}}/>;
  if(!data||!campaign)return <WorkspaceState kind={query.isLoading||query.isFetching?'loading':'error'} onRetry={()=>{void query.refetch();}}/>;
  const filters=data.audience.status==='valid'?data.audience.filters:null;
  const audience=<>{filters?Object.keys(filters).length===0?<p>{label('allAudience')}</p>:<ul className="cd-audience-rules">{filters.lastActivityDays!==undefined&&<li>{label('lastActivity',{days:number(filters.lastActivityDays)})}</li>}{filters.purchaseCountMin!==undefined&&<li>{label('purchaseMin',{count:number(filters.purchaseCountMin)})}</li>}{filters.purchaseCountMax!==undefined&&<li>{label('purchaseMax',{count:number(filters.purchaseCountMax)})}</li>}</ul>:<p role="alert" className="cw-error">{label('audienceInvalid')}</p>}</>;
  return <div className="campaign-workspace campaign-details-workspace" dir={i18n.language.startsWith('ar')?'rtl':'ltr'}>
    <Link className="cd-back" href="/merchant/campaigns">{label('allCampaigns')}</Link>
    <header className="cw-header"><div><p className="cw-eyebrow">{label('title')}</p><h1>{campaign.name}</h1><p>{label('description')}</p><p className="cw-muted">{label('checkedAt',{date:date(data.checkedAt)})}</p></div><div className="cw-header-actions">
      <Button variant="outline" disabled={query.isFetching||busy} onClick={()=>{void query.refetch();}}><RefreshCw aria-hidden="true"/>{label('refresh')}</Button>
      <Button asChild variant="outline"><Link href={`/merchant/campaigns/${campaignId}/report`}><FileText aria-hidden="true"/>{label('report')}</Link></Button>
      {data.canManage&&editable&&<Button asChild variant="outline"><Link href={`/merchant/campaigns/${campaignId}/edit`}><Pencil aria-hidden="true"/>{label('edit')}</Link></Button>}
    </div></header>
    {!data.canManage&&<p className="cw-muted">{label('readOnly')}</p>}{notice&&<p role="status" className="cw-notice">{notice}</p>}{failure&&!reviewed&&<p role="alert" className="cw-error">{failure}</p>}
    <dl className="cd-metadata"><div><dt>{label('status')}</dt><dd><Badge variant={campaign.status==='failed'?'outline':'secondary'}>{names[campaign.status]}</Badge></dd></div><div><dt>{label('created')}</dt><dd><time dateTime={campaign.createdAt}>{date(campaign.createdAt)}</time></dd></div><div><dt>{label('scheduled')}</dt><dd>{campaign.scheduledAt?<time dateTime={campaign.scheduledAt}>{date(campaign.scheduledAt)}</time>:label('notScheduled')}</dd></div></dl>
    {data.excludedRecipients>0&&<p role="alert" className="cw-error">{label('inconsistent')}</p>}
    <div className="cd-content-grid"><section className="cd-panel"><h2>{label('messageTitle')}</h2><p className="cw-muted">{label('messageHint')}</p><p className="cd-message" dir="auto">{outgoing}</p><p className="cw-muted">{label('textLimit',{limit:number(limit)})}</p>
      {!contentValid&&<p className="cw-error" role="alert">{label('contentInvalid')}</p>}{campaign.imageUrl&&(image&&failedImage!==image?<img src={image} alt={label('image')} referrerPolicy="no-referrer" decoding="async" onError={()=>setFailedImage(image)}/>:<p className="cw-error" role="alert">{label('imageUnavailable')}</p>)}
    </section><section className="cd-panel"><h2>{label('audienceTitle')}</h2>{audience}<p className="cw-muted">{label('audienceHint')}</p>
      {data.canManage&&editable&&<div className="cd-send-review"><h3>{label('reviewTitle')}</h3><p className="cw-muted">{label('reviewHint')}</p><Button disabled={!canSend||query.isFetching||busy} onClick={()=>{opener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setFailure('');setReviewed(campaign.definitionKey);}}><Send aria-hidden="true"/>{label('send')}</Button></div>}
    </section></div>
    <section className="cd-panel"><h2>{label('queueTitle')}</h2><p className="cw-muted">{label('basis')}</p><dl className="cd-recorded"><div><dt>{label('recordedRecipients')}</dt><dd>{number(campaign.recipients)}</dd></div><div><dt>{label('recordedAccepted')}</dt><dd>{number(campaign.accepted)}</dd></div></dl>
      {data.queue?<><p className="cw-muted">{label('queueHint')}</p><dl className="cd-queue">{(['queued','accepted','awaiting','suppressed','needsReview']as const).map(key=><div key={key}><dt>{label(key)}</dt><dd>{number(data.queue![key==='queued'?'total':key])}</dd></div>)}</dl>{data.queue.needsReview>0&&<aside className="cw-review"><p>{label('reviewsHint')}</p><Button asChild variant="outline"><Link href={`/merchant/campaigns/${campaignId}/report?view=recipients&status=manual_review`}>{label('openReviews')}</Link></Button></aside>}</>:<p className="cw-muted">{label('queueMissing')}</p>}
    </section>
    <Dialog open={!!reviewed} onOpenChange={open=>{if(!open&&!busy){setReviewed(null);setFailure('');}}}><DialogContent closeLabel={label('cancel')} className="cw-dialog cd-dialog" dir={i18n.language.startsWith('ar')?'rtl':'ltr'} onOpenAutoFocus={event=>{event.preventDefault();reviewTitle.current?.focus({preventScroll:true});}} onCloseAutoFocus={event=>{event.preventDefault();if(opener.current?.isConnected)opener.current.focus();}}><DialogHeader><DialogTitle ref={reviewTitle} tabIndex={-1}>{label('confirmTitle',{name:campaign.name})}</DialogTitle><DialogDescription>{label('confirmHint')}</DialogDescription></DialogHeader>
      <p className="cd-message" dir="auto">{outgoing}</p><div className="cd-dialog-audience"><h3>{label('audienceTitle')}</h3>{audience}</div>{campaign.scheduledAt&&<p className="cw-notice">{label('scheduledNow')} <time dateTime={campaign.scheduledAt}>{date(campaign.scheduledAt)}</time></p>}
      {!unchanged&&<p className="cw-error" role="alert">{label('changed')}</p>}{failure&&<p className="cw-error" role="alert">{failure}</p>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setReviewed(null)}>{label('cancel')}</Button><Button disabled={!canSend||!unchanged||busy||query.isFetching} onClick={()=>{void confirm();}}>{label(busy?'busy':'confirm')}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
