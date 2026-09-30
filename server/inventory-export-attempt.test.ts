// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  readInventoryExportAttempt,
  rememberInventoryExportAttempt,
  forgetInventoryExportAttempt,
  acknowledgeInventoryExportAttempt,
} from "../client/src/lib/inventory-export-attempt";
import {
  knowledgeCacheEpoch,
  clearKnowledgeWorkspace,
} from "../client/src/lib/knowledge-workspace-cache";
const scope = "7:20:data-sync",
  prefix = "sary:inventory-export:v1:";
const sample = () => ({
  scope,
  attemptId: "11111111-1111-4111-8111-111111111112",
  spreadsheetId: "local-only",
  sourceDigest: "a".repeat(64),
  startedAt: "2026-09-30T12:00:00.000Z",
});
beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());
describe("local inventory export warning", () => {
  it("stores only bounded identity and destination information, isolated by actor and tenant", () => {
    const v = sample();
    rememberInventoryExportAttempt(scope, v, knowledgeCacheEpoch());
    expect(readInventoryExportAttempt(scope)).toEqual(v);
    expect(readInventoryExportAttempt("8:20:data-sync")).toBeNull();
    expect(readInventoryExportAttempt("7:21:data-sync")).toBeNull();
    expect(() =>
      rememberInventoryExportAttempt("7:21:data-sync", v, knowledgeCacheEpoch())
    ).toThrow();
  });
  it("does not replace an unresolved attempt or clear a different attempt", () => {
    rememberInventoryExportAttempt(scope, sample(), knowledgeCacheEpoch());
    expect(() =>
      rememberInventoryExportAttempt(
        scope,
        { ...sample(), attemptId: "22222222-2222-4222-8222-222222222222" },
        knowledgeCacheEpoch()
      )
    ).toThrow();
    expect(() =>
      forgetInventoryExportAttempt(scope, "different", knowledgeCacheEpoch())
    ).toThrow();
    expect(readInventoryExportAttempt(scope)).not.toBeNull();
    forgetInventoryExportAttempt(
      scope,
      sample().attemptId,
      knowledgeCacheEpoch()
    );
    expect(readInventoryExportAttempt(scope)).toBeNull();
  });
  it.each([
    "not-json",
    JSON.stringify({ ...sample(), scope: "8:20:data-sync" }),
    JSON.stringify({ ...sample(), spreadsheetId: "https://evil.test" }),
    "x".repeat(4097),
  ])(
    "rejects corrupt or foreign data %# until explicitly acknowledged",
    raw => {
      sessionStorage.setItem(prefix + scope, raw);
      expect(() => readInventoryExportAttempt(scope)).toThrow();
      expect(() =>
        rememberInventoryExportAttempt(scope, sample(), knowledgeCacheEpoch())
      ).toThrow();
      acknowledgeInventoryExportAttempt(scope, knowledgeCacheEpoch());
      expect(readInventoryExportAttempt(scope)).toBeNull();
    }
  );
  it("checks read-back when storage silently drops a write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    expect(() =>
      rememberInventoryExportAttempt(scope, sample(), knowledgeCacheEpoch())
    ).toThrow();
  });
  it("clears its prefix on logout and rejects late saves and clears", () => {
    const epoch = knowledgeCacheEpoch();
    rememberInventoryExportAttempt(scope, sample(), epoch);
    sessionStorage.setItem("other-module", "keep");
    clearKnowledgeWorkspace();
    expect(readInventoryExportAttempt(scope)).toBeNull();
    expect(sessionStorage.getItem("other-module")).toBe("keep");
    expect(() =>
      rememberInventoryExportAttempt(scope, sample(), epoch)
    ).toThrow();
    expect(() => acknowledgeInventoryExportAttempt(scope, epoch)).toThrow();
  });
});
