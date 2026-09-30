// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  setupFieldsFromDraft,
  readSetupAttempt,
  rememberSetupAttempt,
  checkedSetupReceipt,
} from "../client/src/lib/setup-completion-workspace";
import {
  clearKnowledgeWorkspace,
  knowledgeCacheEpoch,
} from "../client/src/lib/knowledge-workspace-cache";
const fields = () =>
  setupFieldsFromDraft({
    businessName: "Store",
    phone: "+966500000001",
    products: [{ name: "Price", price: "12.34" }],
    services: [],
  });
const attempt = () => ({
  actorId: 4,
  merchantId: 21,
  input: {
    fields: fields(),
    reviewed: true as const,
    expectedDigest: "a".repeat(64),
    requestId: "63055d6e-9b7d-469c-bf3c-237c0097bdf6",
  },
});
beforeEach(() => sessionStorage.clear());
describe("setup draft conversion and durable attempt", () => {
  it("preserves exact prices and rejects incomplete rows without filtering them", () => {
    expect(fields().products[0].priceMinor).toBe(1234);
    expect(() =>
      setupFieldsFromDraft({
        businessName: "Store",
        phone: "+966500000001",
        products: [{ name: "No price", price: "" }],
      })
    ).toThrow();
  });
  it("isolates user and merchant, never replacing a pending request", () => {
    const a = attempt();
    rememberSetupAttempt(a, knowledgeCacheEpoch());
    expect(readSetupAttempt(4, 21)).toEqual(a);
    expect(readSetupAttempt(5, 21)).toBeNull();
    expect(readSetupAttempt(4, 22)).toBeNull();
    expect(() =>
      rememberSetupAttempt(
        {
          ...a,
          input: {
            ...a.input,
            fields: { ...a.input.fields, businessName: "Changed" },
          },
        },
        knowledgeCacheEpoch()
      )
    ).toThrow("Pending setup attempt");
  });
  it("clears account drafts on logout and rejects a late write from the previous session", () => {
    const epoch = knowledgeCacheEpoch();
    rememberSetupAttempt(attempt(), epoch);
    clearKnowledgeWorkspace();
    expect(readSetupAttempt(4, 21)).toBeNull();
    expect(() => rememberSetupAttempt(attempt(), epoch)).toThrow(
      "Session changed"
    );
  });
  it("retains unreadable request data for explicit recovery", () => {
    sessionStorage.setItem("sary:setup-completion:v1:4:21", "broken");
    expect(() => readSetupAttempt(4, 21)).toThrow();
    expect(sessionStorage.getItem("sary:setup-completion:v1:4:21")).toBe(
      "broken"
    );
  });
  it("checks receipt scope, request and exact item values", () => {
    const a = attempt(),
      receipt = {
        merchantId: 21,
        actorId: 4,
        requestId: a.input.requestId,
        confirmedAt: "2026-09-30T12:00:00.000Z",
        currency: "SAR",
        businessName: "Store",
        products: [{ id: 1, name: "Price", priceMinor: 1234, currency: "SAR" }],
        services: [],
        templateId: null,
        reviewedWebsite: null,
      };
    expect(checkedSetupReceipt(receipt, a)).toEqual(receipt);
    for (const patch of [
      { actorId: 5 },
      { merchantId: 22 },
      { products: [{ ...receipt.products[0], priceMinor: 0 }] },
      {
        services: [
          { id: 1, name: "Extra", priceMinor: 0, durationMinutes: 30 },
        ],
      },
    ])
      expect(() => checkedSetupReceipt({ ...receipt, ...patch }, a)).toThrow();
  });
});
