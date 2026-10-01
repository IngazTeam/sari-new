import * as local from '../../../client/src/lib/knowledge-workspace-cache';
import type { KnowledgeDraft } from '../../../client/src/lib/knowledge-workspace-cache';
export * from '../../../client/src/lib/knowledge-workspace-cache';
type ParentCache = {
  epoch():number;
  read(key:string):KnowledgeDraft|null;
  write(key:string,draft:KnowledgeDraft,expectedEpoch:number):void;
  discard(key:string):void;
};
function parentCache():ParentCache|null {
  if(window.parent===window || new URLSearchParams(window.location.search).get('embed')!=='brain')return null;
  try { return (window.parent as Window & {SaryBrainPrototypeCache?:ParentCache}).SaryBrainPrototypeCache ?? null; } catch {return null;}
}
export const knowledgeCacheEpoch=()=>parentCache()?.epoch() ?? local.knowledgeCacheEpoch();
export const readKnowledgeDraft=(key:string)=>parentCache()?.read(key) ?? local.readKnowledgeDraft(key);
export function cacheKnowledgeDraft(key:string,draft:KnowledgeDraft,epoch:number) {
  const cache=parentCache();if(cache)cache.write(key,draft,epoch);else local.cacheKnowledgeDraft(key,draft,epoch);
}
export function discardKnowledgeDraft(key:string) {
  const cache=parentCache();if(cache)cache.discard(key);else local.discardKnowledgeDraft(key);
}
