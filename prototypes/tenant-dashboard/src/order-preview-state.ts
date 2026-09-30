import { useSyncExternalStore } from "react";
import { OrderPreviewModel } from "./order-model";
import { OrderFinanceModel } from "./order-finance-model";
import { OrderPlatformModel } from "./order-platform-model";
export const orders = new OrderPreviewModel();
export const finances = new OrderFinanceModel(orders);
export const platforms = new OrderPlatformModel(orders);
export let orderLanguage = "ar";
const languageListeners = new Set<() => void>();
export const setOrderLanguage = (language: string) => {
  if (language !== "ar" && language !== "en") throw Error("Invalid language");
  orderLanguage = language;
  languageListeners.forEach(fn => fn());
};
export const useOrderLanguage = () =>
  useSyncExternalStore(
    fn => {
      languageListeners.add(fn);
      return () => {
        languageListeners.delete(fn);
      };
    },
    () => orderLanguage
  );
export const useOrderVersion = () =>
  useSyncExternalStore(
    orders.subscribe,
    () => orders.revision,
    () => orders.revision
  );
