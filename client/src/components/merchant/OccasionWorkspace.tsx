import {useEffect,useRef,useState} from 'react';
import {useLocation,useSearch} from 'wouter';
import {useTranslation} from 'react-i18next';
import {CalendarDays,RefreshCw} from 'lucide-react';
import {trpc} from '@/lib/trpc';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {WorkspaceState,workspaceFailureKind} from './WorkspaceState';
import {OccasionRecord} from './OccasionRecord';
import {occasionWorkspaceLabels} from '@/lib/occasion-workspace-labels';
import {occasionNavigation,occasionSelectionKey,scopedOccasionWorkspace,scopedOccasionReview,scopedOccasionResult} from '@/lib/occasion-workspace';
import {catalogHref} from '@/lib/service-catalog-navigation';
import {occasionTypes,occasionStates,type OccasionWorkspaceRow} from '@shared/occasion-workspace';
import type {OccasionActionTarget,OccasionActionReview} from '@shared/occasion-actions';
import '@/styles/service-catalog-workspace.css';
import '@/styles/occasion-workspace.css';
type Action={kind:'details';row:OccasionWorkspaceRow}|{kind:'review';target:OccasionActionTarget;row?:OccasionWorkspaceRow};
export function OccasionWorkspace({actorId,merchantId}:{actorId:number;merchantId:number}){
 const {t,i18n}=useTranslation(),c=occasionWorkspaceLabels(t),locale=i18n.language.startsWith('ar')?'ar':'en',utils=trpc.useUtils();
 const [path,navigate]=useLocation(),search=useSearch(),selection=occasionNavigation(search),key=occasionSelectionKey(selection);
 const query=trpc.occasionCampaigns.workspace.useQuery(selection,{retry:false,staleTime:0,refetchOnMount:'always'}),data=query.error?null:scopedOccasionWorkspace(query.data,actorId,merchantId,selection);
 const apply=trpc.occasionCampaigns.applyAction.useMutation({retry:false});
 const [action,setAction]=useState<Action|null>(null),[review,setReview]=useState<OccasionActionReview|null>(null),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[blocked,setBlocked]=useState(false),[failure,setFailure]=useState(''),[notice,setNotice]=useState(''),[editSearch,setEditSearch]=useState<string|null>(null);
 const live=useRef(true),locked=useRef(false),scope=useRef(''),title=useRef<HTMLHeadingElement>(null),results=useRef<HTMLHeadingElement>(null),opener=useRef<HTMLElement|null>(null),focusTitle=useRef(false),focusResults=useRef(false);
 scope.current=`${actorId}:${merchantId}:${key}:${locale}`;
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{setAction(null);setReview(null);setAck(false);setEditSearch(null);setNotice('');},[search,locale]);
 useEffect(()=>{if(query.error){setAction(null);setReview(null);setAck(false);}},[query.error]);
 useEffect(()=>{if(focusResults.current&&data&&!query.isFetching){results.current?.focus();focusResults.current=false;}},[key,data,query.isFetching]);
 const same=!action?.row||!!data?.rows.some(r=>r.id===action.row!.id&&r.revision===action.row!.revision);
 const writable=!!data?.canManage&&!query.isFetching&&!busy&&!blocked&&same;
 const name=(type:string|null)=>occasionTypes.includes(type as any)?c[type as typeof occasionTypes[number]]:type??c.unknown;
 const number=(value:number)=>value.toLocaleString(locale);
 const date=(value:string)=>new Intl.DateTimeFormat(locale,{timeZone:'Asia/Riyadh',year:'numeric',month:'short',day:'numeric'}).format(new Date(value+'T09:00:00Z'));
 const change=(patch:Record<string,string|number|null>)=>{focusResults.current=true;navigate(catalogHref(path,search,patch));};
 function openDetails(row:OccasionWorkspaceRow){opener.current=document.activeElement as HTMLElement;setFailure('');setAction({kind:'details',row});}
 async function refresh(){const view=scope.current,result=await query.refetch();if(!live.current||view!==scope.current)return;if(!result.error&&scopedOccasionWorkspace(result.data,actorId,merchantId,selection)){setBlocked(false);setFailure('');setReview(null);setAction(null);}}
 async function prepare(target:OccasionActionTarget,row?:OccasionWorkspaceRow){
  if(!writable||locked.current)return;const view=scope.current;opener.current=document.activeElement as HTMLElement;locked.current=true;setBusy(true);setFailure('');setAck(false);setReview(null);setAction({kind:'review',target,row});
  try{const raw=await utils.occasionCampaigns.reviewAction.fetch(target,{staleTime:0});if(!live.current||view!==scope.current)return;const checked=scopedOccasionReview(raw,actorId,merchantId,target,row?.revision);if(!checked)throw Error();setReview(checked);}
  catch{if(live.current&&view===scope.current)setFailure(c.reviewFailed);}
  finally{locked.current=false;if(live.current)setBusy(false);}
 }
 async function save(){
  if(action?.kind!=='review'||!review?.eligible||!writable||locked.current||(action.target.action==='toggle'&&!ack))return;
  const submitted=action,view=scope.current;locked.current=true;setBusy(true);setFailure('');
  try{const raw=await apply.mutateAsync({target:submitted.target,reviewRevision:review.reviewRevision,acknowledged:true});if(!live.current||view!==scope.current)return;if(!scopedOccasionResult(raw,actorId,merchantId,submitted.target))throw Error();focusTitle.current=true;setAction(null);setNotice(c.saved);setBlocked(true);await refresh();}
  catch(error){if(live.current&&view===scope.current){setFailure((error as any)?.data?.code==='CONFLICT'?c.conflict:c.uncertain);setBlocked(true);setAck(false);}}
  finally{locked.current=false;if(live.current)setBusy(false);}
 }
 const effect=review?.terms.effect==='save_disabled'?c.createEffect:review?.terms.effect==='allow_automatic_admission'?c.enableEffect:c.disableEffect;
 return <div className="service-catalog occasion-workspace" dir={locale==='ar'?'rtl':'ltr'}>
  <header className="sc-header"><div><p className="sc-eyebrow">{c.eyebrow}</p><h1 ref={title} tabIndex={-1}>{c.title}</h1><p>{c.description}</p></div><Button variant="outline" disabled={busy||query.isFetching} onClick={()=>void refresh()}><RefreshCw aria-hidden="true"/>{c.refresh}</Button></header>
  {notice&&<p role="status" className="sc-feedback">{notice}</p>}{blocked&&!action&&<p role="alert" className="sc-feedback">{failure||c.blocked}</p>}
  {query.error?<WorkspaceState inline kind={workspaceFailureKind(query.error)} onRetry={()=>void refresh()}/>:!data?<WorkspaceState inline kind={query.isLoading||query.isFetching?'loading':'error'} onRetry={()=>void refresh()}/>:<>
   {!data.canManage&&<p>{c.readonly}</p>}
   <dl className="sc-summary">{[[c.total,data.total],[c.enabled,data.counts.enabled],[c.accepted,data.delivery.accepted],[c.invalid,data.counts.invalid]].map(([label,value])=><div key={String(label)}><dt>{label}</dt><dd>{number(Number(value))}</dd></div>)}</dl><p className="sc-muted">{c.evidence}</p>
   <section className="sc-list"><div className="oc-section-heading"><CalendarDays aria-hidden="true"/><h2>{c.upcoming}</h2></div><p className="sc-muted">{c.upcomingHelp}</p>
    {!data.upcoming.length?<p role="alert">{c.upcomingEmpty}</p>:<div className="oc-upcoming">{data.upcoming.map(o=><article className="oc-card" key={o.type+o.year}>
     <div className="oc-card-heading"><h3>{name(o.type)}</h3><Badge variant="outline">{o.discountPercent}%</Badge></div><p>{date(o.date)}</p><p className="sc-muted">{o.daysUntil===0?c.today:c.days+': '+number(o.daysUntil)}</p>
     {o.existing?<><p className="oc-status">{c[o.existing.state]}</p><Button variant="outline" disabled={busy} onClick={()=>change({q:String(o.existing!.id),state:null,year:null,page:null})}>{c.view}<span className="sr-only"> · {name(o.type)}</span></Button></>:data.canManage?<Button disabled={!writable} onClick={()=>void prepare({action:'create',occasionType:o.type,year:o.year})}>{c.create}<span className="sr-only"> · {name(o.type)}</span></Button>:null}
    </article>)}</div>}
   </section>
   <section className="sc-list" aria-busy={query.isFetching}>
    <h2 ref={results} tabIndex={-1}>{c.history}</h2><form className="sc-filters" onSubmit={e=>{e.preventDefault();change({q:(editSearch??selection.query).trim(),page:null});}}>
     <label className="sc-search"><span>{c.search}</span><input value={editSearch??selection.query} maxLength={100} disabled={busy} onChange={e=>setEditSearch(e.target.value)}/></label><Button variant="outline" type="submit" disabled={busy}>{c.searchAction}</Button>
     <label><span>{c.state}</span><select value={selection.state} disabled={busy} onChange={e=>change({state:e.target.value==='all'?null:e.target.value,page:null})}><option value="all">{c.all}</option>{occasionStates.map(s=><option key={s} value={s}>{c[s]}</option>)}</select></label>
     <label><span>{c.year}</span><select value={selection.year??''} disabled={busy} onChange={e=>change({year:e.target.value||null,page:null})}><option value="">{c.allYears}</option>{data.years.map(y=><option key={y} value={y}>{y}</option>)}</select></label>
     {(selection.query||selection.state!=='all'||selection.year!==null)&&<Button variant="outline" type="button" disabled={busy} onClick={()=>change({q:null,state:null,year:null,page:null})}>{c.clear}</Button>}
    </form><p className="sc-results" aria-live="polite">{c.matches}: {number(data.matched)}</p>
    {!data.rows.length?<div className="sc-empty"><p>{data.total===0?c.empty:data.matched===0?c.noResults:c.outOfRange}</p>{selection.page>1&&<Button variant="outline" onClick={()=>change({page:null})}>{c.first}</Button>}</div>:<div className="oc-records">{data.rows.map(row=><article className="oc-record" key={row.id}>
     <div className="oc-card-heading"><h3>{name(row.occasionType)} · {row.year??c.unknown}</h3><Badge variant="outline">{c[row.state]}</Badge></div>
     <dl className="oc-facts"><div><dt>{c.id}</dt><dd>#{row.id}</dd></div><div><dt>{c.discount}</dt><dd>{row.discountPercentage===null?c.unknown:row.discountPercentage+'%'}</dd></div><div><dt>{c.accepted}</dt><dd>{row.delivery?number(row.delivery.accepted):c.notRecorded}</dd></div><div><dt>{c.code}</dt><dd>{row.discountCode??c.notRecorded}</dd></div></dl>
     <div className="sc-actions"><Button variant="outline" disabled={busy} onClick={()=>openDetails(row)}>{c.details}<span className="sr-only"> #{row.id}</span></Button>{data.canManage&&row.storedStatus==='pending'&&row.enabled!==null&&<Button variant={row.enabled?'outline':'default'} disabled={!writable} onClick={()=>void prepare({action:'toggle',id:row.id,enabled:!row.enabled},row)}>{row.enabled?c.disable:c.enable}<span className="sr-only"> #{row.id}</span></Button>}</div>
    </article>)}</div>}
    {data.pages>1&&<nav className="sc-pagination" aria-label={c.history}><Button variant="outline" disabled={busy||query.isFetching||selection.page<=1} onClick={()=>change({page:selection.page-1})}>{c.previous}</Button><span>{c.page} {number(selection.page)} {c.of} {number(data.pages)}</span><Button variant="outline" disabled={busy||query.isFetching||selection.page>=data.pages} onClick={()=>change({page:selection.page+1})}>{c.next}</Button></nav>}
   </section><details className="oc-policy"><summary>{c.policy}</summary><p>{c.policyHelp}</p></details>
  </>}
  <Dialog open={!!action&&!!data} onOpenChange={open=>{if(!open&&!busy){setAction(null);setReview(null);setAck(false);}}}>
   <DialogContent closeLabel={c.close} className="sc-dialog oc-dialog" dir={locale==='ar'?'rtl':'ltr'} onInteractOutside={e=>{if(busy)e.preventDefault();}} onEscapeKeyDown={e=>{if(busy)e.preventDefault();}} onCloseAutoFocus={e=>{e.preventDefault();if(focusTitle.current){title.current?.focus();focusTitle.current=false;}else if(opener.current?.isConnected)opener.current.focus();else title.current?.focus();}}>
    <DialogHeader><DialogTitle>{action?.kind==='details'?c.details:c.reviewTitle}</DialogTitle><DialogDescription>{action?.kind==='details'?name(action.row.occasionType)+' · #'+action.row.id:c.reviewIntro}</DialogDescription></DialogHeader>
    {action?.kind==='details'?<OccasionRecord row={action.row} c={c}/>:<>
     {busy&&!review&&<p role="status">{c.reviewing}</p>}{review&&<div className="oc-review"><p className="oc-effect">{effect}</p><h3>{name(review.terms.occasionType)} · {review.terms.year}</h3>
      {!review.eligible&&<p role="alert" className="sc-feedback">{c['reason_'+review.reason as keyof typeof c]??c.reviewFailed}</p>}
      <p><strong>{c.discount}: {review.terms.discountPercent===null?c.unknown:review.terms.discountPercent+'%'}</strong></p>
      <details><summary>{c.moreReview}</summary><h3>{c.offer}</h3><p>{c.offerHelp}</p><h3>{c.audience}</h3><p>{c.audienceHelp}</p><h3>{c.message}</h3><p className="sc-muted">{review.terms.messageSource==='linked_campaign'?c.messageSaved:c.messageGenerated}</p><pre>{review.terms.messagePreview??c.notRecorded}</pre><p>{c.evidence}</p></details>
      {action?.kind==='review'&&action.target.action==='toggle'&&<label className="oc-check"><input type="checkbox" checked={ack} disabled={busy||blocked||!same||!review.eligible} onChange={e=>setAck(e.target.checked)}/><span>{c.ack}</span></label>}
     </div>}{failure&&<p role="alert" className="sc-feedback">{failure}</p>}{!same&&<p role="alert">{c.conflict}</p>}
    </>}
    <div className="sc-actions"><Button variant="outline" disabled={busy} onClick={()=>setAction(null)}>{action?.kind==='details'?c.close:c.cancel}</Button>{action?.kind==='review'&&<Button disabled={!writable||!review?.eligible||(action.target.action==='toggle'&&!ack)} onClick={()=>void save()}>{busy?c.saving:action.target.action==='create'?c.confirmCreate:action.target.enabled?c.confirmEnable:c.confirmDisable}</Button>}{(blocked||!same||failure&&!review)&&<Button variant="outline" disabled={busy||query.isFetching} onClick={()=>void refresh()}>{c.refresh}</Button>}</div>
   </DialogContent>
  </Dialog>
 </div>;
}
