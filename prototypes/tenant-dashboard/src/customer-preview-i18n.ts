import { useCustomerVersion, customerLanguage } from "./customer-preview-state";
declare const CUSTOMER_PREVIEW_COPY: Record<string, any>;
export function useTranslation() {
  useCustomerVersion();
  return {
    i18n: { language: customerLanguage },
    t: (key: string, values: Record<string, unknown> = {}) => {
      const value = key
        .split(".")
        .reduce((v: any, k) => v?.[k], CUSTOMER_PREVIEW_COPY[customerLanguage]);
      return typeof value === "string"
        ? value.replace(/\{\{(\w+)\}\}/g, (_, name) =>
            String(values[name] ?? "")
          )
        : key;
    },
  };
}
