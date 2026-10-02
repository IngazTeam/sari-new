import {useEffect,useRef,useState} from 'react';
import {Link} from 'wouter';
import {useTranslation} from 'react-i18next';
import {RefreshCw,Store,ExternalLink,FileSpreadsheet,GraduationCap} from 'lucide-react';
import {trpc} from '@/lib/trpc';
import {platformWorkspaceSchema,safePlatformUrl,type PlatformSummary} from '@shared/platform-workspace';
import {sheetsSettingsView} from '@shared/sheets-settings';
import {platformWorkspaceLabels} from '@/lib/platform-workspace-labels';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {CalendarConnectionCard} from './CalendarConnectionCard';
import {WorkspaceState,workspaceFailureKind} from './WorkspaceState';
import '@/styles/service-catalog-workspace.css';
import '@/styles/platform-workspace.css';

const settings = {salla:'/merchant/salla',zid:'/merchant/integrations/zid',woocommerce:'/merchant/woocommerce/settings',shopify:null,byaan:'/merchant/integrations/byaan'};
const fresh={retry:false,staleTime:0,refetchOnMount:'always' as const,refetchOnWindowFocus:false};
const needsReview=(row:PlatformSummary)=>['error','pending_verification','unknown'].includes(row.state)||row.hasSyncErrors;
export function PlatformIntegrationsWorkspace({actorId,merchantId}:{actorId:number;merchantId:number}) {
  const {t,i18n}=useTranslation(),copy=platformWorkspaceLabels(t),[health,setHealth]=useState<''|'healthChanged'|'healthOk'|'healthPending'|'healthNone'|'healthFailed'>(''),[busy,setBusy]=useState(false);
  const live=useRef(true),lock=useRef(false),scope=useRef('');scope.current=actorId+':'+merchantId;
  const query=trpc.integrations.workspace.useQuery(undefined,fresh),test=trpc.integrations.testByaanConnection.useMutation();
  const parsed=platformWorkspaceSchema.safeParse(query.data);
  const data=!query.error&&parsed.success&&parsed.data.actorId===actorId&&parsed.data.merchantId===merchantId?parsed.data:null;
  const byaan=data?.platforms.find(p=>p.platform==='byaan'),definition=JSON.stringify(byaan),currentDefinition=useRef(definition);currentDefinition.current=definition;
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  useEffect(()=>{setHealth('');},[definition]);
  const refresh=()=>{setHealth('');void query.refetch();};
  const check=async()=>{
    if(lock.current||!data||!byaan?.occupiesSlot||data.source!=='byaan'||query.isFetching)return;
    const identity=scope.current,evidence=definition;lock.current=true;setBusy(true);setHealth('');
    try {
      const result=await test.mutateAsync();
      if(!live.current||identity!==scope.current)return;
      if(evidence!==currentDefinition.current){setHealth('healthChanged');return;}
      setHealth(result.status==='active'&&result.success===true?'healthOk':result.status==='pending_verification'?'healthPending':result.status==='not_connected'?'healthNone':'healthFailed');
    }catch{if(live.current&&identity===scope.current)setHealth('healthFailed');}
    finally{lock.current=false;if(live.current&&identity===scope.current)setBusy(false);}
  };
  if(query.error)return <WorkspaceState kind={workspaceFailureKind(query.error)} onRetry={refresh}/>;
  if(!data)return <WorkspaceState kind={query.isLoading||query.isFetching?'loading':'error'} onRetry={refresh}/>;
  const locale=i18n.language.startsWith('ar')?'ar-SA':'en-US',format=(date:string|null)=>date?new Date(date).toLocaleString(locale):copy.none;
  return <div className="service-catalog platform-workspace" dir={locale==='ar-SA'?'rtl':'ltr'}>
    <header className="sc-header"><div><p className="sc-eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><p>{copy.description}</p></div><Button variant="outline" disabled={busy||query.isFetching} onClick={refresh}><RefreshCw aria-hidden="true"/>{copy.refresh}</Button></header>
    <nav className="sc-nav" aria-label={copy.title}><Link href="/merchant/integrations-dashboard">{copy.logs}</Link><Link href="/merchant/calendar">{copy.calendar}</Link></nav>
    <dl className="pi-summary"><div><dt>{copy.stored}</dt><dd>{data.occupied.toLocaleString(locale)}</dd></div><div><dt>{copy.attention}</dt><dd>{data.platforms.filter(needsReview).length.toLocaleString(locale)}</dd></div><div><dt>{copy.checked}</dt><dd className="pi-date">{format(data.checkedAt)}</dd></div></dl>
    {data.conflict&&<p role="alert" className="pi-conflict">{copy.conflict}</p>}
    <section aria-labelledby="pi-platforms"><div className="pi-section-head"><h2 id="pi-platforms">{copy.sources}</h2><p>{copy.sourceHint}</p><p className="sc-muted">{copy.storedHint}</p></div>
      <ul className="pi-grid" aria-busy={query.isFetching}>{data.platforms.map(row=>{
        const path=settings[row.platform],href=safePlatformUrl(row.storeUrl),blocked=!row.present&&data.occupied>0;
        return <li className="pi-card" key={row.platform} data-platform={row.platform} data-attention={needsReview(row)||undefined}>
          <div className="pi-card-head"><span className="pi-icon">{row.platform==='byaan'?<GraduationCap aria-hidden="true"/>:<Store aria-hidden="true"/>}</span><div><h3>{copy[row.platform]}</h3><p>{copy[(row.platform+'Hint') as 'sallaHint']}</p></div></div>
          <Badge variant="secondary">{copy[row.state]}</Badge>
          {row.present&&<dl className="pi-facts"><div><dt>{copy.store}</dt><dd>{href?<a href={href} target="_blank" rel="noopener noreferrer" dir="ltr">{href}<ExternalLink aria-hidden="true"/></a>:copy.none}</dd></div><div><dt>{copy.lastSync}</dt><dd>{format(row.lastSyncAt)}</dd></div></dl>}
          {row.legacy&&<p className="sc-muted">{copy.legacy}</p>}
          <div className="pi-card-actions">{path&&!blocked?<Button asChild variant={row.present?'outline':'default'}><Link href={path}>{row.present?copy.manage:copy.connect}</Link></Button>:<p className="sc-muted">{path?copy.blocked:copy.unsupported}</p>}
            {row.platform==='shopify'&&row.present&&<Link href="/support">{copy.support}</Link>}
            {row.platform==='byaan'&&row.occupiesSlot&&data.source==='byaan'&&<Button variant="outline" disabled={busy||query.isFetching} onClick={()=>{void check();}}><RefreshCw aria-hidden="true"/>{busy?copy.testing:copy.test}</Button>}
          </div>{row.platform==='byaan'&&health&&<p className="pi-health" role="status">{copy[health]}</p>}
        </li>;
      })}</ul>
    </section>
    <section aria-labelledby="pi-data" className="pi-data"><div><h2 id="pi-data">{copy.data}</h2><p>{copy.dataHint}</p></div><dl><div><dt>{copy.products}</dt><dd>{data.stats.products.toLocaleString(locale)}</dd></div><div><dt>{data.stats.audience==='trainees'?copy.trainees:copy.customers}</dt><dd>{data.stats.customers.toLocaleString(locale)}</dd></div></dl></section>
    <section aria-labelledby="pi-google"><div className="pi-section-head"><h2 id="pi-google">{copy.google}</h2><p>{copy.googleHint}</p></div><div className="pi-google"><SheetsCard actorId={actorId} merchantId={merchantId}/><CalendarConnectionCard/></div></section>
    <details className="pi-help"><summary>{copy.help}</summary><p>{copy.helpText}</p></details>
  </div>;
}
function SheetsCard({actorId,merchantId}:{actorId:number;merchantId:number}) {
  const {t}=useTranslation(),copy=platformWorkspaceLabels(t),query=trpc.sheets.getStatus.useQuery(undefined,fresh),parsed=sheetsSettingsView.safeParse(query.data);
  const data=!query.error&&parsed.success&&parsed.data.actorId===actorId&&parsed.data.merchantId===merchantId?parsed.data:null;
  const loading=!query.error&&!data&&(query.isLoading||query.isFetching);
  return <section className="service-catalog cc-panel pi-sheets" data-sheets-connection-card><h3><FileSpreadsheet aria-hidden="true"/>{copy.sheets}</h3><p role={query.error?'alert':'status'}>{loading?copy.loading:data?data.state==='ready'?copy.sheetsReady:copy[data.state]:copy.statusError}</p><p className="sc-muted">{copy.sheetsHint}</p><div className="sc-actions"><Button asChild variant="outline"><Link href="/merchant/sheets/settings">{copy.manage}</Link></Button>{!loading&&!data&&<Button variant="outline" onClick={()=>{void query.refetch();}}>{copy.refresh}</Button>}</div></section>;
}
