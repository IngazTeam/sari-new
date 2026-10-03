// @vitest-environment jsdom
import { beforeEach, it, expect } from "vitest";
import {
  clearKnowledgeWorkspace,
  knowledgeCacheEpoch,
} from "../client/src/lib/knowledge-workspace-cache";
import {
  readWebsiteAttempt,
  saveWebsiteAttempt,
} from "../client/src/lib/website-analysis-attempt";
const scope = "7:20:brain-page",
  first = "00000000-0000-4000-8000-000000000001",
  second = "00000000-0000-4000-8000-000000000002";
beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  clearKnowledgeWorkspace();
});
it("cannot overwrite another pending reference with a stale expected value", () => {
  saveWebsiteAttempt(scope, first, null, knowledgeCacheEpoch());
  expect(() =>
    saveWebsiteAttempt(scope, second, null, knowledgeCacheEpoch())
  ).toThrow();
  expect(readWebsiteAttempt(scope)).toBe(first);
  saveWebsiteAttempt(scope, second, first, knowledgeCacheEpoch());
  expect(readWebsiteAttempt(scope)).toBe(second);
  expect(localStorage.length).toBe(0);
});
it("rejects a late write after session clearing and preserves unrelated storage", () => {
  const epoch = knowledgeCacheEpoch();
  sessionStorage.setItem("unrelated", "keep");
  saveWebsiteAttempt(scope, first, null, epoch);
  clearKnowledgeWorkspace();
  expect(() => saveWebsiteAttempt(scope, second, null, epoch)).toThrow();
  expect(readWebsiteAttempt(scope)).toBeNull();
  expect(sessionStorage.getItem("unrelated")).toBe("keep");
});
it.each([
  "7:20:other",
  "0:20:brain-page",
  "7:0:brain-page",
  "7:20:brain-page:extra",
])("rejects an invalid scope %s", scope => {
  expect(() => readWebsiteAttempt(scope)).toThrow();
  expect(() =>
    saveWebsiteAttempt(scope, first, null, knowledgeCacheEpoch())
  ).toThrow();
  expect(sessionStorage.length).toBe(0);
});
