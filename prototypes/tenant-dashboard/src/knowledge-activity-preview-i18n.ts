import { createContext, useContext } from "react";
declare const KNOWLEDGE_ACTIVITY_COPY: Record<string, Record<string, string>>;
export const ActivityLanguage = createContext<"ar" | "en">("ar");
export function useTranslation() {
  const language = useContext(ActivityLanguage);
  return {
    i18n: {
      language,
      dir: () => (language === "ar" ? ("rtl" as const) : ("ltr" as const)),
    },
    t: (key: string, args: Record<string, unknown> = {}) => {
      const value = KNOWLEDGE_ACTIVITY_COPY[language][key.split(".").at(-1)!];
      return (
        value?.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) =>
          String(args[k] ?? "")
        ) || key
      );
    },
  };
}
