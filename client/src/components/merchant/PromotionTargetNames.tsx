import {useState} from 'react';
import {trpc} from '@/lib/trpc';
import {Button} from '@/components/ui/button';
import type {PromotionLabels} from '@/lib/promotion-workspace-labels';
import {promotionTargetSelection,promotionTargetChoices} from '@shared/promotion-targets';
import {promotionNamedTargets,promotionTargetNamesResult,type PromotionNamedTargets} from '@shared/promotion-target-names';
import type {PromotionWorkspaceRow} from '@shared/promotion-workspace';
type Props={actorId:number;merchantId:number;c:PromotionLabels;locale:string};
function TargetList({data,kind,c,locale}:{data:PromotionNamedTargets;kind:'products'|'categories';c:PromotionLabels;locale:string}){
 const [page,setPage]=useState(1),ids=data.ids??[],pages=Math.ceil(ids.length/10),at=Math.min(page,Math.max(1,pages));
 if(!ids.length&&data.ids!==null)return null;
 return <section className="pm-target-names" aria-label={c[kind]}><h3>{c[kind]} {data.ids!==null&&<span>({ids.length.toLocaleString(locale)})</span>}</h3>
  {data.ids===null?<p role="alert" className="sc-feedback">{c.fieldIds}</p>:<><ul>{ids.slice((at-1)*10,at*10).map(id=>{const row=data.choices.find(r=>r.id===id),alternate=locale==='ar'&&kind==='products'||locale==='en'&&kind==='categories',label=row?(alternate?row.alternateName??row.name:row.name??row.alternateName)??c.unknown:c.targetUnavailable;return <li key={id}><span>{label}</span><small>#{id}{row&&<> · {row.active===null?c.unknown:row.active?c.active:c.inactive}</>}</small></li>;})}</ul>{data.missingIds.length>0&&<p className="sc-feedback">{c.missingTargets}</p>}{pages>1&&<nav className="sc-pagination" aria-label={c[kind]}><Button type="button" variant="outline" disabled={at<=1} onClick={()=>setPage(at-1)}>{c.previous}</Button><span>{c.page} {at.toLocaleString(locale)} {c.of} {pages.toLocaleString(locale)}</span><Button type="button" variant="outline" disabled={at>=pages} onClick={()=>setPage(at+1)}>{c.next}</Button></nav>}</>}
 </section>;
}
function NamesState({failed,busy,retry,c}:{failed:boolean;busy:boolean;retry:()=>void;c:PromotionLabels}){return failed?<div role="alert" className="sc-feedback"><p>{c.namesFailed}</p><Button type="button" variant="outline" disabled={busy} onClick={retry}>{c.refresh}</Button></div>:<p role="status">{c.choicesLoading}</p>;}
export function PromotionSavedTargets({actorId,merchantId,row,c,locale}:Props&{row:PromotionWorkspaceRow}){
 const input={id:row.id,revision:row.revision},request=trpc.promotions.targetNames.useQuery(input,{retry:false,staleTime:0,refetchOnMount:'always'}),parsed=promotionTargetNamesResult.safeParse(request.data);
 const data=!request.error&&parsed.success&&parsed.data.actorId===actorId&&parsed.data.merchantId===merchantId&&parsed.data.input.id===input.id&&parsed.data.input.revision===input.revision?parsed.data:null;
 if(!data)return <NamesState failed={!!request.error||!request.isFetching} busy={request.isFetching} retry={()=>void request.refetch()} c={c}/>;
 if(data.state!=='ready')return <p role="status" className="sc-feedback">{c.namesChanged}</p>;
 return <div><p className="sc-muted">{c.namesHelp}</p>{row.scope==='products'&&<TargetList key={'p:'+row.revision} kind="products" data={data.products} c={c} locale={locale}/>} {row.scope==='categories'&&<TargetList key={'c:'+row.revision} kind="categories" data={data.categories} c={c} locale={locale}/>} {(['products','categories'] as const).some(k=>row.scope!==k&&(data[k].ids===null||data[k].ids.length>0))&&<details><summary>{c.otherStoredTargets}</summary>{(['products','categories'] as const).filter(k=>row.scope!==k).map(kind=><TargetList key={kind+row.revision} kind={kind} data={data[kind]} c={c} locale={locale}/>)}</details>}</div>;
}
function ProposedNames({actorId,merchantId,ids,kind,c,locale}:Props&{kind:'products'|'categories';ids:number[]}){
 const selection=promotionTargetSelection.parse({kind,selectedIds:ids}),request=trpc.promotions.targetChoices.useQuery(selection,{retry:false,staleTime:0,refetchOnMount:'always'}),parsed=promotionTargetChoices.safeParse(request.data);
 const snapshot=!request.error&&parsed.success&&parsed.data.actorId===actorId&&parsed.data.merchantId===merchantId&&JSON.stringify(parsed.data.selection)===JSON.stringify(selection)?parsed.data:null;
 const named=promotionNamedTargets.safeParse(snapshot?{ids,choices:snapshot.selected,missingIds:snapshot.missingIds}:null);
 if(!named.success)return <NamesState failed={!!request.error||!request.isFetching} busy={request.isFetching} retry={()=>void request.refetch()} c={c}/>;
 return <div><p className="sc-muted">{c.namesHelp}</p><TargetList key={JSON.stringify(ids)} data={named.data} kind={kind} c={c} locale={locale}/></div>;
}
export function PromotionProposedTargets({scope,productIds,categoryIds,...props}:Props&{scope:string|null;productIds:string|null;categoryIds:string|null}){
 if(scope!=='products'&&scope!=='categories')return null;
 let ids:number[];try{ids=JSON.parse((scope==='products'?productIds:categoryIds)??'null');if(!Array.isArray(ids)||!ids.length||!promotionTargetSelection.safeParse({kind:scope,selectedIds:ids}).success)throw Error();}catch{return <p role="alert" className="sc-feedback">{props.c.fieldIds}</p>;}
 return <ProposedNames {...props} kind={scope} ids={ids}/>;
}
