import { useSyncExternalStore } from "react";
import { QuotationPreviewModel } from "./quotation-model";
import { TemplatePreviewModel } from "./template-model";
export const model = new QuotationPreviewModel();
export const templates = new TemplatePreviewModel();
export let previewLanguage = "ar";
export const setPreviewLanguage = (language: string) => {
  previewLanguage = language;
  model.changed();
};
export const usePreviewVersion = () =>
  useSyncExternalStore(
    listener => {
      const quote = model.subscribe(listener),
        template = templates.subscribe(listener);
      return () => {
        quote();
        template();
      };
    },
    () => `${model.revision}:${templates.revision}`,
    () => `${model.revision}:${templates.revision}`
  );
