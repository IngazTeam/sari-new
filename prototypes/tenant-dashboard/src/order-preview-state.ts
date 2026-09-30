import { useSyncExternalStore } from "react";
import { OrderPreviewModel } from "./order-model";
export const orders = new OrderPreviewModel();
export let orderLanguage = "ar";
export const setOrderLanguage = (language: string) => {
  orderLanguage = language;
  orders.changed();
};
export const useOrderVersion = () =>
  useSyncExternalStore(
    orders.subscribe,
    () => orders.revision,
    () => orders.revision
  );
