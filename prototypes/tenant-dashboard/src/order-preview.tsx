import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { OrderWorkspace } from "../../../client/src/components/merchant/OrderWorkspace";
import { orderModes, orderPreviewScope, type OrderMode } from "./order-model";
import { financeModes, type FinanceMode } from "./order-finance-model";
import {
  finances,
  orders,
  orderLanguage,
  setOrderLanguage,
  useOrderVersion,
} from "./order-preview-state";
import "./quotation-preview.css";
import "./order-preview.css";
let root: Root | null = null;
export const handles = (page: { route: string }) =>
  page?.route === "/merchant/orders";
export const render = () => '<div id="order-prototype-root"></div>';
export function unmount() {
  root?.unmount();
  root = null;
  document.body.classList.remove("op-active");
}
function Preview() {
  useOrderVersion();
  finances.sync();
  const [generation, setGeneration] = useState(0),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState(false);
  return (
    <div className="qp-preview" dir={orderLanguage === "ar" ? "rtl" : "ltr"}>
      <aside className="qp-controls" aria-label="خيارات محاكاة الطلبات">
        <p>
          موك أب يستخدم صفحة الطلبات ومراجعة الحالة الفعليتين. بيانات مصطنعة في
          ذاكرة الصفحة؛ لا دفع أو إرسال أو اتصال بالخادم. السجل يعود إلى أصله
          عند إعادة تحميل الصفحة.
        </p>
        <div>
          <label>
            حالة المثال
            <select
              value={orders.mode}
              onChange={e => orders.setMode(e.target.value as OrderMode)}
            >
              {Object.entries(orderModes).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            حالة الأدوات المالية
            <select
              value={finances.mode}
              onChange={e => finances.setMode(e.target.value as FinanceMode)}
            >
              {Object.entries(financeModes).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            اللغة / Language
            <select
              value={orderLanguage}
              onChange={e => setOrderLanguage(e.target.value)}
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
            <p>إعادة بيانات مثال الطلبات ومسودته فقط؟</p>
            <button
              type="button"
              onClick={() => {
                try {
                  sessionStorage.removeItem(
                    "sary:order-status:v1:" + orderPreviewScope
                  );
                  orders.reset();
                  setGeneration(v => v + 1);
                  setConfirm(false);
                  setError(false);
                } catch {
                  setError(true);
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
        {error && <p role="alert">تعذر مسح مسودة المثال من المتصفح.</p>}
      </aside>
      <OrderWorkspace
        key={generation}
        scope={orderPreviewScope}
        href={path => "#/page" + path}
      />
      <p className="qp-footnote">
        مثال 002 لمراجعة الفاتورة والهامش، و001 لمحاولات الدفع، و006 لتحرير
        الخصم. العمليات توضيحية في الذاكرة ولا تحرك أموالًا. أمثلة سلة وزد
        تُستكمل بشكل منفصل. المحاكاة لا تثبت صلاحيات الخادم أو دوام الإيصالات أو
        وصول إشعار.
      </p>
    </div>
  );
}
export function mount() {
  const node = document.getElementById("order-prototype-root");
  if (!node) return;
  document.body.classList.add("op-active");
  root = createRoot(node);
  root.render(<Preview />);
}
// Only this in-memory fixture resets on load; a previous simulated receipt is not a server receipt.
try {
  const key = "sary:order-status:v1:" + orderPreviewScope,
    raw = sessionStorage.getItem(key);
  if (raw) {
    const v = JSON.parse(raw);
    delete v.attempt;
    sessionStorage.setItem(key, JSON.stringify(v));
  }
} catch {
  /* Actual workspace displays storage failure. */
}
document.addEventListener("click", event => {
  if (!document.body.classList.contains("op-active")) return;
  const a = (event.target as Element)?.closest<HTMLAnchorElement>(
    'a[href^="/merchant/"]'
  );
  if (a) {
    event.preventDefault();
    location.hash = "#/page" + a.getAttribute("href");
  }
});
