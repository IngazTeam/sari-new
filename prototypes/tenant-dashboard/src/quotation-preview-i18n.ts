import { usePreviewVersion, previewLanguage } from "./quotation-preview-state";
declare const QUOTATION_PREVIEW_COPY: Record<string, any>;
export function useTranslation() {
  usePreviewVersion();
  return {
    i18n: { language: previewLanguage },
    t: (key: string, values?: Record<string, unknown>) => {
      let text = key
        .split(".")
        .reduce((v: any, k) => v?.[k], QUOTATION_PREVIEW_COPY[previewLanguage]);
      if (typeof text !== "string") return key;
      for (const [name, value] of Object.entries(values ?? {}))
        text = text.replaceAll(`{{${name}}}`, String(value));
      return text;
    },
  };
}
