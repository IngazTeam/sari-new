import {useDeferredValue,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Search,RefreshCw} from 'lucide-react';
import {trpc} from '@/lib/trpc';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {sallaLogsInput,sallaLogStates,sallaLogKinds} from '@shared/salla-workspace';
import {scopedSallaLogs} from '@/lib/salla-workspace';
import {sallaWorkspaceLabels} from '@/lib/salla-workspace-labels';
import {WorkspaceState,workspaceFailureKind} from './WorkspaceState';
export function SallaLogList({actorId,merchantId}:{actorId:number;merchantId:number}){
 const {t,i18n}=useTranslation(),copy=sallaWorkspaceLabels(t),locale=i18n.language.startsWith('ar')?'ar':'en';
 const [search,setSearch]=useState(''),deferred=useDeferredValue(search.trim()),[state,setState]=useState('all'),[kind,setKind]=useState('all'),[page,setPage]=useState(1);
 const selection=sallaLogsInput.parse({search:deferred,state,kind,page}),query=trpc.salla.logsWorkspace.useQuery(selection,{retry:false,staleTime:0,refetchOnMount:'always',refetchOnWindowFocus:false});
 const data=query.error?null:scopedSallaLogs(query.data,actorId,merchantId,selection),date=(value:string|null)=>value?new Date(value).toLocaleString(locale):copy.none;
 const reset=()=>{setSearch('');setState('all');setKind('all');setPage(1);};
 const heading=useRef<HTMLHeadingElement>(null),navigate=(next:number)=>{setPage(next);heading.current?.focus();};
 return <section className="sl-stack" aria-labelledby="sl-history"><h2 ref={heading} tabIndex={-1} id="sl-history" className="text-lg font-semibold">{copy.history}</h2><div className="sc-filters"><label className="sc-search"><span>{copy.search}</span><div><Search aria-hidden="true"/><input maxLength={100} value={search} onChange={event=>{setSearch(event.target.value);setPage(1);}} aria-describedby="sl-search-hint"/></div></label><label><span>{copy.state}</span><select aria-label={copy.state} value={state} onChange={event=>{setState(event.target.value);setPage(1);}}><option value="all">{copy.all}</option>{sallaLogStates.map(value=><option key={value} value={value}>{copy[value]}</option>)}</select></label><label><span>{copy.kind}</span><select aria-label={copy.kind} value={kind} onChange={event=>{setKind(event.target.value);setPage(1);}}><option value="all">{copy.all}</option>{sallaLogKinds.map(value=><option key={value} value={value}>{copy[value]}</option>)}</select></label><Button variant="outline" disabled={query.isFetching} onClick={()=>void query.refetch()}><RefreshCw aria-hidden="true"/>{copy.refresh}</Button></div><p id="sl-search-hint" className="sc-muted">{copy.searchHint}</p>
 {query.isLoading||query.isFetching&&!data?<WorkspaceState inline kind="loading"/>:!data?<WorkspaceState inline kind={workspaceFailureKind(query.error)} onRetry={()=>void query.refetch()}/>:<><dl className="sl-counts"><div><dt>{copy.stored}</dt><dd>{data.summary.stored.toLocaleString(locale)}</dd></div><div><dt>{copy.matched}</dt><dd>{data.summary.matched.toLocaleString(locale)}</dd></div><div><dt>{copy.results}</dt><dd>{data.pagination.total.toLocaleString(locale)}</dd></div></dl><div className="sl-groups">{data.summary.groups.map(group=><span key={group.key}>{copy[group.key]} <strong>{group.count.toLocaleString(locale)}</strong></span>)}</div>
 {!data.rows.length?<div className="sc-empty"><h3>{copy.noResults}</h3><p>{copy.noResultsHelp}</p><Button variant="outline" onClick={reset}>{copy.reset}</Button></div>:<ul className="sl-records">{data.rows.map(row=><li key={row.id} data-salla-log={row.id}><header><h3>{copy[row.kind]} · <bdi>{row.id}</bdi></h3><Badge variant="secondary">{copy[row.state]}</Badge></header><dl className="sl-facts"><div><dt>{copy.started}</dt><dd>{date(row.startedAt)}</dd></div><div><dt>{copy.completed}</dt><dd>{date(row.completedAt)}</dd></div><div><dt>{copy.itemsSynced}</dt><dd>{row.itemsSynced===null?copy.none:row.itemsSynced.toLocaleString(locale)}</dd></div></dl>{row.invalidData&&<p className="sl-notice">{copy.dataWarning}</p>}{row.hasErrors&&<p className="sc-muted">{copy.logError}</p>}</li>)}</ul>}
 <nav className="sc-pagination" aria-label={copy.page}><Button variant="outline" disabled={page<=1||query.isFetching} onClick={()=>navigate(page-1)}>{copy.previous}</Button><span>{copy.page} {page.toLocaleString(locale)} {copy.of} {Math.max(1,data.pagination.pages).toLocaleString(locale)}</span><Button variant="outline" disabled={page>=data.pagination.pages||query.isFetching} onClick={()=>navigate(page+1)}>{copy.next}</Button></nav></>}
 </section>;
}
