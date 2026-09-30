// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import {
  blankQuotationForm,
  quotationFormInput,
  readQuotationEditorCache,
  saveQuotationEditorCache,
  clearQuotationEditorCache,
} from "../client/src/lib/quotation-editor-cache";
import {
  clearKnowledgeWorkspace,
  knowledgeCacheEpoch,
} from "../client/src/lib/knowledge-workspace-cache";
const id = "11111111-1111-4111-8111-111111111111",
  scope = "7:20:sales-hub";
beforeEach(() => {
  sessionStorage.clear();
  clearKnowledgeWorkspace();
});
afterEach(() => vi.restoreAllMocks());
describe("quotation form and recovery storage", () => {
  it("keeps empty and invalid numeric fields invalid, including exponent/hex input", () => {
    const f = blankQuotationForm();
    f.items[0].name = "Item";
    for (const unitPrice of ["", "-1", "0x10", "1e3", "1.001"]) {
      f.items[0].unitPrice = unitPrice;
      expect(quotationFormInput(f, id).success).toBe(false);
    }
  });
  it("retains exact fractional quantities and percent without floating point artifacts", () => {
    const f = blankQuotationForm();
    f.items[0] = {
      name: "Item",
      description: "Full description",
      quantity: "1.125",
      unitPrice: "10.01",
    };
    f.tax = "6.01";
    const parsed = quotationFormInput(f, id);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.taxBasisPoints).toBe(601);
      expect(parsed.data.items[0].quantity).toBe(1.125);
    }
  });
  it("validates phone, 50 item bound, currency and field lengths", () => {
    const f = blankQuotationForm();
    f.items[0].name = "Item";
    f.customerPhone = "bad";
    expect(quotationFormInput(f, id).success).toBe(false);
    f.customerPhone = "";
    f.items = Array.from({ length: 51 }, () => f.items[0]);
    expect(quotationFormInput(f, id).success).toBe(false);
  });
  it("restores only actor/merchant scope and clears local drafts on logout", () => {
    const form = blankQuotationForm();
    form.customerName = "Local draft";
    saveQuotationEditorCache(scope, { form }, knowledgeCacheEpoch());
    expect(readQuotationEditorCache(scope).form).toEqual(form);
    expect(readQuotationEditorCache("8:20:sales-hub")).toEqual({});
    expect(readQuotationEditorCache("7:21:sales-hub")).toEqual({});
    clearKnowledgeWorkspace();
    expect(readQuotationEditorCache(scope)).toEqual({});
  });
  it("expires after 24 hours and refuses stale callbacks after logout", () => {
    const epoch = knowledgeCacheEpoch();
    saveQuotationEditorCache(scope, { form: blankQuotationForm() }, epoch);
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 86400001);
    expect(readQuotationEditorCache(scope)).toEqual({});
    clearKnowledgeWorkspace();
    expect(() => saveQuotationEditorCache(scope, {}, epoch)).toThrow(
      "Session changed"
    );
    expect(() => clearQuotationEditorCache(scope, epoch)).toThrow(
      "Session changed"
    );
  });
  it("does not silently overwrite corrupt or unavailable storage", () => {
    sessionStorage.setItem("sary:quotation-editor:v1:" + scope, "{broken");
    expect(() => readQuotationEditorCache(scope)).toThrow();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw Error("quota");
    });
    expect(() =>
      saveQuotationEditorCache(scope, {}, knowledgeCacheEpoch())
    ).toThrow("quota");
  });
});
