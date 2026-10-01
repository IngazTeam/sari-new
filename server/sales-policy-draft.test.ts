// @vitest-environment jsdom
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  clearSalesPolicyDrafts,
  salesPolicyDraftEpoch,
  writeSalesPolicyDraft,
  readSalesPolicyDraft,
  discardSalesPolicyDraft,
  parseSalesPolicyRead,
  policyFromForm,
  type SalesPolicyDraft,
} from "../client/src/lib/sales-policy-draft";
import { clearKnowledgeWorkspace } from "../client/src/lib/knowledge-workspace-cache";
const scope = "7:20:sales-discount",
  key = "sary:sales-policy-draft:v1:" + scope;
const draft: SalesPolicyDraft = {
  base: {
    merchantId: 20,
    revision: 2,
    evidence: "a".repeat(64),
    policy: { enabled: false, maxPercent: 15, expireHours: 48 },
  },
  form: { enabled: true, percent: "", hours: "24" },
  submitted: false,
};
beforeEach(() => {
  clearSalesPolicyDrafts();
  sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  clearSalesPolicyDrafts();
});
it("restores empty fields from storage alone and isolates actor, store and policy", () => {
  expect(
    writeSalesPolicyDraft(scope, "discount", draft, salesPolicyDraftEpoch()),
  ).toBe(true);
  const raw = sessionStorage.getItem(key)!;
  clearSalesPolicyDrafts();
  sessionStorage.setItem(key, raw);
  expect(readSalesPolicyDraft(scope, "discount")).toMatchObject({
    state: "ready",
    value: draft,
  });
  for (const s of ["8:20:sales-discount", "7:21:sales-discount"])
    expect(readSalesPolicyDraft(s, "discount").state).toBe("missing");
  expect(readSalesPolicyDraft(scope, "margin").state).toBe("invalid");
  expect(() => policyFromForm("discount", draft.form)).toThrow();
});
it("expires drafts after 24 hours without silently removing them", () => {
  writeSalesPolicyDraft(
    scope,
    "discount",
    draft,
    salesPolicyDraftEpoch(),
    1000,
  );
  expect(readSalesPolicyDraft(scope, "discount", 86401000).state).toBe(
    "expired",
  );
  expect(sessionStorage.getItem(key)).not.toBeNull();
});
it.each(["garbage", "{}", "null"])(
  "keeps malformed storage until explicit discard: %s",
  (raw) => {
    sessionStorage.setItem(key, raw);
    expect(readSalesPolicyDraft(scope, "discount").state).toBe("invalid");
    expect(sessionStorage.getItem(key)).toBe(raw);
    expect(discardSalesPolicyDraft(scope, salesPolicyDraftEpoch())).toBe(true);
    expect(sessionStorage.getItem(key)).toBeNull();
  },
);
it("rejects copied foreign data, wrong policy shapes, future dates and persisted consent", () => {
  writeSalesPolicyDraft(scope, "discount", draft, salesPolicyDraftEpoch());
  const saved = JSON.parse(sessionStorage.getItem(key)!);
  clearSalesPolicyDrafts();
  for (const record of [
    { ...saved, scope: "8:20:sales-discount" },
    { ...saved, updatedAt: Date.now() + 120000 },
    { ...saved, value: { ...saved.value, reviewed: true } },
    {
      ...saved,
      value: { ...saved.value, base: { ...saved.value.base, merchantId: 21 } },
    },
    {
      ...saved,
      value: {
        ...saved.value,
        base: { ...saved.value.base, policy: { enabled: true, minPercent: 3 } },
      },
    },
  ]) {
    sessionStorage.setItem(key, JSON.stringify(record));
    expect(readSalesPolicyDraft(scope, "discount").state).toBe("invalid");
  }
});
it("prevents stale writers after sign-out and clears both policy drafts", () => {
  const epoch = salesPolicyDraftEpoch();
  writeSalesPolicyDraft(scope, "discount", draft, epoch);
  clearKnowledgeWorkspace();
  expect(sessionStorage.getItem(key)).toBeNull();
  expect(writeSalesPolicyDraft(scope, "discount", draft, epoch)).toBe(false);
  expect(readSalesPolicyDraft(scope, "discount").state).toBe("missing");
});
it("keeps a memory copy on storage failure and does not acknowledge a failed removal", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("full");
  });
  expect(
    writeSalesPolicyDraft(scope, "discount", draft, salesPolicyDraftEpoch()),
  ).toBe(false);
  expect(readSalesPolicyDraft(scope, "discount")).toMatchObject({
    state: "ready",
    persisted: false,
    value: draft,
  });
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
    throw Error("blocked");
  });
  expect(discardSalesPolicyDraft(scope, salesPolicyDraftEpoch())).toBe(false);
  expect(readSalesPolicyDraft(scope, "discount").state).toBe("ready");
});
it("rejects foreign, malformed or unprivileged policy reads as authority", () => {
  const data = { ...draft.base, canManage: true, history: [] };
  expect(parseSalesPolicyRead("discount", data, 20).merchantId).toBe(20);
  for (const bad of [
    { ...data, merchantId: 21 },
    { ...data, canManage: undefined },
    { ...data, evidence: "bad" },
    { ...data, history: [{}] },
  ])
    expect(() => parseSalesPolicyRead("discount", bad, 20)).toThrow();
  expect(
    parseSalesPolicyRead("discount", { ...data, canManage: false }, 20)
      .canManage,
  ).toBe(false);
});
