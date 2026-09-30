import {
  setupLanguage,
  setSetupLanguage,
  useSetupVersion,
} from "./setup-preview-state";
declare const SETUP_PREVIEW_COPY: Record<string, any>;
export const APP_LANGUAGE_OPTIONS = [
  { code: "ar", nativeName: "العربية", dir: "rtl", flag: "🇸🇦" },
  { code: "en", nativeName: "English", dir: "ltr", flag: "🇬🇧" },
];
export async function changeAppLanguage(value: string) {
  if (value === "ar" || value === "en") setSetupLanguage(value);
}
export function useTranslation() {
  useSetupVersion();
  return {
    i18n: { language: setupLanguage },
    t: (key: string, values: Record<string, unknown> = {}) => {
      const value = key
        .split(".")
        .reduce((v: any, k) => v?.[k], SETUP_PREVIEW_COPY[setupLanguage]);
      return typeof value === "string"
        ? value.replace(/\{\{(\w+)\}\}/g, (_, name) =>
            String(values[name] ?? "")
          )
        : key;
    },
  };
}
