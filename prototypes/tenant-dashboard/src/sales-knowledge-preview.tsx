import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { SalesKnowledgeGroupView } from "../../../client/src/components/SalesKnowledgeReadout";
import { useMerchantViewport } from "../../../client/src/lib/merchant-viewport";
import { salesKnowledgeFixture } from "./sales-knowledge-fixture";
import { SalesLanguage } from "./sales-knowledge-preview-i18n";
function Preview() {
  useMerchantViewport();
  const [language, setLanguage] = useState<"ar" | "en">("ar"),
    [mode, setMode] = useState("sample"),
    [kind, setKind] = useState<"sales_intel" | "opportunities">("sales_intel"),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<number | null>(null),
    [destination, setDestination] = useState(false);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);
  const ar = language === "ar",
    rows = salesKnowledgeFixture(kind, !ar);
  const detail = rows.find(r => r.section.id === selected);
  return (
    <SalesLanguage.Provider value={language}>
      <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
        <a className="underline" href="./#/page/merchant/sari-brain">
          {ar ? "العودة إلى عقل ساري" : "Back to Sari Brain"}
        </a>
        <aside className="rounded-xl border bg-muted/40 p-4 space-y-3">
          <h1 className="text-xl font-semibold">
            {ar
              ? "معاينة أقسام معرفة المبيعات"
              : "Sales knowledge sections preview"}
          </h1>
          <p>
            {ar
              ? "مكوّن التطبيق نفسه مع عشرة أقسام توضيحية لكل نوع. حالات الأهلية ثابتة في المثال ولا تُحلل معرفة تيننت فعلي. زر الإدارة يعرض وجهته فقط."
              : "The actual component with ten example sections per type. Eligibility states are fixed examples, not analysis of actual tenant knowledge. The management button only shows its destination."}
          </p>
          <div className="flex flex-wrap gap-3">
            <label className="grid gap-2">
              {ar ? "اللغة" : "Language"}
              <select
                className="rounded-lg border bg-background p-2"
                value={language}
                onChange={e => setLanguage(e.target.value as "ar" | "en")}
              >
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="grid gap-2">
              {ar ? "نوع القسم" : "Section type"}
              <select
                className="rounded-lg border bg-background p-2"
                value={kind}
                onChange={e => {
                  setKind(e.target.value as typeof kind);
                  setSelected(null);
                  setPage(1);
                }}
              >
                <option value="sales_intel">
                  {ar ? "إرشادات المبيعات" : "Sales guidance"}
                </option>
                <option value="opportunities">
                  {ar ? "اقتراحات التطوير" : "Improvement suggestions"}
                </option>
              </select>
            </label>
            <label className="grid gap-2">
              {ar ? "حالة المثال" : "Example state"}
              <select
                className="rounded-lg border bg-background p-2"
                value={mode}
                onChange={e => setMode(e.target.value)}
              >
                {[
                  ["sample", "أقسام بحالات مختلفة", "Mixed section states"],
                  ["loading", "جارٍ قراءة القائمة", "Loading list"],
                  ["error", "فشل قراءة القائمة", "List read failed"],
                  ["empty", "لا أقسام", "No sections"],
                  [
                    "detail-loading",
                    "جارٍ قراءة النص المختار",
                    "Loading selected text",
                  ],
                  [
                    "detail-error",
                    "فشل قراءة النص المختار",
                    "Selected text failed",
                  ],
                ].map(([id, a, e]) => (
                  <option key={id} value={id}>
                    {ar ? a : e}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {destination && (
            <p role="status">
              {ar
                ? "الوجهة: المعرفة والفجوات ← أقسام المعرفة. لا يحدث تعديل من هذه المعاينة."
                : "Destination: Knowledge and gaps → Knowledge sections. This preview makes no changes."}
            </p>
          )}
        </aside>
        <SalesKnowledgeGroupView
          kind={kind}
          data={{
            items:
              mode === "empty"
                ? []
                : rows.slice((page - 1) * 8, page * 8).map(r => r.section),
            total: mode === "empty" ? 0 : 10,
            page,
            totalPages: mode === "empty" ? 1 : 2,
          }}
          loading={mode === "loading"}
          error={mode === "error"}
          selected={selected}
          detail={detail}
          detailLoading={mode === "detail-loading"}
          detailError={mode === "detail-error"}
          onPage={next => {
            setPage(next);
            setSelected(null);
          }}
          onOpen={setSelected}
          onRefresh={() => {
            setMode("sample");
            setSelected(null);
          }}
          onRefreshDetail={() => setMode("sample")}
          onManage={() => setDestination(true)}
        />
      </main>
    </SalesLanguage.Provider>
  );
}
createRoot(document.getElementById("sales-knowledge-preview")!).render(
  <Preview />
);
