import { useOrderVersion, orderLanguage } from "./order-preview-state";
import merchantUxAr from "../../../client/src/locales/merchant-ux.ar";
import merchantUxEn from "../../../client/src/locales/merchant-ux.en";
declare const ORDER_PREVIEW_COPY: Record<string, any>;
export function useTranslation() {
  useOrderVersion();
  return {
    i18n: { language: orderLanguage },
    t: (key: string, values: Record<string, unknown> = {}) => {
      const value = key
        .split(".")
        .reduce((v: any, k) => v?.[k], {
          ...ORDER_PREVIEW_COPY[orderLanguage],
          merchantUx: orderLanguage === "ar" ? merchantUxAr : merchantUxEn,
        });
      return typeof value === "string"
        ? value.replace(/\{\{(\w+)\}\}/g, (_, name) =>
            String(values[name] ?? "")
          )
        : key;
    },
  };
}
