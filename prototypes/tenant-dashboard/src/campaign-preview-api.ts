import { createContext, useContext, useSyncExternalStore, useState, useEffect, useRef } from 'react';
import { CampaignPreviewModel, campaignQueries, campaignMutations } from './campaign-preview-model';
export const CampaignPreviewContext=createContext<CampaignPreviewModel|null>(null);
function useModel(){const model=useContext(CampaignPreviewContext);if(!model)throw Error('Missing local campaign simulation');useSyncExternalStore(model.subscribe,model.snapshot);return model;}
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
export const trpc:any={useUtils:()=>{const model=useModel();return {campaigns:new Proxy({}, {get:(_,key)=>key==='reportExport'?{fetch:(input:any)=>model.exportReport(input)}:{invalidate:model.invalidate}})};}};
for(const name of campaignQueries){const [namespace,method]=name.split('.');trpc[namespace]??={};trpc[namespace][method]={useQuery:(input:any,options:any)=>useRead(name,input,options)};}
for(const name of campaignMutations){const [namespace,method]=name.split('.');trpc[namespace]??={};trpc[namespace][method]={useMutation:()=>useMutation(name)};}
