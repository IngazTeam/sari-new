import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { KnowledgeSourceGroupsView, type KnowledgeGroupDestination } from "../../../client/src/components/KnowledgeSourceGroupsWorkspace";
import { KnowledgeRemovalView } from "../../../client/src/components/KnowledgeRemovalWorkspace";
import { useMerchantViewport } from "../../../client/src/lib/merchant-viewport";
import type { KnowledgeRemovalTarget } from "../../../shared/knowledge-source-removal";
import { readRemovalAttempt } from "../../../client/src/lib/knowledge-removal-attempt";
import { removalFixture, removalFixtureReceipt } from "./knowledge-removal-fixture";
import { sourceGroupsFixture } from "./knowledge-groups-fixture";
import { GroupsLanguage } from "./knowledge-groups-preview-i18n";
const scopeKey = "970163:970163:knowledge-removal";
function Preview() {
  useMerchantViewport();
  const [language,setLanguage] = useState<"ar"|"en">("ar"), [mode,setMode] = useState("sample"), [target,setTarget] = useState<KnowledgeRemovalTarget|null>(null), [destination,setDestination] = useState<KnowledgeGroupDestination|"upload"|null>(null), [done,setDone]=useState(false);
  useEffect(()=>{ document.documentElement.lang=language; document.documentElement.dir=language==='ar'?'rtl':'ltr'; },[language]);
  const ar=language==='ar', data=sourceGroupsFixture(mode==='empty');
  if(mode==='foreign') data.merchantId++;
  if(mode==='pagesOnly') {data.website.analyses=0; data.website.removalAnchorId=null; data.website.latestAnalysisAt=null;}
  if(mode==='missingDates') {data.documents.latestUploadedAt=null;data.products.latestModifiedAt=null;data.website.latestAnalysisAt=null;data.website.latestPageUpdateAt=null;data.faqs.latestModifiedAt=null;data.sections.latestModifiedAt=null;}
  const destinations = {documents:ar?'مكتبة الملفات':'File library',products:ar?'الكتالوج':'Catalog',pages:ar?'صفحات الموقع':'Website pages',faqs:ar?'الأسئلة':'Questions',sections:ar?'أقسام المعرفة':'Knowledge sections',settings:ar?'إعدادات النشاط':'Business settings',upload:ar?'رفع ملف':'File upload'};
  return <GroupsLanguage.Provider value={language}><main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
    <a href="./#/page/merchant/sari-brain" className="underline">{ar?'العودة إلى عقل ساري':'Back to Sari Brain'}</a>
    <aside className="rounded-xl border bg-muted/40 p-4 space-y-4"><h1 className="text-xl font-semibold">{ar?'معاينة مجموعات المعرفة':'Knowledge groups preview'}</h1>
      <p>{ar?'مكوّن التطبيق ببيانات توضيحية. جرّب المجموعات الخالية، التواريخ المفقودة ومراجعة الحذف. لا اتصال بالخادم أو حذف حقيقي.':'The actual component with sample data. Try empty groups, missing dates and removal review. No server calls or real removal.'}</p>
      <div className="flex flex-wrap gap-3"><label className="grid gap-2">{ar?'اللغة':'Language'}<select className="rounded-lg border p-2" value={language} onChange={e=>setLanguage(e.target.value as typeof language)}><option value="ar">العربية</option><option value="en">English</option></select></label>
        <label className="grid gap-2">{ar?'الحالة':'State'}<select className="rounded-lg border p-2" value={mode} onChange={e=>{setMode(e.target.value);setDestination(null);setDone(false);}}>{[['sample','بيانات جاهزة'],['loading','تحميل'],['empty','مجموعات خالية'],['error','خطأ القراءة'],['foreign','بيانات تيننت آخر'],['pagesOnly','صفحات بلا تحليل'],['missingDates','تواريخ غير متوفرة']].map(([key,label])=><option key={key} value={key}>{ar?label:key}</option>)}</select></label></div>
    </aside>
    {destination && <aside role="status" className="rounded-xl border p-4 space-y-3"><p>{ar?'اختيرت الوجهة: ':'Selected destination: '}{destinations[destination]}</p><p>{ar?'في التطبيق يفتح الزر القسم المقابل. هذه المعاينة تفحص بطاقات المجموعات فقط، دون محاكاة محرر آخر.':'In the app, this opens the corresponding workspace. This preview checks group cards and does not simulate another editor.'}</p><button className="underline" onClick={()=>setDestination(null)}>{ar?'إغلاق':'Close'}</button></aside>}
    {done && <p role="status">{ar?'اكتملت عملية الحذف التوضيحية فقط؛ بيانات البطاقات ثابتة للمعاينة.':'The example removal completed; card data remains a fixed preview fixture.'}</p>}
    <KnowledgeSourceGroupsView merchantId={970163} data={data} loading={mode==='loading'} error={mode==='error'} onRefresh={()=>setMode('sample')} onUpload={()=>setDestination('upload')} onManage={setDestination} onRemove={setTarget}/>
    <KnowledgeRemovalView scopeKey={scopeKey} target={target} onClose={()=>setTarget(null)} api={{
      review: async choice=>{const r=removalFixture(choice,970163,970163);r.businessName=data.businessName; if(choice.kind==='document')r.counts.documents=data.documents.total;if(choice.kind==='products')r.counts.products=data.products.total;if(choice.kind==='website'){r.counts.analyses=data.website.analyses;r.counts.pages=data.website.pages;}if(choice.kind==='faqs')r.counts.faqs=data.faqs.total;return r;},
      send: async input=>{const p=readRemovalAttempt(scopeKey)!;return removalFixtureReceipt(p.review,input.requestId);},
      receipt: async input=>{const p=readRemovalAttempt(scopeKey);return p?removalFixtureReceipt(p.review,input.requestId):null;}, changed:()=>setDone(true),
    }}/>
  </main></GroupsLanguage.Provider>;
}
createRoot(document.getElementById('knowledge-groups-preview')!).render(<Preview/>);
