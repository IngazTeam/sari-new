import { createContext, useContext } from 'react';
declare const INBOX_PREVIEW_COPY:Record<string,any>;
export const InboxPreviewLanguage=createContext<'ar'|'en'>('ar');
export function useTranslation(){const language=useContext(InboxPreviewLanguage);return {i18n:{language,dir:()=>language==='ar'?'rtl':'ltr'},t:(key:string,args:Record<string,unknown>={})=>{
  const text=key.split('.').reduce((value,key)=>value?.[key],INBOX_PREVIEW_COPY[language]);return typeof text==='string'?text.replace(/\{\{(\w+)\}\}/g,(_,key)=>String(args[key]??'')):key;
}};}
