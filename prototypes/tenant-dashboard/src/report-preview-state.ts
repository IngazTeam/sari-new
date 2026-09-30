import { useSyncExternalStore } from "react";
import type { ReportMode } from "./report-model";
export let reportMode: ReportMode = "data",
  reportLanguage = "ar",
  reportVersion = 0;
export let reportHint = "";
const listeners = new Set<() => void>(),
  pending = new Set<() => void>();
function changed() {
  reportVersion++;
  listeners.forEach(fn => fn());
}
export function useReportVersion() {
  return useSyncExternalStore(
    fn => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => reportVersion,
    () => reportVersion
  );
}
export function setReportMode(mode: ReportMode) {
  reportMode = mode;
  reportHint = "";
  changed();
}
export function setReportLanguage(language: string) {
  if (language !== "ar" && language !== "en") return;
  reportLanguage = language;
  changed();
}
export function refreshReport() {
  if (!["forbidden", "session"].includes(reportMode)) reportMode = "data";
  changed();
  return Promise.resolve();
}
export function waitReportExport() {
  return new Promise<void>(resolve => pending.add(resolve));
}
export function releaseReportExports() {
  pending.forEach(resolve => resolve());
  pending.clear();
}
export function resetReport() {
  reportMode = "data";
  reportHint = "";
  changed();
  releaseReportExports();
}
export function reportPublicAction() {
  reportHint =
    reportLanguage === "ar"
      ? "هذا نموذج محلي؛ تسجيل الدخول والتواصل مع الدعم يتمان من التطبيق الفعلي. لم تُرسل بيانات."
      : "This is a local preview. Sign-in and support are available in the actual app. No data was sent.";
  changed();
}
