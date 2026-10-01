import { createContext, useContext } from "react";
declare const DASHBOARD_PREVIEW_COPY: Record<string, any>;
export const DashboardPreviewLanguage = createContext<"ar" | "en">("ar");
export function useTranslation() {
  const language = useContext(DashboardPreviewLanguage);
  return {
    i18n: {
      language,
      dir: () => (language === "ar" ? ("rtl" as const) : ("ltr" as const)),
    },
    t: (key: string, args: Record<string, unknown> = {}) => {
      const value = key
        .split(".")
        .reduce((node, key) => node?.[key], DASHBOARD_PREVIEW_COPY[language]);
      return typeof value === "string"
        ? value.replace(/\{\{(\w+)\}\}/g, (_, k) => String(args[k] ?? ""))
        : key;
    },
  };
}
