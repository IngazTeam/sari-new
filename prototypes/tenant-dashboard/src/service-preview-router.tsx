import React, { useSyncExternalStore } from 'react';
const reserved=['path','lang','tenant','scenario','embed'];
const subscribe=(fn:()=>void)=>{window.addEventListener('popstate',fn);return()=>window.removeEventListener('popstate',fn);};
export const validServicePath=(path:string)=>/^\/merchant\/(?:services(?:\/new|\/[1-9]\d*(?:\/edit)?)?|service-categories|service-packages|staff|bookings|calendar(?:\/settings)?)$/.test(path)&&path.length<=100&&(!/\/services\/\d/.test(path)||Number(path.split('/')[3])<=2147483647);
export function previewNavigation(search:string){const params=new URLSearchParams(search),path=params.get('path')??'/merchant/services',app=new URLSearchParams(params);for(const key of reserved)app.delete(key);return {path,search:app.toString(),params};}
export function servicePreviewHref(href:string,current:string){
  const [path,query='']=href.split('?');if(!validServicePath(path))return null;
  const params=new URLSearchParams(current);for(const key of Array.from(params.keys()))if(!reserved.includes(key))params.delete(key);
  params.set('path',path);for(const [key,value] of Array.from(new URLSearchParams(query)))if(!reserved.includes(key))params.set(key,value);
  return '?'+params.toString();
}
export function usePreviewSearch(){return useSyncExternalStore(subscribe,()=>location.search);}
export function updateServiceSearch(params:URLSearchParams){history.pushState(null,'',location.pathname+'?'+params.toString());window.dispatchEvent(new PopStateEvent('popstate'));}
export function navigate(path:string){const href=servicePreviewHref(path,location.search);if(href){history.pushState(null,'',location.pathname+href);window.dispatchEvent(new PopStateEvent('popstate'));}}
export function useSearch(){return previewNavigation(usePreviewSearch()).search;}
export function useLocation():[string,typeof navigate]{return [previewNavigation(usePreviewSearch()).path,navigate];}
export function useParams(){const [path]=useLocation();return {id:path.endsWith('/new')?undefined:/^\/merchant\/services\/([^/]+)/.exec(path)?.[1]};}
export function useRoute(pattern:string):[boolean,{id?:string}|null]{const [path]=useLocation(),match=new RegExp('^'+pattern.replace(':id','([^/]+)')+'$').exec(path);return [!!match,match?{id:match[1]}:null];}
export const Link=React.forwardRef<HTMLAnchorElement,React.AnchorHTMLAttributes<HTMLAnchorElement>>(({href='',onClick,...props},ref)=><a {...props} ref={ref} href={servicePreviewHref(href,location.search)??'./#/page'+href} onClick={event=>{onClick?.(event);if(!event.defaultPrevented&&event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey&&validServicePath(href.split('?')[0])){event.preventDefault();navigate(href);}}}/>);
