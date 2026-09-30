import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  WebsiteAnalysisDialog,
  type WebsiteAnalysisIssue,
} from "../../../client/src/components/WebsiteAnalysisDialog";
import { AnalysisLanguage } from "./website-analysis-preview-i18n";
import { useMerchantViewport } from "../../../client/src/lib/merchant-viewport";
const sample = {
  title: "متجر المثال · Example store",
  score: 68,
  crawlStats: {
    pagesDiscovered: 12,
    pagesCrawled: 8,
    pagesSuccess: 6,
    mainPageWords: 420,
    totalWords: 1930,
  },
  knowledgeEvolution: { added: 2, evolved: 1, conflicts: 3 },
  salesIntelSummary: {
    totalSections: 9,
    hasIntel: true,
    hasOpportunities: false,
  },
};
function Preview() {
  useMerchantViewport();
  const [language, setLanguage] = useState<"ar" | "en">("ar"),
    [mode, setMode] = useState("partial"),
    [open, setOpen] = useState(false),
    [target, setTarget] = useState("");
  const choices = [
    ["request", "طلب التحليل", "Request pending"],
    ["scraping", "قراءة الموقع", "Reading website"],
    ["knowledge", "تصنيف المعرفة", "Classifying knowledge"],
    ["embedding", "محاولة الفهرسة", "Attempting indexing"],
    ["readError", "تعذر قراءة الحالة", "Status read error"],
    ["startUnconfirmed", "بدء غير مؤكد", "Unconfirmed start"],
    ["missing", "حالة غير متاحة", "Unavailable status"],
    ["failed", "تعثر المعالجة", "Processing error"],
    ["partial", "نتيجة جزئية", "Partial outcome"],
    ["finished", "نتيجة مكتملة البيانات", "Outcome with metrics"],
    ["unknown", "مقاييس غير متاحة", "Unavailable metrics"],
  ];
  const ar = language === "ar";
  const issue = ["startUnconfirmed", "missing", "failed"].includes(mode)
    ? (mode as WebsiteAnalysisIssue)
    : null;
  const result =
    mode === "partial"
      ? { ...sample, knowledgeError: "Demonstration only" }
      : mode === "finished"
        ? sample
        : mode === "unknown"
          ? {}
          : null;
  return (
    <AnalysisLanguage.Provider value={language}>
      <main
        dir={ar ? "rtl" : "ltr"}
        className="max-w-3xl mx-auto p-6 space-y-6"
      >
        <a href="./#/page/merchant/sari-brain" className="underline">
          {ar ? "العودة إلى عقل ساري" : "Back to Sari Brain"}
        </a>
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <h1 className="text-2xl font-semibold">
            {ar
              ? "معاينة نتائج تحليل الموقع"
              : "Website analysis outcome preview"}
          </h1>
          <p>
            {ar
              ? "هذه شاشة التطبيق الفعلية ببيانات توضيحية. لا يتم جلب موقع أو تحليل ملف أو تعديل معرفة، ولا توجد نسبة مبيعات مقاسة هنا."
              : "The actual application screen with sample data. No website fetch, file analysis or knowledge changes take place. No sales proficiency was measured."}
          </p>
          <label className="grid gap-2">
            {ar ? "لغة العرض" : "Display language"}
            <select
              className="border rounded-lg p-3 bg-background"
              value={language}
              onChange={e => setLanguage(e.target.value as "ar" | "en")}
            >
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </label>
          <label className="grid gap-2">
            {ar ? "حالة المثال" : "Example state"}
            <select
              className="border rounded-lg p-3 bg-background"
              value={mode}
              onChange={e => setMode(e.target.value)}
            >
              {choices.map(([id, a, e]) => (
                <option key={id} value={id}>
                  {ar ? a : e}
                </option>
              ))}
            </select>
          </label>
          <button
            className="rounded-lg bg-primary text-primary-foreground px-4 py-3"
            onClick={() => {
              setTarget("");
              setOpen(true);
            }}
          >
            {ar ? "فتح الشاشة" : "Open screen"}
          </button>
          {target && (
            <p role="status">
              {ar
                ? "الوجهة المختارة في المثال: "
                : "Selected example destination: "}
              {target}.{" "}
              {ar
                ? "لا تتغير بيانات صفحات المثال الأخرى."
                : "Other example pages remain unchanged."}
            </p>
          )}
        </div>
        <WebsiteAnalysisDialog
          open={open}
          onOpenChange={setOpen}
          result={result}
          issue={issue}
          pending={mode === "request"}
          currentStep={mode}
          progress={
            mode === "scraping"
              ? 20
              : mode === "knowledge"
                ? 60
                : mode === "embedding"
                  ? 85
                  : 0
          }
          statusError={mode === "readError"}
          statusFetching={false}
          onReadStatus={() => setMode("scraping")}
          onOpenDestination={setTarget}
        />
      </main>
    </AnalysisLanguage.Provider>
  );
}
createRoot(document.getElementById("analysis-preview")!).render(<Preview />);
