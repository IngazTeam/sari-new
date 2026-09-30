import React, { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QuotationWorkspace } from "../../../client/src/components/merchant/QuotationWorkspace";
import {
  previewModes,
  previewScope,
  type PreviewMode,
} from "./quotation-model";
import {
  model,
  previewLanguage,
  setPreviewLanguage,
  usePreviewVersion,
} from "./quotation-preview-state";
import "./quotation-preview.css";
let root: Root | null = null;
export const handles = (page: { route: string }) =>
  page?.route === "/merchant/sales-hub";
export const render = () => '<div id="quotation-prototype-root"></div>';
export function unmount() {
  if (root) {
    root.unmount();
    root = null;
  }
  document.body.classList.remove("qp-active");
}
function Preview() {
  usePreviewVersion();
  const [generation, setGeneration] = useState(0),
    [resetReview, setResetReview] = useState(false);
  return (
    <div className="qp-preview">
      <aside className="qp-controls" aria-label="خيارات المحاكاة">
        <p>
          موك أب تفاعلي يستخدم مكونات التطبيق نفسها. بيانات مصطنعة في جلسة هذه
          الصفحة؛ لا اتصال بالخادم ولا إرسال أو دفع فعلي. السجل التجريبي يعود
          إلى أصله عند إعادة تحميل الصفحة.
        </p>
        <div>
          <label>
            حالة المثال
            <select
              value={model.mode}
              onChange={e => model.setMode(e.target.value as PreviewMode)}
            >
              {Object.entries(previewModes).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            اللغة / Language
            <select
              value={previewLanguage}
              onChange={e => setPreviewLanguage(e.target.value)}
            >
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </label>
          <button type="button" onClick={() => setResetReview(true)}>
            إعادة المثال
          </button>
        </div>
        {resetReview && (
          <div role="alert">
            <p>إعادة بيانات المثال ومسوداته المحلية فقط؟</p>
            <button
              type="button"
              onClick={() => {
                try {
                  const keys = Array.from(
                    { length: sessionStorage.length },
                    (_, i) => sessionStorage.key(i)
                  );
                  for (const key of keys)
                    if (
                      key === `sary:quotation-editor:v1:${previewScope}` ||
                      key?.startsWith(`sary:quotation-send:v1:${previewScope}:`)
                    )
                      sessionStorage.removeItem(key);
                  model.reset();
                  setGeneration(v => v + 1);
                  setResetReview(false);
                } catch {
                  (window as any).toast("تعذرت إعادة المسودة في هذا المتصفح.");
                }
              }}
            >
              تأكيد إعادة المثال
            </button>
            <button type="button" onClick={() => setResetReview(false)}>
              إلغاء
            </button>
          </div>
        )}
      </aside>
      <QuotationWorkspace
        key={generation}
        scope={previewScope}
        href={path => "#/page" + path}
      />
      <p className="qp-footnote">
        المحاكاة تختبر العرض والتفاعل. لا تثبت حماية الخادم أو إرسال المزود أو
        إعادة تحميل إيصال خادمي؛ أدلة هذه الجوانب في تقارير الاختبارات.
      </p>
    </div>
  );
}
export function mount() {
  const node = document.getElementById("quotation-prototype-root");
  if (!node) return;
  document.body.classList.add("qp-active");
  root = createRoot(node);
  root.render(<Preview />);
}
document.addEventListener("click", event => {
  if (!document.body.classList.contains("qp-active")) return;
  const anchor = (event.target as Element)?.closest<HTMLAnchorElement>(
    'a[href^="/merchant/"]'
  );
  if (anchor) {
    event.preventDefault();
    location.hash = "#/page" + anchor.getAttribute("href");
  }
});
// A new page load resets the in-memory model. Avoid presenting an old demo request as a server receipt.
try {
  for (const key of Array.from({ length: sessionStorage.length }, (_, i) =>
    sessionStorage.key(i)
  )) {
    if (key?.startsWith(`sary:quotation-send:v1:${previewScope}:`))
      sessionStorage.removeItem(key);
  }
  const key = `sary:quotation-editor:v1:${previewScope}`,
    raw = sessionStorage.getItem(key);
  if (raw) {
    const entry = JSON.parse(raw);
    delete entry.attempt;
    sessionStorage.setItem(key, JSON.stringify(entry));
  }
} catch {
  /* The real component reports unreadable storage. */
}
