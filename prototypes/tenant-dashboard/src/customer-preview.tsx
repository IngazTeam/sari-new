import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CustomerListWorkspace } from "../../../client/src/components/merchant/CustomerListWorkspace";
import { CustomerDetailWorkspace } from "../../../client/src/components/merchant/CustomerDetailWorkspace";
import { customerKeyFromPath } from "../../../client/src/lib/customer-workspace-cache";
import {
  customerModes,
  customerPreviewScope,
  type CustomerMode,
} from "./customer-model";
import {
  customers,
  customerLanguage,
  customerHint,
  useCustomerVersion,
  setCustomerLanguage,
  customerPublicAction,
} from "./customer-preview-state";
import "./customer-preview.css";
let root: Root | null = null;
export const handles = (page: { route: string }) =>
  page?.route === "/merchant/customers" ||
  page?.route === "/merchant/customers/:phone";
export const render = () => '<div id="customer-prototype-root"></div>';
function Preview() {
  useCustomerVersion();
  const [generation, setGeneration] = useState(0),
    [confirm, setConfirm] = useState(false),
    [storageError, setStorageError] = useState(false);
  const path = location.hash.slice(6).split("?")[0],
    detail = path.startsWith("/merchant/customers/"),
    parsedKey = customerKeyFromPath(path),
    key = parsedKey === ":phone" ? "966500000001" : parsedKey;
  return (
    <div dir={customerLanguage === "ar" ? "rtl" : "ltr"}>
      <aside className="cp-controls" aria-label="محاكاة العملاء">
        <p>
          موك أب يستخدم شاشات العملاء الفعلية. السجلات والحفظ والإيصالات مصطنعة
          في ذاكرة الصفحة؛ تعود البيانات الأصلية عند إعادة التحميل. المسودات
          محلية ومعزولة عن التطبيق؛ لا اتصال بخادم أو إرسال للعميل.
        </p>
        <div>
          <label>
            حالة المثال
            <select
              value={customers.mode}
              onChange={e => customers.setMode(e.target.value as CustomerMode)}
            >
              {Object.entries(customerModes).map(([id, label]) => (
                <option value={id} key={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            اللغة / Language
            <select
              value={customerLanguage}
              onChange={e => setCustomerLanguage(e.target.value)}
            >
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </label>
          <button type="button" onClick={() => setConfirm(true)}>
            إعادة المثال
          </button>
          <button type="button" onClick={customers.release}>
            إكمال التصدير المؤجل
          </button>
          {detail && key && (
            <button type="button" onClick={() => customers.conflict(key)}>
              محاكاة تعديل زميل للوسوم
            </button>
          )}
        </div>
        {confirm && (
          <div role="alert">
            <p>إعادة بيانات هذا المثال ومسوداته ومحاولاته المحلية فقط؟</p>
            <button
              type="button"
              onClick={() => {
                try {
                  const prefix =
                    "sary:customer-draft:v1:" + customerPreviewScope + ":";
                  for (const name of Object.keys(sessionStorage))
                    if (name.startsWith(prefix))
                      sessionStorage.removeItem(name);
                  customers.reset();
                  setGeneration(v => v + 1);
                  setConfirm(false);
                  setStorageError(false);
                } catch {
                  setStorageError(true);
                }
              }}
            >
              نعم، إعادة المثال
            </button>
            <button type="button" onClick={() => setConfirm(false)}>
              إلغاء
            </button>
          </div>
        )}
        {storageError && <p role="alert">تعذر مسح مسودة المثال من المتصفح.</p>}
      </aside>
      {customerHint && (
        <p className="cp-controls" role="status">
          {customerHint}
        </p>
      )}
      {detail ? (
        <CustomerDetailWorkspace
          key={generation + ":" + key}
          scope={customerPreviewScope}
          customerKey={key ?? "missing"}
        />
      ) : (
        <CustomerListWorkspace key={generation} scope={customerPreviewScope} />
      )}
    </div>
  );
}
export function mount() {
  const node = document.getElementById("customer-prototype-root");
  if (!node) return;
  document.body.classList.add("cp-active");
  root = createRoot(node);
  root.render(<Preview />);
}
export function unmount() {
  root?.unmount();
  root = null;
  document.body.classList.remove("cp-active");
  customers.release();
}
document.addEventListener(
  "click",
  event => {
    if (!document.body.classList.contains("cp-active")) return;
    const anchor = (event.target as Element)?.closest<HTMLAnchorElement>(
      'a[href^="/merchant/"],a[href="/login"],a[href="/support"]'
    );
    if (!anchor) return;
    event.preventDefault();
    const href = anchor.getAttribute("href")!;
    if (href === "/login" || href === "/support") customerPublicAction();
    else location.hash = "#/page" + href;
  },
  true
);
