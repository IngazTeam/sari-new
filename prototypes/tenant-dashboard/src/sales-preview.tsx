import React, {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import AnalyticsDashboard from "../../../client/src/pages/merchant/AnalyticsDashboard";
import { useMerchantViewport } from "../../../client/src/lib/merchant-viewport";
import {
  SalesPreviewModel,
  salesModes,
  type SalesMode,
} from "./sales-preview-model";
import { SalesPreviewContext } from "./sales-preview-api";
import { SalesPreviewLanguage } from "./sales-preview-i18n";
import { useSearch, updatePreviewSearch } from "./sales-preview-router";
const labels = {
  ar: [
    "عادية",
    "بلا بيانات",
    "تحميل المتجر",
    "تحميل الأقسام",
    "فشل القراءات",
    "فشل المتجر",
    "فشل الرسم فقط",
    "فشل مع بيانات قديمة",
    "تغير عملة المتجر",
  ],
  en: [
    "Normal",
    "Empty",
    "Store loading",
    "Sections loading",
    "Reads failed",
    "Store unavailable",
    "Only trend failed",
    "Failed with stale data",
    "Store currency changed",
  ],
};
function Preview() {
  useMerchantViewport();
  const search = useSearch(),
    params = new URLSearchParams(search),
    language = params.get("lang") === "en" ? "en" : "ar",
    ar = language === "ar";
  const merchantId = params.get("tenant") === "207" ? 207 : 206,
    raw = params.get("scenario"),
    mode: SalesMode = salesModes.includes(raw as SalesMode)
      ? (raw as SalesMode)
      : "normal";
  const [generation, setGeneration] = useState(0);
  const model = useMemo(
    () => new SalesPreviewModel(merchantId, mode),
    [merchantId, mode, generation]
  );
  useSyncExternalStore(model.subscribe, model.snapshot);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = ar ? "rtl" : "ltr";
  }, [language, ar]);
  const change = (key: string, value: string) => {
    const next = new URLSearchParams(search);
    next.set(key, value);
    updatePreviewSearch(next);
  };
  return (
    <SalesPreviewLanguage.Provider value={language}>
      <SalesPreviewContext.Provider value={model}>
        <main className="mw-main space-y-5">
          <aside
            className="space-y-3 rounded-xl border bg-muted/40 p-4"
            aria-label={ar ? "خيارات الموك أب" : "Preview controls"}
          >
            <h2 className="text-xl font-semibold">
              {ar
                ? "موك أب تحليلات المبيعات"
                : "Actual sales analytics preview"}
            </h2>
            <p>
              {ar
                ? "بيانات مثال محلية معزولة؛ لا تثبت مبيعات فعلية أو نسبة احتراف المساعد. جرّب الفترة والأقسام الخمسة وحالات الفشل والاستعادة."
                : "Isolated local sample data, not actual sales or assistant proficiency. Try the period, five sections, failures and recovery."}
            </p>
            <div className="flex flex-wrap gap-3">
              <label className="grid min-w-0 gap-2">
                {ar ? "حالة التجربة" : "Scenario"}
                <select
                  className="max-w-full rounded-lg border bg-background p-2"
                  value={mode}
                  onChange={e => change("scenario", e.target.value)}
                >
                  {salesModes.map((item, i) => (
                    <option key={item} value={item}>
                      {labels[language][i]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2">
                {ar ? "لغة اللوحة" : "Interface language"}
                <select
                  className="rounded-lg border bg-background p-2"
                  value={language}
                  onChange={e => change("lang", e.target.value)}
                >
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label className="grid gap-2">
                {ar ? "تيننت المحاكاة" : "Simulated tenant"}
                <select
                  className="rounded-lg border bg-background p-2"
                  value={merchantId}
                  onChange={e => change("tenant", e.target.value)}
                >
                  <option value="206">A · 206 · SAR</option>
                  <option value="207">B · 207 · USD</option>
                </select>
              </label>
              <button
                type="button"
                className="rounded-lg border bg-background px-3"
                onClick={() => setGeneration(n => n + 1)}
              >
                {ar ? "إعادة الحالة" : "Reset scenario"}
              </button>
            </div>
            {(mode === "loading" || mode === "section-loading") && (
              <button type="button" onClick={() => model.complete()}>
                {ar ? "إنهاء التحميل التجريبي" : "Finish simulated loading"}
              </button>
            )}
            <p role="status">
              {ar ? "محاولات الاستعادة المحلية: " : "Local retries: "}
              {model.retries}
            </p>
          </aside>
          <AnalyticsDashboard key={`${merchantId}:${mode}:${generation}`} />
        </main>
      </SalesPreviewContext.Provider>
    </SalesPreviewLanguage.Provider>
  );
}
createRoot(document.getElementById("sales-preview")!).render(<Preview />);
