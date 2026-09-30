import { createContext, useContext } from "react";
declare const WEBSITE_ANALYSIS_COPY: Record<string, Record<string, string>>;
export const AnalysisLanguage = createContext<"ar" | "en">("ar");
export function useTranslation() {
  const language = useContext(AnalysisLanguage);
  return {
    i18n: {
      language,
      dir: () => (language === "ar" ? ("rtl" as const) : ("ltr" as const)),
    },
    t: (key: string, values: Record<string, unknown> = {}) => {
      const value = WEBSITE_ANALYSIS_COPY[language][key.split(".").at(-1)!];
      return (
        value?.replace(/\{\{(\w+)\}\}/g, (_, name) =>
          String(values[name] ?? "")
        ) || key
      );
    },
  };
}
