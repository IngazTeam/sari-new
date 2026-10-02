import {useContext,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {CalendlyPageHeading} from './CalendlyWorkspaceShell';
import {trpc} from '@/lib/trpc';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {readCalendlyTracking,saveCalendlyTracking,clearCalendlyTracking,scopedCalendlyOperation,scopedCalendlyReview,type CalendlyOperationTracking} from '@/lib/calendly-workspace';
import type {CalendlyOperationKind,CalendlyOperationReceipt} from '@shared/calendly-operation';
import type {CalendlyCopy} from '@/lib/calendly-workspace-labels';
export const calendlyFresh={retry:false,staleTime:0,refetchOnMount:'always' as const,refetchOnWindowFocus:false};
type Notice='storage'|'changed'|'forbidden'|'busy'|'rate'|'requestUnknown';

export function useCalendlyOperation(actorId:number,merchantId:number,enabled:boolean){
 const utils=trpc.useUtils(),blockerQuery=trpc.calendly.getBlockingOperation.useQuery(undefined,{...calendlyFresh,enabled});
 const acknowledge=trpc.calendly.acknowledgeOperation.useMutation({retry:false});
 const [tracked,setTracked]=useState<CalendlyOperationTracking|null>(null),[receipt,setReceipt]=useState<CalendlyOperationReceipt|null>(null),[notice,setNotice]=useState<Notice|null>(null),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
 const alive=useRef(true),locked=useRef(false),settled=useRef('');
 useEffect(()=>{alive.current=true;if(enabled){try{setTracked(readCalendlyTracking(sessionStorage,actorId,merchantId));}catch{setNotice('storage');}}setLoaded(true);return()=>{alive.current=false;};},[actorId,merchantId,enabled]);
 const envelope=!blockerQuery.error?scopedCalendlyReview(blockerQuery.data,actorId,merchantId):null,blocker=envelope?.operation??null;
 const sourceInvalid=enabled&&(!!blockerQuery.error||!blockerQuery.isLoading&&!blockerQuery.isFetching&&!envelope);
 async function accept(raw:unknown,intent:CalendlyOperationTracking){
  const value=scopedCalendlyOperation(raw,actorId,merchantId,intent);if(!value)throw Error('Unconfirmed operation scope');
  if(!alive.current)return;setReceipt(value);setNotice(null);
  const identity=value.requestId+':'+value.outcome;
  if(value.outcome!=='pending'&&settled.current!==identity){settled.current=identity;await utils.calendly.invalidate();}
 }
 async function recover(){
  if(locked.current||!enabled)return;locked.current=true;setBusy(true);
  try{if(tracked){const result=await utils.calendly.getOperation.fetch({requestId:tracked.requestId});if(!alive.current)return;await accept(result,tracked);}const result=await blockerQuery.refetch();if(!alive.current)return;if(result.error||!scopedCalendlyReview(result.data,actorId,merchantId))throw Error('Unconfirmed operation review');if(!tracked)setNotice(null);}
  catch{if(alive.current)setNotice('requestUnknown');}finally{locked.current=false;if(alive.current)setBusy(false);}
 }
 useEffect(()=>{if(loaded&&tracked&&enabled)void recover();},[loaded,tracked?.requestId,enabled]);
 const waiting=receipt?.outcome==='pending'||blocker?.outcome==='pending';
 useEffect(()=>{if(!enabled||!loaded||!waiting&&!tracked)return;const timer=setInterval(()=>{if(!receipt||receipt.outcome==='pending'||blocker?.outcome==='pending')void recover();},5000);return()=>clearInterval(timer);},[enabled,loaded,tracked?.requestId,receipt?.outcome,blocker?.outcome]);
 const canStart=enabled&&loaded&&!busy&&!sourceInvalid&&!blockerQuery.isFetching&&!blockerQuery.isLoading&&!notice&&!waiting&&!blocker?.reviewRequired&&(!tracked||!!receipt&&!receipt.reviewRequired);
 async function execute(kind:CalendlyOperationKind,revision:string,send:(requestId:string)=>Promise<unknown>){
  if(locked.current||!canStart)return false;locked.current=true;setBusy(true);setNotice(null);let intent:CalendlyOperationTracking|undefined;
  try{
   try{intent=saveCalendlyTracking(sessionStorage,actorId,merchantId,{requestId:crypto.randomUUID(),kind,revision});setTracked(intent);setReceipt(null);}catch{setNotice('storage');return false;}
   const result=await send(intent.requestId);if(!alive.current)return false;await accept(result,intent);await blockerQuery.refetch();return true;
  }catch(error){
   if(alive.current){const code=(error as any)?.data?.code,message=(error as any)?.message;
    const known=['BAD_REQUEST','FORBIDDEN','UNAUTHORIZED','PRECONDITION_FAILED','CONFLICT','TOO_MANY_REQUESTS'].includes(code);
    if(known&&intent){try{clearCalendlyTracking(sessionStorage,actorId,merchantId,intent.requestId);setTracked(null);}catch{setNotice('storage');return false;}}
    setNotice(['FORBIDDEN','UNAUTHORIZED'].includes(code)?'forbidden':code==='TOO_MANY_REQUESTS'?'rate':message==='calendly_operation:busy'||message==='calendly_operation:review_required'?'busy':known?'changed':'requestUnknown');void blockerQuery.refetch();
   }return false;
  }finally{locked.current=false;if(alive.current)setBusy(false);}
 }
 async function reviewUnknown(operation:CalendlyOperationReceipt){
  if(locked.current||!enabled||!operation.reviewRequired||operation.outcome!=='unknown')return;locked.current=true;setBusy(true);
  try{const result=scopedCalendlyReview(await acknowledge.mutateAsync({requestId:operation.requestId}),actorId,merchantId);if(!alive.current)return;
   if(!result?.operation||result.operation.requestId!==operation.requestId||result.operation.outcome!=='unknown'||result.operation.reviewRequired)throw Error('Unconfirmed acknowledgement');
   if(tracked?.requestId===result.operation.requestId)await accept(result.operation,tracked);setNotice(null);await blockerQuery.refetch();await utils.calendly.invalidate();
  }catch{if(alive.current)setNotice('requestUnknown');}finally{locked.current=false;if(alive.current)setBusy(false);}
 }
 function forget(){if(locked.current||!tracked||waiting)return;try{clearCalendlyTracking(sessionStorage,actorId,merchantId,tracked.requestId);setTracked(null);setReceipt(null);setNotice(null);void blockerQuery.refetch();}catch{setNotice('storage');}}
 return {tracked,receipt,blocker,notice:notice??(sourceInvalid?'requestUnknown':null),busy,canStart,recover,execute,reviewUnknown,forget,actorId};
}
export type CalendlyOperationController=ReturnType<typeof useCalendlyOperation>;
export function CalendlyOperationPanel({operation:o,copy:c,locale}:{operation:CalendlyOperationController;copy:CalendlyCopy;locale:'ar'|'en'}){
 const [review,setReview]=useState<CalendlyOperationReceipt|null>(null),opener=useRef<HTMLButtonElement|null>(null),heading=useRef<HTMLHeadingElement>(null);
 const shown=[...(o.receipt?[o.receipt]:[]),...(o.blocker&&o.blocker.requestId!==o.receipt?.requestId?[o.blocker]:[])];
 const pageHeading=useContext(CalendlyPageHeading),forgetting=useRef(false),hidden=!shown.length&&!o.notice&&!o.tracked;
 useLayoutEffect(()=>{if(forgetting.current){forgetting.current=false;if(!o.tracked)(hidden?pageHeading?.current:heading.current)?.focus();}});
 if(hidden)return null;
 const title=(kind:CalendlyOperationKind)=>c[kind],outcome=(value:CalendlyOperationReceipt)=>c[value.outcome==='pending'?'opPending':value.outcome==='success'?'opSuccess':value.outcome==='rejected'?'opRejected':'opUnknown'];
 return <section className="cl-panel cl-operation" aria-labelledby="cl-operation"><h2 id="cl-operation" ref={heading} tabIndex={-1}>{c.operation}</h2>
  {shown.map(value=><div className="cl-notice" key={value.requestId} role="status" data-calendly-outcome={value.outcome}><h3>{title(value.kind)}</h3><strong>{outcome(value)}</strong>{value.actorId!==o.actorId&&<p>{c.otherActor}</p>}{value.outcome==='unknown'&&<p>{c.unknownHelp}</p>}
   <dl className="cl-facts"><div><dt>{c.requestId}</dt><dd><bdi dir="ltr">{value.requestId}</bdi></dd></div><div><dt>{c.createdAt}</dt><dd>{new Date(value.createdAt).toLocaleString(locale,{timeZone:'UTC'})} · UTC</dd></div></dl>
   {value.result?.type==='sync'&&<><p>{c.period}: <bdi>{value.result.period.startDate} — {value.result.period.endDate}</bdi> · UTC</p><p>{c.syncResultHint}</p><dl className="cl-facts">{(['appointments','active','cancelled'] as const).map(key=><div key={key}><dt>{c[key]}</dt><dd>{value.result?.type==='sync'?value.result[key].toLocaleString(locale):null}</dd></div>)}</dl></>}
   {value.result?.type==='connection'&&<>{value.result.remoteCleanup==='unconfirmed'&&<p>{c.remoteUnconfirmed}</p>}{value.result.verification==='api'&&<p>{c.apiOnly}</p>}{value.result.verification==='api_and_webhooks'&&<p>{c.apiAndHooks}</p>}{value.result.localCopies==='cleared'&&<p>{c.localCleared}</p>}</>}
   {value.result?.type==='settings'&&<p>{c.confirmations}: {value.result.syncToWhatsApp?c.on:c.off}</p>}
   {value.reviewRequired&&<><p>{c.reviewRequired}</p><Button variant="outline" disabled={o.busy} onClick={event=>{opener.current=event.currentTarget;setReview(value);}}>{c.acknowledge}</Button></>}
  </div>)}
  {o.notice&&<p role="alert" className="cl-notice">{c[o.notice]}</p>}{o.tracked&&!o.receipt&&<p>{c.requestId}: <bdi dir="ltr">{o.tracked.requestId}</bdi></p>}
  <div className="sc-actions"><Button variant="outline" disabled={o.busy} onClick={()=>void o.recover()}>{c.recover}</Button></div>
  {o.tracked&&o.receipt?.outcome!=='pending'&&o.blocker?.outcome!=='pending'&&<details className="cl-help"><summary>{c.forget}</summary><p>{c.forgetHint}</p><Button variant="outline" disabled={o.busy} onClick={()=>{forgetting.current=true;o.forget();}}>{c.forget}</Button></details>}
  <Dialog open={!!review} onOpenChange={open=>{if(!open&&!o.busy)setReview(null);}}><DialogContent className="sc-dialog cl-dialog" closeLabel={c.close} showCloseButton={!o.busy} dir={locale==='ar'?'rtl':'ltr'} onCloseAutoFocus={event=>{event.preventDefault();(opener.current?.isConnected&&!opener.current.disabled?opener.current:heading.current?.isConnected?heading.current:pageHeading?.current)?.focus();}} onEscapeKeyDown={event=>{if(o.busy)event.preventDefault();}} onInteractOutside={event=>{if(o.busy)event.preventDefault();}}><DialogHeader><DialogTitle>{c.acknowledge}</DialogTitle><DialogDescription>{c.acknowledgeHint}</DialogDescription></DialogHeader><p><bdi dir="ltr">{review?.requestId}</bdi></p><p>{c.unknownHelp}</p><DialogFooter><Button variant="outline" disabled={o.busy} onClick={()=>setReview(null)}>{c.cancel}</Button><Button disabled={o.busy} onClick={async()=>{if(review)await o.reviewUnknown(review);setReview(null);}}>{o.busy?c.working:c.acknowledge}</Button></DialogFooter></DialogContent></Dialog>
 </section>;
}
