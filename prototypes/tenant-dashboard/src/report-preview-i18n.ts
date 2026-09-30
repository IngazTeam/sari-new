import { useReportVersion, reportLanguage } from "./report-preview-state";
declare const REPORT_PREVIEW_COPY: Record<string, any>;
export function useTranslation() {
  useReportVersion();
  return {
    i18n: { language: reportLanguage },
    t: (key: string, values: Record<string, unknown> = {}) => {
      const value = key
        .split(".")
        .reduce((v: any, k) => v?.[k], REPORT_PREVIEW_COPY[reportLanguage]);
      return typeof value === "string"
        ? value.replace(/\{\{(\w+)\}\}/g, (_, name) =>
            String(values[name] ?? "")
          )
        : key;
    },
  };
}
