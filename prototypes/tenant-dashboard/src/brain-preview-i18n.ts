import { createContext, useContext } from "react";
declare const BRAIN_PREVIEW_COPY: Record<
  string,
  Record<string, Record<string, string>>
>;
export const PreviewLanguage = createContext<"ar" | "en">("ar");
export function useTranslation() {
  const language = useContext(PreviewLanguage);
  return {
    i18n: {
      language,
      dir: () => (language === "ar" ? ("rtl" as const) : ("ltr" as const)),
    },
    t: (key: string, args: Record<string, unknown> = {}) =>
      BRAIN_PREVIEW_COPY[language][key.split(".")[0]]?.[
        key.split(".")[1]
      ]?.replace(/\{\{(\w+)\}\}/g, (_, k) => String(args[k] ?? "")) || key,
  };
}
