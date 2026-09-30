import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ProductImportWorkspace } from "../../../client/src/components/merchant/ProductImportWorkspace";
import { ProductFileAdviceWorkspace } from "../../../client/src/components/merchant/ProductFileAdviceWorkspace";
import { ProductSheetWorkspace } from "../../../client/src/components/merchant/ProductSheetWorkspace";
import { clearSheetAttempt } from "../../../client/src/lib/product-sheet-workspace";
import { sheetModes, type SheetMode } from "./import-sheet-model";
import { InventoryPreview } from "./inventory-preview";
import { inventoryPreviewScope } from "./inventory-sheet-model";
import { clearSheetAttempt as clearInventoryAttempt } from "../../../client/src/lib/inventory-sheet-workspace";
import { clearAdviceReference } from "../../../client/src/lib/product-file-advice-workspace";
import { adviceModes, type AdviceMode } from "./import-advice-model";
import {
  readImportAttempt,
  saveImportAttempt,
  clearImportAttempt,
  downloadImportText,
} from "../../../client/src/lib/product-import-workspace";
import { knowledgeCacheEpoch } from "../../../client/src/lib/knowledge-workspace-cache";
import {
  importModes,
  importPreviewScope,
  importSampleCsv,
  type ImportMode,
} from "./import-model";
import {
  imports,
  advice,
  sheets,
  importLanguage,
  importHint,
  useImportVersion,
  setImportLanguage,
  importPublicAction,
} from "./import-preview-state";
import "./product-preview.css";
let root: Root | null = null;
let initialized = false;
export const handles = (page: { route: string }) =>
  ["/merchant/products/upload", "/merchant/sheets/inventory"].includes(
    page?.route
  );
export const render = (page?: { route: string }) =>
  `<div id="import-prototype-root" data-kind="${page?.route === "/merchant/sheets/inventory" ? "inventory" : "import"}"></div>`;
function Preview() {
  useImportVersion();
  const [generation, setGeneration] = useState(0),
    [confirm, setConfirm] = useState<"data" | "empty" | null>(null),
    [storageError, setStorageError] = useState(false);
  return (
    <div dir={importLanguage === "ar" ? "rtl" : "ltr"}>
      <aside className="pp-controls" aria-label="محاكاة الاستيراد">
        <p>
          موك أب بشاشة الاستيراد الفعلية. الملف يُقرأ داخل هذا المتصفح ولا يُرفع
          لأي خادم. المنتجات والإيصالات محاكاة في الذاكرة مستقلة عن مثال
          الكتالوج؛ إعادة تحميل الصفحة تعيد بيانات المحاكاة. البصمات تجريبية ولا
          تثبت حماية قاعدة بيانات.
        </p>
        <div>
          <label>
            حالة المثال
            <select
              value={imports.mode}
              onChange={event =>
                event.target.value === "empty"
                  ? setConfirm("empty")
                  : imports.setMode(event.target.value as ImportMode)
              }
            >
              {Object.entries(importModes).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            اللغة / Language
            <select
              value={importLanguage}
              onChange={event => setImportLanguage(event.target.value)}
            >
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </label>
          <label>
            حالة مساعدة الملف
            <select
              value={advice.mode}
              onChange={event =>
                advice.setMode(event.target.value as AdviceMode)
              }
            >
              {Object.entries(adviceModes).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() =>
              downloadImportText(importSampleCsv(), "sary-import-demo.csv")
            }
          >
            تنزيل ملف المثال ·25 صفًا
          </button>
          <button type="button" onClick={() => setConfirm("data")}>
            إعادة المثال
          </button>
          <span>عدد العناصر المنشأة في المحاكاة: {imports.createdCount}</span>
          <span>عدد التحليلات المحلية: {advice.starts}</span>
          <label>
            حالة Google Sheets
            <select
              value={sheets.mode}
              onChange={event =>
                sheets.setMode(event.target.value as SheetMode)
              }
            >
              {Object.entries(sheetModes).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <span>
            قراءات الورقة المحلية: {sheets.reads} · إضافات:{" "}
            {sheets.createdCount} · تحديثات: {sheets.updatedCount}
          </span>
        </div>
        {confirm && (
          <div role="alert">
            <p>إعادة مراجعة المثال وطلبه ومسودته المحلية فقط؟</p>
            <button
              type="button"
              onClick={() => {
                try {
                  clearImportAttempt(importPreviewScope, knowledgeCacheEpoch());
                  clearAdviceReference(
                    importPreviewScope,
                    knowledgeCacheEpoch()
                  );
                  advice.reset();
                  clearSheetAttempt(importPreviewScope, knowledgeCacheEpoch());
                  sheets.reset();
                  imports.reset();
                  if (confirm === "data")
                    saveImportAttempt(
                      importPreviewScope,
                      imports.sample(),
                      knowledgeCacheEpoch()
                    );
                  else imports.setMode("empty");
                  setGeneration(value => value + 1);
                  setConfirm(null);
                  setStorageError(false);
                } catch {
                  setStorageError(true);
                }
              }}
            >
              نعم، إعادة المثال
            </button>
            <button type="button" onClick={() => setConfirm(null)}>
              إلغاء
            </button>
          </div>
        )}
        {storageError && <p role="alert">تعذر حفظ مرجع المثال.</p>}
      </aside>
      {importHint && (
        <p className="pp-controls" role="status">
          {importHint}
        </p>
      )}
      <ProductImportWorkspace
        key={generation}
        scope={importPreviewScope}
        href={path => "#/page" + path}
        renderAdvice={props => <ProductFileAdviceWorkspace {...props} />}
      />
      <aside className="pp-controls">
        <p>
          مساعدة الملف تعرض اقتراحات محلية ثابتة مع شواهد من الملف، دون ذكاء
          اصطناعي أو إرسال أو رسوم. اختر «قبل اختيار الملف» لتجربتها. لا تتغير
          المعرفة أو المنتجات عند التحليل؛ تطبيق الربط يجهّز معاينة فقط.
        </p>
        <a href="#/page/merchant/sheets/settings">عرض إعدادات Google Sheets</a>
      </aside>
      <details className="pw-panel">
        <summary>استيراد من Google Sheets</summary>
        <p>
          هذا ملف Sheets محلي اصطناعي، لا يتصل بحساب Google. اختَر حالة البيانات
          قبل القراءة أو أعد المراجعة بعد تغييرها. اختر ورقة العروض المخفية
          لتجربة النطاق المحدود. المطابقة بـSKU تعطي إضافة وتحديثًا وصفًا دون
          تغيير. كل النتائج في الذاكرة.
        </p>
        <ProductSheetWorkspace
          key={`sheets-${generation}`}
          scope={importPreviewScope}
          href={path => "#/page" + path}
        />
      </details>
    </div>
  );
}
export function mount() {
  const node = document.getElementById("import-prototype-root");
  if (!node) return;
  document.body.classList.add("pp-active", "pi-active");
  try {
    // Reload resets the in-memory store; its local reference must reset with it.
    // Navigating between prototype pages keeps both until a full reload.
    if (!initialized) {
      clearImportAttempt(importPreviewScope, knowledgeCacheEpoch());
      clearAdviceReference(importPreviewScope, knowledgeCacheEpoch());
      clearSheetAttempt(importPreviewScope, knowledgeCacheEpoch());
      clearInventoryAttempt(inventoryPreviewScope, knowledgeCacheEpoch());
      initialized = true;
    }
    if (
      node.dataset.kind !== "inventory" &&
      imports.mode !== "empty" &&
      !readImportAttempt(importPreviewScope)
    )
      saveImportAttempt(
        importPreviewScope,
        imports.sample(),
        knowledgeCacheEpoch()
      );
  } catch {
    /* Actual workspace shows storage failure. */
  }
  root = createRoot(node);
  root.render(
    node.dataset.kind === "inventory" ? <InventoryPreview /> : <Preview />
  );
}
export function unmount() {
  root?.unmount();
  root = null;
  document.body.classList.remove("pi-active");
  if (!document.getElementById("product-prototype-root"))
    document.body.classList.remove("pp-active");
}
document.addEventListener(
  "click",
  event => {
    if (!document.body.classList.contains("pi-active")) return;
    const anchor = (event.target as Element)?.closest<HTMLAnchorElement>(
      'a[href^="/merchant/"],a[href="/login"],a[href="/support"]'
    );
    if (!anchor) return;
    event.preventDefault();
    const href = anchor.getAttribute("href")!;
    if (href === "/login" || href === "/support") importPublicAction();
    else location.hash = "#/page" + href;
  },
  true
);
