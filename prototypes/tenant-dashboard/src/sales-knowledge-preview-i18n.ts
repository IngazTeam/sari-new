import { createContext, useContext } from "react";
declare const SALES_KNOWLEDGE_COPY: Record<string, Record<string, string>>;
export const SalesLanguage = createContext<"ar" | "en">("ar");
export function useTranslation() {
  const language = useContext(SalesLanguage);
  return {
    i18n: {
      language,
      dir: () => (language === "ar" ? ("rtl" as const) : ("ltr" as const)),
    },
    t: (key: string, values: Record<string, unknown> = {}) => {
      const value = SALES_KNOWLEDGE_COPY[language][key.split(".").at(-1)!];
      return (
        value?.replace(/\{\{(\w+)\}\}/g, (_, name) =>
          String(values[name] ?? "")
        ) || key
      );
    },
  };
}
