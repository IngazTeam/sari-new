import { createContext, useContext, useSyncExternalStore, useState, useEffect, useRef } from 'react';
import { InboxPreviewModel, inboxQueries, inboxMutations } from './inbox-preview-model';
export const InboxPreviewContext=createContext<InboxPreviewModel|null>(null);
function useModel(){const model=useContext(InboxPreviewContext);if(!model)throw Error('Missing local inbox simulation');useSyncExternalStore(model.subscribe,model.snapshot);return model;}
function useRead(name:string,input:any,options?:{enabled?:boolean}){
  const model=useModel();
  if(options?.enabled===false)return {data:undefined,error:null,isLoading:false,isFetching:false,isError:false,isFetchedAfterMount:false,dataUpdatedAt:0,refetch:async()=>({data:undefined})};
  return {...model.read(name,input),refetch:()=>model.refetch(name,input)};
}
function useMutation(name:string){
  const model=useModel(),[isPending,setPending]=useState(false),live=useRef(true);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  return {isPending,mutateAsync:async(input:any)=>{setPending(true);try{return await model.mutate(name,input);}finally{if(live.current)setPending(false);}}};
}
export const trpc:any={useUtils:()=>{const model=useModel();return {conversations:new Proxy({}, {get:()=>({invalidate:model.invalidate})})};}};
for(const name of inboxQueries){const [namespace,method]=name.split('.');trpc[namespace]??={};trpc[namespace][method]={useQuery:(input:any,options:any)=>useRead(name,input,options)};}
for(const name of inboxMutations){const [namespace,method]=name.split('.');trpc[namespace]??={};trpc[namespace][method]={useMutation:()=>useMutation(name)};}
