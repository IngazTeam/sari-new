import { useSyncExternalStore } from "react";
import { ImportPreviewStore } from "./import-model";
import { ImportAdviceStore } from "./import-advice-model";
export const imports = new ImportPreviewStore();
export const advice = new ImportAdviceStore(() => imports.changed());
export let importLanguage = "ar",
  importHint = "";
export function useImportVersion() {
  return useSyncExternalStore(
    imports.subscribe,
    () => imports.version,
    () => imports.version
  );
}
export function setImportLanguage(value: string) {
  if (value === "ar" || value === "en") {
    importLanguage = value;
    imports.changed();
  }
}
export function importPublicAction() {
  importHint =
    importLanguage === "ar"
      ? "هذا مثال محلي؛ لم يُرسل طلب تسجيل دخول أو دعم."
      : "Local example; no sign-in or support request was sent.";
  imports.changed();
}
