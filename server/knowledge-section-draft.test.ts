// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import {
  SECTION_DRAFT_PREFIX,
  readSectionDraft,
  writeSectionDraft,
  type SectionDraftSnapshot,
} from "../client/src/lib/knowledge-section-draft";
import {
  clearKnowledgeWorkspace,
  knowledgeCacheEpoch,
  hasKnowledgeDrafts,
} from "../client/src/lib/knowledge-workspace-cache";
const scope = "10:20:sections";
const draft = (): SectionDraftSnapshot => ({
  version: 1,
  savedAt: Date.now(),
  id: null,
  title: "Draft",
  content: "Private text",
  useInBot: false,
  sectionType: "custom",
  parentId: null,
  requestId: "a56f25af-4b44-4f29-baa9-15a3874e7a87",
  revision: null,
  phase: "editing",
});
beforeEach(() => {
  sessionStorage.clear();
  clearKnowledgeWorkspace();
});
it("isolates users and tenants", () => {
  writeSectionDraft(scope, draft(), knowledgeCacheEpoch());
  expect(readSectionDraft(scope)?.content).toBe("Private text");
  expect(readSectionDraft("10:21:sections")).toBeNull();
  expect(readSectionDraft("11:20:sections")).toBeNull();
  expect(() => readSectionDraft("../sections")).toThrow();
});
it.each([25 * 60 * 60 * 1000, -120000])(
  "discards expired or future-dated drafts (%s)",
  offset => {
    sessionStorage.setItem(
      SECTION_DRAFT_PREFIX + scope,
      JSON.stringify({ ...draft(), savedAt: Date.now() - offset })
    );
    expect(readSectionDraft(scope)).toBeNull();
    expect(sessionStorage.length).toBe(0);
  }
);
it.each(["ack", "deleting", "review", "unknown"])(
  "rejects persisted authority or unknown field %s",
  key => {
    sessionStorage.setItem(
      SECTION_DRAFT_PREFIX + scope,
      JSON.stringify({ ...draft(), [key]: true })
    );
    expect(readSectionDraft(scope)).toBeNull();
  }
);
it("clears text on logout and rejects writes by a stale component", () => {
  const epoch = knowledgeCacheEpoch();
  writeSectionDraft(scope, draft(), epoch);
  expect(hasKnowledgeDrafts()).toBe(true);
  sessionStorage.setItem("unrelated", "preserved");
  clearKnowledgeWorkspace();
  expect(hasKnowledgeDrafts()).toBe(false);
  expect(readSectionDraft(scope)).toBeNull();
  expect(() => writeSectionDraft(scope, draft(), epoch)).toThrow(
    "Session changed"
  );
  expect(sessionStorage.getItem("unrelated")).toBe("preserved");
});
it("fails explicitly when the browser refuses storage", () => {
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("Quota");
  });
  try {
    expect(() =>
      writeSectionDraft(scope, draft(), knowledgeCacheEpoch())
    ).toThrow();
  } finally {
    spy.mockRestore();
  }
});
