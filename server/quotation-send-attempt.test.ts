// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readQuotationSendAttempt,
  rememberQuotationSendAttempt,
} from "../client/src/lib/quotation-send-attempt";
import {
  knowledgeCacheEpoch,
  clearKnowledgeWorkspace,
} from "../client/src/lib/knowledge-workspace-cache";
const scope = "7:20:sales-hub",
  key = "sary:quotation-send:v1:" + scope + ":1";
const value = () => ({
  review: {
    requestId: randomUUID(),
    quotationId: 1,
    expectedRevision: 1,
    instanceRecordId: 2,
    templateId: null,
  },
  delivery: {
    requestId: randomUUID(),
    reviewId: 3,
    snapshotHash: "a".repeat(64),
  },
});
beforeEach(() => {
  clearKnowledgeWorkspace();
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());
describe("quotation request restoration", () => {
  it("stores only request identity and selection, never approval, commercial text or recipient", () => {
    const v = value();
    rememberQuotationSendAttempt(scope, 1, v, knowledgeCacheEpoch());
    expect(readQuotationSendAttempt(scope, 1)).toEqual(v);
    const stored = JSON.parse(sessionStorage.getItem(key)!);
    expect(Object.keys(stored).sort()).toEqual([
      "delivery",
      "review",
      "savedAt",
    ]);
    expect(stored.delivery).not.toHaveProperty("confirmed");
    expect(localStorage.length).toBe(0);
    for (const other of ["8:20:sales-hub", "7:21:sales-hub"])
      expect(readQuotationSendAttempt(other, 1)).toEqual({});
    expect(readQuotationSendAttempt(scope, 2)).toEqual({});
  });
  it("fails closed on corrupt or blocked storage rather than silently starting a new request", () => {
    sessionStorage.setItem(key, "{broken");
    expect(() => readQuotationSendAttempt(scope, 1)).toThrow();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    expect(() =>
      rememberQuotationSendAttempt(scope, 1, value(), knowledgeCacheEpoch())
    ).toThrow();
  });
  it("rejects invented context and cross-quote stored review identity", () => {
    expect(() =>
      rememberQuotationSendAttempt("unknown", 1, value(), knowledgeCacheEpoch())
    ).toThrow();
    sessionStorage.setItem(
      key,
      JSON.stringify({
        ...value(),
        review: { ...value().review, quotationId: 99 },
        savedAt: Date.now(),
      })
    );
    expect(() => readQuotationSendAttempt(scope, 1)).toThrow();
  });
  it("expires references after 24 hours and rejects future timestamps", () => {
    for (const savedAt of [Date.now() - 86400001, Date.now() + 60000]) {
      sessionStorage.setItem(key, JSON.stringify({ ...value(), savedAt }));
      expect(readQuotationSendAttempt(scope, 1)).toEqual({});
    }
  });
  it("clears on logout and prevents an old callback from restoring a cleared session", () => {
    const epoch = knowledgeCacheEpoch();
    rememberQuotationSendAttempt(scope, 1, value(), epoch);
    sessionStorage.setItem("unrelated", "keep");
    clearKnowledgeWorkspace();
    expect(readQuotationSendAttempt(scope, 1)).toEqual({});
    expect(sessionStorage.getItem("unrelated")).toBe("keep");
    expect(() =>
      rememberQuotationSendAttempt(scope, 1, value(), epoch)
    ).toThrow("Session changed");
  });
  it("refuses accidental persistence of confirmation or document contents", () => {
    const v = value();
    expect(() =>
      rememberQuotationSendAttempt(
        scope,
        1,
        { ...v, delivery: { ...v.delivery, confirmed: true } } as any,
        knowledgeCacheEpoch()
      )
    ).toThrow();
    expect(() =>
      rememberQuotationSendAttempt(
        scope,
        1,
        { ...v, document: "private" } as any,
        knowledgeCacheEpoch()
      )
    ).toThrow();
  });
});
