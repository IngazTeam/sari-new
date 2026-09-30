import { useEffect, useRef, useState } from "react";
import { DataSyncWorkspace } from "../../../client/src/components/merchant/DataSyncWorkspace";
import { acknowledgeInventoryExportAttempt } from "../../../client/src/lib/inventory-export-attempt";
import { knowledgeCacheEpoch } from "../../../client/src/lib/knowledge-workspace-cache";
import {
  exportPreviewScope,
  exportModes,
  type ExportMode,
} from "./export-model";
import {
  exportSheets,
  importLanguage,
  useImportVersion,
  setImportLanguage,
} from "./import-preview-state";
export function ExportPreview() {
  const destinationHeading = useRef<HTMLHeadingElement>(null),
    opener = useRef<HTMLElement | null>(null);
  useImportVersion();
  const [generation, setGeneration] = useState(0),
    [confirm, setConfirm] = useState(false),
    [destination, setDestination] = useState<string | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    if (destination) destinationHeading.current?.focus();
  }, [destination]);
  return (
    <div dir={importLanguage === "ar" ? "rtl" : "ltr"}>
      <aside className="pp-controls" aria-label="محاكاة التصدير">
        <p>
          شاشة التصدير الفعلية مع25 منتجًا محليًا وقواعد الكمية والسعر نفسها. لا
          اتصال Google ولا تغيير بيانات حقيقية. بيانات الوجهة التجريبية في
          الذاكرة؛ التنبيه المحفوظ يبقى في علامة التبويب حتى مراجعته أو إعادة
          المثال.
        </p>
        <div>
          <label>
            حالة تصدير المخزون
            <select
              value={exportSheets.mode}
              onChange={e => exportSheets.setMode(e.target.value as ExportMode)}
            >
              {Object.entries(exportModes).map(([key, label]) => (
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
              onChange={e => setImportLanguage(e.target.value)}
            >
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </label>
          <button onClick={() => setConfirm(true)}>إعادة مثال التصدير</button>
          <span>
            محاولات التصدير المحلية: {exportSheets.sent} · كتابات مقبولة:{" "}
            {exportSheets.accepted}
          </span>
        </div>
        {confirm && (
          <div role="alert">
            <p>إعادة بيانات التصدير والتنبيه المحلي التجريبي فقط؟</p>
            <button
              onClick={() => {
                try {
                  acknowledgeInventoryExportAttempt(
                    exportPreviewScope,
                    knowledgeCacheEpoch()
                  );
                  exportSheets.reset();
                  setDestination(null);
                  setConfirm(false);
                  setError(false);
                  setGeneration(n => n + 1);
                } catch {
                  setError(true);
                }
              }}
            >
              نعم، إعادة مثال التصدير
            </button>
            <button onClick={() => setConfirm(false)}>إلغاء</button>
          </div>
        )}
        {error && <p role="alert">تعذر مسح تنبيه المثال.</p>}
      </aside>
      <DataSyncWorkspace
        key={generation}
        scope={exportPreviewScope}
        href={path => "#/page" + path}
        sheetHref={() => "#export-destination"}
        openSheet={id => {
          opener.current = document.activeElement as HTMLElement;
          setDestination(id);
        }}
      />
      {destination && (
        <section
          className="pw-panel"
          id="export-destination"
          aria-label="الوجهة التجريبية"
        >
          <h2 ref={destinationHeading} tabIndex={-1}>
            الوجهة التجريبية · {destination}
          </h2>
          <p>
            عدد الصفوف: {exportSheets.rows.length}. هذه معاينة محلية ولا تفتح
            Google.
          </p>
          <button
            className="pw-button"
            onClick={() => {
              setDestination(null);
              opener.current?.focus();
            }}
          >
            إغلاق معاينة الوجهة
          </button>
          <ol>
            {exportSheets.rows.map(row => (
              <li
                key={row[0]}
                style={{ overflowWrap: "anywhere", paddingBlock: "0.5rem" }}
              >
                {row[0]} · {row[1]} · السعر: {row[3] || "فارغ"} · الكمية:{" "}
                {row[4] || "فارغ"}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
