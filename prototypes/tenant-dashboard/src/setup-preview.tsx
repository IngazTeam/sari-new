import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Toaster } from "sonner";
import SetupWizard from "../../../client/src/pages/SetupWizard";
import {
  setup,
  useSetupVersion,
  setupLanguage,
  setSetupLanguage,
} from "./setup-preview-state";
import { setupModes, setupScope, type SetupMode } from "./setup-model";
import "./setup-preview.css";
let root: Root | null = null;
let priorStyles: { node: HTMLLinkElement; disabled: boolean }[] = [];
export const handles = (page: { route: string }) =>
  page.route === "/merchant/setup-wizard";
export const render = () => '<div id="setup-prototype-root"></div>';
function Preview() {
  useSetupVersion();
  const [generation, setGeneration] = useState(0),
    [reset, setReset] = useState(false),
    [fixture, setFixture] = useState<"normal" | "invalid" | "empty">("normal"),
    [hint, setHint] = useState("");
  return (
    <div dir={setupLanguage === "ar" ? "rtl" : "ltr"}>
      <aside
        className="sp-controls"
        dir="rtl"
        aria-label="تجربة الإعداد محليًا"
      >
        <details>
          <summary>تجربة الويزرد · نفس شاشة التطبيق · حالات محلية</summary>
          <p>
            لا اتصال بموقع أو ذكاء اصطناعي، ولا تعديل لمتجر حقيقي. المصدر
            التجريبي وإيصالاته في ذاكرة الصفحة؛ إعادة تحميل المتصفح تعيد المصدر.
            زر «إعادة فتح الشاشة» يختبر استعادة المسودة أو الإيصال داخل المثال.
          </p>
          <div>
            <label>
              حالة التجربة
              <select
                value={setup.mode}
                onChange={e => setup.setMode(e.target.value as SetupMode)}
              >
                {Object.entries(setupModes).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              لغة الواجهة
              <select
                value={setupLanguage}
                onChange={e => setSetupLanguage(e.target.value as "ar" | "en")}
              >
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </label>
            <button
              onClick={() => {
                setup.remoteEdit();
                setHint(
                  "تغيرت النسخة المحفوظة في المثال. عدّل حقلًا واحفظ لاختبار مراجعة التعارض."
                );
              }}
            >
              تعديل من تبويب آخر
            </button>
            <button
              onClick={() => {
                setGeneration(n => n + 1);
                setHint(
                  "أعيد فتح المكوّن لقراءة المسودة المحلية والنسخة المحفوظة."
                );
              }}
            >
              إعادة فتح الشاشة
            </button>
            <button onClick={() => setReset(true)}>إعادة المثال</button>
            <a href="#/page/merchant/tools">جميع صفحات الموك أب</a>
          </div>
          {reset && (
            <div role="alert">
              <p>إعادة بيانات هذا المثال ومسودته وطلبه غير المؤكد فقط؟</p>
              <label>
                بيانات البداية
                <select
                  value={fixture}
                  onChange={e => setFixture(e.target.value as typeof fixture)}
                >
                  <option value="normal">نشاط ومنتج وخدمة</option>
                  <option value="empty">بداية فارغة</option>
                  <option value="invalid">حقول قديمة تحتاج إصلاحًا</option>
                </select>
              </label>
              <button
                onClick={() => {
                  try {
                    for (const prefix of [
                      "sary:setup-draft:v1:",
                      "sary:setup-completion:v1:",
                    ])
                      sessionStorage.removeItem(
                        `${prefix}${setupScope.actorId}:${setupScope.merchantId}`
                      );
                    setup.reset(fixture);
                    setGeneration(n => n + 1);
                    setReset(false);
                    setHint("أعيد المثال المحدد فقط.");
                  } catch {
                    setHint("تعذر مسح مسودة المثال.");
                  }
                }}
              >
                نعم، إعادة المثال
              </button>
              <button onClick={() => setReset(false)}>إلغاء</button>
            </div>
          )}
          {hint && <p role="status">{hint}</p>}
        </details>
      </aside>
      <SetupWizard key={generation} />
      <Toaster />
    </div>
  );
}
export function mount() {
  const node = document.getElementById("setup-prototype-root");
  if (!node) return;
  document.body.classList.add("sp-active");
  // The standalone wizard owns its surface. Restore other prototype styles on exit.
  priorStyles = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
  )
    .filter(node => !node.href.endsWith("/setup-preview.css"))
    .map(node => ({ node, disabled: node.disabled }));
  priorStyles.forEach(({ node }) => {
    node.disabled = true;
  });
  const css = document.createElement("link");
  css.id = "setup-utilities";
  css.rel = "stylesheet";
  css.href = "setup-utilities.css";
  document.head.append(css);
  root = createRoot(node);
  root.render(<Preview />);
}
export function unmount() {
  root?.unmount();
  root = null;
  document.body.classList.remove("sp-active");
  document.getElementById("setup-utilities")?.remove();
  priorStyles.forEach(({ node, disabled }) => {
    node.disabled = disabled;
  });
  priorStyles = [];
}
