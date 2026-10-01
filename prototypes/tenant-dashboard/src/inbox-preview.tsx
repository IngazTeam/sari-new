import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import Conversations from '../../../client/src/pages/merchant/Conversations';
import { useMerchantViewport } from '../../../client/src/lib/merchant-viewport';
import { Toaster, toast } from 'sonner';
import { InboxPreviewModel, inboxModes, type InboxMode } from './inbox-preview-model';
import { InboxPreviewContext } from './inbox-preview-api';
import { InboxPreviewLanguage } from './inbox-preview-i18n';
import { useSearch, updateInboxSearch } from './inbox-preview-router';
const labels={ar:['عادية','قائمة فارغة','سجل فارغ','تحميل','فشل القائمة','فشل الرسائل','فشل أدوات المراجعة','دون صلاحية','جلسة منتهية','نتائج متجر آخر','خطأ مع بيانات قديمة','قراءة أدوات الإدارة فقط','واتساب غير متصل','استيراد جزئي','رد غير محسوم','رد معلق','فشل الإجراء','فشل المرفقات'],en:['Normal','Empty inbox','Empty history','Loading','List failed','History failed','Review tools failed','Forbidden','Session expired','Another store snapshot','Error with stale data','Read-only management','WhatsApp disconnected','Partial import','Uncertain reply','Pending reply','Action failed','Attachment failures']};
function Preview(){
  useMerchantViewport();const search=useSearch(),params=new URLSearchParams(search),language=params.get('lang')==='en'?'en':'ar',ar=language==='ar';
  const merchantId=params.get('tenant')==='236'?236:235,raw=params.get('scenario'),mode:InboxMode=inboxModes.includes(raw as InboxMode)?raw as InboxMode:'normal';
  const [generation,setGeneration]=useState(0),model=useMemo(()=>new InboxPreviewModel(merchantId,mode),[merchantId,mode,generation]);model.language=language;
  useSyncExternalStore(model.subscribe,model.snapshot);
  useEffect(()=>()=>model.finishPending(),[model]);
  useEffect(()=>{document.documentElement.lang=language;document.documentElement.dir=ar?'rtl':'ltr';},[language,ar]);
  const change=(key:string,value:string)=>{const next=new URLSearchParams(search);next.set(key,value);updateInboxSearch(next);};
  return <InboxPreviewLanguage.Provider value={language}><InboxPreviewContext.Provider value={model}>
    <main className="mw-main space-y-5" onClickCapture={event=>{const link=(event.target as HTMLElement).closest?.('a[href="/login"],a[href="./#/page/login"],a[href="/support"],a[href="./#/page/support"]');if(link){event.preventDefault();if(link.getAttribute('href')?.endsWith('/login'))model.complete();else toast.info(ar?'هذه معاينة محلية؛ لم يُرسل طلب دعم.':'This is a local preview; no support request was sent.');}}}>
      <aside className="space-y-3 rounded-xl border bg-muted/40 p-4" aria-label={ar?'خيارات الموك أب':'Preview controls'}>
        <h2 className="text-xl font-semibold">{ar?'موك أب المحادثات الفعلي':'Actual conversation preview'}</h2>
        <p className="text-sm leading-relaxed">{ar?'شاشة التطبيق ببيانات توضيحية معزولة. الإرسال والتسليم والاستيراد والمراجعات محاكاة محلية؛ لا اتصال بواتساب أو ذكاء اصطناعي خارجي. تسجيل الصوت هنا يولّد عينة صامتة ولا يفتح الميكروفون.':'Actual application screen with isolated sample data. Sending, handoff, import and reviews are local simulations with no WhatsApp or external AI connection. Recording generates silent audio without opening the microphone.'}</p>
        <div className="flex min-w-0 flex-wrap gap-3">
          <label className="grid min-w-0 gap-2">{ar?'حالة التجربة':'Scenario'}<select data-inbox-scenario className="max-w-full rounded-lg border bg-background p-2" value={mode} onChange={e=>change('scenario',e.target.value)}>{inboxModes.map((item,i)=><option key={item} value={item}>{labels[language][i]}</option>)}</select></label>
          <label className="grid gap-2">{ar?'لغة اللوحة':'Interface language'}<select data-inbox-language className="rounded-lg border bg-background p-2" value={language} onChange={e=>change('lang',e.target.value)}><option value="ar">العربية</option><option value="en">English</option></select></label>
          <label className="grid gap-2">{ar?'تيننت المحاكاة':'Simulated tenant'}<select data-inbox-tenant className="rounded-lg border bg-background p-2" value={merchantId} onChange={e=>change('tenant',e.target.value)}><option value="235">A · 235</option><option value="236">B · 236</option></select></label>
          <button data-inbox-reset type="button" className="rounded-lg border bg-background px-3" onClick={()=>setGeneration(n=>n+1)}>{ar?'إعادة بيانات المثال':'Reset sample data'}</button>
          {(mode==='loading'||mode==='session')&&<button type="button" className="rounded-lg border px-3" onClick={model.complete}>{ar?'استعادة الحالة محليًا':'Recover local state'}</button>}
          {model.pending>0&&<button data-inbox-complete type="button" className="rounded-lg border px-3" onClick={model.finishPending}>{ar?'أكمل الرد المعلق محليًا':'Complete pending local reply'}</button>}
        </div>
        <p role="status" className="text-xs">{ar?'عمليات محلية: ':'Local operations: '}{model.operations} · {ar?'محاولات استعادة: ':'Recovery attempts: '}{model.retries}</p>
      </aside>
      <Toaster richColors position="bottom-center"/><div className="inbox-preview-workspace"><Conversations key={`${merchantId}:${mode}:${generation}`}/></div>
    </main>
  </InboxPreviewContext.Provider></InboxPreviewLanguage.Provider>;
}
createRoot(document.getElementById('inbox-preview')!).render(<Preview/>);
