import {useEffect,useRef,useState} from 'react';
import {Link,useLocation,useSearch} from 'wouter';
import {useTranslation} from 'react-i18next';
import {Plus,RefreshCw,Layers,Folder,Search,Clock3,CalendarCheck,AlertCircle,ArrowUpRight,Pause} from 'lucide-react';
import {trpc} from '@/lib/trpc';
import {catalogWorkspaceSchema,type CatalogRecord} from '@shared/service-catalog-workspace';
import {catalogNavigation,catalogHref,catalogSelectionKey} from '@/lib/service-catalog-navigation';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {WorkspaceState,workspaceFailureKind} from './WorkspaceState';
import '@/styles/service-catalog-workspace.css';

type Service=Extract<CatalogRecord,{entity:'service'}>;
export function ServiceCatalogList({actorId,merchantId}:{actorId:number;merchantId:number}){
 const {t,i18n}=useTranslation(),[path,navigate]=useLocation(),search=useSearch(),selection=catalogNavigation(search);
 const text=(key:string,variables?:Record<string,unknown>)=>t(`merchantUx.serviceCatalog.${key}`,variables);
 const [searchEdit,setSearchEdit]=useState<{source:string;value:string}|null>(null),[action,setAction]=useState<{row:Service;view:string}|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[failure,setFailure]=useState(''),[needsRefresh,setNeedsRefresh]=useState(false);
 const view=useRef(''),live=useRef(true),lock=useRef(false),opener=useRef<HTMLElement|null>(null);view.current=`${actorId}:${merchantId}:${path}:${search}`;
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{setAction(null);setSearchEdit(null);setNotice('');setFailure('');},[search]);
 const query=trpc.services.catalogWorkspace.useQuery(selection,{retry:false,staleTime:0,refetchOnMount:'always'}),archive=trpc.services.delete.useMutation();
 const parsed=catalogWorkspaceSchema.safeParse(query.data),key=catalogSelectionKey(selection);
 const matches=parsed.success&&parsed.data.actorId===actorId&&parsed.data.merchantId===merchantId&&catalogSelectionKey(parsed.data.selection)===key;
 const data=!query.error&&matches?parsed.data:undefined;
 const change=(patch:Record<string,string|number|null>)=>navigate(catalogHref(path,search,patch));
 const refresh=async()=>{const scope=view.current;const result=await query.refetch();if(!live.current||scope!==view.current)return;const checked=catalogWorkspaceSchema.safeParse(result.data);if(!result.error&&checked.success&&checked.data.actorId===actorId&&checked.data.merchantId===merchantId&&catalogSelectionKey(checked.data.selection)===key){setNeedsRefresh(false);setFailure('');setAction(null);}};
 const current=action&&data?.rows.find(row=>row.id===action.row.id),unchanged=!!action&&action.view===view.current&&current?.definition===action.row.definition;
 const canConfirm=!!data?.canManage&&unchanged&&!query.isFetching&&!busy&&!needsRefresh;
 const confirm=async()=>{
  if(!action||!canConfirm||lock.current)return;const submitted=action;lock.current=true;setBusy(true);setFailure('');
  try{await archive.mutateAsync({serviceId:submitted.row.id,expectedDefinition:submitted.row.definition});if(live.current&&submitted.view===view.current){setAction(null);setNotice(text('archiveSuccess'));setNeedsRefresh(true);await refresh();}}
  catch(error){if(live.current&&submitted.view===view.current){setFailure(text((error as {data?:{code?:string}})?.data?.code==='CONFLICT'?'conflict':'actionError'));setNeedsRefresh(true);}}
  finally{lock.current=false;if(live.current)setBusy(false);}
 };
 if(query.error)return <WorkspaceState kind={workspaceFailureKind(query.error)} onRetry={()=>{void refresh();}}/>;
 if(!data)return <WorkspaceState kind={query.isLoading||query.isFetching?'loading':'error'} onRetry={()=>{void refresh();}}/>;
 const locale=i18n.language.startsWith('ar')?'ar-SA':'en-US',number=(value:number)=>value.toLocaleString(locale),money=(value:number)=>new Intl.NumberFormat(locale,{style:'currency',currency:'SAR'}).format(value/100);
 const price=(row:Service)=>{const f=row.fields;if(row.issues.some(issue=>['priceType','basePrice','minPrice','maxPrice'].includes(issue)))return text('unavailable');if(f.priceType==='custom')return text('customPrice');if(f.priceType==='fixed'&&f.basePrice!==null&&f.basePrice>=0)return money(f.basePrice);if(f.priceType==='variable'&&f.minPrice!==null&&f.maxPrice!==null&&f.minPrice>=0&&f.maxPrice>=f.minPrice)return text('range',{min:money(f.minPrice),max:money(f.maxPrice)});return text('unavailable');};
 const filtered=!!selection.search||selection.status!=='all',name=(row:Service)=>row.fields.name.trim()||text('unnamed');
 return <div className="service-catalog" dir={i18n.language.startsWith('ar')?'rtl':'ltr'}>
  <header className="sc-header"><div><p className="sc-eyebrow">{text('eyebrow')}</p><h1>{text('title')}</h1><p>{text('description')}</p></div><div className="sc-actions"><Button variant="outline" disabled={query.isFetching||busy} onClick={()=>{void refresh();}}><RefreshCw aria-hidden="true"/>{text('refresh')}</Button>{data.canManage&&<Button asChild><Link href="/merchant/services/new"><Plus aria-hidden="true"/>{text('create')}</Link></Button>}</div></header>
  <nav className="sc-nav" aria-label={text('title')}><Link href="/merchant/service-categories"><Folder aria-hidden="true"/>{text('categories')}<ArrowUpRight aria-hidden="true"/></Link><Link href="/merchant/service-packages"><Layers aria-hidden="true"/>{text('packages')}<ArrowUpRight aria-hidden="true"/></Link></nav>
  {!data.canManage&&<p className="sc-muted">{text('readOnly')}</p>}{notice&&<p role="status" className="sc-feedback">{notice}</p>}{needsRefresh&&!action&&<p role="alert" className="sc-feedback"><span>{failure||text('actionError')}</span><Button variant="outline" disabled={busy||query.isFetching} onClick={()=>{void refresh();}}>{text('reviewState')}</Button></p>}
  <dl className="sc-summary"><div><dt>{text('total')}</dt><dd>{number(data.summary.total)}</dd></div><div><dt>{text('active')}</dt><dd>{number(data.summary.active)}</dd></div><div><dt>{text('inactive')}</dt><dd>{number(data.summary.inactive)}</dd></div>{data.summary.unknown>0&&<div><dt>{text('unknown')}</dt><dd>{number(data.summary.unknown)}</dd></div>}</dl>
  {data.summary.unknown>0&&<p className="sc-feedback"><AlertCircle aria-hidden="true"/>{text('unknownHint')}</p>}
  <section className="sc-list" aria-busy={query.isFetching}>
   <form className="sc-filters" onSubmit={event=>{event.preventDefault();change({q:searchEdit?.source===search?searchEdit.value.trim():selection.search,page:null});}}><label className="sc-search"><span>{text('search')}</span><div><Search aria-hidden="true"/><input value={searchEdit?.source===search?searchEdit.value:selection.search} maxLength={200} placeholder={text('searchHint')} onChange={event=>setSearchEdit({source:search,value:event.target.value})}/></div></label><Button type="submit" variant="outline">{text('searchAction')}</Button><label><span>{text('status')}</span><select value={selection.status} onChange={event=>change({status:event.target.value,page:null})}>{(['all','active','inactive','unknown'] as const).map(status=><option key={status} value={status}>{text(status)}</option>)}</select></label>{filtered&&<Button variant="ghost" type="button" onClick={()=>change({q:null,status:null,page:null})}>{text('clear')}</Button>}</form>
   <p className="sc-results" role="status">{query.isFetching?text('loadingUpdate'):text('results',{total:number(data.pagination.total)})}</p>
   {!data.rows.length?<div className="sc-empty"><Layers aria-hidden="true"/><h2>{text(selection.page>1?'outOfRange':filtered?'noResults':'empty')}</h2><p>{text(filtered?'noResultsHint':'emptyHint')}</p>{selection.page>1?<Button onClick={()=>change({page:null})}>{text('first')}</Button>:filtered?<Button variant="outline" onClick={()=>change({q:null,status:null,page:null})}>{text('clear')}</Button>:data.canManage?<Button asChild><Link href="/merchant/services/new">{text('create')}</Link></Button>:null}</div>:
    <ul className="sc-records">{data.rows.map(record=>{if(record.entity!=='service')return null;const row=record,f=row.fields,repair=row.issues.length>0||row.unavailableReferences>0;return <li key={row.id} className="sc-record" data-service-id={row.id}>
     <div className="sc-record-title"><div><p className="sc-muted">{row.categoryName??text(f.categoryId===null?'uncategorized':'categoryUnavailable')}</p><Link href={`/merchant/services/${row.id}`}><h2>{name(row)}</h2></Link></div><Badge variant={f.isActive===true?'default':'secondary'}>{text(f.isActive===true?'active':f.isActive===false?'inactive':'unknown')}</Badge></div>
     {f.description&&<p className="sc-description">{f.description}</p>}<dl className="sc-facts"><div><dt>{text('price')}</dt><dd>{price(row)}</dd></div><div><dt><Clock3 aria-hidden="true"/>{text('duration')}</dt><dd>{f.durationMinutes!==null&&!row.issues.includes('durationMinutes')?text('minutes',{value:number(f.durationMinutes)}):text('unavailable')}</dd></div></dl>
     <p className="sc-appointment"><CalendarCheck aria-hidden="true"/>{text(f.requiresAppointment===true?'appointment':f.requiresAppointment===false?'noAppointment':'unavailable')}</p>
     {repair&&<div className="sc-repair"><AlertCircle aria-hidden="true"/><div><strong>{text('repair')}</strong><p>{text('repairHint')}</p></div></div>}
     <div className="sc-record-actions"><Button asChild variant="outline"><Link href={`/merchant/services/${row.id}`}>{text('details')}</Link></Button>{data.canManage&&<><Button asChild variant="ghost"><Link href={`/merchant/services/${row.id}/edit`}>{text('edit')}</Link></Button>{f.isActive!==false&&<Button variant="ghost" disabled={busy||query.isFetching||needsRefresh} aria-label={text('archiveNamed',{name:name(row)})} onClick={()=>{opener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;setFailure('');setAction({row,view:view.current});}}><Pause aria-hidden="true"/>{text('archive')}</Button>}</>}</div>
    </li>;})}</ul>}
   {data.pagination.pages>0&&<nav className="sc-pagination" aria-label={text('title')}><Button variant="outline" disabled={selection.page<=1||busy} onClick={()=>change({page:selection.page-1})}>{text('previous')}</Button><span>{text('page',{page:number(selection.page),pages:number(data.pagination.pages)})}</span><Button variant="outline" disabled={selection.page>=data.pagination.pages||busy} onClick={()=>change({page:selection.page+1})}>{text('next')}</Button></nav>}
  </section>
  <Dialog open={!!action} onOpenChange={open=>{if(!open&&!busy)setAction(null);}}><DialogContent className="sc-dialog" closeLabel={text('cancel')} dir={i18n.language.startsWith('ar')?'rtl':'ltr'} onCloseAutoFocus={event=>{event.preventDefault();if(opener.current?.isConnected)opener.current.focus();}}><DialogHeader><DialogTitle>{text('archiveTitle',{name:action?name(action.row):''})}</DialogTitle><DialogDescription>{text('archiveHint')}</DialogDescription></DialogHeader>{!unchanged&&<p role="alert" className="sc-feedback">{text('changed')}</p>}{failure&&<p role="alert" className="sc-feedback">{failure}</p>}{needsRefresh&&<Button variant="outline" disabled={busy||query.isFetching} onClick={()=>{void refresh();}}>{text('reviewState')}</Button>}<DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setAction(null)}>{text('cancel')}</Button><Button disabled={!canConfirm} onClick={()=>{void confirm();}}>{text('confirmArchive')}</Button></DialogFooter></DialogContent></Dialog>
 </div>;
}
