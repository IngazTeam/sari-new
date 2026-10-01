import { createContext, useContext } from "react";
declare const KNOWLEDGE_GROUPS_COPY: Record<string, any>;
export const GroupsLanguage = createContext<"ar" | "en">("ar");
export function useTranslation() {
  const language = useContext(GroupsLanguage);
  return {
    i18n: {
      language,
      dir: () => (language === "ar" ? ("rtl" as const) : ("ltr" as const)),
    },
    t: (key: string, args: Record<string, unknown> = {}) => {
      const value = key
        .split(".")
        .reduce((o: any, k) => o?.[k], KNOWLEDGE_GROUPS_COPY[language]);
      return typeof value === "string"
        ? value.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) =>
            String(args[k] ?? "")
          )
        : key;
    },
  };
}
