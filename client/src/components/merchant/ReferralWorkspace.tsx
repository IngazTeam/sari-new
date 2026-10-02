import {useEffect,useRef,useState} from 'react';
import {useLocation,useSearch} from 'wouter';
import {useTranslation} from 'react-i18next';
import {RefreshCw,Copy,Plus} from 'lucide-react';
import {trpc} from '@/lib/trpc';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {WorkspaceState,workspaceFailureKind} from './WorkspaceState';
import {ReferralSummary} from './ReferralSummary';
import {referralNavigation,referralSelectionKey,referralStates,scopedReferralWorkspace,scopedInvitationReview} from '@/lib/referral-workspace';
import {referralWorkspaceLabels} from '@/lib/referral-workspace-labels';
import {catalogHref} from '@/lib/service-catalog-navigation';
import {referralInvitationInput,type ReferralInvitationReview} from '@shared/referral-program';
import type {ReferralWorkspaceRow} from '@shared/referral-workspace';
import '@/styles/service-catalog-workspace.css';
import '@/styles/discount-workspace.css';
import '@/styles/referral-workspace.css';
type Action={kind:'create'}|{kind:'details'|'claim';row:ReferralWorkspaceRow}|{kind:'apply';review:ReferralInvitationReview};
export function ReferralWorkspace({actorId,merchantId}:{actorId:number;merchantId:number}){
 const {t,i18n}=useTranslation(),c=referralWorkspaceLabels(t),locale=i18n.language.startsWith('ar')?'ar':'en';
 const [path,navigate]=useLocation(),search=useSearch(),selection=referralNavigation(search),selectionKey=referralSelectionKey(selection);
 const query=trpc.referrals.workspace.useQuery(selection,{retry:false,staleTime:0,refetchOnMount:'always'});
 const create=trpc.referrals.createInvitation.useMutation({retry:false}),review=trpc.referrals.reviewInvitation.useMutation({retry:false}),apply=trpc.referrals.applyReferralCode.useMutation({retry:false}),claim=trpc.referrals.claimReward.useMutation({retry:false});
 const data=query.error?null:scopedReferralWorkspace(query.data,actorId,merchantId,selection);
 const [editSearch,setEditSearch]=useState<string|null>(null),[code,setCode]=useState(()=>new URLSearchParams(search).get('ref')?.slice(0,50)??''),[codeError,setCodeError]=useState(''),[action,setAction]=useState<Action|null>(null),[ack,setAck]=useState(false),[busy,setBusy]=useState(false),[blocked,setBlocked]=useState(false),[failure,setFailure]=useState(''),[notice,setNotice]=useState(''),[copyNotice,setCopyNotice]=useState('');
 const live=useRef(true),locked=useRef(false),view=useRef(''),title=useRef<HTMLHeadingElement>(null),results=useRef<HTMLHeadingElement>(null),codeField=useRef<HTMLInputElement>(null),opener=useRef<HTMLElement|null>(null),focusResults=useRef(false),focusAfterWrite=useRef(false),returnToTitle=useRef(false);
 view.current=`${actorId}:${merchantId}:${selectionKey}`;
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{setEditSearch(null);setAction(null);setAck(false);setCopyNotice('');},[search]);
 useEffect(()=>{if(data&&!query.isFetching&&focusResults.current){results.current?.focus();focusResults.current=false;}},[selectionKey,!!data,query.isFetching]);
 useEffect(()=>{if(data&&!query.isFetching&&!action&&focusAfterWrite.current){title.current?.focus();focusAfterWrite.current=false;}},[data,query.isFetching,action]);
 const change=(patch:Record<string,string|number|null>)=>{focusResults.current=true;navigate(catalogHref(path,search,patch));};
 const open=(next:Action)=>{opener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setFailure('');setAck(false);setAction(next);};
 const refresh=async()=>{const scope=view.current,result=await query.refetch();if(!live.current||scope!==view.current)return;if(!result.error&&scopedReferralWorkspace(result.data,actorId,merchantId,selection)){setBlocked(false);setFailure('');setAction(null);}};
 const selected=action&&(action.kind==='details'||action.kind==='claim')?action.row:null;
 const same=!selected||data?.rows.some(row=>row.kind===selected.kind&&row.id===selected.id&&row.revision===selected.revision);
 const writable=!!data?.canManage&&same&&!query.isFetching&&!busy&&!blocked;
 async function reviewCode(){
  if(!writable||locked.current||data?.invitation.applied)return;
  const parsed=referralInvitationInput.safeParse({code});if(!parsed.success){setCodeError(c.invalidCode);codeField.current?.focus();return;}
  const scope=view.current;locked.current=true;setBusy(true);setCodeError('');setFailure('');
  try{const raw=await review.mutateAsync(parsed.data);if(!live.current||scope!==view.current)return;const checked=scopedInvitationReview(raw,actorId,merchantId,parsed.data.code);if(!checked)throw Error('Invalid review');open({kind:'apply',review:checked});}
  catch{if(live.current&&scope===view.current){setCodeError(c.invitationFailed);codeField.current?.focus();}}
  finally{locked.current=false;if(live.current)setBusy(false);}
 }
 async function save(){
  if(!action||action.kind==='details'||!writable||locked.current||action.kind!=='create'&&!ack)return;
  const submitted=action,scope=view.current;locked.current=true;setBusy(true);setFailure('');
  try{
   if(submitted.kind==='create'){const result=await create.mutateAsync({confirm:true});if(result?.code?.merchantId!==merchantId||!Number.isSafeInteger(result.code.id)||result.code.id<=0)throw Error('Invalid result');}
   else if(submitted.kind==='apply'){const result=await apply.mutateAsync({code:submitted.review.code,expectedRevision:submitted.review.expectedRevision,acknowledgePendingReward:true});if(result?.success!==true||result.benefitGranted!==false)throw Error('Invalid result');}
   else{const result=await claim.mutateAsync({rewardId:submitted.row.id,expectedRevision:submitted.row.revision,recordOnly:true});if(result?.success!==true||result.rewardId!==submitted.row.id||result.effect!=='record_only'||result.benefitGranted!==false)throw Error('Invalid result');}
   if(!live.current||scope!==view.current)return;
   returnToTitle.current=true;focusAfterWrite.current=true;setAction(null);setNotice(submitted.kind==='create'?c.createdNotice:c.saved);setBlocked(true);await refresh();
  }catch(error){if(live.current&&scope===view.current){setFailure((error as any)?.data?.code==='CONFLICT'?c.conflict:c.uncertain);setBlocked(true);}}
  finally{locked.current=false;if(live.current)setBusy(false);}
 }
 async function copyLink(link:string){const scope=view.current;try{await navigator.clipboard.writeText(link);if(live.current&&scope===view.current)setCopyNotice(c.copied);}catch{if(live.current&&scope===view.current)setCopyNotice(c.copyFailed);}}
 if(query.error)return <WorkspaceState kind={workspaceFailureKind(query.error)} onRetry={()=>void refresh()}/>;
 if(!data)return <WorkspaceState kind={query.isLoading||query.isFetching?'loading':'error'} onRetry={()=>void refresh()}/>;
 const number=(n:number)=>n.toLocaleString(locale),link=data.invitation.state==='ready'&&data.invitation.code?`${window.location.origin}/signup?ref=${encodeURIComponent(data.invitation.code)}`:'';
 const heading=(row:ReferralWorkspaceRow)=>row.kind==='code'?row.code||c.unknown:row.kind==='referral'?row.referredName||row.referredPhone||`#${row.id}`:row.type?c[row.type]:c.unknown;
 const dialogTitle=action?.kind==='create'?c.create:action?.kind==='apply'?c.review:action?.kind==='claim'?c.claim:c.details;
 const dialogHelp=action?.kind==='create'?c.createHelp:action?.kind==='apply'?c.applyHelp:action?.kind==='claim'?c.claimHelp:c.evidence;
 return <div className="service-catalog referral-workspace" dir={locale==='ar'?'rtl':'ltr'}>
  <header className="sc-header"><div><p className="sc-eyebrow">{c.eyebrow}</p><h1 ref={title} tabIndex={-1}>{c.title}</h1><p>{c.description}</p></div><Button variant="outline" disabled={busy||query.isFetching} onClick={()=>void refresh()}><RefreshCw aria-hidden="true"/>{c.refresh}</Button></header>
  {!data.canManage&&<p>{c.readonly}</p>}{notice&&<p role="status" className="sc-feedback">{notice}</p>}{blocked&&!action&&<p role="alert" className="sc-feedback">{failure||c.uncertain}</p>}
  <dl className="sc-summary">{(['codes','referrals','rewards'] as const).map(tab=><div key={tab}><dt>{c[tab]}</dt><dd>{number(data.totals[tab])}</dd></div>)}</dl><p className="sc-muted">{c.evidence}</p>
  <div className="rw-invitation"><section className="dc-code"><h2>{c.invitation}</h2><p className="sc-muted">{c.invitationHelp}</p>{link?<><label className="dc-field"><span>{c.invitation}</span><input className="rw-link" value={link} readOnly onFocus={e=>e.target.select()}/></label><Button variant="outline" onClick={()=>void copyLink(link)}><Copy aria-hidden="true"/>{c.copy}</Button>{copyNotice&&<p role="status">{copyNotice}</p>}</>:<><p>{data.invitation.state==='not_created'?c.noInvitation:c.invitationInvalid}</p>{data.canManage&&data.invitation.state==='not_created'&&<Button disabled={!writable} onClick={()=>open({kind:'create'})}><Plus aria-hidden="true"/>{c.create}</Button>}</>}</section>
   <section className="dc-code"><h2>{c.apply}</h2>{data.invitation.applied?<p>{c.applied}</p>:data.canManage?<form onSubmit={e=>{e.preventDefault();void reviewCode();}}><label className="dc-field"><span>{c.inputCode}</span><input ref={codeField} value={code} maxLength={50} autoComplete="off" autoCapitalize="characters" spellCheck={false} dir="ltr" aria-invalid={!!codeError} aria-describedby={codeError?'referral-code-error':undefined} disabled={busy} onChange={e=>{setCode(e.target.value);setCodeError('');}}/></label>{codeError&&<p id="referral-code-error" role="alert" className="sc-feedback">{codeError}</p>}<Button type="submit" variant="outline" disabled={!writable}>{busy?c.reviewing:c.review}</Button></form>:<p>{c.readonly}</p>}</section></div>
  <section className="sc-list" aria-busy={query.isFetching}><div className="rw-tabs" role="group" aria-label={c.title}>{(['referrals','codes','rewards'] as const).map(tab=><Button key={tab} variant={selection.tab===tab?'default':'outline'} aria-pressed={selection.tab===tab} disabled={busy} onClick={()=>change({tab,state:null,page:null,q:null})}>{c[tab]} ({number(data.totals[tab])})</Button>)}</div>
   <form className="sc-filters" onSubmit={e=>{e.preventDefault();change({q:(editSearch??selection.query).trim(),page:null});}}><label className="sc-search"><span>{c.search}</span><input maxLength={100} value={editSearch??selection.query} disabled={busy} onChange={e=>setEditSearch(e.target.value)}/></label><Button type="submit" variant="outline" disabled={busy}>{c.searchAction}</Button><label><span>{c.state}</span><select value={selection.state} disabled={busy} onChange={e=>change({state:e.target.value,page:null})}>{(['all',...referralStates[selection.tab]] as const).map(state=><option key={state} value={state}>{c[state]}{state==='all'?'':` (${number(data.counts[state])})`}</option>)}</select></label>{(selection.query||selection.state!=='all')&&<Button type="button" variant="ghost" disabled={busy} onClick={()=>change({q:null,state:null,page:null})}>{c.clear}</Button>}</form>
   <h2 ref={results} tabIndex={-1} className="dc-results">{c.matches} · {number(data.matched)}</h2>
   {!data.rows.length?<div className="sc-empty"><p>{data.totals[selection.tab]===0?c.empty:data.matched===0?c.noResults:c.outOfRange}</p>{selection.page>1&&<Button variant="outline" onClick={()=>change({page:null})}>{c.first}</Button>}</div>:<div className="dc-codes">{data.rows.map(row=><article key={row.kind+row.id} className="dc-code"><div className="dc-code-heading"><div><p className="sc-muted">#{row.id}</p><h3><bdi>{heading(row)}</bdi></h3></div><Badge variant="secondary">{c[row.state]}</Badge></div><p className="sc-muted"><bdi>{row.createdAt?row.createdAt.slice(0,10)+' · UTC':c.unknown}</bdi></p>{row.kind==='code'&&<p>{c.storedCount}: {row.recordedCount===null?c.unknown:number(row.recordedCount)}</p>}{row.kind==='referral'&&<p><bdi>{row.code}</bdi></p>}<div className="sc-actions"><Button variant="outline" disabled={busy} onClick={()=>open({kind:'details',row})}>{c.details}<span className="sr-only"> {heading(row)} #{row.id}</span></Button>{row.kind==='reward'&&row.state==='pending'&&data.canManage&&<Button disabled={!writable} onClick={()=>open({kind:'claim',row})}>{c.claim}<span className="sr-only"> #{row.id}</span></Button>}</div></article>)}</div>}
   {data.pages>1&&<nav className="sc-pagination" aria-label={c.page}><Button variant="outline" disabled={selection.page<=1||query.isFetching||busy} onClick={()=>change({page:selection.page-1})}>{c.previous}</Button><span>{c.page} {number(selection.page)} {c.of} {number(data.pages)}</span><Button variant="outline" disabled={selection.page>=data.pages||query.isFetching||busy} onClick={()=>change({page:selection.page+1})}>{c.next}</Button></nav>}
  </section>
  <Dialog open={!!action} onOpenChange={value=>{if(!value&&!busy)setAction(null);}}><DialogContent className="sc-dialog dc-dialog rw-dialog" closeLabel={c.close} dir={locale==='ar'?'rtl':'ltr'} showCloseButton={!busy} onEscapeKeyDown={e=>{if(busy)e.preventDefault();}} onInteractOutside={e=>{if(busy)e.preventDefault();}} onCloseAutoFocus={e=>{e.preventDefault();(returnToTitle.current?title.current:opener.current?.isConnected?opener.current:title.current)?.focus();returnToTitle.current=false;}}><DialogHeader><DialogTitle>{dialogTitle}</DialogTitle><DialogDescription>{dialogHelp}</DialogDescription></DialogHeader>
   {failure&&<p role="alert" className="sc-feedback">{failure}</p>}{!same&&<p role="alert">{c.conflict}</p>}{selected?.issues.length?<p className="sc-feedback">{c.invalidHelp}</p>:null}{selected&&<ReferralSummary row={selected}/>}
   {action?.kind==='apply'&&<dl className="dc-summary"><div><dt>{c.from}</dt><dd>{action.review.referrerName}</dd></div><div><dt>{c.code}</dt><dd><bdi>{action.review.code}</bdi></dd></div></dl>}
   {(action?.kind==='claim'||action?.kind==='apply')&&<label className="rw-ack"><input type="checkbox" checked={ack} disabled={busy||blocked} onChange={e=>setAck(e.target.checked)}/><span>{action.kind==='claim'?c.claimAck:c.applyAck}</span></label>}
   {action?.kind==='apply'&&action.review.alreadyApplied&&<p>{c.applied}</p>}
   <div className="sc-actions"><Button variant="outline" disabled={busy} onClick={()=>setAction(null)}>{action?.kind==='details'?c.close:c.cancel}</Button>{action&&action.kind!=='details'&&<Button disabled={!writable||action.kind!=='create'&&!ack||action.kind==='apply'&&action.review.alreadyApplied} onClick={()=>void save()}>{busy?c.saving:action.kind==='create'?c.createConfirm:action.kind==='apply'?c.applyConfirm:c.confirm}</Button>}</div>
   {(blocked||!same)&&<Button variant="outline" disabled={busy||query.isFetching} onClick={()=>void refresh()}>{c.refresh}</Button>}
  </DialogContent></Dialog>
 </div>;
}
