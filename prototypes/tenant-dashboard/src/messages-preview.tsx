import React, {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import { MessageWorkspace } from "../../../client/src/components/merchant/MessageWorkspace";
import { setExportModel } from "./messages-preview-export";
import { Toaster, toast } from "sonner";
import { useMerchantViewport } from "../../../client/src/lib/merchant-viewport";
import {
  MessagesPreviewModel,
  messagesModes,
  type MessagesMode,
} from "./messages-preview-model";
import { MessagesPreviewContext } from "./messages-preview-api";
import { MessagesPreviewLanguage } from "./messages-preview-i18n";
import { useSearch, updatePreviewSearch } from "./messages-preview-router";
const labels = {
  ar: [
    "عادية",
    "بلا بيانات",
    "تحميل",
    "فشل القراءة",
    "اتصال غير متاح",
    "فشل تحديد المتجر",
    "دون صلاحية",
    "جلسة منتهية",
    "نتائج متجر آخر",
    "فشل مع بيانات قديمة",
    "تصدير معلق",
    "فشل تجهيز الملف",
  ],
  en: [
    "Normal",
    "Empty",
    "Loading",
    "Read failed",
    "Connection unavailable",
    "Store unavailable",
    "Forbidden",
    "Session expired",
    "Another store snapshot",
    "Failed with stale data",
    "Pending export",
    "Export preparation failed",
  ],
};
function Preview() {
  useMerchantViewport();
  const search = useSearch(),
    params = new URLSearchParams(search),
    language = params.get("lang") === "en" ? "en" : "ar",
    ar = language === "ar";
  const merchantId = params.get("tenant") === "209" ? 209 : 208,
    raw = params.get("scenario"),
    mode: MessagesMode = messagesModes.includes(raw as MessagesMode)
      ? (raw as MessagesMode)
      : "normal";
  const [generation, setGeneration] = useState(0);
  const model = useMemo(
    () => new MessagesPreviewModel(merchantId, mode),
    [merchantId, mode, generation]
  );
  setExportModel(model);
  useSyncExternalStore(model.subscribe, model.snapshot);
  useEffect(() => () => model.finishExports(), [model]);
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
    <MessagesPreviewLanguage.Provider value={language}>
      <MessagesPreviewContext.Provider value={model}>
        <main
          className="mw-main space-y-5"
          onClickCapture={event => {
            if((event.target as HTMLElement).closest?.('a[href="/support"]')){
              event.preventDefault();toast.info(ar?'الدعم في التطبيق الفعلي. هذه المعاينة لا ترسل طلبات دعم.':'Support is available in the application. This preview does not send support requests.');return;
            }
            const link = (event.target as HTMLElement).closest?.(
              'a[href="/login"]'
            );
            if (link) {
              event.preventDefault();
              model.complete();
            }
          }}
        >
          <aside
            className="space-y-3 rounded-xl border bg-muted/40 p-4"
            aria-label={ar ? "خيارات الموك أب" : "Preview controls"}
          >
            <h2 className="text-xl font-semibold">
              {ar
                ? "موك أب تحليلات الرسائل"
                : "Actual message analytics preview"}
            </h2>
            <p>
              {ar
                ? "بيانات مثال محلية معزولة؛ لا تثبت مبيعات فعلية أو نسبة احتراف المساعد. جرّب الفترة والأقسام الثلاثة وحالات الفشل والاستعادة."
                : "Isolated local sample data, not actual sales or assistant proficiency. Try the period, three sections, failures and recovery."}
            </p>
            <div className="flex flex-wrap gap-3">
              <label className="grid min-w-0 gap-2">
                {ar ? "حالة التجربة" : "Scenario"}
                <select
                  className="max-w-full rounded-lg border bg-background p-2"
                  value={mode}
                  onChange={e => change("scenario", e.target.value)}
                >
                  {messagesModes.map((item, i) => (
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
                  <option value="208">A · 208</option>
                  <option value="209">B · 209</option>
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
            {mode === "loading" && (
              <button type="button" onClick={() => model.complete()}>
                {ar ? "إنهاء التحميل التجريبي" : "Finish simulated loading"}
              </button>
            )}
            {model.pendingExports > 0 && (
              <button type="button" onClick={() => model.finishExports()}>
                {ar ? "أكمل تجهيز الملف المعلق" : "Complete pending file"}
              </button>
            )}
            <p role="status">
              {ar ? "محاولات الاستعادة المحلية: " : "Local retries: "}
              {model.retries}
            </p>
          </aside>
          <Toaster richColors position="bottom-center" />
          <MessageWorkspace key={`${merchantId}:${mode}:${generation}`} />
        </main>
      </MessagesPreviewContext.Provider>
    </MessagesPreviewLanguage.Provider>
  );
}
createRoot(document.getElementById("messages-preview")!).render(<Preview />);
