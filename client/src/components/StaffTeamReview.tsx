import {useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {z} from 'zod';
import {trpc} from '@/lib/trpc';
import {Button} from '@/components/ui/button';
import {Dialog,DialogTrigger,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogClose} from '@/components/ui/dialog';
import {StaffAttemptGuidance} from './StaffAttemptGuidance';
import {readStaffTeamAttempt,prepareStaffTeamAttempt,completeStaffTeamAttempt,discardStaffTeamAttempt} from '@/lib/staff-team-review-attempt';
import {staffTeamCheckResult,staffTeamListInput,staffTeamPage,staffTeamAuditPage,staffTeamReviewReason,staffTeamContext,staffTeamSnapshot,type staffTeamItem} from '@shared/staff-team-review';

type Kind='text'|'voice';type Reason=z.infer<typeof staffTeamReviewReason>;
function TeamAttempt({item,kind,refreshing,revision,onChecked,merchantId,actorUserId}:{item:z.infer<typeof staffTeamItem>;kind:Kind;refreshing:boolean;revision:number;onChecked:()=>void;merchantId:number;actorUserId:number}){
 const {t,i18n}=useTranslation(),mutation=trpc.conversations.checkTeamStaffAttempt.useMutation({retry:false});
 const scope={merchantId,actorUserId,kind,sourceId:item.attempt.id,conversationId:item.conversationId,authorUserId:item.authorUserId};
 const [stored,setStored]=useState(()=>readStaffTeamAttempt(scope));
 const [storageFailed,setStorageFailed]=useState(false);
 const [reason,setReason]=useState<Reason|''>(stored.state==='ready'?stored.value.reason:''),[notice,setNotice]=useState(''),[blocked,setBlocked]=useState(false);
 const busy=useRef(false),request=useRef<{requestId:string;reason:Reason}|undefined>(stored.state==='ready'?stored.value:undefined);
 const restore=()=>{const value=readStaffTeamAttempt(scope);setStored(value);request.current=value.state==='ready'?value.value:undefined;if(value.state==='ready')setReason(value.value.reason);if(value.state==='ready'||value.state==='missing'){setStorageFailed(false);setBlocked(false);}};
 const live=useRef(true);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>setBlocked(false),[revision]);
 const a=item.attempt;
 const check=async()=>{
  if(busy.current||blocked||refreshing||!reason||a.state==='accepted'||stored.state==='invalid'||stored.state==='unavailable')return;
  busy.current=true;setNotice('');
  try{
   try{const prepared=prepareStaffTeamAttempt(scope,reason);request.current={requestId:prepared.requestId,reason:prepared.reason};setStored({state:'ready',value:prepared});setReason(prepared.reason);setStorageFailed(false);}catch{setStorageFailed(true);throw Error('Review identity unavailable');}
   const response=staffTeamCheckResult.parse(await mutation.mutateAsync({kind,sourceId:a.id,conversationId:item.conversationId,authorUserId:item.authorUserId,requestId:request.current.requestId,reason:request.current.reason}));
   if(!live.current)return;
   const outcome=response.result.success?(response.result.persisted?t('merchantUx.staffAttempts.accepted'):t('merchantUx.staffAttempts.unprojected'))
    :response.result.status==='unavailable'?t('merchantUx.staffAttempts.unavailable'):response.result.status==='pending'?t('merchantUx.staffAttempts.unresolved'):response.result.status==='suppressed'?t('merchantUx.staffAttempts.dispatchSuppressed'):t('merchantUx.staffAttempts.providerFailed');
   try{completeStaffTeamAttempt(scope,request.current.requestId);}catch{setStorageFailed(true);throw Error('Review identity cleanup unavailable');}
   setNotice(`${t('merchantUx.teamAttempts.saved',{id:response.reviewId})} ${outcome}`);request.current=undefined;setStored({state:'missing'});onChecked();
  }catch{if(live.current){const value=readStaffTeamAttempt(scope);setStored(value);request.current=value.state==='ready'?value.value:undefined;setBlocked(true);setNotice(t('merchantUx.teamAttempts.failed'));}}
  finally{busy.current=false;}
 };
 return <article data-team-attempt={a.id} data-team-state={a.state} className="space-y-2 rounded-lg border p-3 text-sm [overflow-wrap:anywhere]">
  <h4 className="font-semibold">{t('merchantUx.staffAttempts.attempt',{id:a.id})}</h4>
  <p>{t('merchantUx.teamAttempts.identity',{conversation:item.conversationId,author:item.authorUserId})}</p>
  <time dateTime={a.createdAt}>{new Intl.DateTimeFormat(i18n.language,{dateStyle:'medium',timeStyle:'short'}).format(new Date(a.createdAt))}</time>
  <p>{a.state==='accepted'?t('merchantUx.staffAttempts.accepted'):a.state==='unavailable'?t('merchantUx.staffAttempts.unavailable'):a.state==='failed'?t('merchantUx.staffAttempts.failed'):a.state==='suppressed'?t('merchantUx.staffAttempts.suppressed'):t('merchantUx.staffAttempts.pending')}</p>
  <StaffAttemptGuidance diagnostic={a.diagnostic}/>
  {a.state==='accepted'&&!a.persisted&&<p>{t('merchantUx.staffAttempts.unprojected')}</p>}
  {a.state!=='accepted'&&<>
   {stored.state==='ready'&&<p data-team-restored role="status">{t('conversationReview.savedRequest')}</p>}
   {(storageFailed||stored.state==='invalid'||stored.state==='unavailable')&&<div role="alert" data-team-storage-error className="space-y-2">
    <p>{t('conversationReview.storageFailed')}</p>
    <Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" onClick={restore}>{t('conversationReview.retryStorage')}</Button>
    {stored.state==='invalid'&&<Button type="button" variant="outline" className="h-auto min-h-11 whitespace-normal" onClick={()=>{try{discardStaffTeamAttempt(scope);restore();setBlocked(false);}catch{setNotice(t('conversationReview.storageFailed'));}}}>{t('conversationReview.reviewedReset')}</Button>}
   </div>}
   <label className="block">{t('merchantUx.teamAttempts.reason')}
    <select data-team-reason className="mt-1 min-h-11 w-full rounded-md border bg-background px-2" value={reason} disabled={mutation.isPending||!!request.current||stored.state==='invalid'||stored.state==='unavailable'} onChange={e=>setReason(e.target.value as Reason)}>
     <option value="">{t('merchantUx.teamAttempts.chooseReason')}</option><option value="delivery_check">{t('merchantUx.teamAttempts.delivery')}</option>
     <option value="departed_employee">{t('merchantUx.teamAttempts.departed')}</option><option value="incident_review">{t('merchantUx.teamAttempts.incident')}</option>
    </select>
   </label>
   <Button data-team-check className="h-auto min-h-11 w-full whitespace-normal" disabled={!reason||blocked||refreshing||mutation.isPending||stored.state==='invalid'||stored.state==='unavailable'} onClick={()=>void check()}>{mutation.isPending?t('merchantUx.teamAttempts.checking'):t('merchantUx.teamAttempts.check')}</Button>
  </>}
  {notice&&<p role="status" data-team-notice>{notice}</p>}
 </article>;
}
type TeamScope={merchantId:number;actorUserId:number};
function TeamBrowser({merchantId,actorUserId}:TeamScope){
 const {t,i18n}=useTranslation(),utils=trpc.useUtils();
 const [kind,setKind]=useState<Kind>('text'),[history,setHistory]=useState(false),[beforeId,setBeforeId]=useState<number>();
 const [conversation,setConversation]=useState(''),[author,setAuthor]=useState(''),[error,setError]=useState('');
 const [filters,setFilters]=useState<{conversationId?:number;authorUserId?:number}>({});
 const input={kind,...filters,beforeId};
 const query=trpc.conversations.staffTeamSnapshot.useQuery({...input,mode:history?'history':'attempts'},{retry:false,staleTime:0,refetchOnMount:'always'});
 const snapshot=staffTeamSnapshot.safeParse(query.data),reading=query.isLoading||query.isFetching;
 const matches=snapshot.success&&snapshot.data.merchantId===merchantId&&snapshot.data.actorUserId===actorUserId&&snapshot.data.kind===kind&&snapshot.data.mode===(history?'history':'attempts')&&snapshot.data.beforeId===(beforeId??null)&&snapshot.data.conversationId===(filters.conversationId??null)&&snapshot.data.authorUserId===(filters.authorUserId??null);
 const data=snapshot.success&&matches&&!reading&&!query.isError?snapshot.data:null;
 const page=staffTeamPage.safeParse(data?.mode==='attempts'?data.page:undefined),audit=staffTeamAuditPage.safeParse(data?.mode==='history'?data.page:undefined);
 const parsed=history?audit.success:page.success,cursor=history?(audit.success?audit.data.nextCursor:null):(page.success?page.data.nextCursor:null);
 const refresh=()=>{if(beforeId!==undefined)setBeforeId(undefined);else void query.refetch();};
 const checked=(conversationId:number)=>{void utils.conversations.staffTeamSnapshot.invalidate();void utils.conversations.listTeamStaffAttempts.invalidate({kind,...filters});void utils.conversations.listStaffTeamReviews.invalidate();void utils.conversations.getMessages.invalidate({conversationId});void utils.conversations.messageHistory.invalidate({conversationId});void utils.conversations.listStaffAttempts.invalidate({conversationId});void utils.conversations.staffAttemptSnapshot.invalidate({conversationId});};
 const reasons={delivery_check:t('merchantUx.teamAttempts.delivery'),departed_employee:t('merchantUx.teamAttempts.departed'),incident_review:t('merchantUx.teamAttempts.incident')};
 return <section className="min-w-0 space-y-3 p-3 text-sm" aria-label={t('merchantUx.teamAttempts.title')}>
  <p>{t('merchantUx.teamAttempts.scope')}</p>
  <div className="flex flex-wrap gap-2">
   <Button data-team-mode="attempts" aria-pressed={!history} variant={!history?'default':'outline'} className="h-auto min-h-11 whitespace-normal" onClick={()=>{setHistory(false);setBeforeId(undefined);}}>{t('merchantUx.teamAttempts.attempts')}</Button>
   <Button data-team-mode="history" aria-pressed={history} variant={history?'default':'outline'} className="h-auto min-h-11 whitespace-normal" onClick={()=>{setHistory(true);setBeforeId(undefined);}}>{t('merchantUx.teamAttempts.history')}</Button>
   <Button data-team-kind="text" aria-pressed={kind==='text'} variant={kind==='text'?'default':'outline'} className="h-auto min-h-11 whitespace-normal" onClick={()=>{setKind('text');setBeforeId(undefined);}}>{t('merchantUx.staffAttempts.text')}</Button>
   <Button data-team-kind="voice" aria-pressed={kind==='voice'} variant={kind==='voice'?'default':'outline'} className="h-auto min-h-11 whitespace-normal" onClick={()=>{setKind('voice');setBeforeId(undefined);}}>{t('merchantUx.staffAttempts.voice')}</Button>
  </div>
  <form className="flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();
   const valid=[conversation,author].every(v=>!v||/^[0-9]+$/.test(v));
   const result=staffTeamListInput.safeParse({kind,conversationId:conversation?Number(conversation):undefined,authorUserId:author?Number(author):undefined});
   if(!valid||!result.success){setError(t('merchantUx.teamAttempts.filtersInvalid'));return;}setError('');setFilters({conversationId:result.data.conversationId,authorUserId:result.data.authorUserId});setBeforeId(undefined);
  }}>
   <label className="min-w-0 flex-1">{t('merchantUx.teamAttempts.conversation')}<input data-team-conversation inputMode="numeric" className="mt-1 min-h-11 w-full rounded-md border bg-background px-2" placeholder={t('merchantUx.teamAttempts.all')} value={conversation} onChange={e=>setConversation(e.target.value)}/></label>
   <label className="min-w-0 flex-1">{t('merchantUx.teamAttempts.author')}<input data-team-author inputMode="numeric" className="mt-1 min-h-11 w-full rounded-md border bg-background px-2" placeholder={t('merchantUx.teamAttempts.all')} value={author} onChange={e=>setAuthor(e.target.value)}/></label>
   <Button data-team-apply type="submit" className="h-auto min-h-11 whitespace-normal">{t('merchantUx.teamAttempts.apply')}</Button>
  </form>
  {error&&<p role="alert">{error}</p>}
  {query.isError?<p role="alert">{t('merchantUx.teamAttempts.loadFailed')}</p>:reading?<p role="status">{t('merchantUx.teamAttempts.loading')}</p>:!parsed?<p role="alert">{t('merchantUx.teamAttempts.invalid')}</p>:
   <div data-team-list key={`${history}:${kind}:${filters.conversationId}:${filters.authorUserId}:${beforeId}`} className="max-h-96 space-y-3 overflow-y-auto overscroll-contain" tabIndex={0}>
    {history&&audit.success?audit.data.items.length?audit.data.items.map(v=><article data-team-audit={v.id} key={v.id} className="space-y-2 rounded-lg border p-3 [overflow-wrap:anywhere]">
     <h4>{t('merchantUx.teamAttempts.review',{id:v.id})} · {t('merchantUx.staffAttempts.attempt',{id:v.sourceId})}</h4>
     <p>{t('merchantUx.teamAttempts.identity',{conversation:v.conversationId,author:v.authorUserId})}</p><p>{t('merchantUx.teamAttempts.reviewer',{reviewer:v.reviewerUserId})}</p>
     <time dateTime={v.createdAt}>{new Intl.DateTimeFormat(i18n.language,{dateStyle:'medium',timeStyle:'short'}).format(new Date(v.createdAt))}</time><p>{reasons[v.reason]}</p>
     <p>{v.result.success?t('merchantUx.staffAttempts.accepted'):v.result.status==='unavailable'?t('merchantUx.staffAttempts.unavailable'):v.result.status==='pending'?t('merchantUx.staffAttempts.unresolved'):v.result.status==='suppressed'?t('merchantUx.staffAttempts.dispatchSuppressed'):t('merchantUx.staffAttempts.providerFailed')}</p>
     {v.result.success&&!v.result.persisted&&<p>{t('merchantUx.staffAttempts.unprojected')}</p>}
    </article>):<p>{t('merchantUx.teamAttempts.empty')}</p>:page.success&&(page.data.items.length?page.data.items.map(item=><TeamAttempt key={item.attempt.id} item={item} kind={kind} merchantId={merchantId} actorUserId={actorUserId} refreshing={query.isFetching} revision={query.dataUpdatedAt} onChecked={()=>checked(item.conversationId)}/>):<p>{t('merchantUx.teamAttempts.empty')}</p>)}
   </div>}
  <div className="flex flex-wrap gap-2"><Button data-team-refresh variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={query.isFetching} onClick={refresh}>{beforeId?t('merchantUx.teamAttempts.latest'):t('merchantUx.teamAttempts.refresh')}</Button>
   {!query.isError&&cursor&&<Button data-team-older variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={query.isFetching} onClick={()=>setBeforeId(cursor)}>{t('merchantUx.teamAttempts.older')}</Button>}</div>
  <p className="text-xs text-muted-foreground">{t('merchantUx.teamAttempts.auditScope')}</p>
 </section>;
}
export function StaffTeamReview(props:TeamScope&{compact?:boolean}){
 return <ScopedTeamReview key={`${props.actorUserId}:${props.merchantId}`} {...props}/>;
}
function ScopedTeamReview({merchantId,actorUserId,compact=false}:TeamScope&{compact?:boolean}){
 const {t}=useTranslation(),[open,setOpen]=useState(false);
 const access=trpc.conversations.staffTeamContext.useQuery(undefined,{retry:false,staleTime:0,refetchOnMount:'always'});
 const parsed=staffTeamContext.safeParse(access.data),matches=parsed.success&&parsed.data.merchantId===merchantId&&parsed.data.actorUserId===actorUserId;
 if(compact){
  if(!access.isLoading&&!access.isFetching&&!access.isError&&matches&&!parsed.data.canReview)return null;
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button type="button" data-team-compact variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={access.isLoading||access.isFetching}>{t('merchantUx.conversationTools.team')}</Button></DialogTrigger><DialogContent className="max-h-[90dvh] min-w-0 max-w-3xl overflow-y-auto" showCloseButton={false}><DialogHeader className="text-start"><DialogTitle>{t('merchantUx.teamAttempts.title')}</DialogTitle><DialogDescription>{t('merchantUx.conversationTools.teamDescription')}</DialogDescription></DialogHeader>
   {access.isLoading||access.isFetching?<p role="status">{t('merchantUx.teamAttempts.loading')}</p>:access.isError||!matches?<section role="alert" className="space-y-2"><p>{t('merchantUx.teamAttempts.loadFailed')}</p><Button type="button" variant="outline" onClick={()=>void access.refetch()}>{t('merchantUx.teamAttempts.refresh')}</Button></section>:parsed.data.canReview&&<TeamBrowser merchantId={merchantId} actorUserId={actorUserId}/>}
   <DialogClose asChild><Button type="button" variant="outline" className="min-h-11">{t('merchantUx.conversationTools.close')}</Button></DialogClose>
  </DialogContent></Dialog>;
 }
 if(access.isLoading||access.isFetching)return <p role="status">{t('merchantUx.teamAttempts.loading')}</p>;
 if(access.isError||!matches)return <section role="alert" className="space-y-2 rounded-lg border p-3"><p>{t('merchantUx.teamAttempts.loadFailed')}</p><Button type="button" variant="outline" onClick={()=>void access.refetch()}>{t('merchantUx.teamAttempts.refresh')}</Button></section>;
 if(!parsed.data.canReview)return null;
 return <details data-team-review open={open} className="min-w-0 rounded-lg border bg-background" onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary className="min-h-11 cursor-pointer p-3">{t('merchantUx.teamAttempts.title')}</summary>{open&&<TeamBrowser merchantId={merchantId} actorUserId={actorUserId}/>}
 </details>;
}
