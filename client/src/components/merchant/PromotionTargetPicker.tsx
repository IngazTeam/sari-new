import {useState} from 'react';
import {trpc} from '@/lib/trpc';
import {Button} from '@/components/ui/button';
import {promotionTargetChoices,promotionTargetSelection} from '@shared/promotion-targets';
import type {PromotionLabels} from '@/lib/promotion-workspace-labels';
export function promotionTargetIds(value:string){const parts=value.trim()?value.replace(/[٠-٩]/g,v=>String(v.charCodeAt(0)-1632)).replace(/[۰-۹]/g,v=>String(v.charCodeAt(0)-1776)).split(/[,،\s]+/).filter(Boolean):[];return parts.length<=1000&&parts.every(v=>/^\d+$/.test(v)&&Number(v)>0&&Number(v)<=2147483647)&&new Set(parts.map(Number)).size===parts.length?parts.map(Number):null;}
export function PromotionTargetPicker({actorId,merchantId,kind,value,onChange,busy,c,locale}:{actorId:number;merchantId:number;kind:'products'|'categories';value:string;onChange:(s:string)=>void;busy:boolean;c:PromotionLabels;locale:string}){
 const [query,setQuery]=useState(''),[draft,setDraft]=useState(''),[page,setPage]=useState(1),ids=promotionTargetIds(value),selection=promotionTargetSelection.parse({kind,query,page,selectedIds:ids??[]});
 const request=trpc.promotions.targetChoices.useQuery(selection,{retry:false,staleTime:0,refetchOnMount:'always'}),parsed=promotionTargetChoices.safeParse(request.data),data=!request.error&&parsed.success&&parsed.data.actorId===actorId&&parsed.data.merchantId===merchantId&&JSON.stringify(parsed.data.selection)===JSON.stringify(selection)?parsed.data:null;
 const disabled=busy||request.isFetching||!data||ids===null;
 const label=(row:{name:string|null;alternateName:string|null})=>locale==='ar'&&kind==='products'||locale==='en'&&kind==='categories'?row.alternateName??row.name??c.unknown:row.name??row.alternateName??c.unknown;
 const toggle=(id:number)=>{if(disabled)return;onChange(ids!.includes(id)?ids!.filter(n=>n!==id).join(', '):[...ids!,id].join(', '));};
 return <section className="pm-picker" aria-label={kind==='products'?c.products:c.categories} aria-busy={request.isFetching}>
  <div className="pm-picker-search"><label><span>{c.chooseSearch}</span><input value={draft} maxLength={100} disabled={busy} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();setQuery(draft.trim());setPage(1);}}}/></label><Button type="button" variant="outline" disabled={busy} onClick={()=>{setQuery(draft.trim());setPage(1);}}>{c.searchAction}</Button></div>
  {request.error||!data&&!request.isFetching?<div role="alert"><p>{c.choicesFailed}</p><Button type="button" variant="outline" disabled={busy||request.isFetching} onClick={()=>void request.refetch()}>{c.refresh}</Button></div>:!data?<p role="status">{c.choicesLoading}</p>:<>
   <p className="sc-muted">{c.selectedTargets}: {ids?.length??c.unknown} · {c.targetMatches}: {data.total}</p>
   {!!data.selected.length&&<div className="pm-selected">{data.selected.map(row=><Button key={row.id} type="button" variant="outline" disabled={disabled} onClick={()=>toggle(row.id)}>{c.removeTarget}: {label(row)} <span className="pm-inline-value">#{row.id}</span></Button>)}</div>}
   {!!data.missingIds.length&&<div className="sc-feedback"><p>{c.missingTargets}</p>{data.missingIds.map(id=><Button key={id} type="button" variant="outline" disabled={disabled} onClick={()=>toggle(id)}>{c.removeTarget} #{id}</Button>)}</div>}
   {!data.rows.length?<p>{c.noTargets}</p>:<ul className="pm-choices">{data.rows.map(row=><li key={row.id}><label className="pm-check"><input type="checkbox" checked={ids?.includes(row.id)??false} disabled={disabled||!ids?.includes(row.id)&&(ids?.length??0)>=1000} onChange={()=>toggle(row.id)}/><span>{label(row)} <small>#{row.id} · {row.active===null?c.unknown:row.active?c.active:c.inactive}</small></span></label></li>)}</ul>}
   {data.pages>1&&<nav className="sc-pagination" aria-label={c.choosePages}><Button type="button" variant="outline" disabled={busy||request.isFetching||page<=1} onClick={()=>setPage(p=>p-1)}>{c.previous}</Button><span>{c.page} {page} {c.of} {data.pages}</span><Button type="button" variant="outline" disabled={busy||request.isFetching||page>=data.pages} onClick={()=>setPage(p=>p+1)}>{c.next}</Button></nav>}{page>1&&!data.rows.length&&<Button variant="outline" type="button" disabled={busy} onClick={()=>setPage(1)}>{c.first}</Button>}
  </>}{ids===null&&<p role="alert" className="pm-field-error">{c.fieldIds}</p>}
 </section>;
}
