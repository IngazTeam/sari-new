import {useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {trpc} from '@/lib/trpc';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {zidWorkspaceLabels} from '@/lib/zid-workspace-labels';
import {pendingZidSync,saveZidSync,clearZidSync,scopedZidSync} from '@/lib/zid-workspace';
import type {ZidWorkspace} from '@shared/zid-workspace';
import type {ZidSyncReceipt} from '@shared/zid-sync-request';

type Intent=NonNullable<ReturnType<typeof pendingZidSync>>;
const fresh={retry:false,staleTime:0,refetchOnMount:'always' as const,refetchOnWindowFocus:false};
export function ZidSyncPanel({connection,refresh,unavailable=false,onlyProducts=false}:{connection:ZidWorkspace;refresh:()=>Promise<unknown>;unavailable?:boolean;onlyProducts?:boolean}){
 const {t,i18n}=useTranslation(),copy=zidWorkspaceLabels(t),locale=i18n.language.startsWith('ar')?'ar':'en',{actorId,merchantId}=connection;
 const [pending,setPending]=useState<Intent|null>(null),[receipt,setReceipt]=useState<ZidSyncReceipt|null>(null),[review,setReview]=useState<{revision:string;resource:'all'|'products'|'orders'|'customers'}|null>(null);
 const [notice,setNotice]=useState<'storage'|'changed'|'forbidden'|'rate'|'busy'|'requestUnknown'|null>(null),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
 const latest=trpc.zid.latestSyncRequest.useQuery(undefined,{...fresh,enabled:loaded&&!pending}),mutation=trpc.zid.requestSync.useMutation({retry:false}),utils=trpc.useUtils();
 const lock=useRef(false),alive=useRef(true),opener=useRef<HTMLButtonElement|null>(null),heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{alive.current=true;try{setPending(pendingZidSync(sessionStorage,actorId,merchantId));}catch{setNotice('storage');}setLoaded(true);return()=>{alive.current=false;};},[actorId,merchantId]);
 const shown=receipt??(!pending&&!latest.error?scopedZidSync(latest.data,actorId,merchantId):null);
 function accept(raw:unknown,intent:Intent){
  const value=scopedZidSync(raw,actorId,merchantId,intent);if(!value)throw Error('Unconfirmed scope');setReceipt(value);setNotice(null);
  if(value.outcome!=='pending'){clearZidSync(sessionStorage,actorId,merchantId,intent.requestId);setPending(null);}
 }
 async function recover(){
  if(lock.current)return;lock.current=true;setBusy(true);
  try{if(pending){const result=await utils.zid.syncRequest.fetch({requestId:pending.requestId});if(!alive.current)return;accept(result,pending);}else{const result=await latest.refetch();if(!alive.current)return;if(result.error||result.data!==null&&!scopedZidSync(result.data,actorId,merchantId))throw Error('Unconfirmed receipt');setReceipt(null);setNotice(null);}await refresh();}
  catch{if(alive.current)setNotice('requestUnknown');}finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 // Poll only known pending work. Reads never start or resume a sync.
 useEffect(()=>{if(!loaded||!pending&&shown?.outcome!=='pending')return;const timer=setInterval(()=>{void recover();},5000);return()=>clearInterval(timer);},[loaded,pending?.requestId,shown?.outcome]);
 async function send(){
  if(lock.current||!review||review.revision!==connection.revision||!ready||unavailable)return;lock.current=true;setBusy(true);setNotice(null);let intent=pending;
  try{
   if(!intent){try{intent=saveZidSync(sessionStorage,actorId,merchantId,{requestId:crypto.randomUUID(),...review});setPending(intent);setReceipt(null);}catch{setNotice('storage');setReview(null);return;}}
   if(intent.revision!==review.revision||intent.resource!==review.resource){setNotice('changed');return;}
   const result=await mutation.mutateAsync(intent);if(!alive.current)return;accept(result,intent);setReview(null);await refresh();
  }catch(error){if(alive.current){const code=(error as any)?.data?.code,message=(error as any)?.message;setNotice(['FORBIDDEN','UNAUTHORIZED'].includes(code)?'forbidden':code==='TOO_MANY_REQUESTS'?'rate':message==='zid_sync:busy'?'busy':code==='CONFLICT'?'changed':'requestUnknown');setReview(null);}}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 function stopTracking(){if(lock.current||!pending)return;try{clearZidSync(sessionStorage,actorId,merchantId,pending.requestId);setPending(null);setReceipt(null);setNotice(null);void latest.refetch();}catch{setNotice('storage');}}
 const enabled=(['products','orders','customers'] as const).filter(key=>connection.settings[('sync'+key[0].toUpperCase()+key.slice(1)) as 'syncProducts'|'syncOrders'|'syncCustomers']);
 const ready=connection.state==='configured'&&connection.source==='canonical'&&connection.settingsValid&&!!connection.storeId&&connection.credentialsStored,latestInvalid=latest.error||latest.data!==undefined&&latest.data!==null&&!scopedZidSync(latest.data,actorId,merchantId);
 const waiting=shown?.outcome==='pending',disabled=busy||unavailable||!loaded||!ready||!!latestInvalid||latest.isLoading||!pending&&latest.isFetching;
 const open=(resource:'all'|'products'|'orders'|'customers',button:HTMLButtonElement)=>{opener.current=button;setReview({revision:connection.revision,resource});};
 return <section className="zd-panel" aria-labelledby="zd-sync"><h2 id="zd-sync" ref={heading} tabIndex={-1}>{copy.syncTitle}</h2><p className="sc-muted">{copy.syncHelp}</p>{!enabled.length&&<p className="zd-notice">{copy.allDisabled}</p>}
  {!ready&&<p className="zd-notice">{copy.notReady}</p>}
  {shown&&<div className="zd-notice" role="status" data-sync-outcome={shown.outcome}><h3>{copy.latest}</h3><strong>{copy[shown.outcome]}</strong>{shown.outcome!=='success'&&<p>{copy[shown.outcome==='pending'?'pendingHelp':shown.outcome==='failed'?'failedHelp':'interruptedHelp']}</p>}{shown.revision!==connection.revision&&<p>{copy.earlierLink}</p>}<dl className="zd-facts"><div><dt>{copy.requestId}</dt><dd><bdi dir="ltr">{shown.requestId}</bdi></dd></div><div><dt>{copy.requestDate}</dt><dd>{new Date(shown.createdAt).toLocaleString(locale)}</dd></div></dl><ul className="zd-results">{shown.resources.map(resource=><li key={resource.kind}><strong>{copy[resource.kind]}</strong><p>{copy[resource.state==='pending'?'resourcePending':resource.state==='completed'?'resourceCompleted':resource.state==='failed'?'resourceFailed':resource.state==='unknown'?'resourceUnknown':'not_started']}</p>{resource.itemsSynced!==null&&<p>{copy.itemsSynced}: {resource.itemsSynced.toLocaleString(locale)}</p>}{resource.logId!==null&&<p>{copy.logId}: <bdi>{resource.logId}</bdi></p>}</li>)}</ul></div>}
  {(notice||latestInvalid)&&<p className="zd-notice" role="alert">{copy[notice??'requestUnknown']}</p>}
  {pending&&!shown&&<p className="sc-muted">{copy.requestId}: <bdi dir="ltr">{pending.requestId}</bdi></p>}
  <div className="sc-actions">{(pending||shown||latestInvalid)&&<Button variant="outline" disabled={busy} onClick={()=>void recover()}>{copy.recover}</Button>}{pending?<Button disabled={disabled||waiting||pending.revision!==connection.revision} onClick={event=>open(pending.resource,event.currentTarget)}>{copy.retrySame}</Button>:!waiting&&<>{(onlyProducts?['products'] as const:['all','products','orders','customers'] as const).map(resource=><Button key={resource} variant={resource==='all'||onlyProducts?'default':'outline'} disabled={disabled||!enabled.length||resource!=='all'&&!enabled.includes(resource)} onClick={event=>open(resource,event.currentTarget)}>{resource==='all'?copy.allResources:copy[resource]}</Button>)}</>}</div>
  {pending&&!waiting&&<details className="zd-help"><summary>{copy.stopTracking}</summary><div><p>{copy.stopTrackingHelp}</p><Button variant="outline" disabled={busy} onClick={stopTracking}>{copy.stopTracking}</Button></div></details>}
  <Dialog open={!!review} onOpenChange={open=>{if(!open&&!busy)setReview(null);}}><DialogContent className="sc-dialog zd-review" closeLabel={copy.close} showCloseButton={!busy} dir={locale==='ar'?'rtl':'ltr'} onCloseAutoFocus={event=>{event.preventDefault();(opener.current?.isConnected&&!opener.current.disabled?opener.current:heading.current)?.focus();}} onEscapeKeyDown={event=>{if(busy)event.preventDefault();}} onInteractOutside={event=>{if(busy)event.preventDefault();}}><DialogHeader><DialogTitle>{copy.syncReview}</DialogTitle><DialogDescription>{copy.syncReviewHelp}</DialogDescription></DialogHeader><p><bdi dir="ltr">{connection.storeUrl??connection.storeId}</bdi></p><ul>{enabled.filter(resource=>review?.resource==='all'||review?.resource===resource).map(resource=><li key={resource}>{copy[resource]}</li>)}</ul>{review?.revision!==connection.revision&&<p role="alert">{copy.changed}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setReview(null)}>{copy.cancel}</Button><Button disabled={disabled||review?.revision!==connection.revision} onClick={()=>void send()}>{busy?copy.requesting:copy.confirmSync}</Button></DialogFooter></DialogContent></Dialog>
 </section>;
}
