import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { KnowledgeActivityView } from "../../../client/src/components/KnowledgeActivityWorkspace";
import { useMerchantViewport } from "../../../client/src/lib/merchant-viewport";
import { activityFixture } from "./knowledge-activity-fixture";
import { ActivityLanguage } from "./knowledge-activity-preview-i18n";
function Preview() {
  useMerchantViewport();
  const [language, setLanguage] = useState<"ar" | "en">("ar"),
    [mode, setMode] = useState("sample"),
    [filter, setFilter] = useState("all"),
    [page, setPage] = useState(1);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);
  const ar = language === "ar",
    data = activityFixture(filter, page, !ar);
  if (mode === "empty") {
    data.items = [];
    data.total = 0;
    data.totalPages = 0;
    data.page = 1;
    data.actionTypes = [];
  }
  if (mode === "foreign") data.merchantId = 970161;
  if (mode === "truncated") {
    data.actionTypes = Array.from({ length: 200 }, (_, i) => `extra_${i}`);
    data.actionTypesTruncated = true;
  }
  return (
    <ActivityLanguage.Provider value={language}>
      <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
        <a href="./#/page/merchant/sari-brain" className="underline">
          {ar ? "العودة إلى عقل ساري" : "Back to Sari Brain"}
        </a>
        <aside className="rounded-xl border bg-muted/40 p-4 space-y-4">
          <h1 className="text-xl font-semibold">
            {ar ? "معاينة سجل المعرفة" : "Knowledge history preview"}
          </h1>
          <p>
            {ar
              ? "مكوّن التطبيق نفسه مع23 نشاطًا توضيحيًا. لا يتصل بالخادم أو يغير المعرفة. جرّب فلترًا خاليًا والتنقل بين الصفحات."
              : "The actual component with 23 example events. It does not contact a server or change knowledge. Try an empty filter and page navigation."}
          </p>
          <div className="flex flex-wrap gap-3">
            <label className="grid gap-2">
              {ar ? "اللغة" : "Language"}
              <select
                className="rounded-lg border p-2"
                value={language}
                onChange={e => setLanguage(e.target.value as typeof language)}
              >
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="grid gap-2">
              {ar ? "الحالة" : "State"}
              <select
                className="rounded-lg border p-2"
                value={mode}
                onChange={e => setMode(e.target.value)}
              >
                {[
                  ["sample", "بيانات جاهزة"],
                  ["loading", "تحميل"],
                  ["empty", "فارغ"],
                  ["error", "خطأ القراءة"],
                  ["foreign", "بيانات تيننت مختلف مرفوضة"],
                  ["truncated", "أكثر من200 نوع"],
                ].map(([k, v]) => (
                  <option key={k} value={k}>
                    {ar ? v : k}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </aside>
        <KnowledgeActivityView
          merchantId={970160}
          data={data}
          loading={mode === "loading"}
          error={mode === "error"}
          filter={filter}
          onFilter={next => {
            setFilter(next);
            setPage(1);
          }}
          onPage={setPage}
          onRefresh={() => setMode("sample")}
        />
      </main>
    </ActivityLanguage.Provider>
  );
}
createRoot(document.getElementById("knowledge-activity-preview")!).render(
  <Preview />
);
