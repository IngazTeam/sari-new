import {useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {trpc} from '@/lib/trpc';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {sallaWorkspaceLabels} from '@/lib/salla-workspace-labels';
import {pendingSallaSync,saveSallaSync,clearSallaSync,scopedSallaSync} from '@/lib/salla-workspace';
import type {SallaWorkspace} from '@shared/salla-workspace';
import type {SallaSyncReceipt} from '@shared/salla-sync-request';

type Intent=NonNullable<ReturnType<typeof pendingSallaSync>>;
const fresh={retry:false,staleTime:0,refetchOnMount:'always' as const,refetchOnWindowFocus:false};
export function SallaSyncPanel({connection,refresh,unavailable=false}:{connection:SallaWorkspace;refresh:()=>Promise<unknown>;unavailable?:boolean}){
 const {t,i18n}=useTranslation(),copy=sallaWorkspaceLabels(t),locale=i18n.language.startsWith('ar')?'ar':'en',{actorId,merchantId}=connection;
 const [pending,setPending]=useState<Intent|null>(null),[receipt,setReceipt]=useState<SallaSyncReceipt|null>(null),[review,setReview]=useState<{revision:string;syncType:'full'|'stock'}|null>(null);
 const [notice,setNotice]=useState<'storage'|'changed'|'forbidden'|'rate'|'busy'|'requestUnknown'|null>(null),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
 const latest=trpc.salla.latestSyncRequest.useQuery(undefined,{...fresh,enabled:loaded&&!pending}),mutation=trpc.salla.requestSync.useMutation({retry:false}),utils=trpc.useUtils();
 const lock=useRef(false),alive=useRef(true),opener=useRef<HTMLButtonElement|null>(null);
 useEffect(()=>{alive.current=true;try{setPending(pendingSallaSync(sessionStorage,actorId,merchantId));}catch{setNotice('storage');}setLoaded(true);return()=>{alive.current=false;};},[actorId,merchantId]);
 const shown=receipt??(!pending&&!latest.error?scopedSallaSync(latest.data,actorId,merchantId):null);
 function accept(raw:unknown,intent:Intent){
  const value=scopedSallaSync(raw,actorId,merchantId,intent);if(!value)throw Error('Unconfirmed scope');setReceipt(value);setNotice(null);
  if(value.outcome!=='pending'){clearSallaSync(sessionStorage,actorId,merchantId,intent.requestId);setPending(null);}
 }
 async function recover(){
  if(lock.current)return;lock.current=true;setBusy(true);
  try{if(pending){const result=await utils.salla.syncRequest.fetch({requestId:pending.requestId});if(alive.current)accept(result,pending);}else{const result=await latest.refetch();if(!alive.current)return;if(result.error||result.data!==null&&!scopedSallaSync(result.data,actorId,merchantId))throw Error('Unconfirmed receipt');setReceipt(null);setNotice(null);}await refresh();}
  catch{if(alive.current)setNotice('requestUnknown');}finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 // Poll only known pending work. Reads never start or resume a sync.
 useEffect(()=>{if(!loaded||!pending&&shown?.outcome!=='pending')return;const timer=setInterval(()=>{void recover();},5000);return()=>clearInterval(timer);},[loaded,pending?.requestId,shown?.outcome]);
 async function send(){
  if(lock.current||!review||review.revision!==connection.revision||!ready||unavailable)return;lock.current=true;setBusy(true);setNotice(null);let intent=pending;
  try{
   if(!intent){try{intent=saveSallaSync(sessionStorage,actorId,merchantId,{requestId:crypto.randomUUID(),...review});setPending(intent);setReceipt(null);}catch{setNotice('storage');setReview(null);return;}}
   if(intent.revision!==review.revision||intent.syncType!==review.syncType){setNotice('changed');return;}
   const result=await mutation.mutateAsync(intent);if(!alive.current)return;accept(result,intent);setReview(null);await refresh();
  }catch(error){if(alive.current){const code=(error as any)?.data?.code,message=(error as any)?.message;setNotice(['FORBIDDEN','UNAUTHORIZED'].includes(code)?'forbidden':code==='TOO_MANY_REQUESTS'?'rate':message==='salla_sync:busy'?'busy':code==='CONFLICT'?'changed':'requestUnknown');setReview(null);}}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 function stopTracking(){if(lock.current||!pending)return;try{clearSallaSync(sessionStorage,actorId,merchantId,pending.requestId);setPending(null);setReceipt(null);setNotice(null);void latest.refetch();}catch{setNotice('storage');}}
 const ready=connection.state==='configured'&&!!connection.storeId&&connection.credentialsStored,latestInvalid=latest.error||latest.data!==undefined&&latest.data!==null&&!scopedSallaSync(latest.data,actorId,merchantId);
 const waiting=shown?.outcome==='pending',disabled=busy||unavailable||!loaded||!ready||!!latestInvalid||latest.isLoading||!pending&&latest.isFetching;
 const open=(syncType:'full'|'stock',button:HTMLButtonElement)=>{opener.current=button;setReview({revision:connection.revision,syncType});};
 return <section className="sl-panel" aria-labelledby="sl-sync"><h2 id="sl-sync">{copy.syncTitle}</h2><p className="sc-muted">{copy.syncHelp}</p>
  {!ready&&<p className="sl-notice">{copy.notReady}</p>}
  {shown&&<div className="sl-notice" role="status" data-sync-outcome={shown.outcome}><h3>{copy.latest}</h3><strong>{copy[shown.outcome]}</strong>{shown.outcome!=='success'&&<p>{copy[shown.outcome==='pending'?'pendingHelp':shown.outcome==='failed'?'failedHelp':'interruptedHelp']}</p>}{shown.revision!==connection.revision&&<p>{copy.earlierLink}</p>}<dl className="sl-facts"><div><dt>{copy.requestId}</dt><dd><bdi dir="ltr">{shown.requestId}</bdi></dd></div><div><dt>{copy.requestDate}</dt><dd>{new Date(shown.createdAt).toLocaleString(locale)}</dd></div>{shown.logId!==null&&<div><dt>{copy.logId}</dt><dd>{shown.logId}</dd></div>}{shown.itemsSynced!==null&&<div><dt>{copy.itemsSynced}</dt><dd>{shown.itemsSynced.toLocaleString(locale)}</dd></div>}</dl></div>}
  {(notice||latestInvalid)&&<p className="sl-notice" role="alert">{copy[notice??'requestUnknown']}</p>}
  {pending&&!shown&&<p className="sc-muted">{copy.requestId}: <bdi dir="ltr">{pending.requestId}</bdi></p>}
  <div className="sc-actions">{(pending||shown||latestInvalid)&&<Button variant="outline" disabled={busy} onClick={()=>void recover()}>{copy.recover}</Button>}{pending?<Button disabled={disabled||waiting||pending.revision!==connection.revision} onClick={event=>open(pending.syncType,event.currentTarget)}>{copy.retrySame}</Button>:!waiting&&<><Button disabled={disabled} onClick={event=>open('full',event.currentTarget)}>{copy.full}</Button><Button variant="outline" disabled={disabled||connection.counts.linkedProducts===0} onClick={event=>open('stock',event.currentTarget)}>{copy.stock}</Button></>}</div>
  {pending&&!waiting&&<details className="sl-help"><summary>{copy.stopTracking}</summary><div><p>{copy.stopTrackingHelp}</p><Button variant="outline" disabled={busy} onClick={stopTracking}>{copy.stopTracking}</Button></div></details>}
  <Dialog open={!!review} onOpenChange={open=>{if(!open&&!busy)setReview(null);}}><DialogContent className="sc-dialog sl-review" closeLabel={copy.close} showCloseButton={!busy} dir={locale==='ar'?'rtl':'ltr'} onCloseAutoFocus={event=>{event.preventDefault();opener.current?.focus();}} onEscapeKeyDown={event=>{if(busy)event.preventDefault();}} onInteractOutside={event=>{if(busy)event.preventDefault();}}><DialogHeader><DialogTitle>{copy.syncReview}</DialogTitle><DialogDescription>{review?.syncType==='full'?copy.fullHelp:copy.stockHelp}</DialogDescription></DialogHeader><p><bdi dir="ltr">{connection.storeUrl??connection.storeId}</bdi></p><p>{review?.syncType==='full'?copy.full:copy.stock}</p>{review?.revision!==connection.revision&&<p role="alert">{copy.changed}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setReview(null)}>{copy.cancel}</Button><Button disabled={disabled||review?.revision!==connection.revision} onClick={()=>void send()}>{busy?copy.requesting:copy.confirmSync}</Button></DialogFooter></DialogContent></Dialog>
 </section>;
}
