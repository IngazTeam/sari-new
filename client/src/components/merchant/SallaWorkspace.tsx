import {useEffect,useRef,useState} from 'react';
import {Link} from 'wouter';
import {useTranslation} from 'react-i18next';
import {Store,RefreshCw,ExternalLink,Unplug,Eye,EyeOff,Copy} from 'lucide-react';
import {trpc} from '@/lib/trpc';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Badge} from '@/components/ui/badge';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {SallaEffectReview} from '@/components/SallaEffectReview';
import {sallaConnectionToken,sallaRegisterReceipt,sallaDisconnectReceipt} from '@shared/salla-connection';
import {safePlatformUrl} from '@shared/platform-workspace';
import type {SallaWorkspace as Snapshot} from '@shared/salla-workspace';
import {scopedSallaWorkspace} from '@/lib/salla-workspace';
import {sallaWorkspaceLabels} from '@/lib/salla-workspace-labels';
import {WorkspaceState,workspaceFailureKind} from './WorkspaceState';
import {SallaSyncPanel} from './SallaSyncPanel';
import {SallaLogList} from './SallaLogList';
import '@/styles/service-catalog-workspace.css';
import '@/styles/salla-workspace.css';

const fresh={retry:false,staleTime:0,refetchOnMount:'always' as const,refetchOnWindowFocus:false};
type Notice='registered'|'disconnected'|'changed'|'conflict'|'forbidden'|'uncertain'|'refreshed'|'refreshFailed'|null;
export function SallaWorkspace({actorId,merchantId}:{actorId:number;merchantId:number}){
 const {t,i18n}=useTranslation(),copy=sallaWorkspaceLabels(t),locale=i18n.language.startsWith('ar')?'ar':'en';
 const query=trpc.salla.workspace.useQuery(undefined,fresh),register=trpc.salla.registerConnection.useMutation({retry:false}),remove=trpc.salla.disconnect.useMutation({retry:false});
 const data=query.error?null:scopedSallaWorkspace(query.data,actorId,merchantId);
 const [token,setToken]=useState(''),[visible,setVisible]=useState(false),[fieldError,setFieldError]=useState<'invalidToken'|'credentials'|null>(null),[tab,setTab]=useState<'overview'|'history'|'effects'>('overview');
 const [busy,setBusy]=useState<'register'|'remove'|'refresh'|null>(null),[blocked,setBlocked]=useState(false),[notice,setNotice]=useState<Notice>(null),[review,setReview]=useState<Snapshot|null>(null),[copied,setCopied]=useState<'copied'|'copyFailed'|null>(null);
 const alive=useRef(true),lock=useRef(false),opener=useRef<HTMLButtonElement>(null),refreshButton=useRef<HTMLButtonElement>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const checked=async()=>{const result=await query.refetch();if(!alive.current)return null;return !result.error?scopedSallaWorkspace(result.data,actorId,merchantId):null;};
 async function refresh(){if(lock.current)return;lock.current=true;setBusy('refresh');try{const value=await checked();if(!alive.current)return;if(!value){setNotice('refreshFailed');setBlocked(true);return;}setBlocked(false);setReview(null);setNotice('refreshed');}catch{if(alive.current){setNotice('refreshFailed');setBlocked(true);}}finally{lock.current=false;if(alive.current)setBusy(null);}}
 function failed(error:unknown){const value=error as any;setNotice(['FORBIDDEN','UNAUTHORIZED'].includes(value?.data?.code)?'forbidden':value?.message==='salla_connection:changed'?'changed':value?.data?.code==='CONFLICT'?'conflict':'uncertain');setBlocked(true);}
 async function save(){
  if(lock.current||!data||data.present||blocked||query.isFetching)return;const value=sallaConnectionToken.safeParse(token);if(!value.success){setFieldError('invalidToken');return;}
  lock.current=true;setBusy('register');setFieldError(null);setNotice(null);
  try{const receipt=sallaRegisterReceipt.parse(await register.mutateAsync({accessToken:value.data,revision:data.revision}));if(!alive.current)return;if(receipt.actorId!==actorId||receipt.merchantId!==merchantId)throw Error('Unconfirmed scope');const saved=await checked();if(!alive.current)return;if(!saved?.present||saved.revision!==receipt.revision||saved.storeId!==receipt.storeId||!safePlatformUrl(receipt.storeUrl)||safePlatformUrl(saved.storeUrl)!==safePlatformUrl(receipt.storeUrl))throw Error('Unconfirmed saved connection');setToken('');setVisible(false);setNotice('registered');}
  catch(error){if(alive.current){if((error as any)?.message==='salla_connection:credentials')setFieldError('credentials');else if((error as any)?.data?.code==='BAD_REQUEST')setFieldError('invalidToken');else{setToken('');setVisible(false);failed(error);}}}
  finally{lock.current=false;if(alive.current)setBusy(null);}
 }
 async function disconnect(){
  if(lock.current||!review||!data?.present||data.revision!==review.revision||blocked||query.isFetching)return;lock.current=true;setBusy('remove');setNotice(null);
  try{const result=sallaDisconnectReceipt.strip().parse(await remove.mutateAsync({revision:review.revision}));if(!alive.current)return;if(result.actorId!==actorId||result.merchantId!==merchantId)throw Error('Unconfirmed scope');const saved=await checked();if(!alive.current)return;if(!saved||saved.present)throw Error('Unconfirmed disconnection');setReview(null);setNotice('disconnected');}
  catch(error){if(alive.current){failed(error);setReview(null);}}finally{lock.current=false;if(alive.current)setBusy(null);}
 }
 async function copyUrl(){try{await navigator.clipboard.writeText(webhookUrl);if(alive.current)setCopied('copied');}catch{if(alive.current)setCopied('copyFailed');}}
 if(query.isLoading||query.isFetching&&!query.data)return <WorkspaceState kind="loading"/>;
 if(!data)return <WorkspaceState kind={workspaceFailureKind(query.error)} onRetry={()=>void refresh()}/>;
 const date=(value:string|null)=>value?new Date(value).toLocaleString(locale):copy.none,disabled=!!busy||query.isFetching||blocked,url=safePlatformUrl(data.storeUrl),webhookUrl=typeof window==='undefined'?'':window.location.origin+'/api/webhooks/salla';
 return <div className="service-catalog salla-workspace" data-salla-workspace dir={locale==='ar'?'rtl':'ltr'}>
  <header className="sc-header"><div><p className="sc-eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><p>{copy.description}</p></div><Button ref={refreshButton} variant="outline" disabled={!!busy||query.isFetching} onClick={()=>void refresh()}><RefreshCw aria-hidden="true"/>{copy.refresh}</Button></header>
  <nav className="sc-nav" aria-label={copy.back}><Link href="/merchant/platform-integrations">{copy.back}</Link><Link href="/merchant/products">{copy.products}</Link><Link href="/merchant/test-sari">{copy.test}</Link></nav>
  {notice&&<p className="sc-feedback" role={['registered','disconnected','refreshed'].includes(notice)?'status':'alert'}>{copy[notice]}</p>}
  <nav className="sl-tabs" aria-label={copy.title}>{(['overview','history','effects'] as const).map(value=><button type="button" key={value} disabled={!!busy} aria-current={tab===value?'page':undefined} onClick={()=>setTab(value)}>{copy[value]}</button>)}</nav>
  {tab==='overview'?<><div className="sl-grid"><section className="sl-panel" aria-labelledby="sl-connection"><div className="sl-status"><Store aria-hidden="true"/><h2 id="sl-connection">{copy.connection}</h2><Badge variant="secondary">{copy[data.state]}</Badge></div><p className="sc-muted">{copy.savedHint}</p>
   {data.present?<><dl className="sl-facts"><div><dt>{copy.storeUrl}</dt><dd>{url?<a href={url} target="_blank" rel="noopener noreferrer" dir="ltr">{url}<ExternalLink className="inline ms-2" aria-hidden="true"/></a>:copy.none}</dd></div><div><dt>{copy.storeId}</dt><dd><bdi>{data.storeId??copy.none}</bdi></dd></div><div><dt>{copy.lastSync}</dt><dd>{date(data.lastSyncAt)}</dd></div><div><dt>{copy.created}</dt><dd>{date(data.createdAt)}</dd></div></dl>{data.hasSyncErrors&&<p className="sl-notice">{copy.error}</p>}<div className="sc-actions"><Button ref={opener} variant="outline" disabled={disabled} onClick={()=>setReview(data)}><Unplug aria-hidden="true"/>{copy.remove}</Button></div></>:<form className="sl-form" noValidate onSubmit={event=>{event.preventDefault();void save();}}><label htmlFor="sl-token">{copy.token}</label><div className="sl-secret"><Input id="sl-token" type={visible?'text':'password'} value={token} onChange={event=>{setToken(event.target.value);setFieldError(null);}} dir="ltr" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={8192} disabled={!!busy} aria-invalid={!!fieldError||undefined} aria-describedby={'sl-token-hint'+(fieldError?' sl-token-error':'')}/><Button type="button" variant="outline" aria-label={visible?copy.hide:copy.show} aria-pressed={visible} onClick={()=>setVisible(v=>!v)}>{visible?<EyeOff aria-hidden="true"/>:<Eye aria-hidden="true"/>}</Button></div><p id="sl-token-hint" className="sc-muted">{copy.tokenHint}</p>{fieldError&&<p className="sl-error" id="sl-token-error" role="alert">{copy[fieldError]}</p>}<Button type="submit" disabled={disabled}>{busy==='register'?copy.saving:copy.register}</Button></form>}
   <p className="sc-muted">{copy.checked}: {date(data.checkedAt)}</p></section><SallaSyncPanel key={actorId+':'+merchantId} connection={data} unavailable={disabled} refresh={async()=>{await checked();}}/></div>
   <dl className="sc-summary">{(['catalog','linkedProducts','syncLogs'] as const).map(key=><div key={key}><dt>{copy[key]}</dt><dd>{data.counts[key].toLocaleString(locale)}</dd></div>)}</dl><p className="sc-muted">{copy.countsHint}</p>
   <section className="sl-panel sl-webhooks"><h2>{copy.webhooks}</h2><p className="sc-muted">{copy.webhookHint}</p><dl className="sl-facts">{(['recentTotal','recentCompleted','awaiting','manualReview'] as const).map(key=><div key={key}><dt>{copy[key]}</dt><dd>{data.webhooks[key].toLocaleString(locale)}</dd></div>)}<div><dt>{copy.oldest}</dt><dd>{data.webhooks.oldestPendingSeconds===null?copy.none:Math.ceil(data.webhooks.oldestPendingSeconds/60).toLocaleString(locale)}</dd></div></dl></section>
   <details className="sl-help"><summary>{copy.help}</summary><div><p>{copy.helpText}</p><label htmlFor="sl-webhook-url">{copy.webhookUrl}</label><code id="sl-webhook-url" dir="ltr" tabIndex={0}>{webhookUrl}</code><div><Button variant="outline" onClick={()=>void copyUrl()}><Copy aria-hidden="true"/>{copy.copy}</Button></div>{copied&&<p role="status">{copy[copied]}</p>}</div></details>
  </>:tab==='history'?<SallaLogList actorId={actorId} merchantId={merchantId}/>:<section className="sl-stack"><h2 className="text-lg font-semibold">{copy.effects}</h2><p>{copy.effectsHelp}</p><p className="sc-muted">{copy.noAccessEffects}</p><SallaEffectReview/></section>}
  <Dialog open={!!review} onOpenChange={open=>{if(!open&&!busy)setReview(null);}}><DialogContent className="sc-dialog sl-review" closeLabel={copy.close} showCloseButton={!busy} dir={locale==='ar'?'rtl':'ltr'} onCloseAutoFocus={event=>{event.preventDefault();(data.present?opener.current:refreshButton.current)?.focus();}} onEscapeKeyDown={event=>{if(busy)event.preventDefault();}} onInteractOutside={event=>{if(busy)event.preventDefault();}}><DialogHeader><DialogTitle>{copy.disconnectTitle}</DialogTitle><DialogDescription>{copy.disconnectHelp}</DialogDescription></DialogHeader><p><bdi dir="ltr">{review?.storeUrl??review?.storeId??copy.none}</bdi></p>{review?.revision!==data.revision&&<p role="alert">{copy.changed}</p>}<DialogFooter><Button variant="outline" disabled={!!busy} onClick={()=>setReview(null)}>{copy.cancel}</Button><Button variant="destructive" disabled={disabled||review?.revision!==data.revision} onClick={()=>void disconnect()}>{busy==='remove'?copy.removing:copy.confirmDisconnect}</Button></DialogFooter></DialogContent></Dialog>
 </div>;
}
