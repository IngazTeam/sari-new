import React, {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import LanguageSettings from "../../../client/src/pages/merchant/LanguageSettings";
import HumanTakeoverSettings from "../../../client/src/pages/merchant/HumanTakeoverSettings";
import { discardAssistantOptionDraft } from "../../../client/src/lib/assistant-option-draft";
import { useMerchantViewport } from "../../../client/src/lib/merchant-viewport";
import {
  AssistantOptionPreviewModel,
  optionModes,
  type OptionMode,
} from "./assistant-option-preview-model";
import { AssistantOptionPreviewContext } from "./assistant-option-preview-api";
import { AssistantOptionPreviewLanguage } from "./assistant-option-preview-i18n";
const labels = {
  ar: [
    "الخيارات والسجل",
    "سجل فارغ",
    "قراءة فقط",
    "انقطاع قبل الحفظ",
    "فقدان الرد بعد الحفظ",
    "تعارض من نافذة أخرى",
    "تعذر تحميل الخيارات",
    "تعذر تحميل المحادثات",
    "تعذر التحقق بعد الحفظ",
    "نتيجة حفظ لمتجر آخر",
  ],
  en: [
    "Options and history",
    "Empty history",
    "Read only",
    "Disconnect before save",
    "Lost response after save",
    "Concurrent edit conflict",
    "Options unavailable",
    "Conversations unavailable",
    "Review unavailable after save",
    "Save result for another store",
  ],
};
function Preview() {
  useMerchantViewport();
  const [language, setLanguage] = useState<"ar" | "en">("ar"),
    [merchantId, setMerchant] = useState(177),
    [mode, setMode] = useState<OptionMode>("normal"),
    [generation, setGeneration] = useState(0),
    [resetError, setResetError] = useState(false);
  const [page, setPage] = useState(
    new URLSearchParams(location.search).get("page") === "takeover"
      ? "takeover"
      : "language"
  );
  const model = useMemo(
    () => new AssistantOptionPreviewModel(merchantId, sessionStorage),
    [merchantId]
  );
  useSyncExternalStore(model.subscribe, model.snapshot);
  const ar = language === "ar";
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = ar ? "rtl" : "ltr";
  }, [language, ar]);
  function scenario(value: OptionMode) {
    try {
      model.reset(value);
      setMode(value);
      setGeneration(n => n + 1);
      setResetError(false);
    } catch {
      setResetError(true);
    }
  }
  return (
    <AssistantOptionPreviewLanguage.Provider value={language}>
      <AssistantOptionPreviewContext.Provider value={model}>
        <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
          <a className="underline" href="./#/page/merchant/ai-hub">
            {ar ? "العودة إلى مركز المساعد" : "Back to the assistant hub"}
          </a>
          <aside className="space-y-3 rounded-xl border bg-muted/40 p-4">
            <h1 className="text-xl font-semibold">
              {ar ? "موك أب خيارات المساعد" : "Assistant options preview"}
            </h1>
            <p>
              {ar
                ? "شاشات التطبيق الفعلية ببيانات محاكاة منفصلة. لا اتصال بمتجر أو مزود أو واتساب. الإعدادات والمسودات التجريبية تبقى في هذا التبويب. تغيير الحالة يعيد البيانات التجريبية ويحتفظ بالمسودة للمراجعة."
                : "Actual application screens with separate simulated data. No store, provider or WhatsApp connection. Sample settings and drafts stay in this tab. Changing scenarios resets sample data and retains drafts for review."}
            </p>
            <div className="flex flex-wrap gap-3">
              <label className="grid gap-2">
                {ar ? "حالة التجربة" : "Scenario"}
                <select
                  className="rounded-lg border bg-background p-2"
                  value={mode}
                  onChange={e => scenario(e.target.value as OptionMode)}
                >
                  {optionModes.map((value, i) => (
                    <option key={value} value={value}>
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
                  onChange={e => setLanguage(e.target.value as "ar" | "en")}
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
                  onChange={e => {
                    setMerchant(Number(e.target.value));
                    setMode("normal");
                  }}
                >
                  <option value="177">A · 177</option>
                  <option value="178">B · 178</option>
                </select>
              </label>
              <button
                type="button"
                className="rounded-lg border bg-background px-3"
                onClick={() => {
                  const removed = ["assistant-language", "human-takeover"].map(
                    slot =>
                      discardAssistantOptionDraft(
                        `${model.actorId}:${merchantId}:${slot}`
                      )
                  );
                  if (removed.some(value => !value)) {
                    setResetError(true);
                    return;
                  }
                  scenario(mode);
                }}
              >
                {ar
                  ? "إعادة بيانات التجربة ومسوداتها"
                  : "Reset sample data and drafts"}
              </button>
            </div>
            <p role="status">
              {ar
                ? `محاولات الحفظ: ${model.writes} · قراءات التحقق: ${model.reads}`
                : `Save attempts: ${model.writes} · Verification reads: ${model.reads}`}
            </p>
            {resetError && (
              <p role="alert">
                {ar
                  ? "تعذر إعادة البيانات المحلية. راجع تخزين المتصفح."
                  : "Local reset failed. Check browser storage."}
              </p>
            )}
            <nav
              className="flex flex-wrap gap-2"
              aria-label={ar ? "صفحات الخيارات" : "Option pages"}
            >
              {["language", "takeover"].map(value => (
                <button
                  key={value}
                  type="button"
                  className="rounded-lg border bg-background px-3 py-2"
                  aria-pressed={page === value}
                  onClick={() => {
                    setPage(value);
                    const url = new URL(location.href);
                    url.searchParams.set("page", value);
                    history.replaceState(null, "", url);
                  }}
                >
                  {value === "language"
                    ? ar
                      ? "لغة المساعد"
                      : "Assistant language"
                    : ar
                      ? "التدخل البشري"
                      : "Human takeover"}
                </button>
              ))}
            </nav>
          </aside>
          <div key={`${merchantId}:${generation}:${page}`}>
            {page === "language" ? (
              <LanguageSettings />
            ) : (
              <HumanTakeoverSettings />
            )}
          </div>
        </main>
        <Toaster position="bottom-center" />
      </AssistantOptionPreviewContext.Provider>
    </AssistantOptionPreviewLanguage.Provider>
  );
}
createRoot(document.getElementById("assistant-option-preview")!).render(
  <Preview />
);
