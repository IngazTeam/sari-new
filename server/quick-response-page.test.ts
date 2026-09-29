// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import ar from "../client/src/locales/ar.json";
const m = vi.hoisted(() => ({
  merchant: 20,
  data: {} as any,
  error: false,
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  invalidate: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    auth: { me: { useQuery: () => ({ data: { id: 7 } }) } },
    merchants: {
      getCurrent: { useQuery: () => ({ data: { id: m.merchant } }) },
    },
    useUtils: () => ({ quickResponses: { invalidate: m.invalidate } }),
    quickResponses: {
      workspace: {
        useQuery: () => ({
          data: m.data,
          isError: m.error,
          isLoading: false,
          refetch: m.refetch,
        }),
      },
      create: { useMutation: () => ({ mutateAsync: m.create }) },
      update: { useMutation: () => ({ mutateAsync: m.update }) },
      delete: { useMutation: () => ({ mutateAsync: m.remove }) },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "ar" },
    t: (key: string, values?: any) => {
      const value =
        key.split(".").reduce((v: any, k) => v?.[k], {
          ...ar,
          merchantUx: {
            actions: {
              editNamed: "تعديل {{name}}",
              deleteNamed: "حذف {{name}}",
              activateNamed: "تفعيل {{name}}",
              deactivateNamed: "إيقاف {{name}}",
            },
          },
        }) ?? key;
      return typeof value === "string"
        ? value.replace(
            /\{\{(\w+)\}\}/g,
            (_: string, k: string) => values?.[k] ?? ""
          )
        : value;
    },
  }),
}));
import QuickResponses from "../client/src/pages/merchant/QuickResponses";
import { toast } from "sonner";
let root: Root, container: HTMLDivElement;
const row = {
  id: 3,
  merchantId: 20,
  trigger: "مرحبا",
  response: "كيف أساعدك؟",
  keywords: '["سعر","شحن"]',
  priority: 0,
  isActive: 1,
  useCount: 0,
  revision: "a".repeat(64),
};
async function render() {
  await act(async () => root.render(React.createElement(QuickResponses)));
}
function button(label: string) {
  const el = [...document.querySelectorAll("button")].find(
    el =>
      el.textContent?.trim() === label ||
      el.getAttribute("aria-label") === label
  );
  if (!el) throw Error("Missing " + label);
  return el;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function fill(id: string, value: string) {
  await act(async () => {
    const el = document.getElementById(id) as
      | HTMLInputElement
      | HTMLTextAreaElement;
    Object.getOwnPropertyDescriptor(
      el instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype,
      "value"
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    "confirm",
    vi.fn(() => true)
  );
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  m.merchant = 20;
  m.error = false;
  m.data = {
    merchantId: 20,
    canManage: true,
    rows: [row],
    revision: "b".repeat(64),
    total: 1,
    active: 1,
    inactive: 0,
  };
  m.create.mockResolvedValue({ id: 4 });
  m.update.mockResolvedValue(row);
  m.remove.mockResolvedValue({ deleted: true });
  m.invalidate.mockResolvedValue(undefined);
  m.refetch.mockImplementation(async () => ({ data: m.data }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
describe("quick response reviewed save UI", () => {
  it("keeps priority zero and readable keywords when opening and saving a rule", async () => {
    await render();
    await click("تعديل مرحبا");
    expect(
      (document.getElementById("quick-priority") as HTMLInputElement).value
    ).toBe("0");
    expect(
      (document.getElementById("quick-keywords") as HTMLInputElement).value
    ).toBe("سعر، شحن");
    await click(ar.quickResponsesPage.text48);
    expect(m.update).toHaveBeenCalledWith({
      id: 3,
      expectedRevision: "a".repeat(64),
      trigger: "مرحبا",
      response: "كيف أساعدك؟",
      keywords: "سعر، شحن",
      priority: 0,
      isActive: true,
    });
  });
  it("blocks read-only actions and stale store data", async () => {
    m.data.canManage = false;
    await render();
    expect(button(ar.quickResponsesPage.text38).disabled).toBe(true);
    expect(button("تعديل مرحبا").disabled).toBe(true);
    m.merchant = 21;
    await render();
    expect(container.textContent).not.toContain("مرحبا");
    expect(m.update).not.toHaveBeenCalled();
  });
  it("does not describe a failed source as an empty list", async () => {
    m.error = true;
    await render();
    expect(container.textContent).not.toContain(ar.quickResponsesPage.text19);
    expect(container.textContent).toContain("تعذّر عرض الصفحة");
  });
  it("locks duplicate submissions and ignores a late success from a former tenant", async () => {
    let resolve!: (v: any) => void;
    m.create.mockImplementation(() => new Promise(yes => (resolve = yes)));
    await render();
    await click(ar.quickResponsesPage.text38);
    await fill("quick-trigger", "جديد");
    await fill("quick-response", "نص جديد");
    await act(async () => {
      button(ar.quickResponsesPage.text44).click();
      button(ar.quickResponsesPage.text44).click();
    });
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(
      (document.getElementById("quick-trigger") as HTMLInputElement).closest(
        "fieldset"
      )!.disabled
    ).toBe(true);
    m.merchant = 21;
    m.data = { ...m.data, merchantId: 21, rows: [] };
    await render();
    await act(async () => resolve({ id: 4 }));
    expect(toast.success).not.toHaveBeenCalled();
    expect(m.invalidate).not.toHaveBeenCalled();
  });
  it("retains a conflicting draft and its original review instead of overwriting the latest row", async () => {
    m.update.mockRejectedValueOnce({ data: { code: "CONFLICT" } });
    await render();
    await click("تعديل مرحبا");
    await fill("quick-response", "مسودتي");
    await click(ar.quickResponsesPage.text48);
    expect(document.body.textContent).toContain(
      ar.quickResponseWorkspace.changed
    );
    expect(
      (document.getElementById("quick-response") as HTMLInputElement).value
    ).toBe("مسودتي");
    m.data = {
      ...m.data,
      rows: [{ ...row, response: "محفوظ آخر", revision: "c".repeat(64) }],
    };
    await render();
    await click(ar.quickResponsesPage.text48);
    expect(m.update).toHaveBeenCalledTimes(1);
    await click(ar.virtualTeamReview.load);
    expect(button(ar.virtualTeamReview.applyReview).disabled).toBe(true);
    const mine = [...document.querySelectorAll("label")].find(
      el => el.textContent?.trim() === ar.virtualTeamReview.chooseMine
    )!;
    await act(async () => mine.querySelector("input")!.click());
    await click(ar.virtualTeamReview.applyReview);
    expect(m.update).toHaveBeenCalledTimes(1);
    await click(ar.quickResponsesPage.text48);
    expect(m.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        response: "مسودتي",
        expectedRevision: "c".repeat(64),
      })
    );
  });
  it("sends only the activation patch and supplies a reviewed delete version", async () => {
    await render();
    await click("إيقاف مرحبا");
    expect(m.update).toHaveBeenCalledWith({
      id: 3,
      isActive: false,
      expectedRevision: "a".repeat(64),
    });
    m.remove.mockRejectedValueOnce({ data: { code: "PRECONDITION_FAILED" } });
    await click("حذف مرحبا");
    await act(async () =>
      (
        document.querySelector(
          '[role="dialog"] input[type="checkbox"]'
        ) as HTMLInputElement
      ).click()
    );
    await click(ar.quickResponseWorkspace.confirmDelete);
    expect(m.remove).toHaveBeenCalledWith({
      id: 3,
      expectedRevision: "a".repeat(64),
    });
    expect(document.body.textContent).toContain(
      ar.quickResponsesUx.experimentReference
    );
  });
  it("validates each field, retains a dismissed draft, and starts new rules inactive", async () => {
    await render();
    await click(ar.quickResponsesPage.text38);
    await click(ar.quickResponsesPage.text44);
    expect(document.getElementById("quick-trigger-error")?.textContent).toBe(
      ar.quickResponseWorkspace.triggerError
    );
    expect(document.getElementById("quick-response-error")?.textContent).toBe(
      ar.quickResponseWorkspace.responseError
    );
    expect(document.activeElement?.id).toBe("quick-trigger");
    await fill("quick-trigger", "مسودة");
    await fill("quick-response", "رد محفوظ للمراجعة");
    await fill("quick-priority", "1.5");
    await click(ar.quickResponsesPage.text44);
    expect(m.create).not.toHaveBeenCalled();
    expect(document.getElementById("quick-priority-error")?.textContent).toBe(
      ar.quickResponseWorkspace.priorityError
    );
    await fill("quick-priority", "0");
    await click(ar.quickResponseWorkspace.closeKeep);
    expect(container.textContent).toContain(ar.quickResponseWorkspace.retained);
    await click(ar.quickResponseWorkspace.continueDraft);
    expect(
      (document.getElementById("quick-response") as HTMLInputElement).value
    ).toBe("رد محفوظ للمراجعة");
    await click(ar.quickResponsesPage.text44);
    expect(m.create).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: "مسودة",
        priority: 0,
        isActive: false,
      })
    );
  });
  it("maps action-claim rejection to the response field without losing draft", async () => {
    m.update.mockRejectedValueOnce({
      data: { code: "BAD_REQUEST" },
      message: "Response claims an unverified action",
    });
    await render();
    await click("تعديل مرحبا");
    await fill("quick-response", "تم تأكيد الحجز");
    await click(ar.quickResponsesPage.text48);
    expect(document.getElementById("quick-response-error")?.textContent).toBe(
      ar.quickResponseWorkspace.actionClaim
    );
    expect(
      (document.getElementById("quick-response") as HTMLInputElement).value
    ).toBe("تم تأكيد الحجز");
  });
  it("rejects a failed refresh even when it includes cached data, then merges only edited fields", async () => {
    m.update.mockRejectedValueOnce({ data: { code: "CONFLICT" } });
    await render();
    await click("تعديل مرحبا");
    await fill("quick-response", "مسودتي");
    await click(ar.quickResponsesPage.text48);
    m.refetch.mockResolvedValueOnce({
      data: m.data,
      error: new Error("offline"),
    });
    await click(ar.virtualTeamReview.load);
    expect(document.body.textContent).toContain(ar.quickResponsesUx.failed);
    expect(button(ar.quickResponsesPage.text48).disabled).toBe(true);
    m.data = {
      ...m.data,
      rows: [
        {
          ...row,
          priority: 8,
          isActive: 0,
          keywords: "جديد",
          revision: "d".repeat(64),
        },
      ],
    };
    await click(ar.virtualTeamReview.load);
    await click(ar.virtualTeamReview.applyReview);
    expect(m.update).toHaveBeenCalledTimes(1);
    await click(ar.quickResponsesPage.text48);
    expect(m.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        response: "مسودتي",
        priority: 8,
        isActive: false,
        keywords: "جديد",
        expectedRevision: "d".repeat(64),
      })
    );
  });
  it("keeps a deleted-elsewhere draft without recreating it", async () => {
    m.update.mockRejectedValueOnce({ data: { code: "NOT_FOUND" } });
    await render();
    await click("تعديل مرحبا");
    await fill("quick-response", "مسودتي");
    await click(ar.quickResponsesPage.text48);
    m.data = { ...m.data, rows: [], total: 0 };
    await click(ar.virtualTeamReview.load);
    expect(document.body.textContent).toContain(
      ar.quickResponseWorkspace.deletedElsewhere
    );
    expect(button(ar.quickResponsesPage.text48).disabled).toBe(true);
    expect(m.create).not.toHaveBeenCalled();
  });
  it("recognizes a normalized already-saved creation after uncertainty instead of offering a duplicate", async () => {
    m.create.mockRejectedValueOnce({ data: { code: "CONFLICT" } });
    await render();
    await click(ar.quickResponsesPage.text38);
    await fill("quick-trigger", "  جديد  ");
    await fill("quick-response", "  محفوظ  ");
    await fill("quick-keywords", "سعر, شحن, سعر");
    await click(ar.quickResponsesPage.text44);
    m.data = {
      ...m.data,
      rows: [
        {
          ...row,
          id: 9,
          trigger: "جديد",
          response: "محفوظ",
          priority: 5,
          isActive: 0,
          revision: "c".repeat(64),
        },
      ],
    };
    await click(ar.virtualTeamReview.load);
    expect(document.body.textContent).toContain(
      ar.quickResponseWorkspace.alreadySaved
    );
    await click(ar.quickResponseWorkspace.openSaved);
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(m.update).not.toHaveBeenCalled();
    await click(ar.quickResponsesPage.text48);
    expect(m.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 9, expectedRevision: "c".repeat(64) })
    );
  });
  it("requires a fresh delete acknowledgement after another editor changes the row", async () => {
    m.remove.mockRejectedValueOnce({ data: { code: "CONFLICT" } });
    await render();
    await click("حذف مرحبا");
    expect(button(ar.quickResponseWorkspace.confirmDelete).disabled).toBe(true);
    await act(async () =>
      (
        document.querySelector(
          '[role="dialog"] input[type="checkbox"]'
        ) as HTMLInputElement
      ).click()
    );
    await click(ar.quickResponseWorkspace.confirmDelete);
    m.data = {
      ...m.data,
      rows: [{ ...row, response: "نص جديد للحذف", revision: "e".repeat(64) }],
    };
    await click(ar.virtualTeamReview.load);
    await click(ar.virtualTeamReview.applyReview);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "نص جديد للحذف"
    );
    expect(button(ar.quickResponseWorkspace.confirmDelete).disabled).toBe(true);
    expect(m.remove).toHaveBeenCalledTimes(1);
    await act(async () =>
      (
        document.querySelector(
          '[role="dialog"] input[type="checkbox"]'
        ) as HTMLInputElement
      ).click()
    );
    await click(ar.quickResponseWorkspace.confirmDelete);
    expect(m.remove).toHaveBeenLastCalledWith({
      id: 3,
      expectedRevision: "e".repeat(64),
    });
  });
  it("cancels a deletion without mutating and escapes hostile rule text", async () => {
    m.data.rows = [{ ...row, response: "<img src=x onerror=alert(1)>" }];
    await render();
    await click("حذف مرحبا");
    expect(document.querySelector('[role="dialog"] img')).toBeNull();
    await click(ar.common.cancel);
    expect(m.remove).not.toHaveBeenCalled();
  });
  it("matches saved active rules locally and clears the sample on edits or source errors", async () => {
    m.data.rows = [
      row,
      { ...row, id: 4, trigger: "شحن", response: "مطابقة كاملة", priority: 0 },
      { ...row, id: 5, trigger: "متوقف", response: "لا تعرضني", isActive: 0 },
    ];
    await render();
    await fill("quick-question", "شحن");
    await click(ar.quickResponseWorkspace.runTest);
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      ar.quickResponseWorkspace.exactMatch
    );
    await fill("quick-question", "متوقف");
    expect(
      document.querySelector('[role="status"]')?.textContent || ""
    ).not.toContain(ar.quickResponseWorkspace.exactMatch);
    await click(ar.quickResponseWorkspace.runTest);
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      ar.quickResponseWorkspace.noMatch
    );
    m.error = true;
    await render();
    expect(
      document.querySelector('[role="status"]')?.textContent || ""
    ).not.toContain(ar.quickResponseWorkspace.noMatch);
    expect(m.update).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });
  it("filters the full collection, paginates, and clamps when the source shrinks", async () => {
    m.data.rows = Array.from({ length: 12 }, (_, i) => ({
      ...row,
      id: i + 1,
      trigger: `رد ${i + 1}`,
      response: i === 11 ? "نص مميز" : "نص عادي",
      isActive: i === 11 ? 0 : 1,
    }));
    m.data.total = 12;
    await render();
    expect(container.querySelectorAll("li")).toHaveLength(10);
    await click(ar.common.next);
    expect(container.querySelectorAll("li")).toHaveLength(2);
    await fill("quick-search", "مميز");
    expect(container.querySelectorAll("li")).toHaveLength(1);
    await act(async () => {
      const select = document.getElementById(
        "quick-status"
      ) as HTMLSelectElement;
      select.value = "active";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelectorAll("li")).toHaveLength(0);
    await fill("quick-search", "");
    m.data = { ...m.data, rows: [row], total: 1 };
    await render();
    expect(container.querySelectorAll("li")).toHaveLength(1);
  });
  it("does not show an empty-state claim for a failed cached empty collection", async () => {
    m.data = { ...m.data, rows: [], total: 0 };
    m.error = true;
    await render();
    expect(container.textContent).not.toContain(ar.quickResponsesPage.text19);
  });
});
