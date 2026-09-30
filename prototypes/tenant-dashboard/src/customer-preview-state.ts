import { useSyncExternalStore } from "react";
import { CustomerPreviewStore } from "./customer-model";
export const customers = new CustomerPreviewStore();
export let customerLanguage = "ar",
  customerHint = "";
export function useCustomerVersion() {
  return useSyncExternalStore(
    customers.subscribe,
    () => customers.version,
    () => customers.version
  );
}
export function setCustomerLanguage(language: string) {
  if (language === "ar" || language === "en") {
    customerLanguage = language;
    customers.changed();
  }
}
export function customerPublicAction() {
  customerHint =
    customerLanguage === "ar"
      ? "نموذج محلي؛ تسجيل الدخول والدعم في التطبيق الفعلي. لم تُرسل بيانات."
      : "Local preview. Sign-in and support are available in the actual app. No data was sent.";
  customers.changed();
}
