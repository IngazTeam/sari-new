import { useSyncExternalStore } from "react";
import { ProductPreviewStore } from "./product-model";
import { ProductCategoryPreviewStore } from "./product-category-model";
export const products = new ProductPreviewStore();
export const categories = new ProductCategoryPreviewStore(() => products.changed());
export let productLanguage = "ar",
  productHint = "";
export function useProductVersion() {
  return useSyncExternalStore(
    products.subscribe,
    () => products.version,
    () => products.version
  );
}
export function setProductLanguage(value: string) {
  if (value === "ar" || value === "en") {
    productLanguage = value;
    products.changed();
  }
}
export function productPublicAction() {
  productHint =
    productLanguage === "ar"
      ? "هذا مثال محلي. تسجيل الدخول والدعم في التطبيق الفعلي؛ لم تُرسل بيانات."
      : "Local preview. Sign-in and support are in the actual app; no data was sent.";
  products.changed();
}
