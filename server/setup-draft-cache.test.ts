// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  readSetupDraft,
  rememberSetupDraft,
  forgetSetupDraft,
  sameSetupDraft,
} from "../client/src/lib/setup-draft-cache";
import {
  clearKnowledgeWorkspace,
  knowledgeCacheEpoch,
} from "../client/src/lib/knowledge-workspace-cache";
const entry = () => ({
  actorId: 4,
  merchantId: 21,
  baseDigest: "a".repeat(64),
  savedAt: Date.now(),
  payload: {
    currentStep: 3,
    completedSteps: [1, 2],
    wizardData: {
      businessName: "Local",
      products: [{ name: "Needs price", price: "", currency: "EUR" }],
    },
  },
});
beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());
describe("setup draft backup", () => {
  it("preserves incomplete raw fields without silently converting prices or currencies", () => {
    const a = entry();
    rememberSetupDraft(a, knowledgeCacheEpoch());
    expect(readSetupDraft(4, 21)).toEqual(a);
  });
  it("isolates both actor and merchant", () => {
    rememberSetupDraft(entry(), knowledgeCacheEpoch());
    expect(readSetupDraft(5, 21)).toBeNull();
    expect(readSetupDraft(4, 22)).toBeNull();
    expect(() => readSetupDraft(0, 21)).toThrow();
  });
  it("retains a newer edit when an earlier save is acknowledged", () => {
    const a = entry(),
      b = { ...a, payload: { ...a.payload, currentStep: 6 } };
    rememberSetupDraft(b, knowledgeCacheEpoch());
    forgetSetupDraft(4, 21, a.payload, knowledgeCacheEpoch());
    expect(readSetupDraft(4, 21)).toEqual(b);
    forgetSetupDraft(4, 21, b.payload, knowledgeCacheEpoch());
    expect(readSetupDraft(4, 21)).toBeNull();
  });
  it("compares object keys independently of order and retains array order", () => {
    const a = entry().payload;
    expect(
      sameSetupDraft(a, {
        wizardData: a.wizardData,
        completedSteps: [1, 2],
        currentStep: 3,
      })
    ).toBe(true);
    expect(sameSetupDraft(a, { ...a, completedSteps: [2, 1] })).toBe(false);
  });
  it.each(["broken", JSON.stringify({ ...entry(), merchantId: 22 })])(
    "never overwrites corrupt or incorrectly scoped storage",
    raw => {
      sessionStorage.setItem("sary:setup-draft:v1:4:21", raw);
      expect(() => readSetupDraft(4, 21)).toThrow();
      expect(() =>
        rememberSetupDraft(entry(), knowledgeCacheEpoch())
      ).toThrow();
      expect(sessionStorage.getItem("sary:setup-draft:v1:4:21")).toBe(raw);
    }
  );
  it("bounds UTF8 draft size before writing", () => {
    const a = entry();
    a.payload.wizardData.businessName = "ش".repeat(500_001);
    expect(() => rememberSetupDraft(a, knowledgeCacheEpoch())).toThrow();
    expect(readSetupDraft(4, 21)).toBeNull();
  });
  it("clears local drafts on logout and rejects late cache writes", () => {
    const epoch = knowledgeCacheEpoch();
    rememberSetupDraft(entry(), epoch);
    clearKnowledgeWorkspace();
    expect(readSetupDraft(4, 21)).toBeNull();
    expect(() => rememberSetupDraft(entry(), epoch)).toThrow("Session changed");
  });
  it("detects unavailable storage rather than claiming a backup exists", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    expect(() => rememberSetupDraft(entry(), knowledgeCacheEpoch())).toThrow(
      "Setup draft unavailable"
    );
  });
});
