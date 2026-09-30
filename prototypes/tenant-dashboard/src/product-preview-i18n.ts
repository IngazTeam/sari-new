import { useProductVersion, productLanguage } from "./product-preview-state";
declare const PRODUCT_PREVIEW_COPY: Record<string, any>;
export function useTranslation() {
  useProductVersion();
  return {
    i18n: { language: productLanguage },
    t: (key: string, values: Record<string, unknown> = {}) => {
      const value = key
        .split(".")
        .reduce((v: any, k) => v?.[k], PRODUCT_PREVIEW_COPY[productLanguage]);
      return typeof value === "string"
        ? value.replace(/\{\{(\w+)\}\}/g, (_, name) =>
            String(values[name] ?? "")
          )
        : key;
    },
  };
}
