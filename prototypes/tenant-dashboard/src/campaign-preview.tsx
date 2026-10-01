import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster, toast } from 'sonner';
import { createPortal } from 'react-dom';
import Campaigns from '../../../client/src/pages/merchant/Campaigns';
import CampaignDetails from '../../../client/src/pages/merchant/CampaignDetails';
import CampaignReport from '../../../client/src/pages/merchant/CampaignReport';
import NewCampaign from '../../../client/src/pages/merchant/NewCampaign';
import { WorkspaceState } from '../../../client/src/components/merchant/WorkspaceState';
import { useMerchantViewport } from '../../../client/src/lib/merchant-viewport';
import { CampaignPreviewModel, campaignModes, type CampaignMode } from './campaign-preview-model';
import { CampaignPreviewContext } from './campaign-preview-api';
import { CampaignPreviewLanguage } from './campaign-preview-i18n';
import { usePreviewSearch, previewNavigation, updateCampaignSearch, validCampaignPath, Link } from './campaign-preview-router';
const labels={ar:['عادية','فارغة','تحميل','تعذر القراءة','دون صلاحية','جلسة منتهية','بيانات متجر آخر','فشل مع بيانات قديمة','قراءة فقط','جمهور محفوظ غير صالح','توقيت غير معروف','صورة غير آمنة','جمهور فارغ','تجاوز حد الجمهور','تعذر عد الجمهور','فشل الحفظ','تعارض النسخة','حفظ معلق','حملة قديمة دون طابور','روابط مستبعدة'],en:['Normal','Empty','Loading','Read failed','Forbidden','Session expired','Another store snapshot','Error with stale data','Read only','Invalid saved audience','Unknown timezone','Unsafe image','Empty audience','Audience limit','Audience unavailable','Action failed','Save conflict','Pending save','Legacy without queue','Excluded links']};
function PendingControl({model,ar}:{model:CampaignPreviewModel;ar:boolean}){
  const [target,setTarget]=useState<Element|null>(null);
  useEffect(()=>{setTarget(model.pending?document.querySelector('.ce-dialog'):null);},[model,model.pending]);
  return model.pending&&target?createPortal(<div className="campaign-preview-controls"><p>{ar?'أداة محاكاة التأخير فقط':'Local delay simulation control'}</p><button type="button" data-campaign-complete onClick={model.finishPending}>{ar?'أكمل الحفظ المحلي':'Complete local save'}</button></div>,target):null;
}
function Preview(){
  useMerchantViewport();const search=usePreviewSearch(),{path,params}=previewNavigation(search),language=params.get('lang')==='en'?'en':'ar',ar=language==='ar';
  const merchantId=params.get('tenant')==='259'?259:258,raw=params.get('scenario'),mode:CampaignMode=campaignModes.includes(raw as CampaignMode)?raw as CampaignMode:'normal';
  const [generation,setGeneration]=useState(0),model=useMemo(()=>new CampaignPreviewModel(merchantId,mode),[merchantId,mode,generation]);model.language=language;
  useSyncExternalStore(model.subscribe,model.snapshot);useEffect(()=>()=>model.dispose(),[model]);
  useEffect(()=>{document.documentElement.lang=language;document.documentElement.dir=ar?'rtl':'ltr';},[language,ar]);
  const change=(key:string,value:string)=>{const next=new URLSearchParams(search);next.set(key,value);updateCampaignSearch(next);};
  const page=!validCampaignPath(path)?<WorkspaceState kind="missing"/>:path==='/merchant/campaigns'?<Campaigns/>:path.endsWith('/new')||path.endsWith('/edit')?<NewCampaign/>:path.endsWith('/report')?<CampaignReport/>:<CampaignDetails/>;
  return <CampaignPreviewLanguage.Provider value={language}><CampaignPreviewContext.Provider value={model}><main className="mw-main campaign-preview-main" onClickCapture={event=>{const anchor=(event.target as HTMLElement).closest?.('a[href="/login"],a[href="/support"]');if(anchor){event.preventDefault();if(anchor.getAttribute('href')==='/login')model.complete();else toast.info(ar?'معاينة محلية؛ لم يُرسل طلب دعم.':'Local preview; no support request was sent.');}}}>
    <aside className="campaign-preview-controls" aria-label={ar?'خيارات الموك أب':'Preview controls'}><h2>{ar?'موك أب الحملات الفعلي':'Actual campaign preview'}</h2><p>{ar?'واجهات التطبيق ببيانات توضيحية في الذاكرة. الحفظ والإرسال والمراجعات محاكاة محلية؛ لا اتصال بواتساب. إعادة التحميل أو تغيير التيننت أو الحالة يعيد بيانات المثال.':'Actual application screens with in-memory sample data. Saves, sends and reviews are local simulations with no WhatsApp connection. Reloading or switching tenant or scenario resets samples.'}</p>
      <div className="campaign-preview-options"><label>{ar?'حالة التجربة':'Scenario'}<select data-campaign-scenario value={mode} onChange={e=>change('scenario',e.target.value)}>{campaignModes.map((item,i)=><option key={item} value={item}>{labels[language][i]}</option>)}</select></label>
        <label>{ar?'لغة اللوحة':'Interface language'}<select data-campaign-language value={language} onChange={e=>change('lang',e.target.value)}><option value="ar">العربية</option><option value="en">English</option></select></label>
        <label>{ar?'تيننت المحاكاة':'Simulated tenant'}<select data-campaign-tenant value={merchantId} onChange={e=>change('tenant',e.target.value)}><option value="258">A · 258</option><option value="259">B · 259</option></select></label>
        <button type="button" data-campaign-reset onClick={()=>setGeneration(n=>n+1)}>{ar?'إعادة بيانات المثال':'Reset sample data'}</button>
        <button type="button" onClick={model.complete}>{ar?'استعادة الحالة محليًا':'Recover local state'}</button>
      </div><nav aria-label={ar?'صفحات الحملات':'Campaign pages'}><Link href="/merchant/campaigns">{ar?'الحملات':'Campaigns'}</Link><Link href="/merchant/campaigns?tab=performance">{ar?'الأداء':'Performance'}</Link><Link href="/merchant/campaigns/new">{ar?'إنشاء حملة':'Create campaign'}</Link><Link href="/merchant/campaigns/1/edit">{ar?'تعديل المثال':'Edit sample'}</Link><Link href="/merchant/campaigns/3">{ar?'تفاصيل المثال':'Sample details'}</Link><Link href="/merchant/campaigns/3/report">{ar?'تقرير المثال':'Sample report'}</Link></nav>
      <p role="status">{ar?'عمليات محلية: ':'Local operations: '}{model.operations} · {ar?'محاولات الاستعادة: ':'Recovery attempts: '}{model.retries}</p>
    </aside><Toaster richColors position="bottom-center"/><div key={`${merchantId}:${mode}:${generation}:${path}`} className="campaign-preview-workspace">{page}</div><PendingControl model={model} ar={ar}/>
  </main></CampaignPreviewContext.Provider></CampaignPreviewLanguage.Provider>;
}
createRoot(document.getElementById('campaign-preview')!).render(<Preview/>);
