import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ReplyQualityReadoutView } from "../../../client/src/components/ReplyQualityReadout";
import { useMerchantViewport } from "../../../client/src/lib/merchant-viewport";
import { qualityFixture } from "../../../server/tests/helpers/quality-fixture";
import { qualityFlag } from "../../../shared/quality-readout";
import { QualityLanguage } from "./reply-quality-preview-i18n";
function Preview() {
  useMerchantViewport();
  const [language, setLanguage] = useState<"ar" | "en">("ar"),
    [mode, setMode] = useState("sample"),
    [days, setDays] = useState(30);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);
  const ar = language === "ar",
    data = qualityFixture(days);
  if (mode === "empty") data.totalResponses = 0;
  if (mode === "unknown") {
    data.cache = qualityFlag(20, 0, 0);
    data.shortResponses = qualityFlag(20, 0, 0);
    data.escalation = qualityFlag(20, 0, 0);
    data.avgResponseTimeMs = null;
    data.responseTimeSamples = 0;
    data.sentiment = { positive: 0, neutral: 0, negative: 0, unknown: 20 };
  }
  if (mode === "trend")
    data.trend = {
      state: "improving",
      current: qualityFlag(6, 0, 6),
      previous: qualityFlag(5, 2, 3),
    };
  return (
    <QualityLanguage.Provider value={language}>
      <main
        dir={ar ? "rtl" : "ltr"}
        className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5"
      >
        <a className="underline" href="./#/page/merchant/sari-brain">
          {ar ? "العودة إلى عقل ساري" : "Back to Sari Brain"}
        </a>
        <aside className="rounded-xl border bg-muted/40 p-4 space-y-3">
          <h1 className="text-xl font-semibold">
            {ar ? "معاينة سجل توليد الردود" : "Reply generation log preview"}
          </h1>
          <p>
            {ar
              ? "شاشة التطبيق ببيانات توضيحية ثابتة. تبديل الفترة يوضح نطاق العرض ولا يشغّل تحليلًا أو يعيد حساب سجلات تيننت فعلي. تحديث السجل يعيد الحالة التوضيحية."
              : "The application screen with fixed sample data. Changing the period demonstrates the range without analysing or recalculating actual tenant records. Refresh returns to the sample state."}
          </p>
          <div className="flex flex-wrap gap-3">
            <label className="grid gap-2">
              {ar ? "اللغة" : "Language"}
              <select
                className="rounded-lg border p-2 bg-background"
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
                className="rounded-lg border p-2 bg-background"
                value={mode}
                onChange={e => setMode(e.target.value)}
              >
                {[
                  [
                    "sample",
                    "بيانات وعينة مقارنة صغيرة",
                    "Data with insufficient trend sample",
                  ],
                  ["loading", "جارٍ القراءة", "Loading"],
                  ["error", "تعذر القراءة", "Read error"],
                  ["empty", "لا سجلات", "No records"],
                  ["unknown", "مقاييس مجهولة", "Unknown metrics"],
                  ["trend", "مقارنة بعينتين", "Two-sample trend"],
                ].map(([id, a, e]) => (
                  <option key={id} value={id}>
                    {ar ? a : e}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </aside>
        <ReplyQualityReadoutView
          days={days}
          onDaysChange={setDays}
          data={data}
          loading={mode === "loading"}
          error={mode === "error"}
          onRefresh={() => setMode("sample")}
        />
      </main>
    </QualityLanguage.Provider>
  );
}
createRoot(document.getElementById("quality-preview")!).render(<Preview />);
