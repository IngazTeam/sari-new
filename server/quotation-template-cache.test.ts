// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  blankTemplateForm,
  readTemplateCache,
  saveTemplateCache,
  clearTemplateCache,
} from "../client/src/lib/quotation-template-cache";
import {
  clearKnowledgeWorkspace,
  knowledgeCacheEpoch,
} from "../client/src/lib/knowledge-workspace-cache";
const scope = "7:20:quotation-templates",
  key = "sary:quotation-template:v1:" + scope;
beforeEach(() => {
  sessionStorage.clear();
  clearKnowledgeWorkspace();
});
afterEach(() => vi.restoreAllMocks());
describe("template draft and request recovery", () => {
  it("isolates actor and merchant and clears on logout", () => {
    saveTemplateCache(
      scope,
      { draft: { mode: "create", form: blankTemplateForm() } },
      knowledgeCacheEpoch()
    );
    expect(readTemplateCache(scope).draft).toBeTruthy();
    expect(readTemplateCache("8:20:quotation-templates")).toEqual({});
    expect(readTemplateCache("7:21:quotation-templates")).toEqual({});
    clearKnowledgeWorkspace();
    expect(readTemplateCache(scope)).toEqual({});
  });
  it("expires drafts but retains uncertain writes beyond24hours", () => {
    saveTemplateCache(
      scope,
      { draft: { mode: "create", form: blankTemplateForm() } },
      knowledgeCacheEpoch()
    );
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 86400001);
    expect(readTemplateCache(scope)).toEqual({});
    vi.restoreAllMocks();
    saveTemplateCache(
      scope,
      {
        attempt: {
          action: "create",
          requestId: "11111111-1111-4111-8111-111111111111",
          fields: {
            name: "Pending",
            headerImageUrl: null,
            termsText: null,
            footerText: null,
            isDefault: false,
          },
        },
      },
      knowledgeCacheEpoch()
    );
    vi.spyOn(Date, "now").mockReturnValue(now + 86400001);
    expect(readTemplateCache(scope).attempt).toBeTruthy();
  });
  it("rejects late callbacks after logout", () => {
    const epoch = knowledgeCacheEpoch();
    clearKnowledgeWorkspace();
    expect(() => saveTemplateCache(scope, {}, epoch)).toThrow();
    expect(() => clearTemplateCache(scope, epoch)).toThrow();
  });
  it("fails closed on broken or excessive storage", () => {
    for (const raw of [
      "{broken",
      "x".repeat(100001),
      JSON.stringify({
        savedAt: Date.now(),
        attempt: { action: "delete", requestId: "bad" },
      }),
    ]) {
      sessionStorage.setItem(key, raw);
      expect(() => readTemplateCache(scope)).toThrow();
    }
  });
  it("requires storage acknowledgement before permitting a write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    expect(() =>
      saveTemplateCache(
        scope,
        { draft: { mode: "create", form: blankTemplateForm() } },
        knowledgeCacheEpoch()
      )
    ).toThrow();
  });
});
