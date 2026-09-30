import { useState } from "react";
import { QuotationTemplateWorkspace } from "../../../client/src/components/merchant/QuotationTemplateWorkspace";
import {
  templateModes,
  templatePreviewScope,
  type TemplateMode,
} from "./template-model";
import {
  templates,
  previewLanguage,
  setPreviewLanguage,
  usePreviewVersion,
} from "./quotation-preview-state";
export function TemplatePreview() {
  usePreviewVersion();
  const [generation, setGeneration] = useState(0),
    [confirm, setConfirm] = useState(false);
  return (
    <div className="qp-preview">
      <aside className="qp-controls" aria-label="خيارات محاكاة القوالب">
        <p>
          موك أب يستخدم محرر القوالب ومعاينته الفعليين. البيانات توضيحية في
          ذاكرة هذه الصفحة وتعود عند إعادة تحميلها؛ لا اتصال بالخادم ولا إرسال
          خارجي.
        </p>
        <div>
          <label>
            حالة المثال
            <select
              value={templates.mode}
              onChange={e => templates.setMode(e.target.value as TemplateMode)}
            >
              {Object.entries(templateModes).map(([value, label]) => (
                <option key={value} value={value}>
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
          <button type="button" onClick={() => setConfirm(true)}>
            إعادة المثال
          </button>
        </div>
        {confirm && (
          <div role="alert">
            <p>إعادة بيانات هذا المثال ومسودته فقط؟</p>
            <button
              type="button"
              onClick={() => {
                try {
                  sessionStorage.removeItem(
                    "sary:quotation-template:v1:" + templatePreviewScope
                  );
                  templates.reset();
                  setGeneration(v => v + 1);
                  setConfirm(false);
                } catch {
                  (window as any).toast("تعذرت إعادة المسودة في المتصفح.");
                }
              }}
            >
              تأكيد إعادة المثال
            </button>
            <button type="button" onClick={() => setConfirm(false)}>
              إلغاء
            </button>
          </div>
        )}
      </aside>
      <QuotationTemplateWorkspace
        key={generation}
        scope={templatePreviewScope}
        href={path => "#/page" + path}
      />
      <p className="qp-footnote">
        نتائج المحاكاة تختبر التفاعل ولا تثبت صلاحيات الخادم أو بقاء الإيصال بعد
        تحميل الصفحة. أدلة المعاملات والعزل في تقارير القوالب.
      </p>
    </div>
  );
}
// Only this fixture resets on load. Never misrepresent its old local request as a durable server receipt.
try {
  const key = "sary:quotation-template:v1:" + templatePreviewScope,
    raw = sessionStorage.getItem(key);
  if (raw) {
    const value = JSON.parse(raw);
    delete value.attempt;
    sessionStorage.setItem(key, JSON.stringify(value));
  }
} catch {
  /* The actual workspace displays the storage failure. */
}
