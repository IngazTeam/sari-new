import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ProductCatalogWorkspace } from "../../../client/src/components/merchant/ProductCatalogWorkspace";
import { clearProductWorkspaceCache } from "../../../client/src/lib/product-workspace-cache";
import { clearCategoryDraft } from "../../../client/src/lib/product-category-workspace";
import { clearDetailDraft } from "../../../client/src/lib/product-details-workspace";
import { detailModes, type DetailMode } from "./product-detail-model";
import { stockModes, type StockMode } from "./product-stock-model";
import { categoryModes, type CategoryMode } from "./product-category-model";
import { knowledgeCacheEpoch } from "../../../client/src/lib/knowledge-workspace-cache";
import {
  productModes,
  productPreviewScope,
  type ProductMode,
} from "./product-model";
import {
  products,
  categories,
  details,
  stock,
  useProductVersion,
  productLanguage,
  setProductLanguage,
  productHint,
  productPublicAction,
} from "./product-preview-state";
import "./product-preview.css";
let root: Root | null = null;
export const handles = (page: { route: string }) =>
  page?.route === "/merchant/products";
export const render = () => '<div id="product-prototype-root"></div>';
function Preview() {
  useProductVersion();
  const [generation, setGeneration] = useState(0),
    [confirm, setConfirm] = useState(false),
    [storageError, setStorageError] = useState(false);
  return (
    <div dir={productLanguage === "ar" ? "rtl" : "ltr"}>
      <aside className="pp-controls" aria-label="محاكاة المنتجات">
        <p>
          موك أب بشاشات المنتجات الفعلية. البيانات والحفظ والحذف والإيصالات
          محاكاة في ذاكرة الصفحة وتعود عند إعادة التحميل. المسودات محلية معزولة؛
          لا اتصال بخادم أو متجر خارجي. إذا أعدت تحميل الصفحة أثناء طلب معلق،
          استخدم «إعادة المثال» لبدء محاكاة جديدة؛ إيصالات المثال ليست محفوظة
          على خادم.
        </p>
        <div>
          <label>
            حالة المثال
            <select
              value={products.mode}
              onChange={e => products.setMode(e.target.value as ProductMode)}
            >
              {Object.entries(productModes).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            اللغة / Language
            <select
              value={productLanguage}
              onChange={e => setProductLanguage(e.target.value)}
            >
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </label>
          <label>
            حالة الفئات
            <select
              value={categories.mode}
              onChange={e => categories.setMode(e.target.value as CategoryMode)}
            >
              {Object.entries(categoryModes).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={categories.conflict}>
            محاكاة تعديل زميل للفئات
          </button>
          <label>
            حالة الخيارات والنسخ
            <select
              value={details.mode}
              onChange={e => details.setMode(e.target.value as DetailMode)}
            >
              {Object.entries(detailModes).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={details.conflict}>
            محاكاة تعديل زميل للخيارات والنسخ
          </button>
          <label>
            حالة المخزون
            <select
              value={stock.mode}
              onChange={e => stock.setMode(e.target.value as StockMode)}
            >
              {Object.entries(stockModes).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={products.conflict}>
            محاكاة تعديل زميل للمنتج 27
          </button>
          <button type="button" onClick={() => setConfirm(true)}>
            إعادة المثال
          </button>
        </div>
        {confirm && (
          <div role="alert">
            <p>إعادة بيانات هذا المثال ومسودته وطلبه غير المؤكد فقط؟</p>
            <button
              type="button"
              onClick={() => {
                try {
                  clearProductWorkspaceCache(
                    productPreviewScope,
                    knowledgeCacheEpoch()
                  );
                  clearCategoryDraft(
                    productPreviewScope,
                    knowledgeCacheEpoch()
                  );
                  const prefix =
                    "sary:product-detail:v1:" +
                    productPreviewScope.split(":").slice(0, 2).join(":") +
                    ":product-details:";
                  for (const key of Object.keys(sessionStorage).filter(key =>
                    key.startsWith(prefix)
                  ))
                    clearDetailDraft(
                      key.slice("sary:product-detail:v1:".length),
                      knowledgeCacheEpoch()
                    );
                  details.reset();
                  stock.reset();
                  categories.reset();
                  products.reset();
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
        {storageError && <p role="alert">تعذر مسح مسودة المثال.</p>}
      </aside>
      {productHint && (
        <p className="pp-controls" role="status">
          {productHint}
        </p>
      )}
      <ProductCatalogWorkspace
        key={generation}
        scope={productPreviewScope}
        href={path => "#/page" + path}
      />
    </div>
  );
}
export function mount() {
  const node = document.getElementById("product-prototype-root");
  if (!node) return;
  document.body.classList.add("pp-active");
  root = createRoot(node);
  root.render(<Preview />);
}
export function unmount() {
  root?.unmount();
  root = null;
  document.body.classList.remove("pp-active");
}
document.addEventListener(
  "click",
  event => {
    if (
      !document.body.classList.contains("pp-active") ||
      document.body.classList.contains("pi-active")
    )
      return;
    const anchor = (event.target as Element)?.closest<HTMLAnchorElement>(
      'a[href^="/merchant/"],a[href="/login"],a[href="/support"]'
    );
    if (!anchor) return;
    event.preventDefault();
    const href = anchor.getAttribute("href")!;
    if (href === "/login" || href === "/support") productPublicAction();
    else location.hash = "#/page" + href;
  },
  true
);
