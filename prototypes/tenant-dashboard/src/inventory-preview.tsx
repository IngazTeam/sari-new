import { useState } from "react";
import { InventorySheetWorkspace } from "../../../client/src/components/merchant/InventorySheetWorkspace";
import { clearSheetAttempt } from "../../../client/src/lib/inventory-sheet-workspace";
import { knowledgeCacheEpoch } from "../../../client/src/lib/knowledge-workspace-cache";
import {
  inventoryModes,
  inventoryPreviewScope,
  type InventoryMode,
} from "./inventory-sheet-model";
import {
  inventorySheets,
  importLanguage,
  useImportVersion,
  setImportLanguage,
} from "./import-preview-state";

export function InventoryPreview() {
  useImportVersion();
  const [generation, setGeneration] = useState(0),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState(false);
  return (
    <div dir={importLanguage === "ar" ? "rtl" : "ltr"}>
      <aside className="pp-controls" aria-label="محاكاة المخزون">
        <p>
          شاشة المخزون الفعلية مع ملف محلي اصطناعي من25 صفًا. جميع التغييرات
          والإيصالات في الذاكرة؛ لا اتصال Google أو خادم أو تغيير منتجات حقيقية.
          البصمات محاكاة ولا تثبت حماية قاعدة البيانات. إعادة تحميل الصفحة تعيد
          المثال.
        </p>
        <div>
          <label>
            حالة مخزون Sheets
            <select
              value={inventorySheets.mode}
              onChange={e =>
                inventorySheets.setMode(e.target.value as InventoryMode)
              }
            >
              {Object.entries(inventoryModes).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            اللغة / Language
            <select
              value={importLanguage}
              onChange={e => setImportLanguage(e.target.value)}
            >
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </label>
          <button onClick={() => setConfirm(true)}>إعادة مثال المخزون</button>
          <span>
            قراءات المخزون المحلية: {inventorySheets.reads} · كميات محدثة:{" "}
            {inventorySheets.updatedCount}
          </span>
        </div>
        <p>
          اختر حالة البيانات قبل القراءة. لمعاينة التعارض أو فقد رد الاعتماد،
          غيّر الحالة بعد ظهور المراجعة. «غير معلوم» يختلف عن صفر، والمعرّفات
          المكررة أو غير الموجودة تمنع الاعتماد.
        </p>
        {confirm && (
          <div role="alert">
            <p>إعادة بيانات المخزون والإيصالات التجريبية فقط؟</p>
            <button
              onClick={() => {
                try {
                  clearSheetAttempt(
                    inventoryPreviewScope,
                    knowledgeCacheEpoch()
                  );
                  inventorySheets.reset();
                  setGeneration(g => g + 1);
                  setConfirm(false);
                  setError(false);
                } catch {
                  setError(true);
                }
              }}
            >
              نعم، إعادة مثال المخزون
            </button>
            <button onClick={() => setConfirm(false)}>إلغاء</button>
          </div>
        )}
        {error && <p role="alert">تعذر حفظ مرجع المثال.</p>}
      </aside>
      <InventorySheetWorkspace
        key={generation}
        scope={inventoryPreviewScope}
        href={path => "#/page" + path}
      />
    </div>
  );
}
