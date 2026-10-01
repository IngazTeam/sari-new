import {catalogListInput,type CatalogSelection} from '@shared/service-catalog-workspace';
export function catalogNavigation(search:string,entity:CatalogSelection['entity']='service'){
 const params=new URLSearchParams(search),status=params.get('status'),page=params.get('page');
 return catalogListInput.parse({entity,search:(params.get('q')??'').trim().slice(0,200),status:['active','inactive','unknown'].includes(status??'')?status:'all',page:page&&/^[1-9]\d*$/.test(page)&&Number(page)<=1_000_000?Number(page):1});
}
export function catalogHref(path:string,search:string,patch:Record<string,string|number|null>){
 const params=new URLSearchParams(search);for(const [key,value] of Object.entries(patch)){if(value===null||value===''||key==='page'&&value===1||key==='status'&&value==='all')params.delete(key);else params.set(key,String(value));}return path+(params.size?'?'+params.toString():'');
}
export const catalogSelectionKey=(selection:CatalogSelection)=>JSON.stringify([selection.entity,selection.search,selection.status,selection.page]);
