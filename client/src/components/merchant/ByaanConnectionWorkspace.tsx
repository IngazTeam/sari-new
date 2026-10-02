import {useEffect,useRef,useState} from 'react';
import {Link} from 'wouter';
import {useTranslation} from 'react-i18next';
import {RefreshCw,GraduationCap,Unplug,ExternalLink} from 'lucide-react';
import {trpc} from '@/lib/trpc';
import {byaanConnectionWorkspaceSchema,byaanDisconnectResultSchema,byaanDomainInput,type ByaanConnectionWorkspace as Snapshot} from '@shared/byaan-connection-workspace';
import {byaanConnectionLabels} from '@/lib/byaan-connection-labels';
import {platformWorkspaceLabels} from '@/lib/platform-workspace-labels';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Badge} from '@/components/ui/badge';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from '@/components/ui/dialog';
import {WorkspaceState,workspaceFailureKind} from './WorkspaceState';
import '@/styles/service-catalog-workspace.css';
import '@/styles/platform-workspace.css';
import '@/styles/byaan-connection.css';

type Notice='domainSaved'|'alreadyVerified'|'disconnected'|'queued'|'changed'|'conflict'|'forbidden'|'uncertain'|'refreshFailed'|'currentStatus'|null;
const fresh={retry:false,staleTime:0,refetchOnMount:'always' as const,refetchOnWindowFocus:false};
function scoped(value:unknown,actorId:number,merchantId:number) {
  const result=byaanConnectionWorkspaceSchema.safeParse(value);
  return result.success&&result.data.actorId===actorId&&result.data.merchantId===merchantId?result.data:null;
}
export function ByaanConnectionWorkspace({actorId,merchantId}:{actorId:number;merchantId:number}) {
  const {t,i18n}=useTranslation(),copy=byaanConnectionLabels(t),platform=platformWorkspaceLabels(t);
  const query=trpc.integrations.byaanConnectionWorkspace.useQuery(undefined,fresh);
  const register=trpc.integrations.connectByaan.useMutation({retry:false}),remove=trpc.integrations.disconnectByaan.useMutation({retry:false}),health=trpc.integrations.testByaanConnection.useMutation({retry:false});
  const data=query.error?null:scoped(query.data,actorId,merchantId);
  const [domain,setDomain]=useState(''),[fieldError,setFieldError]=useState(false),[notice,setNotice]=useState<Notice>(null),[busy,setBusy]=useState<'register'|'remove'|'health'|'refresh'|null>(null);
  const [blocked,setBlocked]=useState(false),[review,setReview]=useState<Snapshot|null>(null),[agreed,setAgreed]=useState(false);
  const [healthResult,setHealthResult]=useState<'healthOk'|'healthPending'|'healthNone'|'healthFailed'|'healthChanged'|null>(null);
  const alive=useRef(true),lock=useRef(false),identity=useRef(''),revision=useRef(data?.revision),opener=useRef<HTMLButtonElement>(null),refreshButton=useRef<HTMLButtonElement>(null);
  identity.current=actorId+':'+merchantId;revision.current=data?.revision;
  const current=()=>alive.current&&identity.current===actorId+':'+merchantId;
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{setHealthResult(null);},[data?.revision]);
  async function refresh() {
    if(lock.current)return;lock.current=true;setBusy('refresh');setHealthResult(null);
    try {
      const result=await query.refetch();if(!current())return;
      const value=!result.error&&scoped(result.data,actorId,merchantId);
      if(!value){setNotice('refreshFailed');return;}
      setBlocked(false);setReview(null);setAgreed(false);setNotice('currentStatus');
    }catch{if(current())setNotice('refreshFailed');}
    finally{lock.current=false;if(current())setBusy(null);}
  }
  function failed(error:unknown) {
    const value=error as {data?:{code?:string};message?:string};
    const reason=value?.data?.code==='FORBIDDEN'||value?.data?.code==='UNAUTHORIZED'?'forbidden':value?.message==='byaan_connection:stale'?'changed':value?.data?.code==='CONFLICT'?'conflict':'uncertain';
    setNotice(reason);setBlocked(true);
  }
  async function saveDomain() {
    if(lock.current||!data||data.present||data.blockingPlatforms.length||blocked||query.isFetching)return;
    const value=byaanDomainInput.safeParse(domain);if(!value.success){setFieldError(true);return;}
    lock.current=true;setBusy('register');setFieldError(false);setNotice(null);
    try {
      const result=await register.mutateAsync({tenantDomain:value.data});if(!current())return;
      if(result.tenantDomain!==value.data||typeof result.success!=='boolean'||result.pendingVerification!==!result.success)throw Error('uncertain');
      const checked=await query.refetch();if(!current())return;
      const saved=!checked.error&&scoped(checked.data,actorId,merchantId);
      if(!saved||!saved.present||saved.tenantDomain!==value.data)throw Error('uncertain');
      setNotice(saved.verifiedAt?'alreadyVerified':'domainSaved');setDomain('');
    }catch(error){if(current()){if((error as any)?.data?.code==='BAD_REQUEST'){setFieldError(true);}else failed(error);}}
    finally{lock.current=false;if(current())setBusy(null);}
  }
  async function disconnect() {
    if(lock.current||!data?.present||!review||!agreed||review.revision!==data.revision||blocked||query.isFetching)return;
    lock.current=true;setBusy('remove');setNotice(null);
    try {
      const result=byaanDisconnectResultSchema.parse(await remove.mutateAsync({revision:review.revision}));if(!current())return;
      if(result.actorId!==actorId||result.merchantId!==merchantId)throw Error('uncertain');
      const checked=await query.refetch();if(!current())return;
      const saved=!checked.error&&scoped(checked.data,actorId,merchantId);
      if(!saved||saved.present)throw Error('uncertain');
      setNotice(result.notification==='queued'?'queued':'disconnected');setReview(null);setAgreed(false);
    }catch(error){if(current()){failed(error);setReview(null);setAgreed(false);}}
    finally{lock.current=false;if(current())setBusy(null);}
  }
  async function check() {
    if(lock.current||!data||!data.verifiedAt||!data.managedContent||['disabled','unknown','unlinked','pending_verification'].includes(data.state)||blocked||query.isFetching)return;
    const expected=data.revision;lock.current=true;setBusy('health');setHealthResult(null);
    try {
      const result=await health.mutateAsync();if(!current())return;
      setHealthResult(revision.current!==expected?'healthChanged':result.status==='active'&&result.success===true?'healthOk':result.status==='pending_verification'?'healthPending':result.status==='not_connected'?'healthNone':'healthFailed');
    }catch{if(current())setHealthResult('healthFailed');}
    finally{lock.current=false;if(current())setBusy(null);}
  }
  if(query.error)return <WorkspaceState kind={workspaceFailureKind(query.error)} onRetry={()=>void refresh()}/>;
  if(!data)return <WorkspaceState kind={query.isLoading||query.isFetching?'loading':'error'} onRetry={()=>void refresh()}/>;
  const locale=i18n.language.startsWith('ar')?'ar-SA':'en-US',date=(value:string|null)=>value?new Date(value).toLocaleString(locale):copy.none;
  const disabled=!!busy||!!query.isFetching||blocked;
  const canCheck=!!data.verifiedAt&&data.managedContent&&!['disabled','unknown','unlinked','pending_verification'].includes(data.state);
  return <div className="service-catalog byaan-connection" dir={locale==='ar-SA'?'rtl':'ltr'} data-byaan-connection>
    <header className="sc-header"><div><p className="sc-eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><p>{copy.description}</p></div><Button ref={refreshButton} variant="outline" onClick={()=>void refresh()} disabled={!!busy||query.isFetching}><RefreshCw aria-hidden="true"/>{copy.refresh}</Button></header>
    <nav className="sc-nav" aria-label={copy.title}><Link href="/merchant/platform-integrations">{copy.back}</Link><Link href="/merchant/byaan-dashboard">{copy.workspace}</Link></nav>
    {notice&&<div className="sc-feedback" role={['domainSaved','alreadyVerified','disconnected','queued','currentStatus'].includes(notice)?'status':'alert'}>{notice==='queued'&&<span>{copy.disconnected}</span>}<span>{copy[notice]}</span></div>}
    <div className="bc-layout">
      <section className="bc-panel" aria-labelledby="bc-connection"><div className="bc-status"><GraduationCap aria-hidden="true"/><h2 id="bc-connection">{copy.connection}</h2><Badge variant="secondary">{platform[data.state]}</Badge></div>
        <p className="sc-muted">{copy.savedHint}</p>
        {data.present?<><dl className="pi-facts"><div className="bc-domain"><dt>{copy.domain}</dt><dd>{data.tenantDomain?<a href={'https://'+data.tenantDomain+'/'} target="_blank" rel="noopener noreferrer" dir="ltr">{data.tenantDomain}<ExternalLink aria-hidden="true"/></a>:copy.none}</dd></div><div><dt>{copy.verified}</dt><dd>{date(data.verifiedAt)}</dd></div><div><dt>{copy.lastSync}</dt><dd>{date(data.lastSyncAt)}</dd></div></dl>
          <p className="bc-next">{data.state==='pending_verification'?copy.pendingHelp:['disabled','unknown'].includes(data.state)?copy.disabledHelp:copy.configuredHelp}</p>
          {!!data.verifiedAt&&!data.managedContent&&<p className="pi-conflict">{copy.sourceMismatch}</p>}
          {data.hasSyncErrors&&<p className="pi-conflict">{copy.syncError}</p>}
          <div className="sc-actions">{canCheck&&<Button variant="outline" disabled={disabled} onClick={()=>void check()}><RefreshCw aria-hidden="true"/>{busy==='health'?platform.testing:platform.test}</Button>}<Button ref={opener} variant="outline" disabled={disabled} onClick={()=>{setReview(data);setAgreed(false);}}><Unplug aria-hidden="true"/>{copy.remove}</Button></div>
          {healthResult&&<p className="pi-health" role="status">{platform[healthResult]}</p>}
        </>:data.blockingPlatforms.length?<div className="pi-conflict" role="alert"><p>{copy.blocked}</p><p>{data.blockingPlatforms.map(p=>platform[p]).join(' · ')}</p><Link href="/merchant/platform-integrations">{copy.back}</Link></div>:<form noValidate onSubmit={event=>{event.preventDefault();void saveDomain();}}>
          <label htmlFor="bc-domain">{copy.domain}</label><Input id="bc-domain" value={domain} onChange={event=>{setDomain(event.target.value);setFieldError(false);}} dir="ltr" inputMode="url" autoCapitalize="none" autoComplete="off" spellCheck={false} maxLength={255} disabled={!!busy} aria-invalid={fieldError||undefined} aria-describedby={'bc-domain-hint'+(fieldError?' bc-domain-error':'')}/><p id="bc-domain-hint" className="sc-muted">{copy.domainHint}</p>
          {fieldError&&<p id="bc-domain-error" className="bc-field-error" role="alert">{copy.invalidDomain}</p>}<Button type="submit" disabled={disabled}>{busy==='register'?copy.saving:copy.register}</Button><p className="sc-muted">{copy.registerHint}</p>
        </form>}
        <p className="bc-check-time">{copy.checked}: {date(data.checkedAt)}</p>
      </section>
      <section className="bc-data" aria-labelledby="bc-data"><div><h2 id="bc-data">{copy.data}</h2><p className="sc-muted">{copy.dataHint}</p></div><dl className="sc-summary">{(['catalog','activeTrainees','activeFaqs','sitePages'] as const).map(key=><div key={key}><dt>{copy[key]}</dt><dd>{data.counts[key].toLocaleString(locale)}</dd></div>)}</dl>
        <div className="bc-panel"><h2>{copy.sales}</h2><p>{copy.salesHint}</p><Button asChild variant="outline"><Link href="/merchant/byaan-dashboard">{copy.workspace}</Link></Button></div>
      </section>
    </div>
    <section className="bc-panel"><h2>{data.managedContent?copy.managed:copy.manual}</h2><p>{copy.managedHint}</p><nav className="sc-nav" aria-label={copy.managed}><Link href="/merchant/test-sari">{copy.test}</Link></nav></section>
    <div className="bc-help"><details className="pi-help"><summary>{copy.help}</summary><ol><li>{copy.stepOne}</li><li>{copy.stepTwo}</li><li>{copy.stepThree}</li></ol></details><details className="pi-help"><summary>{copy.terminology}</summary><dl>{([['products','courses'],['customers','trainees'],['orders','enrollments'],['category','category'],['price','fee'],['item','course']] as const).map(([from,to])=><div key={from}><dt>{copy[from]}</dt><dd>{copy[to]}</dd></div>)}</dl></details></div>
    <Dialog open={!!review} onOpenChange={open=>{if(!open&&!busy){setReview(null);setAgreed(false);}}}><DialogContent closeLabel={copy.close} showCloseButton={!busy} className="sc-dialog bc-review" dir={locale==='ar-SA'?'rtl':'ltr'} onCloseAutoFocus={event=>{event.preventDefault();(data.present?opener.current:refreshButton.current)?.focus();}} onEscapeKeyDown={event=>{if(busy)event.preventDefault();}} onInteractOutside={event=>{if(busy)event.preventDefault();}}><DialogHeader><DialogTitle>{copy.reviewTitle}</DialogTitle><DialogDescription>{copy.reviewHelp}</DialogDescription></DialogHeader>
      <p className="bc-review-domain" dir="ltr">{review?.tenantDomain??copy.none}</p>{review?.verifiedAt&&<p>{copy.reviewDelivery}</p>}
      <label><input type="checkbox" checked={agreed} disabled={!!busy} onChange={event=>setAgreed(event.target.checked)}/><span>{copy.acknowledge}</span></label>
      {review&&review.revision!==data.revision&&<p role="alert">{copy.changed}</p>}
      <DialogFooter><Button variant="outline" disabled={!!busy} onClick={()=>setReview(null)}>{copy.cancel}</Button><Button variant="destructive" disabled={disabled||!agreed||review?.revision!==data.revision} onClick={()=>void disconnect()}>{busy==='remove'?copy.removing:copy.confirm}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
