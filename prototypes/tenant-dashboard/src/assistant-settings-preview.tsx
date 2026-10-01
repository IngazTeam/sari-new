import React, {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import BotSettings from "../../../client/src/pages/merchant/BotSettings";
import AIWhatsAppHub from "../../../client/src/pages/merchant/AIWhatsAppHub";
import {
  discardAssistantDraft,
  assistantDraftKey,
} from "../../../client/src/lib/assistant-draft-cache";
import { useMerchantViewport } from "../../../client/src/lib/merchant-viewport";
import {
  AssistantSettingsPreviewModel,
  settingsModes,
  type SettingsMode,
} from "./assistant-settings-preview-model";
import { AssistantSettingsPreviewContext } from "./assistant-settings-preview-api";
import { AssistantSettingsPreviewLanguage } from "./assistant-settings-preview-i18n";
const labels = {
  ar: [
    "الإعدادات والسياسات",
    "رسائل وسجل فارغان",
    "قراءة فقط",
    "انقطاع قبل الحفظ",
    "فقدان الرد بعد الحفظ",
    "تعارض من نافذة أخرى",
    "تعذر تحميل الإعدادات",
    "تعذر التحقق بعد الحفظ",
    "نتيجة حفظ لمتجر آخر",
    "تعذر تحميل سياسات البيع",
    "تعذر قراءة حالة الرد",
    "فشل تجربة الرد",
    "فشل محاكاة إرسال واتساب",
  ],
  en: [
    "Settings and policies",
    "Empty messages and history",
    "Read only",
    "Disconnect before save",
    "Lost response after save",
    "Concurrent edit conflict",
    "Settings unavailable",
    "Review unavailable after save",
    "Save result for another store",
    "Sales policies unavailable",
    "Reply status unavailable",
    "Reply preview failed",
    "WhatsApp simulation failed",
  ],
};
function Preview() {
  useMerchantViewport();
  const hub = new URLSearchParams(location.search).get("page") === "hub";
  const [language, setLanguage] = useState<"ar" | "en">("ar"),
    [merchantId, setMerchant] = useState(181),
    [mode, setMode] = useState<SettingsMode>("normal"),
    [generation, setGeneration] = useState(0),
    [resetError, setResetError] = useState(false);
  const model = useMemo(
    () => new AssistantSettingsPreviewModel(merchantId, sessionStorage),
    [merchantId],
  );
  useSyncExternalStore(model.subscribe, model.snapshot);
  const ar = language === "ar";
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = ar ? "rtl" : "ltr";
  }, [language, ar]);
  function scenario(value: SettingsMode) {
    try {
      model.reset(value);
      setMode(value);
      setGeneration((n) => n + 1);
      setResetError(false);
    } catch {
      setResetError(true);
    }
  }
  return (
    <AssistantSettingsPreviewLanguage.Provider value={language}>
      <AssistantSettingsPreviewContext.Provider value={model}>
        <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
          {!hub && (
            <a className="underline" href="./#/page/merchant/ai-hub">
              {ar ? "العودة إلى مركز المساعد" : "Back to the assistant hub"}
            </a>
          )}
          <aside className="space-y-3 rounded-xl border bg-muted/40 p-4">
            <h1 className="text-xl font-semibold">
              {hub
                ? ar
                  ? "موك أب مركز المساعد"
                  : "Assistant hub preview"
                : ar
                  ? "موك أب سلوك المساعد وصلاحيات البيع"
                  : "Assistant behaviour and sales policies preview"}
            </h1>
            <p>
              {hub
                ? ar
                  ? "شاشة التطبيق الفعلية. روابط الأقسام تفتح بيانات محاكاة محلية؛ لا اتصال بمتجر أو خدمات خارجية."
                  : "Actual application screen. Section links open local sample data; no store or external service connection."
                : ar
                  ? "شاشة التطبيق الفعلية ببيانات محاكاة معزولة. لا اتصال بمتجر أو ذكاء اصطناعي أو واتساب؛ الردود أمثلة ثابتة لا تقيس جودة المعرفة أو المبيعات. تبقى بيانات التجربة ومسودة السلوك في هذا التبويب. تغيير الحالة يعيد بيانات التجربة ويحافظ على مسودة السلوك؛ مسودات سياسات البيع مؤقتة داخل الصفحة."
                  : "Actual application screen with isolated sample data. No store, AI, or WhatsApp connection; replies are fixed layout samples and do not measure knowledge or sales quality. Sample data and behaviour drafts stay in this tab. Changing scenarios resets sample data and retains the behaviour draft; sales policy drafts are temporary within the page."}
            </p>
            <div className="flex flex-wrap gap-3">
              {!hub && (
                <label className="grid gap-2">
                  {ar ? "حالة التجربة" : "Scenario"}
                  <select
                    className="max-w-full rounded-lg border bg-background p-2"
                    value={mode}
                    onChange={(e) => scenario(e.target.value as SettingsMode)}
                  >
                    {settingsModes.map((value, i) => (
                      <option key={value} value={value}>
                        {labels[language][i]}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="grid gap-2">
                {ar ? "لغة اللوحة" : "Interface language"}
                <select
                  className="rounded-lg border bg-background p-2"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as "ar" | "en")}
                >
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                </select>
              </label>
              {!hub && (
                <>
                  <label className="grid gap-2">
                    {ar ? "تيننت المحاكاة" : "Simulated tenant"}
                    <select
                      className="rounded-lg border bg-background p-2"
                      value={merchantId}
                      onChange={(e) => {
                        setMerchant(Number(e.target.value));
                        setMode("normal");
                      }}
                    >
                      <option value="181">A · 181</option>
                      <option value="182">B · 182</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="rounded-lg border bg-background px-3"
                    onClick={() => {
                      if (
                        !discardAssistantDraft(
                          assistantDraftKey(model.actorId, merchantId),
                        )
                      ) {
                        setResetError(true);
                        return;
                      }
                      scenario(mode);
                    }}
                  >
                    {ar
                      ? "إعادة بيانات التجربة ومسودة السلوك"
                      : "Reset sample data and behaviour draft"}
                  </button>
                </>
              )}
            </div>
            {!hub && (
              <p role="status">
                {ar
                  ? `محاولات الحفظ: ${model.writes} · قراءات التحقق: ${model.reads} · أمثلة الرد: ${model.previews} · محاكاة الإرسال: ${model.sends}`
                  : `Save attempts: ${model.writes} · Verification reads: ${model.reads} · Reply samples: ${model.previews} · Simulated sends: ${model.sends}`}
              </p>
            )}
            {resetError && (
              <p role="alert">
                {ar
                  ? "تعذر إعادة البيانات المحلية. راجع تخزين المتصفح."
                  : "Local reset failed. Check browser storage."}
              </p>
            )}
          </aside>
          {hub ? (
            <AIWhatsAppHub />
          ) : (
            <BotSettings key={`${merchantId}:${generation}`} />
          )}
        </main>
        <Toaster position="bottom-center" />
      </AssistantSettingsPreviewContext.Provider>
    </AssistantSettingsPreviewLanguage.Provider>
  );
}
createRoot(document.getElementById("assistant-settings-preview")!).render(
  <Preview />,
);
