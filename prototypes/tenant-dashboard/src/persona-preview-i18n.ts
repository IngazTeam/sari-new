import { createContext, useContext } from "react";
declare const PERSONA_PREVIEW_COPY: Record<string, any>;
export const PersonaPreviewLanguage = createContext<"ar" | "en">("ar");
export function useTranslation() {
  const language = useContext(PersonaPreviewLanguage);
  return {
    i18n: {
      language,
      dir: () => (language === "ar" ? ("rtl" as const) : ("ltr" as const)),
    },
    t: (key: string, args: Record<string, unknown> = {}) => {
      const value = key
        .split(".")
        .reduce((node, key) => node?.[key], PERSONA_PREVIEW_COPY[language]);
      return typeof value === "string"
        ? value.replace(/\{\{(\w+)\}\}/g, (_, k) => String(args[k] ?? ""))
        : key;
    },
  };
}
