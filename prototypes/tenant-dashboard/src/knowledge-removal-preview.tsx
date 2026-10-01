import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { KnowledgeRemovalView } from "../../../client/src/components/KnowledgeRemovalWorkspace";
import { useMerchantViewport } from "../../../client/src/lib/merchant-viewport";
import { readRemovalAttempt } from "../../../client/src/lib/knowledge-removal-attempt";
import type { KnowledgeRemovalTarget } from "../../../shared/knowledge-source-removal";
import {
  removalFixture,
  removalFixtureReceipt,
} from "./knowledge-removal-fixture";
import { RemovalLanguage } from "./knowledge-removal-preview-i18n";
const scopeKey = "970156:970156:knowledge-removal";
function Preview() {
  useMerchantViewport();
  const [language, setLanguage] = useState<"ar" | "en">("ar"),
    [mode, setMode] = useState("sample"),
    [kind, setKind] = useState("all"),
    [target, setTarget] = useState<KnowledgeRemovalTarget | null>(null),
    [version, setVersion] = useState(0),
    [done, setDone] = useState(false);
  const sends = useRef(0);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  }, [language]);
  const ar = language === "ar";
  const selected = (): KnowledgeRemovalTarget =>
    kind === "document" || kind === "website"
      ? { kind, sourceId: 1 }
      : { kind: kind as "all" | "products" | "faqs" };
  return (
    <RemovalLanguage.Provider value={language}>
      <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
        <a href="./#/page/merchant/sari-brain" className="underline">
          {ar ? "العودة إلى عقل ساري" : "Back to Sari Brain"}
        </a>
        <aside className="rounded-xl border bg-muted/40 p-4 space-y-4">
          <h1 className="text-xl font-semibold">
            {ar
              ? "معاينة مراجعة حذف المعرفة"
              : "Knowledge removal review preview"}
          </h1>
          <p>
            {ar
              ? "مكوّن التطبيق الفعلي ببيانات توضيحية. لا يحذف معرفة حقيقية ولا يتصل بالخادم. جرّب المراجعة والتأكيد والتعارض واستعادة الإيصال."
              : "The actual component with example data. It does not remove real knowledge or contact a server. Try impact review, confirmation, conflicts and receipt recovery."}
          </p>
          <div className="flex flex-wrap gap-3">
            <label className="grid gap-2">
              {ar ? "اللغة" : "Language"}
              <select
                className="rounded-lg border p-2"
                value={language}
                onChange={e => setLanguage(e.target.value as typeof language)}
              >
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="grid gap-2">
              {ar ? "المجموعة" : "Group"}
              <select
                className="rounded-lg border p-2"
                value={kind}
                onChange={e => setKind(e.target.value)}
              >
                {[
                  ["all", "الكل"],
                  ["document", "الملفات"],
                  ["website", "الموقع"],
                  ["products", "المنتجات"],
                  ["faqs", "الأسئلة"],
                ].map(([k, label]) => (
                  <option key={k} value={k}>
                    {ar ? label : k}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              {ar ? "الحالة" : "State"}
              <select
                className="rounded-lg border p-2"
                value={mode}
                onChange={e => {
                  setMode(e.target.value);
                  sends.current = 0;
                }}
              >
                {[
                  ["sample", "بيانات جاهزة"],
                  ["loading", "تحميل قصير"],
                  ["empty", "بلا مصادر"],
                  ["readError", "فشل القراءة"],
                  ["external_catalog", "كتالوج مرتبط"],
                  ["running_intake", "إدخال جارٍ"],
                  ["foreign_relationship", "علاقة غير سليمة"],
                  ["conflict", "تغيرت المراجعة"],
                  ["uncertain", "فقد الرد مع إيصال محفوظ"],
                  ["missing", "فقد الرد بلا إيصال بعد"],
                ].map(([k, label]) => (
                  <option key={k} value={k}>
                    {ar ? label : k}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-lg border bg-primary text-primary-foreground px-4 py-2"
              onClick={() => {
                setDone(false);
                setTarget(selected());
              }}
            >
              {ar ? "فتح مراجعة الأثر" : "Open impact review"}
            </button>
            <button
              className="rounded-lg border px-4 py-2"
              onClick={() => {
                sessionStorage.removeItem(
                  "sary:knowledge-removal:v1:" + scopeKey
                );
                sends.current = 0;
                setTarget(null);
                setVersion(v => v + 1);
                setDone(false);
              }}
            >
              {ar ? "إعادة بيانات المثال فقط" : "Reset example data only"}
            </button>
          </div>
          <p className="text-sm">
            {ar
              ? "اسم المتجر في المثال: متجر النموذج. الاستعادة لا تعيد الموافقة."
              : "Example store name: متجر النموذج. Recovery never restores approval."}
          </p>
        </aside>
        {done && (
          <p role="status">
            {ar
              ? "اكتملت العملية التوضيحية فقط."
              : "The example operation completed."}
          </p>
        )}
        <KnowledgeRemovalView
          key={version}
          scopeKey={scopeKey}
          target={target}
          onClose={() => setTarget(null)}
          api={{
            review: async choice => {
              if (mode === "readError") throw Error("Example read error");
              if (mode === "loading")
                await new Promise(r => setTimeout(r, 1500));
              const r = removalFixture(choice);
              if (mode === "empty") {
                for (const k of Object.keys(r.counts) as Array<
                  keyof typeof r.counts
                >)
                  r.counts[k] = 0;
                for (const k of Object.keys(r.related) as Array<
                  keyof typeof r.related
                >)
                  r.related[k] = 0;
                if (choice.kind !== "all") r.blockers = ["empty"];
              }
              if (
                mode === "external_catalog" ||
                mode === "running_intake" ||
                mode === "foreign_relationship"
              )
                r.blockers = [mode];
              return r;
            },
            send: async input => {
              sends.current++;
              if (mode === "conflict") throw { data: { code: "CONFLICT" } };
              if (
                (mode === "uncertain" || mode === "missing") &&
                sends.current === 1
              )
                throw Error("Example lost response");
              const pending = readRemovalAttempt(scopeKey)!;
              return removalFixtureReceipt(pending.review, input.requestId);
            },
            receipt: async input => {
              if (mode === "missing") return null;
              const pending = readRemovalAttempt(scopeKey);
              return pending
                ? removalFixtureReceipt(pending.review, input.requestId)
                : null;
            },
            changed: () => setDone(true),
          }}
        />
      </main>
    </RemovalLanguage.Provider>
  );
}
createRoot(document.getElementById("knowledge-removal-preview")!).render(
  <Preview />
);
