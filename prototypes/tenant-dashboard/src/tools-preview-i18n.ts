declare const TOOLS_PREVIEW_COPY: Record<string, any>;
let language: "ar" | "en" = "ar";
export const setToolsPreviewLanguage = (value: "ar" | "en") => {
  language = value;
};
export function translateToolsPreview(key: string, args: Record<string, unknown> = {}) {
  const copy = TOOLS_PREVIEW_COPY[args.lng === 'ar' || args.lng === 'en' ? args.lng : language];
  const value = key.split('.').reduce((node, key) => node?.[key], copy);
  return typeof value === 'string' ? value.replace(/\{\{(\w+)\}\}/g, (_, k) => String(args[k] ?? '')) : key;
}
export function useTranslation() {
  return {
    i18n: { language, dir: () => (language === "ar" ? "rtl" : "ltr") },
    t: translateToolsPreview,
  };
}
