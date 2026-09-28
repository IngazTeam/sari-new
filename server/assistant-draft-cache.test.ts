// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  assistantDraftKey,
  cacheAssistantDraft,
  readAssistantDraft,
  discardAssistantDraft,
  clearAssistantDrafts,
} from "../client/src/lib/assistant-draft-cache";
import {
  assistantSettingsDraft,
  compareAssistantDraft,
} from "../shared/assistant-settings-draft";
afterEach(clearAssistantDrafts);
const base = assistantSettingsDraft({ welcomeMessage: "saved" });
describe("assistant drafts stay within the current browser lifetime and account", () => {
  it("isolates both tenant and user and returns copies instead of mutable references", () => {
    cacheAssistantDraft(assistantDraftKey(1, 20), {
      base,
      draft: { ...base, welcomeMessage: "private" },
      revision: "a",
      section: "schedule",
    });
    expect(readAssistantDraft(assistantDraftKey(1, 21))).toBeNull();
    expect(readAssistantDraft(assistantDraftKey(2, 20))).toBeNull();
    const read = readAssistantDraft(assistantDraftKey(1, 20))!;
    read.draft.welcomeMessage = "modified copy";
    expect(
      readAssistantDraft(assistantDraftKey(1, 20))!.draft.welcomeMessage
    ).toBe("private");
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });
  it("warns before reload even after route unmount, and releases warnings on save/discard/logout", () => {
    cacheAssistantDraft("1:20", {
      base,
      draft: { ...base, welcomeMessage: "draft" },
      revision: "a",
      section: "schedule",
    });
    const exit = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(exit);
    expect(exit.defaultPrevented).toBe(true);
    discardAssistantDraft("1:20");
    const savedExit = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(savedExit);
    expect(savedExit.defaultPrevented).toBe(false);
    cacheAssistantDraft("1:20", {
      base,
      draft: base,
      revision: "a",
      section: "basics",
    });
    clearAssistantDrafts();
    expect(readAssistantDraft("1:20")).toBeNull();
  });
  it("merges independent edits and requires review only when the same field differs", () => {
    const own = {
      ...base,
      welcomeMessage: "mine",
      tone: "professional" as const,
    };
    const latest = {
      ...base,
      welcomeMessage: "theirs",
      language: "en" as const,
    };
    expect(compareAssistantDraft(base, own, latest)).toEqual({
      merged: { ...latest, welcomeMessage: "mine", tone: "professional" },
      conflicts: ["welcomeMessage"],
    });
    expect(
      compareAssistantDraft(base, own, { ...latest, welcomeMessage: "mine" })
        .conflicts
    ).toEqual([]);
    expect(compareAssistantDraft(base, base, latest).merged).toEqual(latest);
  });
});
