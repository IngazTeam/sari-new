import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearch } from 'wouter';
import { ChartNoAxesColumnIncreasing, RefreshCw, Info } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { acquisitionPeriods, type AcquisitionPeriod } from '@shared/acquisition-workspace';
import { acquisitionLabels, acquisitionSelection, scopedAcquisition } from '@/lib/acquisition-workspace-view';
import { usageQueryOptions } from '@/lib/usage-workspace-view';
import { WorkspaceState, workspaceFailureKind } from './WorkspaceState';
import '@/styles/acquisition-workspace.css';

export function AcquisitionWorkspacePage() {
  const user=trpc.auth.me.useQuery(undefined,usageQueryOptions);
  const merchant=trpc.merchants.workspaceIdentity.useQuery(undefined,{...usageQueryOptions,enabled:!!user.data?.id&&!user.error&&!user.isFetching});
  const error=user.error||merchant.error;
  const refresh=()=>{void user.refetch();void merchant.refetch();};
  if(error)return <WorkspaceState kind={workspaceFailureKind(error)} onRetry={refresh}/>;
  if(user.isLoading||user.isFetching||merchant.isLoading||merchant.isFetching)return <WorkspaceState kind="loading"/>;
  if(!user.data?.id||!merchant.data?.id||merchant.data.actorId!==user.data.id)return <WorkspaceState kind={!user.data?.id?'session':'missing'} onRetry={refresh}/>;
  return <AcquisitionWorkspace key={`${user.data.id}:${merchant.data.id}`} actorId={user.data.id} merchantId={merchant.data.id}/>;
}

function AcquisitionWorkspace({actorId,merchantId}:{actorId:number;merchantId:number}) {
  const {t,i18n}=useTranslation(),labels=acquisitionLabels(t),c=(key:string)=>labels[key],ar=i18n.language.startsWith('ar');
  const [path,navigate]=useLocation(),search=useSearch(),period=acquisitionSelection(search);
  const query=trpc.analytics.acquisitionWorkspace.useQuery({period:period??'all'},{...usageQueryOptions,enabled:period!==null});
  const data=period?scopedAcquisition(query.data,actorId,merchantId,period):null;
  const number=new Intl.NumberFormat(ar?'ar-SA':'en-US'),percent=new Intl.NumberFormat(ar?'ar-SA':'en-US',{style:'percent',maximumFractionDigits:1});
  const changePeriod=(value:AcquisitionPeriod)=>{const p=new URLSearchParams(search);p.set('period',value);navigate(path+'?'+p.toString());};
  const waiting=query.isLoading||query.isFetching;
  const sourceName=(key:string)=>c('source_'+key);
  const top=data?.sources.filter(r=>!['other','unattributed'].includes(r.source)).slice(0,3)??[];
  return <section className="acq-workspace" dir={ar?'rtl':'ltr'} aria-labelledby="acquisition-title">
    <header className="acq-header">
      <div><p className="acq-eyebrow"><ChartNoAxesColumnIncreasing aria-hidden="true" size={18}/>{c('eyebrow')}</p><h1 id="acquisition-title">{c('title')}</h1><p>{c('intro')}</p></div>
      <Link className="acq-button" href="/merchant/customers">{c('customers')}</Link>
    </header>
    <div className="acq-toolbar">
      <label>{c('period')}<select value={period??''} onChange={e=>changePeriod(e.target.value as AcquisitionPeriod)}>
        {!period&&<option value="" disabled>{c('invalidPeriod')}</option>}
        {acquisitionPeriods.map(p=><option value={p} key={p}>{c('period_'+p)}</option>)}
      </select></label>
      <button className="acq-button" type="button" disabled={waiting||period===null} onClick={()=>void query.refetch()}><RefreshCw size={18} aria-hidden="true"/>{c('refresh')}</button>
    </div>
    {!period?<WorkspaceState inline title={c('invalidPeriod')} description={c('invalidPeriodBody')} action={<button className="acq-button" onClick={()=>changePeriod('all')}>{c('reset')}</button>}/>:
      query.error?<WorkspaceState inline kind={workspaceFailureKind(query.error)} onRetry={()=>void query.refetch()}/>:
      waiting?<WorkspaceState inline kind="loading"/>:
      !data?<WorkspaceState inline kind="error" onRetry={()=>void query.refetch()}/>:
      <>
        <p className="acq-source"><Info size={18} aria-hidden="true"/>{c('evidence')}</p>
        <dl className="acq-stats">
          <div><dt>{c('total')}</dt><dd>{number.format(data.totalProfiles)}</dd><p>{c('totalHint')}</p></div>
          <div><dt>{c('classified')}</dt><dd>{number.format(data.classifiedProfiles)}</dd><p>{c('classifiedHint')}</p></div>
          <div className={data.unattributedProfiles+data.otherProfiles?'acq-unknown':''}><dt>{c('unclassified')}</dt><dd>{number.format(data.unattributedProfiles+data.otherProfiles)}</dd><p>{c('unclassifiedHint')}</p></div>
        </dl>
        <section className="acq-panel" aria-labelledby="acquisition-sources">
          <h2 id="acquisition-sources">{c('sources')}</h2><p>{c('shareHint')}</p>
          {data.totalProfiles===0?<div className="acq-empty" role="status"><h3>{c('empty')}</h3><p>{c('emptyBody')}</p></div>:
            <ul className="acq-sources">{data.sources.map(row=><li key={row.source} className={['other','unattributed'].includes(row.source)?'acq-source-unknown':''}>
              <div><h3>{sourceName(row.source)}</h3><span><bdi>{number.format(row.count)}</bdi> {c('profiles')}<strong><bdi>{percent.format(row.sharePermille/1000)}</bdi></strong></span></div>
              <progress max={1000} value={row.sharePermille} aria-label={sourceName(row.source)}/>
              {row.source==='other'&&<p>{c('otherHint')}</p>}{row.source==='unattributed'&&<p>{c('missingHint')}</p>}
            </li>)}</ul>}
        </section>
        {top.length>0&&<details className="acq-panel"><summary>{c('top')}</summary><ol className="acq-top">{top.map(row=><li key={row.source}><span>{sourceName(row.source)}</span><strong>{number.format(row.count)} {c('profiles')}</strong></li>)}</ol></details>}
        <details className="acq-panel"><summary>{c('method')}</summary><p>{c('methodBody')}</p><p>{c('trackingBody')}</p><p>{c('duplicates')}</p></details>
        <p className="acq-checked">{c('checkedAt')}: <time dateTime={data.checkedAt}>{new Intl.DateTimeFormat(ar?'ar-SA':'en-US',{calendar:'gregory',timeZone:'UTC',dateStyle:'medium',timeStyle:'short'}).format(new Date(data.checkedAt))} UTC</time></p>
      </>}
  </section>;
}
