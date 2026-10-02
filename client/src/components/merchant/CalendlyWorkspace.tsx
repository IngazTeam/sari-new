import {useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Link} from 'wouter';
import {CalendarDays} from 'lucide-react';
import type {z} from 'zod';
import {trpc} from '@/lib/trpc';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {calendlyConnectionPreviewInput,calendlyConnectionPreviewSchema} from '@shared/calendly-connection';
import {calendlySyncPeriod} from '@shared/calendly-sync';
import type {CalendlyOperationKind} from '@shared/calendly-operation';
import {scopedCalendlyWorkspace,scopedCalendlyPreview,calendlyDefaultPeriod,calendlyDate} from '@/lib/calendly-workspace';
import {calendlyWorkspaceLabels} from '@/lib/calendly-workspace-labels';
import {WorkspaceState,workspaceFailureKind} from './WorkspaceState';
import {CalendlyWorkspaceShell} from './CalendlyWorkspaceShell';
import {calendlyFresh,useCalendlyOperation,CalendlyOperationPanel} from './CalendlyOperationPanel';
import {CalendlyAppointmentsList,CalendlyReceiptsList,CalendlyBookingLinks} from './CalendlyLists';
type Review={action:CalendlyOperationKind;revision:string;preview?:z.infer<typeof calendlyConnectionPreviewSchema>;token?:string;period?:z.infer<typeof calendlySyncPeriod>;syncToWhatsApp?:boolean};
export function CalendlyWorkspace({actorId,merchantId}:{actorId:number;merchantId:number}){
 const {t,i18n}=useTranslation(),c=calendlyWorkspaceLabels(t),locale=i18n.language.startsWith('ar')?'ar':'en';
 const query=trpc.calendly.getWorkspace.useQuery(undefined,calendlyFresh),data=query.error?null:scopedCalendlyWorkspace(query.data,actorId,merchantId);
 const preview=trpc.calendly.previewConnection.useMutation({retry:false}),connection=trpc.calendly.requestConnection.useMutation({retry:false}),sync=trpc.calendly.requestSync.useMutation({retry:false}),settings=trpc.calendly.saveWorkspaceSettings.useMutation({retry:false}),o=useCalendlyOperation(actorId,merchantId,true);
 const [tab,setTab]=useState<'overview'|'appointments'|'receipts'|'links'>('overview'),[token,setToken]=useState(''),[previewBusy,setPreviewBusy]=useState(false),[tokenError,setTokenError]=useState<'invalidKey'|'previewFailed'|null>(null);
 const [period,setPeriod]=useState(calendlyDefaultPeriod),[dateError,setDateError]=useState(false),[sendConfirmations,setSendConfirmations]=useState(false),[settingsRevision,setSettingsRevision]=useState('');
 const [review,setReview]=useState<Review|null>(null),[consent,setConsent]=useState(false),heading=useRef<HTMLHeadingElement>(null),opener=useRef<HTMLButtonElement|null>(null),tokenInput=useRef<HTMLInputElement>(null),dateInput=useRef<HTMLInputElement>(null),alive=useRef(true),previewLock=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(data&&data.revision!==settingsRevision){setSendConfirmations(data.settings.syncToWhatsApp);setSettingsRevision(data.revision);setToken('');setTokenError(null);}},[data?.revision,settingsRevision]);
 const busy=o.busy||query.isFetching||previewBusy,ready=!!data&&data.state==='configured'&&data.identityValid&&data.credentialsStored,date=(v:string|null)=>calendlyDate(v,locale,c.none);
 async function previewAccount(){
  if(!data||!o.canStart||busy||previewLock.current)return;
  const input=calendlyConnectionPreviewInput.safeParse({apiKey:token});if(!input.success){setTokenError('invalidKey');tokenInput.current?.focus();return;}
  const revision=data.revision;previewLock.current=true;setPreviewBusy(true);setTokenError(null);
  try{const result=scopedCalendlyPreview(await preview.mutateAsync(input.data),actorId,merchantId,revision);if(!alive.current)return;if(!result)throw Error('Unconfirmed account preview');setConsent(false);setReview({action:'connect',revision,preview:result,token:input.data.apiKey});}
  catch{if(alive.current){setTokenError('previewFailed');tokenInput.current?.focus();}}
  finally{previewLock.current=false;if(alive.current)setPreviewBusy(false);}
 }
 function open(action:Exclude<CalendlyOperationKind,'connect'>,button:HTMLButtonElement){if(!data||!o.canStart||busy)return;opener.current=button;setConsent(false);if(action==='sync'&&!calendlySyncPeriod.safeParse(period).success){setDateError(true);dateInput.current?.focus();return;}setDateError(false);setReview({action,revision:data.revision,...(action==='sync'?{period:{...period}}:{}),...(action==='settings'?{syncToWhatsApp:sendConfirmations}:{})});}
 function closeReview(){if(o.busy)return;if(review?.action==='connect')setToken('');setReview(null);}
 async function execute(){
  if(!review||!data||busy||!o.canStart||review.revision!==data.revision||((review.action==='disconnect'||review.preview?.replacing)&&!consent))return;
  const r=review;
  await o.execute(r.action,r.revision,requestId=>r.action==='sync'?sync.mutateAsync({requestId,revision:r.revision,period:r.period!}):r.action==='settings'?settings.mutateAsync({requestId,revision:r.revision,syncToWhatsApp:r.syncToWhatsApp!}):r.action==='connect'?connection.mutateAsync({requestId,revision:r.revision,action:'connect',apiKey:r.token!,userUri:r.preview!.userUri,replaceLocalCopies:!!r.preview!.replacing}):r.action==='disconnect'?connection.mutateAsync({requestId,revision:r.revision,action:'disconnect',clearLocalCopies:true}):connection.mutateAsync({requestId,revision:r.revision,action:'verify'}));
  if(alive.current){setReview(null);setToken('');}
 }
 const listProps={actorId,merchantId,copy:c,locale} as const;
 return <CalendlyWorkspaceShell copy={c} locale={locale} heading={heading} busy={busy} refresh={()=>{void query.refetch();void o.recover();}}>
 {query.isLoading?<WorkspaceState inline kind="loading"/>:!data?<WorkspaceState inline kind={workspaceFailureKind(query.error)} onRetry={()=>void query.refetch()}/>:<>
  <CalendlyOperationPanel operation={o} copy={c} locale={locale}/>
  <nav className="cl-tabs" aria-label={c.title}>{(['overview','appointments','receipts','links'] as const).map(value=><button key={value} type="button" aria-pressed={tab===value} disabled={o.busy||previewBusy} onClick={()=>setTab(value)}>{c[value]}{value==='receipts'&&data.webhooks.needsReview>0?` · ${data.webhooks.needsReview.toLocaleString(locale)}`:''}</button>)}</nav>
  {tab==='appointments'?<CalendlyAppointmentsList {...listProps}/>:tab==='receipts'?<CalendlyReceiptsList {...listProps}/>:tab==='links'?<CalendlyBookingLinks {...listProps} revision={data.revision} ready={ready}/>:<>
   <dl className="sc-summary">{(['appointments','upcoming','cancelled','confirmationsAccepted'] as const).map(key=><div key={key}><dt>{key==='confirmationsAccepted'?c.confirmationAccepted:c[key]}</dt><dd>{data.counts[key].toLocaleString(locale)}</dd></div>)}</dl>
   <div className="cl-grid"><section className="cl-panel"><div className="cl-status"><CalendarDays aria-hidden="true"/><h2>{data.userName||c.account}</h2><span>{c[data.state]}</span></div><p className="sc-muted">{c.savedHint}</p><dl className="cl-facts"><div><dt>{c.accountId}</dt><dd><bdi dir="ltr">{data.userUri??c.none}</bdi></dd></div><div><dt>{c.lastSync}</dt><dd>{date(data.lastSyncAt)}</dd></div><div><dt>{c.checked}</dt><dd>{date(data.checkedAt)}</dd></div></dl><p className="sc-muted">{c.utc}</p><div className="sc-actions"><Button variant="outline" disabled={!ready||!o.canStart||busy} onClick={e=>open('verify',e.currentTarget)}>{c.verify}</Button>{data.present&&<Button variant="outline" disabled={!o.canStart||busy} onClick={e=>open('disconnect',e.currentTarget)}>{c.disconnect}</Button>}</div>
    <details className="cl-help" open={!data.present||undefined}><summary>{c.replaceToken}</summary><form className="cl-form" noValidate onSubmit={e=>{e.preventDefault();void previewAccount();}}><label htmlFor="cl-token">{c.apiKey}</label><input ref={tokenInput} id="cl-token" name="apiKey" dir="ltr" type="password" autoComplete="new-password" autoCapitalize="none" spellCheck={false} maxLength={4096} value={token} disabled={o.busy||previewBusy} aria-invalid={!!tokenError} aria-describedby={tokenError?'cl-token-error':'cl-key-hint'} onChange={e=>{setToken(e.target.value);setTokenError(null);}}/>{tokenError&&<p id="cl-token-error" className="cl-error" role="alert">{c[tokenError]}</p>}<p className="sc-muted" id="cl-key-hint">{c.keyHint}</p><p className="sc-muted">{c.tokenRequired}</p><Button type="submit" disabled={!o.canStart||busy} onClick={e=>{opener.current=e.currentTarget;}}>{previewBusy?c.working:c.preview}</Button></form></details>
   </section><div className="cl-stack"><section className="cl-panel"><h2>{c.sync}</h2><p id="cl-sync-hint" className="sc-muted">{c.syncHint}</p>{!ready&&<p>{c.notReady}</p>}<form className="cl-form" noValidate onSubmit={e=>{e.preventDefault();const button=e.currentTarget.querySelector<HTMLButtonElement>('button[type=submit]');if(button)open('sync',button);}}><div className="cl-dates">{(['startDate','endDate'] as const).map(field=><label key={field}>{field==='startDate'?c.start:c.end}<input ref={field==='startDate'?dateInput:undefined} type="date" value={period[field]} disabled={!ready||o.busy} aria-invalid={dateError} aria-describedby={dateError?'cl-sync-error':'cl-sync-hint'} onChange={e=>{setPeriod({...period,[field]:e.target.value});setDateError(false);}}/></label>)}</div>{dateError&&<p className="cl-error" id="cl-sync-error" role="alert">{c.invalidSyncRange}</p>}<Button type="submit" disabled={!ready||!o.canStart||busy}>{c.review}</Button></form></section>
    <section className="cl-panel"><h2>{c.webhooks}</h2><strong>{data.webhooks.registered?c.registered:c.notRegistered}</strong><p className="sc-muted">{c.hookHint}</p><dl className="cl-facts">{(['stored','awaiting','needsReview','recentCompleted'] as const).map(key=><div key={key}><dt>{c[key]}</dt><dd>{data.webhooks[key].toLocaleString(locale)}</dd></div>)}</dl><Button variant="outline" onClick={()=>setTab('receipts')}>{c.receipts}</Button></section></div>
   </div><section className="cl-panel"><h2>{c.confirmations}</h2><p className="sc-muted">{c.confirmationHint}</p><p className="sc-muted">{c.acceptedHint}</p>{!data.settingsValid?<p className="cl-notice">{c.invalidSettings}</p>:<div className="cl-form"><label className="cl-check"><input type="checkbox" checked={sendConfirmations} disabled={!data.present||o.busy||!ready&&!sendConfirmations||!data.webhooks.registered&&!sendConfirmations} onChange={e=>setSendConfirmations(e.target.checked)}/><span>{c.enableConfirmations}</span></label><div className="sc-actions"><Button disabled={!data.present||!o.canStart||busy||settingsRevision!==data.revision||sendConfirmations===data.settings.syncToWhatsApp} onClick={e=>open('settings',e.currentTarget)}>{c.review}</Button><Button variant="outline" asChild><Link href="/merchant/whatsapp">{c.manageChannel}</Link></Button></div></div>}</section>
  </>}
 </>}
 <Dialog open={!!review} onOpenChange={value=>{if(!value)closeReview();}}><DialogContent className="sc-dialog cl-dialog" closeLabel={c.close} showCloseButton={!o.busy} dir={locale==='ar'?'rtl':'ltr'} onCloseAutoFocus={e=>{e.preventDefault();(opener.current?.isConnected&&!opener.current.disabled?opener.current:heading.current)?.focus();}} onEscapeKeyDown={e=>{if(o.busy)e.preventDefault();}} onInteractOutside={e=>{if(o.busy)e.preventDefault();}}><DialogHeader><DialogTitle>{review?c[review.action]:c.review}</DialogTitle><DialogDescription>{review?.action==='connect'?c.connectReview:review?.action==='disconnect'?c.disconnectWarning:review?.action==='verify'?c.verifyHint:review?.action==='settings'?c.confirmationHint:c.syncHint}</DialogDescription></DialogHeader>
  {review?.preview&&<><dl className="cl-facts"><div><dt>{c.account}</dt><dd>{review.preview.userName}</dd></div><div><dt>{c.accountId}</dt><dd><bdi dir="ltr">{review.preview.userUri}</bdi></dd></div></dl>{review.preview.replacing&&<><p className="cl-notice">{c.replaceWarning}</p><p>{c.localAppointments}: {review.preview.localAppointments.toLocaleString(locale)} · {c.localReceipts}: {review.preview.localReceipts.toLocaleString(locale)}</p></>}</>}
  {review?.action==='disconnect'&&data&&<p>{c.localAppointments}: {data.counts.appointments.toLocaleString(locale)} · {c.localReceipts}: {data.webhooks.stored.toLocaleString(locale)}</p>}
  {review?.period&&<p>{c.period}: <bdi>{review.period.startDate} — {review.period.endDate}</bdi> · UTC</p>}{review?.action==='settings'&&<p>{c.confirmations}: <strong>{review.syncToWhatsApp?c.on:c.off}</strong></p>}
  {(review?.action==='disconnect'||review?.preview?.replacing)&&<label className="cl-check"><input type="checkbox" checked={consent} disabled={o.busy} onChange={e=>setConsent(e.target.checked)}/><span>{c.clearConsent}</span></label>}{review&&review.revision!==data?.revision&&<p role="alert">{c.changed}</p>}
  <DialogFooter><Button variant="outline" disabled={o.busy} onClick={closeReview}>{c.cancel}</Button><Button disabled={!o.canStart||busy||review?.revision!==data?.revision||((review?.action==='disconnect'||!!review?.preview?.replacing)&&!consent)} onClick={()=>void execute()}>{o.busy?c.working:c.confirm}</Button></DialogFooter>
 </DialogContent></Dialog>
 </CalendlyWorkspaceShell>;
}
