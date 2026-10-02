import { createContext, useContext } from 'react';
declare const SERVICE_PREVIEW_COPY:Record<string,any>;
export const ServicePreviewLanguage=createContext<'ar'|'en'>('ar');
export function useTranslation(){const language=useContext(ServicePreviewLanguage);return {i18n:{language,dir:()=>language==='ar'?'rtl':'ltr'},t:(key:string,args:Record<string,unknown>={})=>{
  const text=key.split('.').reduce((value,key)=>value?.[key],SERVICE_PREVIEW_COPY[language]);return typeof text==='string'?text.replace(/\{\{(\w+)\}\}/g,(_,key)=>String(args[key]??'')):key;
}};}
