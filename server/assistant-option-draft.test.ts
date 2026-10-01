// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  readAssistantOptionDraft,
  writeAssistantOptionDraft,
  discardAssistantOptionDraft,
  restoreAssistantOptionForm,
} from "../client/src/lib/assistant-option-draft";
import {
  clearKnowledgeWorkspace,
  knowledgeCacheEpoch,
} from "../client/src/lib/knowledge-workspace-cache";
const scope = "7:20:assistant-language",
  key = "sary:assistant-option-draft:v1:" + scope;
const input = {
  base: { language: "ar" },
  form: { language: "fr" },
  revision: "a".repeat(64),
  submitted: false,
};
beforeEach(() => {
  clearKnowledgeWorkspace();
  sessionStorage.clear();
});
afterEach(() => vi.restoreAllMocks());
describe("assistant option draft recovery", () => {
  it("retains a detached copy scoped to account, tenant and option page", () => {
    expect(
      writeAssistantOptionDraft(
        scope,
        "language",
        input,
        knowledgeCacheEpoch(),
        1000
      )
    ).toBe(true);
    const result = readAssistantOptionDraft(scope, "language", 1001);
    expect(result).toMatchObject({
      state: "ready",
      persisted: true,
      value: input,
    });
    if (result.state === "ready" && result.value.kind === "language")
      result.value.form.language = "en";
    expect(readAssistantOptionDraft(scope, "language", 1001)).toMatchObject({
      value: { form: { language: "fr" } },
    });
    expect(
      readAssistantOptionDraft("8:20:assistant-language", "language").state
    ).toBe("missing");
    expect(
      readAssistantOptionDraft("7:21:assistant-language", "language").state
    ).toBe("missing");
    expect(readAssistantOptionDraft(scope, "takeover").state).toBe("invalid");
  });
  it("keeps blank and invalid minutes available for field correction", () => {
    const takeoverScope = "7:20:human-takeover";
    for (const minutes of [NaN, 0, 5.5, 121]) {
      expect(
        writeAssistantOptionDraft(
          takeoverScope,
          "takeover",
          {
            ...input,
            base: { takeoverTimeoutMinutes: 15, takeoverCommandsEnabled: true },
            form: {
              takeoverTimeoutMinutes: minutes,
              takeoverCommandsEnabled: false,
            },
          },
          knowledgeCacheEpoch()
        )
      ).toBe(true);
      const result = readAssistantOptionDraft(takeoverScope, "takeover");
      expect(result.state).toBe("ready");
      if (result.state === "ready")
        expect(restoreAssistantOptionForm(result.value)).toEqual({
          takeoverTimeoutMinutes: minutes,
          takeoverCommandsEnabled: false,
        });
    }
  });
  it.each(["other", "7:0:assistant-language", "7:20:human-takeover"])(
    "rejects invalid scope %s",
    value => {
      expect(
        writeAssistantOptionDraft(
          value,
          "language",
          input,
          knowledgeCacheEpoch()
        )
      ).toBe(false);
    }
  );
  it.each([
    "invalid JSON",
    JSON.stringify({ version: 2 }),
    JSON.stringify({
      ...input,
      version: 1,
      scope: "7:21:assistant-language",
      kind: "language",
      updatedAt: 1000,
    }),
    JSON.stringify({
      ...input,
      version: 1,
      scope,
      kind: "language",
      updatedAt: 1000,
      unexpected: true,
    }),
    JSON.stringify({
      ...input,
      version: 1,
      scope,
      kind: "language",
      updatedAt: 1000,
      form: { language: "invalid" },
    }),
  ])("rejects corrupt or cross-store browser data without writing it", raw => {
    sessionStorage.setItem(key, raw);
    expect(readAssistantOptionDraft(scope, "language", 1001).state).toBe(
      "invalid"
    );
    expect(sessionStorage.getItem(key)).toBe(raw);
  });
  it("expires after 24 hours and rejects future timestamps", () => {
    writeAssistantOptionDraft(
      scope,
      "language",
      input,
      knowledgeCacheEpoch(),
      100000
    );
    expect(
      readAssistantOptionDraft(scope, "language", 100000 + 86400000).state
    ).toBe("expired");
    expect(readAssistantOptionDraft(scope, "language", 0).state).toBe(
      "invalid"
    );
  });
  it("clears on logout and ignores writes from the previous session epoch", () => {
    const epoch = knowledgeCacheEpoch();
    writeAssistantOptionDraft(scope, "language", input, epoch);
    clearKnowledgeWorkspace();
    expect(readAssistantOptionDraft(scope, "language").state).toBe("missing");
    expect(writeAssistantOptionDraft(scope, "language", input, epoch)).toBe(
      false
    );
    expect(sessionStorage.getItem(key)).toBeNull();
  });
  it("keeps an in-memory draft when durable storage fails and discards it explicitly", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw Error("quota");
    });
    expect(
      writeAssistantOptionDraft(
        scope,
        "language",
        { ...input, submitted: true },
        knowledgeCacheEpoch()
      )
    ).toBe(false);
    expect(readAssistantOptionDraft(scope, "language")).toMatchObject({
      state: "ready",
      persisted: false,
      value: { submitted: true },
    });
    expect(discardAssistantOptionDraft(scope)).toBe(true);
    expect(readAssistantOptionDraft(scope, "language").state).toBe("missing");
  });
});
