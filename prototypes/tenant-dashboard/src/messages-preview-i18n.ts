import { createContext, useContext } from "react";
declare const MESSAGES_PREVIEW_COPY: Record<string, any>;
export const MessagesPreviewLanguage = createContext<"ar" | "en">("ar");
export function useTranslation() {
  const language = useContext(MessagesPreviewLanguage);
  return {
    i18n: {
      language,
      dir: () => (language === "ar" ? ("rtl" as const) : ("ltr" as const)),
    },
    t: (key: string, args: Record<string, unknown> = {}) => {
      const value = key
        .split(".")
        .reduce((node, key) => node?.[key], MESSAGES_PREVIEW_COPY[language]);
      return typeof value === "string"
        ? value.replace(/\{\{(\w+)\}\}/g, (_, k) => String(args[k] ?? ""))
        : key;
    },
  };
}
