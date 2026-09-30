import { useSyncExternalStore } from "react";
import { QuotationPreviewModel } from "./quotation-model";
export const model = new QuotationPreviewModel();
export let previewLanguage = "ar";
export const setPreviewLanguage = (language: string) => {
  previewLanguage = language;
  model.changed();
};
export const usePreviewVersion = () =>
  useSyncExternalStore(
    model.subscribe,
    () => model.revision,
    () => model.revision
  );
