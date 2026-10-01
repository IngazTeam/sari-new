// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { emptyVirtualAgent } from "../shared/virtual-agent-form";
import {
  clearKnowledgeWorkspace,
  knowledgeCacheEpoch,
} from "../client/src/lib/knowledge-workspace-cache";
import {
  readVirtualTeamDraft,
  writeVirtualTeamDraft,
  discardVirtualTeamDraft,
} from "../client/src/lib/virtual-team-draft";
const scope = "7:20:virtual-team",
  prefix = "sary:virtual-team-draft:v1:";
const fixture = () => ({
  editing: 12,
  revision: "a".repeat(64),
  base: structuredClone(emptyVirtualAgent),
  form: {
    ...structuredClone(emptyVirtualAgent),
    name: "مسودة",
    personalityPrompt: "تعليمات غير مكتملة",
    triggerKeywords: ["شحن"],
  },
  keywords: " كلمة لم تضف ",
  tab: "routing" as const,
  submitted: false,
});
beforeEach(() => {
  clearKnowledgeWorkspace();
  sessionStorage.clear();
});
afterEach(() => vi.restoreAllMocks());
it("keeps complete unfinished fields, raw keyword text and the active tab without saving a persona", () => {
  const value = fixture();
  expect(writeVirtualTeamDraft(scope, value, knowledgeCacheEpoch())).toBe(true);
  expect(readVirtualTeamDraft(scope)).toMatchObject({
    state: "ready",
    persisted: true,
    value,
  });
  value.form.name = "changed";
  expect(readVirtualTeamDraft(scope)).toMatchObject({
    value: { form: { name: "مسودة" } },
  });
  expect(localStorage.length).toBe(0);
});
it("preserves a frozen request and rejects mismatched scope, editor or reviewed revision", () => {
  const original = fixture();
  const form = { ...original.form, role: "دعم" };
  const attempt = {
    merchantId: 20,
    requestId: "30000000-0000-4000-8000-000000000001",
    editing: 12,
    expectedRevision: original.revision,
    draft: form,
  };
  const value = { ...original, form, keywords: "", submitted: true, attempt };
  expect(writeVirtualTeamDraft(scope, value, knowledgeCacheEpoch())).toBe(true);
  expect(readVirtualTeamDraft(scope)).toMatchObject({ value: { attempt } });
  for (const change of [
    { merchantId: 21 },
    { editing: 99 },
    { expectedRevision: "b".repeat(64) },
    { draft: { ...form, name: "Other" } },
  ])
    expect(
      writeVirtualTeamDraft(
        scope,
        { ...value, attempt: { ...attempt, ...change } },
        knowledgeCacheEpoch()
      )
    ).toBe(false);
});
it("reads a stored draft after a fresh page instance without relying on memory", () => {
  sessionStorage.setItem(
    prefix + scope,
    JSON.stringify({ ...fixture(), version: 1, scope, updatedAt: Date.now() })
  );
  expect(readVirtualTeamDraft(scope)).toMatchObject({
    state: "ready",
    value: { editing: 12, keywords: " كلمة لم تضف " },
  });
});
it.each(["7:21:virtual-team", "8:20:virtual-team"])(
  "isolates the draft from %s",
  other => {
    writeVirtualTeamDraft(scope, fixture(), knowledgeCacheEpoch());
    expect(readVirtualTeamDraft(other).state).toBe("missing");
  }
);
it.each(["0:1:virtual-team", "1:2:other", "not-a-scope"])(
  "rejects invalid scope %s",
  invalid => {
    expect(
      writeVirtualTeamDraft(invalid, fixture(), knowledgeCacheEpoch())
    ).toBe(false);
    expect(sessionStorage.length).toBe(0);
  }
);
it("rejects another scope inside the stored payload and malformed fields without truncating them", () => {
  const data = {
    ...fixture(),
    version: 1,
    scope: "7:21:virtual-team",
    updatedAt: Date.now(),
  };
  sessionStorage.setItem(prefix + scope, JSON.stringify(data));
  expect(readVirtualTeamDraft(scope).state).toBe("invalid");
  sessionStorage.setItem(
    prefix + scope,
    JSON.stringify({ ...data, scope, form: { ...data.form, isDefault: "yes" } })
  );
  expect(readVirtualTeamDraft(scope).state).toBe("invalid");
});
it("expires after 24 hours and rejects future timestamps without deleting the evidence automatically", () => {
  const now = Date.now();
  writeVirtualTeamDraft(scope, fixture(), knowledgeCacheEpoch(), now);
  expect(readVirtualTeamDraft(scope, now + 86400000).state).toBe("expired");
  expect(sessionStorage.getItem(prefix + scope)).not.toBeNull();
  clearKnowledgeWorkspace();
  sessionStorage.setItem(
    prefix + scope,
    JSON.stringify({ ...fixture(), version: 1, scope, updatedAt: now + 120000 })
  );
  expect(readVirtualTeamDraft(scope, now).state).toBe("invalid");
});
it("retains a memory copy when storage fails and reports that reload recovery is unavailable", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("quota");
  });
  expect(writeVirtualTeamDraft(scope, fixture(), knowledgeCacheEpoch())).toBe(
    false
  );
  expect(readVirtualTeamDraft(scope)).toMatchObject({
    state: "ready",
    persisted: false,
    value: { form: { name: "مسودة" } },
  });
});
it("clears on logout and fences late callbacks from recreating the prior session draft", () => {
  const epoch = knowledgeCacheEpoch();
  writeVirtualTeamDraft(scope, fixture(), epoch);
  clearKnowledgeWorkspace();
  expect(readVirtualTeamDraft(scope).state).toBe("missing");
  expect(writeVirtualTeamDraft(scope, fixture(), epoch)).toBe(false);
  expect(discardVirtualTeamDraft(scope, epoch)).toBe(false);
});
it("preserves the submitted marker for ambiguous outcomes and removes only the chosen draft", () => {
  writeVirtualTeamDraft(
    scope,
    { ...fixture(), submitted: true },
    knowledgeCacheEpoch()
  );
  writeVirtualTeamDraft("7:21:virtual-team", fixture(), knowledgeCacheEpoch());
  expect(readVirtualTeamDraft(scope)).toMatchObject({
    value: { submitted: true },
  });
  discardVirtualTeamDraft(scope);
  expect(readVirtualTeamDraft(scope).state).toBe("missing");
  expect(readVirtualTeamDraft("7:21:virtual-team").state).toBe("ready");
});
