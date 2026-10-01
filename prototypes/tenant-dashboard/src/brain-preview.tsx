import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrainQuickPreviewView } from "../../../client/src/components/BrainQuickPreview";
import { SariPlaygroundWorkspace } from "../../../client/src/pages/SariPlayground";
import { useMerchantViewport } from "../../../client/src/lib/merchant-viewport";
import { PreviewLanguage } from "./brain-preview-i18n";
function Preview() {
  useMerchantViewport();
  const [language, setLanguage] = useState<"ar" | "en">("ar"),
    [mode, setMode] = useState("model"),
    [view, setView] = useState(() =>
      new URLSearchParams(window.location.search).get("screen") === "playground"
        ? "playground"
        : "brain"
    ),
    [pending, setPending] = useState(false),
    [calls, setCalls] = useState(0);
  const finish = useRef<() => void>(() => {});
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);
  const ar = language === "ar";
  const scopePrefix = new URLSearchParams(window.location.search).get("embed") === "brain" && window.parent !== window ? "central" : "preview";
  async function send({ question }: { question: string }) {
    setCalls(n => n + 1);
    if (mode === "failed") throw Error("Synthetic unavailable result");
    if (mode === "forbidden" || mode === "rate")
      throw {
        data: {
          code: mode === "forbidden" ? "FORBIDDEN" : "TOO_MANY_REQUESTS",
        },
      };
    if (mode === "pending") {
      setPending(true);
      await new Promise<void>(resolve => {
        finish.current = () => {
          setPending(false);
          resolve();
        };
      });
    }
    return {
      success: true,
      question,
      source: mode === "guardrail" ? "guardrail" : "model",
      answer:
        mode === "guardrail"
          ? ar
            ? "هذه محاكاة فقط. لم يتم تنفيذ طلب أو دفعة مالية أو تحويل إلى الفريق."
            : "This is a simulation. No order, payment or handoff has been completed."
          : ar
            ? "هذا رد توضيحي ثابت لتجربة شكل النتيجة. راجع الأسعار والتوفر في مصادر متجرك قبل الاعتماد على إجابة حقيقية."
            : "This fixed sample demonstrates the result layout. Check prices and availability against your store sources before relying on a real reply.",
    };
  }
  return (
    <PreviewLanguage.Provider value={language}>
      <main className="mx-auto max-w-3xl p-4 sm:p-6 space-y-5">
        <a href="./#/page/merchant/sari-brain" className="underline">
          {ar ? "العودة إلى عقل ساري" : "Back to Sari Brain"}
        </a>
        <aside className="rounded-xl border bg-muted/40 p-4 space-y-3">
          <h1 className="text-xl font-semibold">
            {ar ? "معاينة الاختبار السريع" : "Quick test preview"}
          </h1>
          <p>
            {ar
              ? "مكوّن التطبيق نفسه ببيانات ثابتة. لا يوجد اتصال بالذكاء الاصطناعي أو تغيير لبيانات متجر فعلي. غيّر نوع الاستجابة ثم أرسل سؤالًا لتجربة الحالة."
              : "The actual application component with fixed data. No AI call or actual store changes. Select a response type, then send a question to try it."}
          </p>
          <div className="flex flex-wrap gap-3">
            <label className="grid gap-2">
              {ar ? "الشاشة" : "Screen"}
              <select
                className="rounded-lg border p-2 bg-background"
                disabled={pending}
                value={view}
                onChange={e => setView(e.target.value)}
              >
                <option value="brain">
                  {ar ? "اختبار داخل العقل" : "Test inside Brain"}
                </option>
                <option value="playground">
                  {ar ? "صفحة المعاينة المستقلة" : "Standalone preview page"}
                </option>
              </select>
            </label>
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
              {ar ? "نوع الاستجابة" : "Response type"}
              <select
                className="rounded-lg border p-2 bg-background"
                disabled={pending}
                value={mode}
                onChange={e => setMode(e.target.value)}
              >
                {[
                  ["model", "رد توضيحي", "Sample reply"],
                  ["guardrail", "رسالة حماية", "Protection message"],
                  ["failed", "نتيجة غير مؤكدة", "Unconfirmed result"],
                  ["rate", "حد المحاولات", "Rate limited"],
                  ["forbidden", "دون صلاحية", "Access denied"],
                  [
                    "pending",
                    "طلب معلق حتى الإكمال",
                    "Pending until completed",
                  ],
                ].map(([id, a, e]) => (
                  <option key={id} value={id}>
                    {ar ? a : e}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p>
            {ar ? "طلبات المثال المحلية: " : "Local example requests: "}
            {calls}
          </p>
          {pending && (
            <button
              className="rounded-lg border bg-background px-3 py-2"
              onClick={() => finish.current()}
            >
              {ar ? "إكمال الطلب التوضيحي" : "Complete sample request"}
            </button>
          )}
        </aside>
        {view === "brain" ? (
          <BrainQuickPreviewView
            key={mode}
            scopeKey={`${scopePrefix}:153:${mode}`}
            send={send}
          />
        ) : (
          <SariPlaygroundWorkspace
            key={mode}
            scopeKey={`${scopePrefix}:154:${mode}`}
            send={async ({ message }) => {
              const result = await send({ question: message });
              return {
                response: result.answer,
                source: result.source,
                historyMessageCount: 0,
                historyTruncated: false,
              };
            }}
          />
        )}
      </main>
    </PreviewLanguage.Provider>
  );
}
createRoot(document.getElementById("brain-preview")!).render(<Preview />);
