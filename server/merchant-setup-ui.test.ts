// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import { toast } from "sonner";

const api = vi.hoisted(() => ({
  query: {} as any,
  save: vi.fn(async () => ({ success: true })),
  complete: vi.fn(async () => ({ success: true })),
  review: vi.fn(),
  receipt: vi.fn(),
  readProgress: vi.fn(),
  navigate: vi.fn(),
  invalidate: vi.fn(async () => undefined),
}));
vi.mock("wouter", () => ({
  useLocation: () => ["/merchant/setup-wizard", api.navigate],
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      setupWizard: {
        completionReceipt: { fetch: api.receipt },
        getProgress: { fetch: api.readProgress },
      },
      merchants: {
        getCurrent: { invalidate: api.invalidate },
        getOnboardingStatus: { invalidate: api.invalidate },
      },
      products: { list: { invalidate: api.invalidate } },
      services: { list: { invalidate: api.invalidate } },
    }),
    setupWizard: {
      getProgress: { useQuery: () => api.query },
      saveProgress: { useMutation: () => ({ mutateAsync: api.save }) },
      completeSetup: { useMutation: () => ({ mutateAsync: api.complete }) },
      reviewSetup: { useMutation: () => ({ mutateAsync: api.review }) },
    },
  },
}));
vi.mock("@/components/LanguageSwitcher", () => ({
  LanguageSwitcher: () => null,
  useLanguageDirection: () => "rtl",
}));
vi.mock("@/components/PreviewChat", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars: Record<string, unknown> = {}) => {
      const copy =
        key.split(".").reduce((value: any, part) => value?.[part], ar) || key;
      return String(copy).replace(/\{\{(\w+)\}\}/g, (_, name) =>
        String(vars[name] ?? "")
      );
    },
  }),
}));
import SetupWizard from "../client/src/pages/SetupWizard";
import {
  rememberSetupDraft,
  readSetupDraft,
} from "../client/src/lib/setup-draft-cache";
import {
  knowledgeCacheEpoch,
  clearKnowledgeWorkspace,
} from "../client/src/lib/knowledge-workspace-cache";

let root: Root;
let container: HTMLDivElement;
const draft = (step: number, name = "متجر الاختبار") => ({
  actorId: 4,
  merchantId: 21,
  digest: "a".repeat(64),
  currency: "SAR",
  isCompleted: 0,
  currentStep: step,
  completedSteps: JSON.stringify(
    Array.from({ length: step - 1 }, (_, i) => i + 1)
  ),
  wizardData: JSON.stringify({
    businessType: "store",
    businessName: name,
    phone: "+966500000081",
    products: [],
    botTone: "professional",
    botLanguage: "en",
  }),
});
const successfulReceipt = (input: any) => ({
  actorId: 4,
  merchantId: 21,
  requestId: input.requestId,
  confirmedAt: "2026-09-30T12:00:00.000Z",
  businessName: input.fields.businessName,
  currency: "SAR",
  products: input.fields.products.map((row: any, i: number) => ({
    id: i + 1,
    name: row.name,
    priceMinor: row.priceMinor,
    currency: row.currency,
  })),
  services: input.fields.services.map((row: any, i: number) => ({
    id: i + 1,
    name: row.name,
    priceMinor: row.priceMinor,
    durationMinutes: row.durationMinutes,
  })),
  templateId: input.fields.templateId ?? null,
  reviewedWebsite: input.fields.websiteAnalysis ?? null,
});
const render = () =>
  act(async () => {
    root.render(React.createElement(SetupWizard));
  });
const button = (text: string) =>
  Array.from(container.querySelectorAll("button")).find(
    node => node.textContent?.trim() === text
  )!;
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  sessionStorage.clear();
  api.save.mockResolvedValue({ digest: "b".repeat(64) } as any);
  api.complete.mockImplementation(async (input?: any) =>
    successfulReceipt(input)
  );
  api.review.mockImplementation(async ({ fields }) => ({
    actorId: 4,
    merchantId: 21,
    digest: "c".repeat(64),
    currency: "SAR",
    canComplete: true,
    alreadyCompleted: false,
    catalogLocked: false,
    templateAvailable: true,
    conflicts: [],
    fields,
  }));
  api.receipt.mockResolvedValue(null);
  api.readProgress.mockImplementation(async () => api.query.data);
  api.invalidate.mockResolvedValue(undefined);
  api.query = {
    data: draft(1),
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: vi.fn(),
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("merchant setup resume and confirmation", () => {
  it.each([
    [{ name: "سعر ناقص", price: "" }],
    [{ name: "", price: "7" }],
    null,
    "broken",
  ])(
    "blocks invalid review data without losing it or approving it: %j",
    async products => {
      api.query.data = draft(10);
      const raw = JSON.parse(api.query.data.wizardData);
      api.query.data.wizardData = JSON.stringify({ ...raw, products });
      await render();
      expect(container.textContent).toContain(ar.setupCatalogUx.reviewInvalid);
      expect(button(ar.setupApprovalUx.check).disabled).toBe(true);
      await act(async () => {
        button(ar.setupApprovalUx.check).click();
      });
      expect(api.complete).not.toHaveBeenCalled();
      expect(api.save).not.toHaveBeenCalled();
    }
  );

  it("approves the exact reviewed price and explicit free service in minor units", async () => {
    api.query.data = draft(10);
    const raw = JSON.parse(api.query.data.wizardData);
    api.query.data.wizardData = JSON.stringify({
      ...raw,
      products: [{ name: "منتج", price: "12.34", currency: "USD" }],
      services: [{ name: "خدمة مجانية", price: "0" }],
    });
    await render();
    await act(async () => {
      button(ar.setupApprovalUx.check).click();
    });
    await act(async () => {
      button(ar.setupWorkspace.reviewConfirm).click();
    });
    expect(api.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedDigest: "c".repeat(64),
        reviewed: true,
        fields: expect.objectContaining({
          products: [
            expect.objectContaining({ priceMinor: 1234, currency: "USD" }),
          ],
          services: [expect.objectContaining({ priceMinor: 0 })],
        }),
      })
    );
  });
  it("waits for the fresh draft instead of saving stale cached values on mount", async () => {
    api.query = {
      ...api.query,
      data: draft(1, "بيانات قديمة"),
      isFetching: true,
    };
    await render();
    expect(container.querySelector("#businessName")).toBeNull();
    expect(api.save).not.toHaveBeenCalled();
    api.query = {
      ...api.query,
      data: draft(3, "بيانات محفوظة حديثًا"),
      isFetching: false,
    };
    await render();
    expect(
      (container.querySelector("#businessName") as HTMLInputElement).value
    ).toBe("بيانات محفوظة حديثًا");
    expect(api.save).not.toHaveBeenCalled();
  });

  it("restores an old language draft to the combined assistant screen with a back action", async () => {
    api.query.data = draft(9);
    await render();
    expect(container.querySelector("h1")?.textContent).toBe(
      ar.setupWorkspace.assistantTitle
    );
    expect(button(ar.setupWizard.auto_0)).toBeDefined();
    const selected = Array.from(
      container.querySelectorAll('[aria-pressed="true"]')
    ).map(node => node.textContent);
    expect(selected.some(text => text?.includes("English"))).toBe(true);
    expect(
      selected.some(text => text?.includes(ar.setupWorkspace.toneProfessional))
    ).toBe(true);
  });

  it("does not complete setup merely by displaying the review", async () => {
    api.query.data = draft(10);
    await render();
    expect(container.textContent).toContain(ar.setupWorkspace.reviewTitle);
    expect(
      container
        .querySelector('[role="progressbar"]')
        ?.getAttribute("aria-valuenow")
    ).toBe("75");
    expect(api.complete).not.toHaveBeenCalled();
    await act(async () => {
      button(ar.setupApprovalUx.check).click();
    });
    expect(api.complete).not.toHaveBeenCalled();
    await act(async () => {
      button(ar.setupWorkspace.reviewConfirm).click();
    });
    expect(api.save).toHaveBeenCalledOnce();
    expect(api.complete).toHaveBeenCalledOnce();
    expect(api.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: expect.objectContaining({
          businessName: "متجر الاختبار",
          botTone: "professional",
          botLanguage: "en",
        }),
      })
    );
    expect(container.textContent).toContain(ar.setupApprovalUx.saved);
    expect(api.navigate).not.toHaveBeenCalled();
    await act(async () => {
      button(ar.setupApprovalUx.openDashboard).click();
    });
    expect(api.navigate).toHaveBeenCalledWith("/merchant/dashboard");
  });

  it("keeps the account in setup if the final draft cannot be saved", async () => {
    api.query.data = draft(10);
    api.save.mockRejectedValue(new Error("offline"));
    await render();
    await act(async () => {
      button(ar.setupApprovalUx.check).click();
    });
    expect(api.complete).not.toHaveBeenCalled();
    expect(api.navigate).not.toHaveBeenCalled();
    expect(container.textContent).toContain(ar.setupWorkspace.saveFailed);
  });

  it("keeps draft writes in navigation order even when the first request is slow", async () => {
    let release!: (value: { success: boolean }) => void;
    api.save.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          release = resolve;
        })
    );
    api.query.data = draft(3);
    await render();
    await act(async () => {
      button(ar.basicInfoStep.auto_3).click();
    });
    await act(async () => {
      button(ar.setupWizard.auto_0).click();
    });
    expect(api.save).toHaveBeenCalledOnce();
    await act(async () => {
      release({ success: true });
    });
    expect(api.save.mock.calls.map((call: any) => call[0].currentStep)).toEqual(
      [6, 3]
    );
  });

  it("shows a useful failure message without exposing internal database details", async () => {
    api.query.data = draft(10);
    api.complete.mockRejectedValue(
      new Error("Failed query: SELECT private_column FROM internal_table")
    );
    await render();
    await act(async () => {
      button(ar.setupApprovalUx.check).click();
    });
    await act(async () => {
      button(ar.setupWorkspace.reviewConfirm).click();
    });
    expect(container.textContent).toContain(ar.setupWorkspace.completeFailed);
    expect(container.textContent).not.toContain("private_column");
    expect(api.navigate).not.toHaveBeenCalled();
  });

  it("keeps a confirmed receipt when cache invalidation fails", async () => {
    api.query.data = draft(10);
    api.invalidate.mockRejectedValue(new Error("cache failed"));
    await render();
    await act(async () => {
      button(ar.setupApprovalUx.check).click();
    });
    await act(async () => {
      button(ar.setupWorkspace.reviewConfirm).click();
    });
    expect(container.textContent).toContain(ar.setupApprovalUx.saved);
    expect(container.textContent).not.toContain(
      ar.setupWorkspace.completeFailed
    );
  });
  it("restores the same pending request after refresh and recovers the receipt without resubmitting", async () => {
    api.query.data = draft(10);
    api.complete.mockRejectedValueOnce(new Error("lost response"));
    await render();
    await act(async () => {
      button(ar.setupApprovalUx.check).click();
    });
    await act(async () => {
      button(ar.setupWorkspace.reviewConfirm).click();
    });
    const input = (api.complete.mock.calls as any)[0][0];
    await act(async () => root.unmount());
    root = createRoot(container);
    api.query.data.isCompleted = 1;
    api.receipt.mockResolvedValue(successfulReceipt(input));
    await render();
    expect(api.receipt).toHaveBeenCalledWith(
      { requestId: input.requestId },
      { staleTime: 0 }
    );
    expect(api.complete).toHaveBeenCalledOnce();
    expect(container.textContent).toContain(ar.setupApprovalUx.saved);
    expect(api.navigate).not.toHaveBeenCalled();
  });
  it("retries identical data with the original UUID only after checking its receipt", async () => {
    api.query.data = draft(10);
    api.complete.mockRejectedValueOnce(new Error("lost response"));
    await render();
    await act(async () => {
      button(ar.setupApprovalUx.check).click();
    });
    await act(async () => {
      button(ar.setupWorkspace.reviewConfirm).click();
    });
    expect(button(ar.setupApprovalUx.retrySame)).toBeUndefined();
    await act(async () => {
      button(ar.setupApprovalUx.recover).click();
    });
    await act(async () => {
      button(ar.setupApprovalUx.retrySame).click();
    });
    expect(api.complete.mock.calls[1]).toEqual(api.complete.mock.calls[0]);
    expect(container.textContent).toContain(ar.setupApprovalUx.saved);
  });
  it("does not submit when a durable request reference cannot be written", async () => {
    api.query.data = draft(10);
    await render();
    await act(async () => {
      button(ar.setupApprovalUx.check).click();
    });
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw Error("unavailable");
      });
    await act(async () => {
      button(ar.setupWorkspace.reviewConfirm).click();
    });
    expect(api.complete).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it("blocks draft conflicts and preserves the visible local values", async () => {
    api.query.data = draft(10);
    api.save.mockRejectedValue({ data: { code: "CONFLICT" } });
    await render();
    await act(async () => {
      button(ar.setupApprovalUx.check).click();
    });
    expect(container.textContent).toContain(ar.setupApprovalUx.draftConflict);
    expect(container.textContent).toContain("متجر الاختبار");
    expect(api.review).not.toHaveBeenCalled();
    expect(button(ar.setupApprovalUx.check)).toBeUndefined();
    expect(
      container.querySelector("[data-setup-draft-recovery]")
    ).not.toBeNull();
  });
});

const payloadFor = (name = "تعديل محلي") => ({
  currentStep: 10,
  completedSteps: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  wizardData: JSON.parse(draft(10, name).wizardData),
});
function storeDraft(name?: string) {
  rememberSetupDraft(
    {
      actorId: 4,
      merchantId: 21,
      baseDigest: "a".repeat(64),
      savedAt: Date.now(),
      payload: payloadFor(name),
    },
    knowledgeCacheEpoch()
  );
}
describe("setup local draft recovery and concurrency", () => {
  it("restores edits only after a choice, then saves against the compared remote digest", async () => {
    storeDraft();
    api.query.data = { ...draft(10, "نسخة الخادم"), digest: "d".repeat(64) };
    await render();
    expect(container.textContent).toContain("تعديل محلي");
    expect(container.textContent).toContain("نسخة الخادم");
    expect(api.save).not.toHaveBeenCalled();
    expect(api.complete).not.toHaveBeenCalled();
    await act(async () => button(ar.setupDraftUx.useLocal).click());
    expect(api.save).toHaveBeenCalledWith({
      ...payloadFor(),
      expectedDigest: "d".repeat(64),
    });
    expect(readSetupDraft(4, 21)).toBeNull();
    expect(container.querySelector("[data-setup-draft-recovery]")).toBeNull();
    expect(container.textContent).toContain("تعديل محلي");
  });
  it("uses the compared server draft without writing or confirming when local edits are discarded", async () => {
    storeDraft();
    api.query.data = draft(3, "نسخة الخادم");
    await render();
    await act(async () => button(ar.setupDraftUx.useRemote).click());
    expect(
      (container.querySelector("#businessName") as HTMLInputElement).value
    ).toBe("نسخة الخادم");
    expect(api.save).not.toHaveBeenCalled();
    expect(api.complete).not.toHaveBeenCalled();
    expect(readSetupDraft(4, 21)).toBeNull();
  });
  it("does not force an identical acknowledged backup through recovery", async () => {
    storeDraft("متجر الاختبار");
    api.query.data = draft(10);
    await render();
    expect(readSetupDraft(4, 21)).toBeNull();
    expect(container.querySelector("[data-setup-draft-recovery]")).toBeNull();
    expect(api.save).not.toHaveBeenCalled();
  });
  it("keeps a stale local draft after completion elsewhere, offering backup and dashboard", async () => {
    storeDraft();
    api.query.data = { ...draft(10), isCompleted: 1 };
    await render();
    expect(api.navigate).not.toHaveBeenCalled();
    expect(button(ar.setupDraftUx.useLocal)).toBeUndefined();
    expect(button(ar.setupDraftUx.download)).toBeDefined();
    expect(container.textContent).toContain(ar.setupDraftUx.completedElsewhere);
    expect(readSetupDraft(4, 21)).not.toBeNull();
    expect(api.save).not.toHaveBeenCalled();
  });
  it("retains corrupt local data and does not automatically navigate or save", async () => {
    sessionStorage.setItem("sary:setup-draft:v1:4:21", "{broken");
    api.query.data = { ...draft(10), isCompleted: 1 };
    await render();
    expect(container.textContent).toContain(ar.setupApprovalUx.unreadable);
    expect(api.navigate).not.toHaveBeenCalled();
    expect(api.save).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("sary:setup-draft:v1:4:21")).toBe("{broken");
  });
  it("cancels queued writes after conflict and preserves the latest navigation snapshot", async () => {
    let reject!: (reason: any) => void;
    api.save.mockImplementationOnce(
      () =>
        new Promise((_, r) => {
          reject = r;
        })
    );
    api.query.data = draft(3);
    await render();
    await act(async () => button(ar.basicInfoStep.auto_3).click());
    await act(async () => button(ar.setupWizard.auto_0).click());
    expect(readSetupDraft(4, 21)?.payload.currentStep).toBe(3);
    await act(async () => reject({ data: { code: "CONFLICT" } }));
    expect(api.save).toHaveBeenCalledOnce();
    expect(api.readProgress).toHaveBeenCalledOnce();
    expect(api.readProgress).toHaveBeenCalledWith(undefined, { staleTime: 0 });
    expect(readSetupDraft(4, 21)?.payload.currentStep).toBe(3);
    expect(
      container.querySelector("[data-setup-draft-recovery]")
    ).not.toBeNull();
  });
  it("does not offer a choice for a response from another store", async () => {
    api.query.data = draft(10);
    api.save.mockRejectedValueOnce({ data: { code: "CONFLICT" } });
    api.readProgress.mockResolvedValue({ ...draft(10), merchantId: 22 });
    await render();
    await act(async () => button(ar.setupApprovalUx.check).click());
    expect(button(ar.setupDraftUx.useLocal)).toBeUndefined();
    expect(container.textContent).toContain(ar.setupDraftUx.refreshFailed);
  });
  it("preserves local edits if they conflict again while choosing them", async () => {
    storeDraft();
    api.query.data = draft(10);
    api.save.mockRejectedValue({ data: { code: "CONFLICT" } });
    await render();
    await act(async () => button(ar.setupDraftUx.useLocal).click());
    expect(readSetupDraft(4, 21)?.payload).toEqual(payloadFor());
    expect(
      container.querySelector("[data-setup-draft-recovery]")
    ).not.toBeNull();
    expect(api.complete).not.toHaveBeenCalled();
  });
  it("ignores a late queued write after logout", async () => {
    let finish!: (v: any) => void;
    api.save.mockImplementationOnce(
      () =>
        new Promise(r => {
          finish = r;
        })
    );
    api.query.data = draft(3);
    await render();
    await act(async () => button(ar.basicInfoStep.auto_3).click());
    await act(async () => button(ar.setupWizard.auto_0).click());
    clearKnowledgeWorkspace();
    await act(async () => finish({ digest: "b".repeat(64) }));
    expect(api.save).toHaveBeenCalledOnce();
    expect(readSetupDraft(4, 21)).toBeNull();
  });
  it("warns before unloading unsaved edits and clears the warning after acknowledgement", async () => {
    let finish!: (v: any) => void;
    api.save.mockImplementationOnce(
      () =>
        new Promise(r => {
          finish = r;
        })
    );
    api.query.data = draft(3);
    await render();
    await act(async () => button(ar.basicInfoStep.auto_3).click());
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await act(async () => finish({ digest: "b".repeat(64) }));
    const saved = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(saved);
    expect(saved.defaultPrevented).toBe(false);
  });
});
