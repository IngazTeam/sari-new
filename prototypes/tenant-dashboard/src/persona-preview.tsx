import React, {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { VirtualTeamWorkspace } from "../../../client/src/pages/merchant/VirtualTeamPage";
import { discardVirtualTeamDraft } from "../../../client/src/lib/virtual-team-draft";
import { useMerchantViewport } from "../../../client/src/lib/merchant-viewport";
import {
  PersonaPreviewModel,
  personaModes,
  type PersonaMode,
} from "./persona-preview-model";
import { PersonaPreviewContext } from "./persona-preview-api";
import { PersonaPreviewLanguage } from "./persona-preview-i18n";
const labels = {
  ar: [
    "الفريق والحفظ",
    "فريق فارغ",
    "حد عشر شخصيات",
    "قراءة فقط",
    "انقطاع قبل الحفظ",
    "فقدان الرد بعد الحفظ",
    "تعذر قراءة الإيصال",
    "إيصال لتيننت آخر",
    "تعارض من نافذة أخرى",
    "تعذر تحميل الفريق",
  ],
  en: [
    "Team and save",
    "Empty team",
    "Ten-persona limit",
    "Read only",
    "Disconnect before save",
    "Lost response after save",
    "Receipt read unavailable",
    "Another tenant's receipt",
    "Concurrent edit conflict",
    "Team load unavailable",
  ],
};
function Preview() {
  useMerchantViewport();
  const [language, setLanguage] = useState<"ar" | "en">("ar"),
    [merchantId, setMerchant] = useState(174),
    [mode, setMode] = useState<PersonaMode>("normal"),
    [generation, setGeneration] = useState(0),
    [resetError, setResetError] = useState(false);
  const model = useMemo(
    () => new PersonaPreviewModel(merchantId, sessionStorage),
    [merchantId]
  );
  useSyncExternalStore(model.subscribe, model.snapshot);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);
  const ar = language === "ar",
    scopeKey = `${model.actorId}:${merchantId}:virtual-team`;
  function scenario(value: PersonaMode) {
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
    <PersonaPreviewLanguage.Provider value={language}>
      <PersonaPreviewContext.Provider value={model}>
        <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
          <a className="underline" href="./#/page/merchant/virtual-team">
            {ar ? "العودة إلى لوحة التحكم" : "Back to the dashboard"}
          </a>
          <aside className="space-y-3 rounded-xl border bg-muted/40 p-4">
            <h1 className="text-xl font-semibold">
              {ar ? "موك أب شخصيات العمل" : "Work personas preview"}
            </h1>
            <p>
              {ar
                ? "مكوّن التطبيق الفعلي ببيانات محاكاة منفصلة. لا اتصال بمتجر أو مزود ذكاء، ولا إرسال إلى العملاء. تغيير الحالة يعيد الفريق التجريبي ويحتفظ بالمسودة للمراجعة."
                : "The actual application component with separate simulated data. No store, AI or customer connection. Changing the scenario resets the sample team and keeps drafts for review."}
            </p>
            <div className="flex flex-wrap gap-3">
              <label className="grid gap-2">
                {ar ? "حالة التجربة" : "Scenario"}
                <select
                  className="rounded-lg border bg-background p-2"
                  value={mode}
                  onChange={e => scenario(e.target.value as PersonaMode)}
                >
                  {personaModes.map((value, i) => (
                    <option key={value} value={value}>
                      {labels[language][i]}
                    </option>
                  ))}
                </select>
              </label>
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
                {ar ? "تيننت المحاكاة" : "Simulated tenant"}
                <select
                  className="rounded-lg border bg-background p-2"
                  value={merchantId}
                  onChange={e => {
                    setMerchant(Number(e.target.value));
                    setMode("normal");
                  }}
                >
                  <option value="174">A · 174</option>
                  <option value="175">B · 175</option>
                </select>
              </label>
              <button
                className="rounded-lg border bg-background px-3"
                type="button"
                onClick={() => {
                  if (!discardVirtualTeamDraft(scopeKey)) {
                    setResetError(true);
                    return;
                  }
                  scenario(mode);
                }}
              >
                {ar
                  ? "مسح مسودة المحاكاة وإعادة بياناتها"
                  : "Clear the simulated draft and reset its data"}
              </button>
            </div>
            <p className="text-sm" role="status">
              {ar
                ? `طلبات حفظ المحاكاة: ${model.writes} · قراءة الإيصال: ${model.reads}`
                : `Simulated save requests: ${model.writes} · Receipt reads: ${model.reads}`}
            </p>
            {resetError && (
              <p role="alert">
                {ar
                  ? "تعذر حفظ بيانات المحاكاة في المتصفح؛ لم يبدأ اتصال خارجي."
                  : "The browser could not store preview data. No external request was started."}
              </p>
            )}
          </aside>
          <VirtualTeamWorkspace
            key={`${scopeKey}:${generation}`}
            scopeKey={scopeKey}
          />
        </main>
        <Toaster />
      </PersonaPreviewContext.Provider>
    </PersonaPreviewLanguage.Provider>
  );
}
createRoot(document.getElementById("persona-preview")!).render(<Preview />);
