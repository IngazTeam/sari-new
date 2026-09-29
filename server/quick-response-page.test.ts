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
        key
          .split(".")
          .reduce((v: any, k) => v?.[k], {
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
      (document.getElementById("edit-priority") as HTMLInputElement).value
    ).toBe("0");
    expect(
      (document.getElementById("edit-keywords") as HTMLInputElement).value
    ).toBe("سعر، شحن");
    await click(ar.quickResponsesPage.text48);
    expect(m.update).toHaveBeenCalledWith({
      id: 3,
      expectedRevision: "a".repeat(64),
      trigger: "مرحبا",
      response: "كيف أساعدك؟",
      keywords: "سعر، شحن",
      priority: 0,
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
    await fill("trigger", "جديد");
    await fill("response", "نص جديد");
    await act(async () => {
      button(ar.quickResponsesPage.text44).click();
      button(ar.quickResponsesPage.text44).click();
    });
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(
      (document.getElementById("trigger") as HTMLInputElement).closest(
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
    m.update.mockRejectedValue({ data: { code: "CONFLICT" } });
    await render();
    await click("تعديل مرحبا");
    await fill("edit-response", "مسودتي");
    await click(ar.quickResponsesPage.text48);
    expect(document.body.textContent).toContain(ar.quickResponsesUx.conflict);
    expect(
      (document.getElementById("edit-response") as HTMLInputElement).value
    ).toBe("مسودتي");
    m.data = {
      ...m.data,
      rows: [{ ...row, response: "محفوظ آخر", revision: "c".repeat(64) }],
    };
    await render();
    await click(ar.quickResponsesPage.text48);
    expect(m.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        response: "مسودتي",
        expectedRevision: "a".repeat(64),
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
    expect(m.remove).toHaveBeenCalledWith({
      id: 3,
      expectedRevision: "a".repeat(64),
    });
    expect(container.textContent).toContain(
      ar.quickResponsesUx.experimentReference
    );
  });
});
