// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  readCustomerCache,
  saveCustomerCache,
  clearCustomerCache,
  customerKeyFromPath,
} from "../client/src/lib/customer-workspace-cache";
import {
  clearKnowledgeWorkspace,
  knowledgeCacheEpoch,
} from "../client/src/lib/knowledge-workspace-cache";
const scope = "7:20:customers",
  key = "966500000075",
  draft = { note: "Note" },
  attempt = {
    key,
    kind: "note" as const,
    content: "Note",
    requestId: "11111111-1111-4111-8111-111111111111",
  };
beforeEach(() => {
  sessionStorage.clear();
  clearKnowledgeWorkspace();
});
afterEach(() => vi.restoreAllMocks());
describe("customer draft identity and recovery", () => {
  it("isolates actor, merchant and customer and clears on sign-out", () => {
    saveCustomerCache(scope, key, { draft, attempt }, knowledgeCacheEpoch());
    expect(readCustomerCache(scope, key).attempt).toEqual(attempt);
    for (const [s, k] of [
      ["8:20:customers", key],
      ["7:21:customers", key],
      [scope, "different"],
    ])
      expect(readCustomerCache(s, k).draft.note).toBe("");
    clearKnowledgeWorkspace();
    expect(readCustomerCache(scope, key).attempt).toBeUndefined();
  });
  it("expires a draft after 24 hours but retains an unresolved attempt", () => {
    const now = Date.now();
    saveCustomerCache(scope, key, { draft }, knowledgeCacheEpoch());
    vi.spyOn(Date, "now").mockReturnValue(now + 86400001);
    expect(readCustomerCache(scope, key).draft.note).toBe("");
    vi.restoreAllMocks();
    saveCustomerCache(scope, key, { draft, attempt }, knowledgeCacheEpoch());
    vi.spyOn(Date, "now").mockReturnValue(now + 86400001);
    expect(readCustomerCache(scope, key).attempt).toEqual(attempt);
  });
  it("rejects stale callbacks and inconsistent pending payloads", () => {
    const epoch = knowledgeCacheEpoch();
    clearKnowledgeWorkspace();
    expect(() => saveCustomerCache(scope, key, { draft }, epoch)).toThrow();
    expect(() => clearCustomerCache(scope, key, epoch)).toThrow();
    expect(() =>
      saveCustomerCache(
        scope,
        key,
        { draft: { note: "Different" }, attempt },
        knowledgeCacheEpoch()
      )
    ).toThrow();
    expect(() =>
      saveCustomerCache(
        scope,
        key,
        { draft, attempt: { ...attempt, key: "other" } },
        knowledgeCacheEpoch()
      )
    ).toThrow();
    expect(() =>
      saveCustomerCache(
        scope,
        key,
        {
          draft,
          attempt: {
            kind: "tags",
            key,
            requestId: attempt.requestId,
            tags: ["A"],
            expectedRevision: 0,
          },
        },
        knowledgeCacheEpoch()
      )
    ).toThrow();
  });
  it("keeps failed storage explicit without a fake success", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    expect(() =>
      saveCustomerCache(scope, key, { draft }, knowledgeCacheEpoch())
    ).toThrow("Customer cache unavailable");
  });
  it.each(["group%literal", "group/a", "+966500000075", "عميل A"])(
    "decodes route identifier exactly once: %s",
    value => {
      expect(
        customerKeyFromPath("/merchant/customers/" + encodeURIComponent(value))
      ).toBe(value);
    }
  );
  it("rejects malformed escapes and unexpected paths", () => {
    expect(customerKeyFromPath("/merchant/customers/%E0%A4")).toBeNull();
    expect(customerKeyFromPath("/merchant/customers/")).toBeNull();
    expect(customerKeyFromPath("/another/path")).toBeNull();
  });
});
