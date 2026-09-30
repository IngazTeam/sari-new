import { importLanguage, useImportVersion } from "./import-preview-state";
declare const IMPORT_PREVIEW_COPY: Record<string, any>;
export function useTranslation() {
  useImportVersion();
  return {
    i18n: { language: importLanguage },
    t: (key: string, values: Record<string, unknown> = {}) => {
      const value = key
        .split(".")
        .reduce((v: any, k) => v?.[k], IMPORT_PREVIEW_COPY[importLanguage]);
      return typeof value === "string"
        ? value.replace(/\{\{(\w+)\}\}/g, (_, name) =>
            String(values[name] ?? "")
          )
        : key;
    },
  };
}
