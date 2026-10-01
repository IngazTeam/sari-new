// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assistantDraftKey,
  cacheAssistantDraft,
  readAssistantDraft,
  discardAssistantDraft,
  clearAssistantDrafts,
  readAssistantDraftStatus,
  assistantDraftEpoch,
  hasAssistantDrafts,
} from "../client/src/lib/assistant-draft-cache";
import {
  assistantSettingsDraft,
  compareAssistantDraft,
} from "../shared/assistant-settings-draft";
beforeEach(() => {
  clearAssistantDrafts();
  sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  clearAssistantDrafts();
});
const base = assistantSettingsDraft({ welcomeMessage: "saved" });
describe("assistant drafts stay within the scoped 24-hour tab session", () => {
  it("isolates both tenant and user and returns copies instead of mutable references", () => {
    cacheAssistantDraft(assistantDraftKey(1, 20), {
      base,
      draft: { ...base, welcomeMessage: "private" },
      revision: "a".repeat(64),
      section: "schedule",
    });
    expect(readAssistantDraft(assistantDraftKey(1, 21))).toBeNull();
    expect(readAssistantDraft(assistantDraftKey(2, 20))).toBeNull();
    const read = readAssistantDraft(assistantDraftKey(1, 20))!;
    read.draft.welcomeMessage = "modified copy";
    expect(
      readAssistantDraft(assistantDraftKey(1, 20))!.draft.welcomeMessage
    ).toBe("private");
    expect(sessionStorage.length).toBe(1);
    expect(localStorage.length).toBe(0);
  });
  it("warns on reload when storage fails and releases the warning on discard or logout", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw Error("quota");
    });
    cacheAssistantDraft("1:20", {
      base,
      draft: { ...base, welcomeMessage: "draft" },
      revision: "a".repeat(64),
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
      revision: "a".repeat(64),
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
  it("restores from browser storage with no in-memory draft and preserves empty numeric fields", () => {
    const key = "sary:assistant-settings-draft:v1:1:20";
    cacheAssistantDraft("1:20", {
      base,
      draft: {
        ...base,
        responseDelay: NaN,
        maxResponseLength: NaN,
        welcomeMessage: "restore",
      },
      revision: "a".repeat(64),
      section: "schedule",
      submitted: true,
    });
    const raw = sessionStorage.getItem(key)!;
    clearAssistantDrafts();
    sessionStorage.setItem(key, raw);
    expect(hasAssistantDrafts()).toBe(true);
    const read = readAssistantDraft("1:20")!;
    expect(read.draft.responseDelay).toBeNaN();
    expect(read.draft.maxResponseLength).toBeNaN();
    expect(read.draft.welcomeMessage).toBe("restore");
    expect(read.submitted).toBe(true);
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
  it("expires after 24 hours, rejects future records, and blocks old session writes", () => {
    const draft = {
        base,
        draft: base,
        revision: "a".repeat(64),
        section: "basics",
      },
      epoch = assistantDraftEpoch();
    cacheAssistantDraft("1:20", draft, epoch, 100000);
    expect(readAssistantDraftStatus("1:20", 100000 + 86400000).state).toBe(
      "expired"
    );
    expect(readAssistantDraftStatus("1:20", 0).state).toBe("invalid");
    clearAssistantDrafts();
    expect(cacheAssistantDraft("1:20", draft, epoch)).toBe(false);
    expect(sessionStorage.length).toBe(0);
  });
  it.each([
    "invalid",
    JSON.stringify({ version: 2 }),
    JSON.stringify({
      version: 1,
      scope: "1:21",
      updatedAt: Date.now(),
      value: { base, draft: base, revision: "a".repeat(64), section: "basics" },
    }),
  ])("rejects corrupt or foreign stored drafts without rewriting them", raw => {
    const key = "sary:assistant-settings-draft:v1:1:20";
    sessionStorage.setItem(key, raw);
    expect(readAssistantDraftStatus("1:20").state).toBe("invalid");
    expect(sessionStorage.getItem(key)).toBe(raw);
  });
  it("clears persisted drafts on logout and never stores policy authority fields", () => {
    const value = {
      base,
      draft: { ...base, discountEnabled: true },
      revision: "a".repeat(64),
      section: "sales",
    };
    expect(cacheAssistantDraft("1:20", value)).toBe(false);
    cacheAssistantDraft("1:20", { ...value, draft: base });
    expect(sessionStorage.length).toBe(1);
    clearAssistantDrafts();
    expect(sessionStorage.length).toBe(0);
    expect(hasAssistantDrafts()).toBe(false);
  });
});
