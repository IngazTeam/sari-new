import { useEffect, useRef, useState } from "react";
import { SheetsSettingsWorkspace } from "../../../client/src/components/merchant/SheetsSettingsWorkspace";
import {
  settingsModes,
  settingsPreviewScope,
  type SettingsMode,
} from "./sheets-settings-model";
import {
  settingsSheets,
  importLanguage,
  setImportLanguage,
  useImportVersion,
} from "./import-preview-state";
export function SheetsSettingsPreview() {
  useImportVersion();
  const [generation, setGeneration] = useState(0),
    [connect, setConnect] = useState(false),
    [destination, setDestination] = useState<string | null>(null),
    [confirm, setConfirm] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null),
    opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (connect || destination) heading.current?.focus();
  }, [connect, destination]);
  const close = () => {
    setConnect(false);
    setDestination(null);
    opener.current?.focus();
  };
  return (
    <div dir={importLanguage === "ar" ? "rtl" : "ltr"}>
      <aside className="pp-controls" aria-label="محاكاة إعدادات الربط">
        <p>
          شاشة الإعدادات الفعلية مع ربط وملفات وإيصالات محلية في الذاكرة. لا فتح
          Google ولا تفويض حقيقي ولا إرسال تقارير. التنقل يحفظ المثال؛ إعادة
          تحميل المتصفح تعيده. تغيير الحالة يستبدل المسودة والمحاولة التجريبية.
        </p>
        <div>
          <label>
            حالة إعدادات الربط
            <select
              value={settingsSheets.mode}
              onChange={e => {
                settingsSheets.setMode(e.target.value as SettingsMode);
                setGeneration(n => n + 1);
                setConnect(false);
                setDestination(null);
              }}
            >
              {Object.entries(settingsModes).map(([key, label]) => (
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
          <button onClick={() => setConfirm(true)}>إعادة مثال الربط</button>
          <span>
            إنشاء ملفات محلية: {settingsSheets.starts} · حفظ تقارير:{" "}
            {settingsSheets.saves} · فصل: {settingsSheets.disconnects}
          </span>
        </div>
        {confirm && (
          <div role="alert">
            <p>إعادة بيانات الربط والمحاولة المحلية؟</p>
            <button
              onClick={() => {
                settingsSheets.reset();
                setGeneration(n => n + 1);
                setConfirm(false);
                setConnect(false);
                setDestination(null);
              }}
            >
              نعم، إعادة مثال الربط
            </button>
            <button onClick={() => setConfirm(false)}>إلغاء</button>
          </div>
        )}
      </aside>
      <SheetsSettingsWorkspace
        key={generation}
        scope={settingsPreviewScope}
        href={p => "#/page" + p}
        navigate={() => {
          opener.current = document.activeElement as HTMLElement;
          setConnect(true);
          setDestination(null);
        }}
        sheetHref={() => "#settings-local-destination"}
        openSheet={id => {
          opener.current = document.activeElement as HTMLElement;
          setConnect(false);
          setDestination(id);
        }}
      />
      {connect && (
        <section className="pw-panel" aria-label="محاكاة اختيار الحساب">
          <h2 tabIndex={-1} ref={heading}>
            اختيار حساب تجريبي
          </h2>
          <p>
            هذه خطوة محاكاة محلية. إكمالها يجهز حساب المثال لإنشاء ملف، ويعيد
            خيارات تقاريره إلى غير مفعلة.
          </p>
          <div className="pw-actions">
            <button
              onClick={() => {
                settingsSheets.finishConnect();
                close();
              }}
            >
              إكمال ربط المثال
            </button>
            <button onClick={close}>إلغاء ربط المثال</button>
          </div>
        </section>
      )}
      {destination && (
        <section
          className="pw-panel"
          id="settings-local-destination"
          aria-label="ملف إعدادات محلي"
        >
          <h2 tabIndex={-1} ref={heading}>
            ملف المثال · {destination}
          </h2>
          <p>
            أوراق وعناوين القالب نفسه المستخدم في التطبيق. لا بيانات عملاء
            حقيقية.
          </p>
          <button onClick={close}>إغلاق الملف المحلي</button>
          {settingsSheets.files.get(destination)?.map(tab => (
            <section key={tab.id}>
              <h3>{tab.title}</h3>
              <ul>
                {tab.headers.map(value => (
                  <li key={value}>{value}</li>
                ))}
              </ul>
            </section>
          )) ?? <p>ملف المثال غير موجود في هذه الحالة.</p>}
        </section>
      )}
    </div>
  );
}
