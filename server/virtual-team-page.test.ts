// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ar from "../client/src/locales/ar.json";
vi.hoisted(async () => {
  Object.assign(globalThis, { React: (await import("react")).default });
});
const m = vi.hoisted(() => ({
  data: [] as any[],
  revision: "a".repeat(64),
  canManage: true,
  scope: "7:20:virtual-team",
  refetch: vi.fn(),
  receipt: vi.fn(),
  save: vi.fn(),
  updateCallbacks: {} as any,
  create: vi.fn(),
  update: vi.fn(),
  preview: vi.fn(),
  callbacks: {} as any,
  pending: false,
}));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      virtualAgents: {
        list: { invalidate: vi.fn() },
        listReview: { invalidate: vi.fn() },
        getSaveReceipt: { fetch: m.receipt },
      },
    }),
    ai: { chat: { useMutation: () => ({ mutateAsync: vi.fn() }) } },
    virtualAgents: {
      listReview: {
        useQuery: () => ({
          data: {
            agents: m.data,
            revision: m.revision,
            canManage: m.canManage,
          },
          refetch: m.refetch,
        }),
      },
      saveReviewed: {
        useMutation: (callbacks: any) => {
          m.callbacks = callbacks;
          m.updateCallbacks = callbacks;
          return {
            mutate: (input: any) => {
              m.save(input);
              (input.editing === null ? m.create : m.update)(input);
            },
            isPending: m.pending,
          };
        },
      },
      delete: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      reorder: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      seedTemplates: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      preview: { useMutation: () => ({ mutateAsync: m.preview }) },
    },
  },
}));
vi.mock("../client/src/components/KnowledgeWorkspaceScope", () => ({
  KnowledgeWorkspaceScope: ({ children }: any) => children(m.scope),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: any) => {
      const value =
        key.split(".").reduce((value: any, part) => value?.[part], ar) ?? key;
      return value.replace(
        /\{\{(\w+)\}\}/g,
        (_: string, name: string) => values?.[name] ?? ""
      );
    },
  }),
}));
import VirtualTeamPage from "../client/src/pages/merchant/VirtualTeamPage";
import { clearKnowledgeWorkspace } from "../client/src/lib/knowledge-workspace-cache";
let root: Root, container: HTMLDivElement;
async function render() {
  await act(async () => root.render(React.createElement(VirtualTeamPage)));
}
function button(label: string) {
  const scope = document.querySelector('[role="dialog"]') ?? document;
  const result = [...scope.querySelectorAll("button")].find(
    button =>
      button.textContent?.trim() === label ||
      button.getAttribute("aria-label") === label
  );
  if (!result) throw Error(`Missing button: ${label}`);
  return result;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function fill(id: string, value: string) {
  await act(async () => {
    const el = document.getElementById(id) as
      | HTMLInputElement
      | HTMLTextAreaElement;
    const prototype =
      el.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  clearKnowledgeWorkspace();
  sessionStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  m.pending = false;
  m.revision = "a".repeat(64);
  m.canManage = true;
  m.scope = "7:20:virtual-team";
  m.refetch.mockReset();
  m.receipt.mockReset();
  m.data = [
    {
      id: 12,
      name: "نورة",
      role: "دعم",
      department: "",
      personalityPrompt: "تعليمات محفوظة",
      tone: "friendly",
      avatarEmoji: "support",
      isActive: 1,
      isDefault: 1,
      sortOrder: 0,
      triggerKeywords: "[]",
      shiftStart: null,
      shiftEnd: null,
    },
  ];
  m.preview.mockResolvedValue({
    response: "رد تجريبي",
    source: "model",
    historyMessageCount: 0,
    historyTruncated: false,
    persona: {
      id: 12,
      name: "نورة",
      role: "دعم",
      isActive: true,
      reason: "manual",
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
describe("rendered virtual team workflow", () => {
  it("keeps every avatar and tone in the actual editor without losing fields between sections", async () => {
    await render();
    await click(ar.virtualTeamUx.new);
    await fill("agent-name", "ريم");
    await fill("agent-role", "مبيعات");
    await fill("agent-personalityPrompt", "تعليمات محفوظة");
    for (const label of Object.values(ar.virtualTeamUx.avatars))
      expect(
        [...document.querySelectorAll('[role="dialog"] details button')].some(
          el => el.textContent?.trim().endsWith(label)
        )
      ).toBe(true);
    for (const label of Object.values(ar.virtualTeamUx.tones))
      expect(button(label)).toBeTruthy();
    await click(ar.virtualTeamUx.avatars.sales);
    await click(ar.virtualTeamUx.tones.persuasive);
    await click(ar.virtualTeamUx.routing);
    await click(ar.virtualTeamUx.identity);
    expect(
      (document.getElementById("agent-name") as HTMLInputElement).value
    ).toBe("ريم");
    await click(ar.virtualTeamUx.save);
    expect(m.save).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({
          avatarEmoji: "sales",
          tone: "persuasive",
          name: "ريم",
        }),
      })
    );
  });
  it("validates routing hours, de-duplicates keywords and allows an inactive new persona", async () => {
    await render();
    await click(ar.virtualTeamUx.new);
    await fill("agent-name", "ريم");
    await fill("agent-role", "مبيعات");
    await fill("agent-personalityPrompt", "تعليمات");
    await click(ar.virtualTeamUx.routing);
    await fill("agent-triggerKeywords", "سعر");
    await click(ar.virtualTeamUx.add);
    await fill("agent-triggerKeywords", "سعر");
    await click(ar.virtualTeamUx.add);
    await fill("agent-shiftStart", "22:00");
    await click(ar.virtualTeamUx.save);
    expect(m.save).not.toHaveBeenCalled();
    expect(
      document.getElementById("agent-shiftStart")?.getAttribute("aria-invalid")
    ).toBe("true");
    await fill("agent-shiftEnd", "06:00");
    await act(async () => document.getElementById("agent-active")!.click());
    await click(ar.virtualTeamUx.save);
    expect(m.save).toHaveBeenCalledWith(
      expect.objectContaining({
        editing: null,
        draft: expect.objectContaining({
          triggerKeywords: ["سعر"],
          shiftStart: "22:00",
          shiftEnd: "06:00",
          isActive: false,
        }),
      })
    );
  });
  it("renders hostile persona text as text and submits explicit empty hours after clearing", async () => {
    m.data[0] = {
      ...m.data[0],
      name: "<img src=x onerror=alert(1)>",
      shiftStart: "22:00",
      shiftEnd: "06:00",
    };
    await render();
    expect(document.querySelector("img[src=x]")).toBeNull();
    await click(`${ar.virtualTeamUx.edit} ${m.data[0].name}`);
    await click(ar.virtualTeamUx.routing);
    await click(ar.virtualTeamUx.clearHours);
    await click(ar.virtualTeamUx.save);
    expect(m.save).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({ shiftStart: "", shiftEnd: "" }),
      })
    );
  });
  const result = (input: any) => ({
    merchantId: input.merchantId,
    actorId: 7,
    requestId: input.requestId,
    operation: input.editing === null ? "create" : "update",
    personaId: input.editing ?? 55,
    reviewedRevision: input.expectedRevision,
    revisionAfter: "b".repeat(64),
    savedAt: new Date().toISOString(),
  });
  async function uncertainSave() {
    await render();
    await click(`${ar.virtualTeamUx.edit} نورة`);
    await fill("agent-name", "حفظ منقطع");
    await click(ar.virtualTeamUx.save);
    const input = m.save.mock.calls[0][0];
    await act(async () => {
      m.callbacks.onError();
      m.callbacks.onSettled();
    });
    return input;
  }
  it("recovers the exact receipt after remount without sending another mutation", async () => {
    const input = await uncertainSave();
    await act(async () => root.render(null));
    await render();
    await click(ar.virtualTeamDraftUx.restore);
    m.receipt.mockResolvedValue(result(input));
    await click(ar.virtualTeamReceiptUx.recover);
    expect(m.receipt).toHaveBeenCalledWith(
      { merchantId: 20, requestId: input.requestId },
      { staleTime: 0 }
    );
    expect(m.save).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.textContent).toContain(ar.virtualTeamReceiptUx.saved);
    expect(
      sessionStorage.getItem("sary:virtual-team-draft:v1:7:20:virtual-team")
    ).toBeNull();
  });
  it("retries only after an explicit missing receipt using the identical frozen request", async () => {
    const input = await uncertainSave();
    m.receipt.mockRejectedValueOnce(Error("offline"));
    await click(ar.virtualTeamReceiptUx.recover);
    expect(document.body.textContent).toContain(
      ar.virtualTeamReceiptUx.readFailed
    );
    expect(document.body.textContent).not.toContain(
      ar.virtualTeamReceiptUx.retry
    );
    m.receipt.mockResolvedValueOnce(null);
    await click(ar.virtualTeamReceiptUx.recover);
    expect(m.save).toHaveBeenCalledTimes(1);
    await click(ar.virtualTeamReceiptUx.retry);
    expect(m.save).toHaveBeenCalledTimes(2);
    expect(m.save.mock.calls[1][0]).toEqual(input);
    await act(async () => {
      m.callbacks.onSuccess(result(input), input);
      m.callbacks.onSettled();
    });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it.each([
    { actorId: 8 },
    { merchantId: 21 },
    { requestId: "30000000-0000-4000-8000-000000000099" },
    { personaId: 99 },
    { reviewedRevision: "c".repeat(64) },
  ])(
    "rejects a receipt belonging to another request or scope: %j",
    async change => {
      const input = await uncertainSave();
      m.receipt.mockResolvedValue({ ...result(input), ...change });
      await click(ar.virtualTeamReceiptUx.recover);
      expect(document.querySelector('[role="dialog"]')).not.toBeNull();
      expect(document.body.textContent).toContain(
        ar.virtualTeamReceiptUx.readFailed
      );
      expect(
        (button(ar.virtualTeamUx.save) as HTMLButtonElement).disabled
      ).toBe(true);
      expect(m.save).toHaveBeenCalledTimes(1);
    }
  );
  it("does not start a write when the browser cannot persist its request reference", async () => {
    await render();
    await click(`${ar.virtualTeamUx.edit} نورة`);
    await fill("agent-name", "مسودة محلية");
    const fail = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw Error("quota");
      });
    await click(ar.virtualTeamUx.save);
    expect(m.save).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      ar.virtualTeamReceiptUx.storageRequired
    );
    fail.mockRestore();
  });
  it("keeps a legacy submitted draft blocked without inventing an idempotency reference", async () => {
    const input = await uncertainSave();
    const key = "sary:virtual-team-draft:v1:7:20:virtual-team";
    const legacy = JSON.parse(sessionStorage.getItem(key)!);
    delete legacy.attempt;
    await act(async () => root.render(null));
    clearKnowledgeWorkspace();
    sessionStorage.setItem(key, JSON.stringify(legacy));
    await render();
    await click(ar.virtualTeamDraftUx.restore);
    expect(document.body.textContent).toContain(
      ar.virtualTeamDraftUx.reviewSaved
    );
    expect(document.body.textContent).not.toContain(
      ar.virtualTeamReceiptUx.retry
    );
    expect(m.save.mock.calls[0][0]).toEqual(input);
    expect(m.save).toHaveBeenCalledTimes(1);
  });
  it("recovers the unfinished editor after remount and requires a fresh review before any save", async () => {
    await render();
    await click(`${ar.virtualTeamUx.edit} نورة`);
    await fill("agent-name", "مسودة بعد المغادرة");
    await click(ar.virtualTeamUx.routing);
    await fill("agent-triggerKeywords", "كلمة معلقة");
    await act(async () => root.render(null));
    await render();
    expect(document.body.textContent).toContain(ar.virtualTeamDraftUx.found);
    expect(m.update).not.toHaveBeenCalled();
    await click(ar.virtualTeamDraftUx.restore);
    expect((button(ar.virtualTeamUx.save) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(
      (document.getElementById("agent-triggerKeywords") as HTMLInputElement)
        .value
    ).toBe("كلمة معلقة");
    m.refetch.mockResolvedValueOnce({
      data: { agents: m.data, revision: m.revision, canManage: true },
    });
    await click(ar.virtualTeamReview.load);
    await click(ar.virtualTeamReview.applyReview);
    await click(ar.virtualTeamUx.identity);
    expect(
      (document.getElementById("agent-name") as HTMLInputElement).value
    ).toBe("مسودة بعد المغادرة");
    expect(m.update).not.toHaveBeenCalled();
    await click(ar.virtualTeamUx.save);
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({
        editing: 12,
        draft: expect.objectContaining({
          name: "مسودة بعد المغادرة",
          triggerKeywords: ["كلمة معلقة"],
        }),
      })
    );
  });
  it("offers close-and-keep without losing the draft and discards it only on explicit choice", async () => {
    await render();
    await click(ar.virtualTeamUx.new);
    await fill("agent-name", "مسودة جديدة");
    await click(ar.virtualTeamUx.cancel);
    await click(ar.virtualTeamDraftUx.keep);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.textContent).toContain(ar.virtualTeamDraftUx.found);
    await click(ar.virtualTeamDraftUx.discard);
    await click(ar.virtualTeamUx.new);
    expect(
      (document.getElementById("agent-name") as HTMLInputElement).value
    ).toBe("");
    expect(m.create).not.toHaveBeenCalled();
  });
  it("restores an interrupted submitted draft without replaying creation or enabling another save", async () => {
    await render();
    await click(ar.virtualTeamUx.new);
    await fill("agent-name", "طلب غير مؤكد");
    await fill("agent-role", "دعم");
    await fill("agent-personalityPrompt", "تعليمات");
    await click(ar.virtualTeamUx.save);
    expect(m.create).toHaveBeenCalledTimes(1);
    await act(async () => root.render(null));
    await render();
    await click(ar.virtualTeamDraftUx.restore);
    expect(document.body.textContent).toContain(
      ar.virtualTeamReceiptUx.unconfirmed
    );
    expect((button(ar.virtualTeamUx.save) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(m.create).toHaveBeenCalledTimes(1);
  });
  it("retains a stale draft, fails closed on refresh failure, and requires choices plus a separate save", async () => {
    await render();
    await click(`${ar.virtualTeamUx.edit} نورة`);
    await fill("agent-name", "تعديلي");
    await click(ar.virtualTeamUx.save);
    expect(m.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expectedRevision: "a".repeat(64),
        draft: expect.objectContaining({ name: "تعديلي" }),
      })
    );
    await act(async () => {
      m.updateCallbacks.onError({ data: { code: "CONFLICT" } });
      m.updateCallbacks.onSettled();
    });
    expect((button(ar.virtualTeamUx.save) as HTMLButtonElement).disabled).toBe(
      true
    );
    m.refetch.mockResolvedValueOnce({
      error: Error("offline"),
      data: { agents: m.data, revision: "b".repeat(64), canManage: true },
    });
    await click(ar.virtualTeamReview.load);
    expect(document.body.textContent).toContain(
      ar.virtualTeamReview.loadFailed
    );
    expect(
      (document.getElementById("agent-name") as HTMLInputElement).value
    ).toBe("تعديلي");
    m.data = [{ ...m.data[0], name: "تعديل آخر", role: "مبيعات" }];
    m.revision = "b".repeat(64);
    m.refetch.mockResolvedValueOnce({
      data: { agents: m.data, revision: m.revision, canManage: true },
    });
    await click(ar.virtualTeamReview.load);
    expect(
      (button(ar.virtualTeamReview.applyReview) as HTMLButtonElement).disabled
    ).toBe(true);
    const mine = [...document.querySelectorAll("label")]
      .find(label => label.textContent === ar.virtualTeamReview.chooseMine)!
      .querySelector("input")!;
    await act(async () => mine.click());
    await click(ar.virtualTeamReview.applyReview);
    expect(m.update).toHaveBeenCalledTimes(1);
    expect(
      (document.getElementById("agent-name") as HTMLInputElement).value
    ).toBe("تعديلي");
    expect(
      (document.getElementById("agent-role") as HTMLInputElement).value
    ).toBe("مبيعات");
    await click(ar.virtualTeamUx.save);
    expect(m.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expectedRevision: "b".repeat(64),
        draft: expect.objectContaining({ name: "تعديلي", role: "مبيعات" }),
      })
    );
  });
  it("preserves a deleted persona draft without offering to recreate it", async () => {
    await render();
    await click(`${ar.virtualTeamUx.edit} نورة`);
    await fill("agent-name", "مسودة باقية");
    await click(ar.virtualTeamUx.save);
    await act(async () => {
      m.updateCallbacks.onError({ data: { code: "CONFLICT" } });
      m.updateCallbacks.onSettled();
    });
    m.refetch.mockResolvedValue({
      data: { agents: [], revision: "b".repeat(64), canManage: true },
    });
    await click(ar.virtualTeamReview.load);
    expect(document.body.textContent).toContain(ar.virtualTeamReview.missing);
    expect(
      (document.getElementById("agent-name") as HTMLInputElement).value
    ).toBe("مسودة باقية");
    expect((button(ar.virtualTeamUx.save) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(m.create).not.toHaveBeenCalled();
  });
  it("does not silently advance an open draft when the list refreshes in the background", async () => {
    await render();
    await click(`${ar.virtualTeamUx.edit} نورة`);
    m.revision = "b".repeat(64);
    m.data = [{ ...m.data[0], role: "Changed" }];
    await render();
    await fill("agent-name", "Mine");
    await click(ar.virtualTeamUx.save);
    expect(m.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expectedRevision: "a".repeat(64),
        draft: expect.objectContaining({ role: "دعم" }),
      })
    );
  });
  it("discards the prior store's form on scope change and ignores its late success", async () => {
    await render();
    await click(`${ar.virtualTeamUx.edit} نورة`);
    await fill("agent-name", "old store");
    await click(ar.virtualTeamUx.save);
    const old = m.updateCallbacks;
    m.scope = "7:21:virtual-team";
    await render();
    await click(`${ar.virtualTeamUx.edit} نورة`);
    await fill("agent-name", "new store draft");
    await act(async () => old.onSuccess());
    expect(
      (document.getElementById("agent-name") as HTMLInputElement).value
    ).toBe("new store draft");
  });
  it("shows read-only permissions without enabling changes", async () => {
    m.canManage = false;
    await render();
    expect((button(ar.virtualTeamUx.new) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(
      (button(`${ar.virtualTeamUx.edit} نورة`) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(document.body.textContent).toContain(ar.virtualTeamReview.readOnly);
    expect(
      (
        button(
          `${ar.personaPreviewUx.testNamed.replace("{{name}}", "نورة")}`
        ) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    await fill("routing-message", "سؤال");
    expect(
      (button(ar.personaPreviewUx.testRouting) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(m.preview).not.toHaveBeenCalled();
  });
  it("shows availability only before AI and opens contextual routing without locally predicting an agent", async () => {
    m.data.push({
      ...m.data[0],
      id: 22,
      name: "محاسب خاص",
      isDefault: 0,
      triggerKeywords: '["محاسب"]',
    });
    await render();
    await fill("routing-message", "لا أريد محاسب");
    await fill("routing-time", "10:00");
    const status = document.querySelector('[role="status"]')!;
    expect(status.textContent).toContain("2");
    expect(status.textContent).not.toContain("محاسب خاص");
    expect(m.preview).not.toHaveBeenCalled();
    await click(ar.personaPreviewUx.testRouting);
    await click(ar.sariPlayground.ask);
    expect(m.preview).toHaveBeenCalledWith({
      mode: "automatic",
      time: "10:00",
      message: "لا أريد محاسب",
      history: [],
      currentAgentId: null,
      historyTruncated: false,
    });
  });
  it("confirms dismissal of edited identity and keeps the draft when editing continues", async () => {
    await clickAfterRender(ar.virtualTeamUx.new);
    await fill("agent-name", "مسودة");
    await click(ar.testSariPage.closeDialog);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain(
      ar.personaPreviewUx.discardHint
    );
    await click(ar.personaPreviewUx.keepEditing);
    expect(
      (document.getElementById("agent-name") as HTMLInputElement).value
    ).toBe("مسودة");
    await click(ar.testSariPage.closeDialog);
    await click(ar.personaPreviewUx.discard);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(m.create).not.toHaveBeenCalled();
  });
  it("closes an unchanged form directly and validates required fields before a request", async () => {
    await clickAfterRender(ar.virtualTeamUx.new);
    await click(ar.testSariPage.closeDialog);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await click(ar.virtualTeamUx.new);
    await act(async () => {
      document
        .querySelector("form")!
        .dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true })
        );
    });
    expect(m.create).not.toHaveBeenCalled();
    expect(
      document.querySelectorAll('[aria-invalid="true"]').length
    ).toBeGreaterThanOrEqual(3);
  });
  it("blocks repeated saves and prevents editing or dismissing an in-flight save", async () => {
    await clickAfterRender(ar.virtualTeamUx.new);
    await fill("agent-name", "نورة");
    await fill("agent-role", "دعم");
    await fill("agent-personalityPrompt", "تعليمات");
    await act(async () => {
      const form = document.querySelector("form")!;
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });
    expect(m.create).toHaveBeenCalledTimes(1);
    m.pending = true;
    await render();
    expect(document.querySelector("fieldset[disabled]")).not.toBeNull();
    await click(ar.testSariPage.closeDialog);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    m.pending = false;
    await act(async () => {
      m.callbacks.onError();
      m.callbacks.onSettled();
    });
    await render();
    expect(document.body.textContent).toContain(
      ar.virtualTeamReceiptUx.unconfirmed
    );
    expect(document.body.textContent).not.toContain(
      ar.virtualTeamUx.saveFailed
    );
    expect(
      (document.getElementById("agent-name") as HTMLInputElement).value
    ).toBe("نورة");
  });
  it("opens the correct saved persona preview without changing settings", async () => {
    await clickAfterRender(
      ar.personaPreviewUx.testNamed.replace("{{name}}", "نورة")
    );
    await fill("saved-preview-question", "سؤال");
    await click(ar.sariPlayground.ask);
    expect(m.preview).toHaveBeenCalledWith({
      mode: "manual",
      agentId: 12,
      message: "سؤال",
    });
    expect(m.update).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("رد تجريبي");
  });
  it("preserves a pending preview dialog and releases dismissal after its response", async () => {
    let resolve!: (value: any) => void;
    m.preview.mockReturnValue(
      new Promise(done => {
        resolve = done;
      })
    );
    await clickAfterRender(
      ar.personaPreviewUx.testNamed.replace("{{name}}", "نورة")
    );
    await fill("saved-preview-question", "سؤال");
    await click(ar.sariPlayground.ask);
    await click(ar.testSariPage.closeDialog);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () =>
      resolve({
        response: "رد",
        source: "model",
        historyMessageCount: 0,
        historyTruncated: false,
      })
    );
    await click(ar.testSariPage.closeDialog);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
async function clickAfterRender(label: string) {
  await render();
  await click(label);
}
