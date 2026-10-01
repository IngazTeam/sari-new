import { createContext, useContext } from "react";
declare const KNOWLEDGE_REMOVAL_COPY: Record<string, any>;
export const RemovalLanguage = createContext<"ar" | "en">("ar");
export function useTranslation() {
  const language = useContext(RemovalLanguage);
  return {
    i18n: {
      language,
      dir: () => (language === "ar" ? ("rtl" as const) : ("ltr" as const)),
    },
    t: (key: string, args: Record<string, unknown> = {}) => {
      const value = key
        .split(".")
        .slice(1)
        .reduce((o: any, k) => o?.[k], KNOWLEDGE_REMOVAL_COPY[language]);
      return typeof value === "string"
        ? value.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) =>
            String(args[k] ?? "")
          )
        : key;
    },
  };
}
