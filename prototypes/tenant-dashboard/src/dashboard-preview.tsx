import React, {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import Dashboard from "../../../client/src/pages/merchant/Dashboard";
import { useMerchantViewport } from "../../../client/src/lib/merchant-viewport";
import {
  DashboardPreviewModel,
  dashboardModes,
  type DashboardMode,
} from "./dashboard-preview-model";
import { DashboardPreviewContext } from "./dashboard-preview-api";
import { DashboardPreviewLanguage } from "./dashboard-preview-i18n";
import { useSearch, updatePreviewSearch } from "./dashboard-preview-router";
const labels = {
  ar: [
    "حالة عادية",
    "متجر جديد بلا بيانات",
    "تحميل المتجر",
    "فشل القراءات",
    "فشل تحديد المتجر",
    "قيم وعناصر ناقصة",
    "لقطة تخص متجرًا آخر",
    "فشل مع بيانات قديمة",
    "تجربة نشطة",
    "تجربة منتهية",
    "موعد نهاية مجهول",
    "فشل قراءة الاشتراك",
    "المساعد متوقف",
    "خارج وقت العمل",
    "فشل قراءة حالة المساعد",
    "جارٍ المزامنة",
    "خطأ المزامنة",
    "مزامنة متوقفة",
    "فشل الاقتراح ثم نجاح إعادة المحاولة",
  ],
  en: [
    "Normal",
    "Empty store",
    "Store loading",
    "Reads failed",
    "Store unavailable",
    "Incomplete values and items",
    "Snapshot for another store",
    "Failed read with stale data",
    "Active trial",
    "Expired trial",
    "Unknown trial end",
    "Subscription unavailable",
    "Assistant disabled",
    "Outside working hours",
    "Schedule unavailable",
    "Syncing",
    "Sync error",
    "Sync paused",
    "Suggestion failed, then retry succeeds",
  ],
};
function Preview() {
  useMerchantViewport();
  const search = useSearch(),
    params = new URLSearchParams(search),
    language = params.get("lang") === "en" ? "en" : "ar",
    ar = language === "ar";
  const merchantId = params.get("tenant") === "199" ? 199 : 198,
    raw = params.get("scenario"),
    mode: DashboardMode = dashboardModes.includes(raw as DashboardMode)
      ? (raw as DashboardMode)
      : "normal";
  const [generation, setGeneration] = useState(0);
  const model = useMemo(
    () => new DashboardPreviewModel(merchantId, mode),
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
    <DashboardPreviewLanguage.Provider value={language}>
      <DashboardPreviewContext.Provider value={model}>
        <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
          <aside
            className="space-y-3 rounded-xl border bg-muted/40 p-4"
            aria-label={ar ? "خيارات الموك أب" : "Preview controls"}
          >
            <h2 className="text-xl font-semibold">
              {ar ? "موك أب الرئيسية الفعلية" : "Actual dashboard preview"}
            </h2>
            <p>
              {ar
                ? "بيانات محاكاة محلية معزولة. الأرقام والملفات والاقتراحات أمثلة لتجربة التصميم ولا تثبت أداء المساعد أو نسبة احتراف المبيعات. إعادة التحميل تعيد بيانات المثال."
                : "Isolated local sample data. Figures, files and suggestions demonstrate the design, not assistant performance or sales proficiency. Reloading resets sample data."}
            </p>
            <div className="flex flex-wrap gap-3">
              <label className="grid min-w-0 gap-2">
                {ar ? "حالة التجربة" : "Scenario"}
                <select
                  className="max-w-full rounded-lg border bg-background p-2"
                  value={mode}
                  onChange={e => change("scenario", e.target.value)}
                >
                  {dashboardModes.map((item, i) => (
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
                  <option value="198">A · 198 · SAR</option>
                  <option value="199">B · 199 · USD</option>
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
            <p role="status">
              {ar ? "طلبات الاقتراح المحلي: " : "Local suggestion requests: "}
              {model.requests}
            </p>
          </aside>
          <Dashboard key={`${merchantId}:${mode}:${generation}`} />
        </main>
      </DashboardPreviewContext.Provider>
    </DashboardPreviewLanguage.Provider>
  );
}
createRoot(document.getElementById("dashboard-preview")!).render(<Preview />);
