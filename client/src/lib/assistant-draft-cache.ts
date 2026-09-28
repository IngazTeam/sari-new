import type { AssistantSettingsDraft } from "@shared/assistant-settings-draft";

export type CachedAssistantDraft = {
  base: AssistantSettingsDraft;
  draft: AssistantSettingsDraft;
  revision: string;
  section: string;
};
// Memory only: business instructions never enter browser persistent storage.
const drafts = new Map<string, CachedAssistantDraft>();
const warnBeforeUnload = (event: BeforeUnloadEvent) => {
  if (!drafts.size) return;
  event.preventDefault();
  event.returnValue = "";
};
export function assistantDraftKey(userId: number, merchantId: number) {
  return `${userId}:${merchantId}`;
}
export function readAssistantDraft(key: string) {
  const draft = drafts.get(key);
  return draft ? structuredClone(draft) : null;
}
export function cacheAssistantDraft(key: string, draft: CachedAssistantDraft) {
  if (!drafts.size) window.addEventListener("beforeunload", warnBeforeUnload);
  drafts.set(key, structuredClone(draft));
}
export function discardAssistantDraft(key: string) {
  drafts.delete(key);
  if (!drafts.size)
    window.removeEventListener("beforeunload", warnBeforeUnload);
}
export function clearAssistantDrafts() {
  drafts.clear();
  window.removeEventListener("beforeunload", warnBeforeUnload);
}
export function hasAssistantDrafts() {
  return drafts.size > 0;
}
