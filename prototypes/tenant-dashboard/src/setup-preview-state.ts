import { useSyncExternalStore } from "react";
import { SetupModel } from "./setup-model";
export const setup = new SetupModel();
export let setupLanguage: "ar" | "en" = "ar";
export const useSetupVersion = () =>
  useSyncExternalStore(setup.subscribe, setup.snapshot);
export function setSetupLanguage(value: "ar" | "en") {
  setupLanguage = value;
  setup.changed();
}
