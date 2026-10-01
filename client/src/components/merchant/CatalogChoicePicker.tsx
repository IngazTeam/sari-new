import {serviceEditorLabels} from '@/lib/service-editor-labels';
import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import {trpc} from '@/lib/trpc';
import {catalogChoicesSchema} from '@shared/service-catalog-workspace';
import {Button} from '@/components/ui/button';
import {WorkspaceState,workspaceFailureKind} from './WorkspaceState';
export function CatalogChoicePicker({actorId,merchantId,kind,selected,names,onChange,onNames,disabled=false}:{actorId:number;merchantId:number;kind:'category'|'staff'|'service';selected:number[]|null;names:Record<number,string>;onChange:(ids:number[])=>void;onNames:(values:{id:number;name:string}[])=>void;disabled?:boolean}){
 const {t}=useTranslation(),label=serviceEditorLabels(t);
 const [open,setOpen]=useState(false),[search,setSearch]=useState(''),[draft,setDraft]=useState(''),[page,setPage]=useState(1);
 const input={kind,search,page},query=trpc.services.catalogChoices.useQuery(input,{enabled:open,retry:false,staleTime:0,refetchOnMount:'always'}),parsed=catalogChoicesSchema.safeParse(query.data);
 const data=!query.error&&parsed.success&&parsed.data.actorId===actorId&&parsed.data.merchantId===merchantId&&parsed.data.selection.kind===kind&&parsed.data.selection.search===search&&parsed.data.selection.page===page?parsed.data:null;
 const choose=(row:{id:number;name:string})=>{if(!data?.canManage||query.isFetching||disabled)return;onNames([row]);onChange(kind==='category'?[row.id]:[...selected??[],row.id]);if(kind==='category')setOpen(false);};
 return <div className="se-choice">
  {selected===null?<div className="sc-feedback"><span>{label('repairSelection')}</span><Button type="button" disabled={disabled} variant="outline" onClick={()=>onChange([])}>{label('resetSelection')}</Button></div>:<><ul className="se-selected">{selected.map(id=><li key={id}><span>{names[id]??label('unavailableSelection',{id})}</span><Button type="button" variant="ghost" disabled={disabled} aria-label={label('removeSelection',{name:names[id]??label('unavailableSelection',{id})})} onClick={()=>onChange(selected.filter(value=>value!==id))}>×</Button></li>)}</ul>{!selected.length&&<p className="sc-muted">{label('noSelection')}</p>}</>}
  <Button type="button" variant="outline" aria-expanded={open} disabled={disabled||selected===null} onClick={()=>setOpen(value=>!value)}>{label(open?'cancel':'choose')}</Button>
  {open&&<div className="se-choice-panel"><div className="se-choice-search"><label><span>{label('searchChoices')}</span><input value={draft} maxLength={200} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();setSearch(draft.trim());setPage(1);}}}/></label><Button type="button" variant="outline" onClick={()=>{setSearch(draft.trim());setPage(1);}}>{label('search')}</Button></div>
   {query.error?<WorkspaceState inline kind={workspaceFailureKind(query.error)} onRetry={()=>{void query.refetch();}}/>:!data?<WorkspaceState inline kind={query.isFetching?'loading':'error'} onRetry={()=>{void query.refetch();}}/>:<><p className="sc-muted">{label('choiceCount',{count:data.pagination.total})}</p><ul className="se-options">{data.rows.map(row=><li key={row.id}><span>{row.name}</span><Button type="button" variant="outline" disabled={disabled||query.isFetching||!data.canManage||selected?.includes(row.id)||kind!=='category'&&(selected?.length??0)>=200} aria-label={label('chooseNamed',{name:row.name})} onClick={()=>choose(row)}>{label('choose')}</Button></li>)}</ul>{!data.rows.length&&<p>{label('noChoices')}</p>}{kind!=='category'&&(selected?.length??0)>=200&&<p>{label('maxChoices')}</p>}<div className="sc-pagination"><Button type="button" variant="outline" disabled={page<=1} onClick={()=>setPage(page-1)}>{label('previous')}</Button><span>{label('page',{page,pages:Math.max(1,data.pagination.pages)})}</span><Button type="button" variant="outline" disabled={page>=data.pagination.pages} onClick={()=>setPage(page+1)}>{label('next')}</Button></div></>}
  </div>}
 </div>;
}
