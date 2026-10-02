import {navigateZidAuthorization} from '@/lib/zid-oauth-navigation';
import {useEffect,useRef,useState} from 'react';
import {Link} from 'wouter';
import {useTranslation} from 'react-i18next';
import {Store,RefreshCw,ExternalLink} from 'lucide-react';
import {trpc} from '@/lib/trpc';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Badge} from '@/components/ui/badge';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {zidSettingsReceipt,zidDisconnectReceipt,zidWebhookReceipt} from '@shared/zid-connection';
import {safePlatformUrl} from '@shared/platform-workspace';
import type {ZidWorkspace as Snapshot} from '@shared/zid-workspace';
import {scopedZidWorkspace} from '@/lib/zid-workspace';
import {zidWorkspaceLabels} from '@/lib/zid-workspace-labels';
import {WorkspaceState,workspaceFailureKind} from './WorkspaceState';
import {ZidSyncPanel} from './ZidSyncPanel';
import {ZidLogList} from './ZidLogList';
import {ZidNotificationReview} from './ZidNotificationReview';
import '@/styles/service-catalog-workspace.css';
import '@/styles/zid-workspace.css';

const fresh={retry:false,staleTime:0,refetchOnMount:'always' as const,refetchOnWindowFocus:false};
const settingKeys=['autoSync','syncProducts','syncOrders','syncCustomers','notifyMerchantOrders'] as const;
type Draft={revision:string;settings:Snapshot['settings']};
type Review={action:'save'|'connect'|'remove'|'rotate';snapshot:Snapshot;draft?:Draft};
type Credentials=ReturnType<typeof zidWebhookReceipt.parse>;
export function ZidWorkspace({actorId,merchantId,view='overview'}:{actorId:number;merchantId:number;view?:'overview'|'products'|'history'}){
 const {t,i18n}=useTranslation(),copy=zidWorkspaceLabels(t),locale=i18n.language.startsWith('ar')?'ar':'en';
 const query=trpc.zid.workspace.useQuery(undefined,fresh),save=trpc.zid.saveWorkspaceSettings.useMutation({retry:false}),remove=trpc.zid.disconnectWorkspace.useMutation({retry:false}),rotate=trpc.zid.rotateWorkspaceWebhook.useMutation({retry:false}),begin=trpc.zid.beginOAuth.useMutation({retry:false});
 const data=query.error?null:scopedZidWorkspace(query.data,actorId,merchantId);
 const [tab,setTab]=useState<'overview'|'settings'|'notifications'>('overview'),[draft,setDraft]=useState<Draft|null>(null),[review,setReview]=useState<Review|null>(null);
 const [busy,setBusy]=useState(false),[blocked,setBlocked]=useState(false),[notice,setNotice]=useState<keyof typeof copy|null>(null),[password,setPassword]=useState(''),[fieldError,setFieldError]=useState<'invalidPassword'|'proofFailed'|null>(null),[credentials,setCredentials]=useState<Credentials|null>(null),[copied,setCopied]=useState(false);
 const alive=useRef(true),lock=useRef(false),opener=useRef<HTMLButtonElement|null>(null),refreshButton=useRef<HTMLButtonElement|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(data&&!draft)setDraft({revision:data.revision,settings:{...data.settings}});},[data?.revision,draft]);
 const checked=async()=>{const result=await query.refetch();if(!alive.current)return null;return !result.error?scopedZidWorkspace(result.data,actorId,merchantId):null;};
 async function refresh(){if(lock.current)return;lock.current=true;setBusy(true);try{const value=await checked();if(!alive.current)return;if(!value)throw Error('Unconfirmed status');if(credentials&&credentials.revision!==value.revision)setCredentials(null);setBlocked(false);setReview(null);setPassword('');setFieldError(null);setNotice('refreshed');}catch{if(alive.current){setNotice('refreshFailed');setBlocked(true);}}finally{lock.current=false;if(alive.current)setBusy(false);}}
 function open(action:Review['action'],button:HTMLButtonElement){if(!data)return;opener.current=button;setPassword('');setFieldError(null);setNotice(null);setReview({action,snapshot:data,...(draft?{draft:{revision:draft.revision,settings:{...draft.settings}}}:{})});}
 async function execute(){
  if(lock.current||!data||!review||blocked||query.isFetching||review.snapshot.revision!==data.revision)return;
  if(review.action==='save'&&review.draft?.revision!==data.revision)return;
  if(review.action!=='save'&&password&&(password.length<8||password.length>128)){setFieldError('invalidPassword');return;}
  lock.current=true;setBusy(true);setNotice(null);setFieldError(null);
  const input={revision:review.snapshot.revision,...(password?{password}:{})};
  try{
   if(review.action==='connect'){
    const result=await begin.mutateAsync(input);if(!alive.current)return;setPassword('');navigateZidAuthorization(result.authorizationUrl);return;
   }
   const result=review.action==='save'?zidSettingsReceipt.parse(await save.mutateAsync({revision:review.snapshot.revision,settings:review.draft!.settings})):review.action==='remove'?zidDisconnectReceipt.parse(await remove.mutateAsync(input)):zidWebhookReceipt.parse(await rotate.mutateAsync(input));
   if(!alive.current)return;if(result.actorId!==actorId||result.merchantId!==merchantId)throw Error('Unconfirmed scope');
   const saved=await checked();if(!alive.current)return;
   if(!saved||saved.revision!==result.revision||review.action==='remove'&&saved.present||review.action!=='remove'&&!saved.present)throw Error('Unconfirmed write');
   if('settings' in result&&JSON.stringify(result.settings)!==JSON.stringify(saved.settings))throw Error('Unconfirmed settings');
   if('endpointPath' in result&&result.endpointPath!==saved.webhookEndpointPath)throw Error('Unconfirmed credentials');
   setDraft({revision:saved.revision,settings:{...saved.settings}});setCredentials('endpointPath' in result?result:null);setCopied(false);setReview(null);setPassword('');setNotice(review.action==='save'?'saved':review.action==='remove'?'disconnected':'rotated');
  }catch(error){if(alive.current){setPassword('');const code=(error as any)?.data?.code,message=(error as any)?.message;if(code==='UNAUTHORIZED'&&review.action!=='save')setFieldError('proofFailed');else{setReview(null);setBlocked(true);setNotice(code==='FORBIDDEN'?'forbidden':code==='CONFLICT'?(message==='zid_connection:changed'?'changed':'conflict'):code==='TOO_MANY_REQUESTS'?'actionRate':'uncertain');}}}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 async function copyCredentials(){if(!credentials)return;try{await navigator.clipboard.writeText(`${window.location.origin}${credentials.endpointPath}\n${credentials.username}\n${credentials.password}`);if(alive.current){setCopied(true);setNotice('copied');}}catch{if(alive.current)setNotice('copyFailed');}}
 if(query.isLoading||query.isFetching&&!query.data)return <WorkspaceState kind="loading"/>;
 if(!data)return <WorkspaceState kind={workspaceFailureKind(query.error)} onRetry={()=>void refresh()}/>;
 const date=(value:string|null)=>value?new Date(value).toLocaleString(locale):copy.none,disabled=busy||query.isFetching||blocked,url=safePlatformUrl(data.storeUrl),draftChanged=!!draft&&settingKeys.some(k=>draft.settings[k]!==data.settings[k]),draftStale=draft?.revision!==data.revision;
 const title=view==='products'?copy.productsTitle:view==='history'?copy.history:copy.title;
 const editReady=data.present&&data.source==='canonical'&&data.settingsValid;
 return <div className="service-catalog zid-workspace" data-zid-workspace dir={locale==='ar'?'rtl':'ltr'}>
  <header className="sc-header"><div><p className="sc-eyebrow">{copy.eyebrow}</p><h1>{title}</h1><p>{view==='products'?copy.productsHelp:copy.description}</p></div><Button ref={refreshButton} variant="outline" disabled={busy||query.isFetching} onClick={()=>void refresh()}><RefreshCw aria-hidden="true"/>{copy.refresh}</Button></header>
  <nav className="sc-nav" aria-label={copy.title}><Link href="/merchant/platform-integrations">{copy.back}</Link><Link href="/merchant/zid/settings" aria-current={view==='overview'?'page':undefined}>{copy.connection}</Link><Link href="/merchant/zid/products" aria-current={view==='products'?'page':undefined}>{copy.productsTitle}</Link><Link href="/merchant/zid/sync-logs" aria-current={view==='history'?'page':undefined}>{copy.history}</Link></nav>
  {notice&&<p className="sc-feedback" role={['saved','disconnected','rotated','refreshed','copied'].includes(notice)?'status':'alert'}>{copy[notice]}</p>}
  {view==='history'?<ZidLogList actorId={actorId} merchantId={merchantId}/>:view==='products'?<><ZidSyncPanel connection={data} unavailable={disabled} onlyProducts refresh={checked}/><section className="zd-panel"><h2>{copy.browseProducts}</h2><p>{copy.countsHint}</p><Link className="sc-link" href="/merchant/products">{copy.browseProducts}</Link></section></>:<>
   <nav className="zd-tabs" aria-label={copy.title}>{(['overview','settings','notifications'] as const).map(value=><button type="button" key={value} disabled={busy} aria-current={tab===value?'page':undefined} onClick={()=>setTab(value)}>{copy[value]}</button>)}</nav>
   {tab==='overview'?<><div className="zd-grid"><section className="zd-panel" aria-labelledby="zd-connection"><div className="zd-status"><Store aria-hidden="true"/><h2 id="zd-connection">{data.storeName||copy.connection}</h2><Badge variant="secondary">{copy[data.state]}</Badge></div><p className="sc-muted">{copy.savedHint}</p>
    {data.present?<><dl className="zd-facts"><div><dt>{copy.storeUrl}</dt><dd>{url?<a href={url} target="_blank" rel="noopener noreferrer" dir="ltr">{url}<ExternalLink className="inline ms-2" aria-hidden="true"/></a>:copy.none}</dd></div><div><dt>{copy.storeId}</dt><dd><bdi>{data.storeId??copy.none}</bdi></dd></div><div><dt>{copy.lastSync}</dt><dd>{date(data.lastSyncAt)}</dd></div><div><dt>{copy.created}</dt><dd>{date(data.createdAt)}</dd></div></dl>{data.source==='legacy'&&<p className="zd-notice">{copy.legacy}</p>}{!data.settingsValid&&<p className="zd-notice">{copy.invalidSettings}</p>}<div><Button variant="outline" disabled={disabled} onClick={event=>open('remove',event.currentTarget)}>{copy.remove}</Button></div></>:<><p>{copy.connectHelp}</p><div><Button disabled={disabled} onClick={event=>open('connect',event.currentTarget)}>{copy.connect}</Button></div></>}
    <p className="sc-muted">{copy.checked}: {date(data.checkedAt)}</p></section><ZidSyncPanel connection={data} unavailable={disabled} refresh={checked}/></div>
    <dl className="sc-summary">{(['catalog','linkedProducts','sourceOrders','storedCustomers','activeCustomers','syncLogs'] as const).map(key=><div key={key}><dt>{copy[key]}</dt><dd>{data.counts[key].toLocaleString(locale)}</dd></div>)}</dl><p className="sc-muted">{copy.countsHint}</p>
    <section className="zd-panel"><h2>{copy.webhooks}</h2><p className="sc-muted">{copy.webhookHint}</p><dl className="zd-facts">{(['recentTotal','recentProcessed','awaiting','failed'] as const).map(key=><div key={key}><dt>{key==='failed'?copy.webhookFailed:copy[key]}</dt><dd>{data.webhooks[key].toLocaleString(locale)}</dd></div>)}</dl></section>
   </>:tab==='settings'?<><section className="zd-panel"><h2>{copy.settings}</h2><p>{copy.settingsHelp}</p>{!editReady&&<p className="zd-notice">{data.source==='legacy'?copy.legacy:copy.invalidSettings}</p>}
    <div className="zd-settings">{settingKeys.map(key=><label className="zd-switch" key={key}><span>{copy[key]}{key==='autoSync'&&<small>{copy.autoSyncHelp}</small>}{key==='notifyMerchantOrders'&&<small>{copy.notifyHelp}</small>}</span><input type="checkbox" checked={draft?.settings[key]??false} disabled={disabled||!editReady} onChange={event=>setDraft(current=>current?{...current,settings:{...current.settings,[key]:event.target.checked}}:null)}/></label>)}</div>
    <p className="sc-muted" role="status">{draftStale?copy.changed:draftChanged?copy.draft:copy.unchanged}</p><div className="sc-actions"><Button disabled={disabled||!editReady||!draftChanged||draftStale} onClick={event=>open('save',event.currentTarget)}>{copy.save}</Button><Button variant="outline" disabled={disabled||!draftChanged&&!draftStale} onClick={()=>setDraft({revision:data.revision,settings:{...data.settings}})}>{copy.resetDraft}</Button></div></section>
    <section className="zd-panel"><h2>{copy.webhookSetup}</h2><p>{copy.webhookSetupHelp}</p><dl className="zd-facts"><div><dt>{copy.webhookUrl}</dt><dd><bdi dir="ltr">{data.webhookEndpointPath?window.location.origin+data.webhookEndpointPath:copy.none}</bdi></dd></div></dl><div><Button variant="outline" disabled={disabled||!editReady||data.state!=='configured'||!!credentials} onClick={event=>open('rotate',event.currentTarget)}>{copy.rotate}</Button></div></section>
   </>:<><section className="zd-panel"><h2>{copy.notifications}</h2><p>{copy.notificationHint}</p><dl className="zd-facts">{(['recentTotal','recentDelivered','recentSuppressed','awaiting','needsReview'] as const).map(key=><div key={key}><dt>{key==='recentTotal'?copy.recentNotices:key==='awaiting'?copy.awaitingNotices:copy[key]}</dt><dd>{data.notifications[key].toLocaleString(locale)}</dd></div>)}</dl></section><ZidNotificationReview actorId={actorId} merchantId={merchantId} refresh={checked}/></>}
  </>}
  {credentials&&credentials.revision===data.revision&&<section className="zd-panel" aria-labelledby="zd-one-time"><h2 id="zd-one-time">{copy.oneTime}</h2><p>{copy.rotated}</p><dl className="zd-facts"><div><dt>{copy.webhookUrl}</dt><dd><bdi dir="ltr">{window.location.origin+credentials.endpointPath}</bdi></dd></div><div><dt>{copy.username}</dt><dd><bdi dir="ltr">{credentials.username}</bdi></dd></div><div><dt>{copy.webhookPassword}</dt><dd><bdi dir="ltr">{credentials.password}</bdi></dd></div></dl><div className="sc-actions"><Button variant="outline" onClick={()=>void copyCredentials()}>{copied?copy.copied:copy.copy}</Button><Button variant="outline" onClick={()=>setCredentials(null)}>{copy.hideCredentials}</Button></div></section>}
  <Dialog open={!!review} onOpenChange={open=>{if(!open&&!busy){setReview(null);setPassword('');setFieldError(null);}}}><DialogContent className="sc-dialog zd-review" closeLabel={copy.close} showCloseButton={!busy} dir={locale==='ar'?'rtl':'ltr'} onCloseAutoFocus={event=>{event.preventDefault();(opener.current?.isConnected?opener.current:refreshButton.current)?.focus();}} onEscapeKeyDown={event=>{if(busy)event.preventDefault();}} onInteractOutside={event=>{if(busy)event.preventDefault();}}><DialogHeader><DialogTitle>{review?.action==='save'?copy.saveReview:review?.action==='remove'?copy.disconnectTitle:review?.action==='rotate'?copy.rotateTitle:copy.connect}</DialogTitle><DialogDescription>{review?.action==='save'?copy.settingsHelp:review?.action==='remove'?copy.disconnectHelp:review?.action==='rotate'?copy.rotateHelp:copy.connectHelp}</DialogDescription></DialogHeader>
   <p><bdi>{review?.snapshot.storeName??review?.snapshot.storeId??copy.title}</bdi></p>
   {review?.action==='save'?<dl className="zd-facts">{settingKeys.map(key=><div key={key}><dt>{copy[key]}</dt><dd>{review.draft?.settings[key]?copy.on:copy.off}</dd></div>)}</dl>:<div className="zd-form"><label htmlFor="zd-password">{copy.password}</label><Input id="zd-password" type="password" autoComplete="current-password" value={password} disabled={busy} maxLength={128} aria-invalid={!!fieldError||undefined} aria-describedby={'zd-password-hint'+(fieldError?' zd-password-error':'')} onChange={event=>{setPassword(event.target.value);setFieldError(null);}}/><p id="zd-password-hint" className="sc-muted">{copy.passwordHelp}</p>{fieldError&&<p id="zd-password-error" role="alert" className="zd-error">{copy[fieldError]}</p>}</div>}
   {review?.snapshot.revision!==data.revision&&<p role="alert">{copy.changed}</p>}<DialogFooter><Button variant="outline" disabled={busy} onClick={()=>{setReview(null);setPassword('');}}>{copy.cancel}</Button><Button variant={review?.action==='remove'?'destructive':'default'} disabled={disabled||review?.snapshot.revision!==data.revision||review?.action==='save'&&review.draft?.revision!==data.revision} onClick={()=>void execute()}>{busy?copy.saving:review?.action==='save'?copy.confirmSave:review?.action==='remove'?copy.confirmDisconnect:review?.action==='rotate'?copy.confirmRotate:copy.confirmConnect}</Button></DialogFooter>
  </DialogContent></Dialog>
 </div>;
}
