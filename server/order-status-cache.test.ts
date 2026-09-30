// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  readOrderStatusCache,
  saveOrderStatusCache,
  clearOrderStatusCache,
} from "../client/src/lib/order-status-cache";
import {
  clearKnowledgeWorkspace,
  knowledgeCacheEpoch,
} from "../client/src/lib/knowledge-workspace-cache";
const scope = "7:20:orders",
  key = "sary:order-status:v1:" + scope;
const draft = {
  id: 1,
  status: "cancelled" as const,
  trackingNumber: "",
  reason: "Local reason",
  notify: false,
};
const attempt = {
  requestId: "11111111-1111-4111-8111-111111111111",
  intent: {
    id: 1,
    status: "cancelled" as const,
    reason: "Local reason",
    notify: false,
  },
  expectedDigest: "a".repeat(64),
  reviewed: true as const,
};
beforeEach(() => {
  sessionStorage.clear();
  clearKnowledgeWorkspace();
});
afterEach(() => vi.restoreAllMocks());
describe("order draft and uncertain operation storage", () => {
  it("isolates the actor and merchant and clears on logout", () => {
    saveOrderStatusCache(scope, { draft }, knowledgeCacheEpoch());
    expect(readOrderStatusCache(scope).draft).toEqual(draft);
    expect(readOrderStatusCache("8:20:orders")).toEqual({});
    expect(readOrderStatusCache("7:21:orders")).toEqual({});
    clearKnowledgeWorkspace();
    expect(readOrderStatusCache(scope)).toEqual({});
  });
  it("expires unsubmitted drafts but retains an uncertain request", () => {
    const now = Date.now();
    saveOrderStatusCache(scope, { draft }, knowledgeCacheEpoch());
    vi.spyOn(Date, "now").mockReturnValue(now + 86400001);
    expect(readOrderStatusCache(scope)).toEqual({});
    vi.restoreAllMocks();
    saveOrderStatusCache(scope, { draft, attempt }, knowledgeCacheEpoch());
    vi.spyOn(Date, "now").mockReturnValue(now + 86400001);
    expect(readOrderStatusCache(scope).attempt).toEqual(attempt);
  });
  it("rejects late callbacks after session cleanup", () => {
    const epoch = knowledgeCacheEpoch();
    clearKnowledgeWorkspace();
    expect(() => saveOrderStatusCache(scope, { draft }, epoch)).toThrow();
    expect(() => clearOrderStatusCache(scope, epoch)).toThrow();
  });
  it("does not accept oversized, invalid or mismatched operation data", () => {
    for (const raw of [
      "broken",
      "x".repeat(16001),
      JSON.stringify({
        savedAt: Date.now(),
        draft,
        attempt: { ...attempt, intent: { ...attempt.intent, id: 2 } },
      }),
    ]) {
      sessionStorage.setItem(key, raw);
      expect(() => readOrderStatusCache(scope)).toThrow();
    }
  });
  it("requires acknowledgement of storage before permitting a write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    expect(() =>
      saveOrderStatusCache(scope, { draft, attempt }, knowledgeCacheEpoch())
    ).toThrow();
  });
  it("rejects a mismatched order before replacing the recoverable cache", () => {
    saveOrderStatusCache(scope, { draft, attempt }, knowledgeCacheEpoch());
    expect(() =>
      saveOrderStatusCache(
        scope,
        { draft: { ...draft, id: 2 }, attempt },
        knowledgeCacheEpoch()
      )
    ).toThrow();
    expect(readOrderStatusCache(scope)).toEqual({ draft, attempt });
  });
});
