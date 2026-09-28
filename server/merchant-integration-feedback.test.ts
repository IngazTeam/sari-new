import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ar from "../client/src/locales/ar.json";

const state = vi.hoisted(() => ({
  pending: "",
  mutations: {} as Record<string, any>,
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: state.toast }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key.split(".").reduce((o: any, k) => o?.[k], ar) || key,
  }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    sheets: new Proxy(
      {},
      {
        get: (_target, name: string) => ({
          useQuery: () => ({
            data: { isConnected: true, spreadsheetId: "local-fixture" },
            refetch: vi.fn(),
          }),
          useMutation: (callbacks: any) => {
            state.mutations[name] = callbacks;
            return { isPending: state.pending === name, mutate: vi.fn() };
          },
        }),
      }
    ),
  },
}));

import SheetsSettings from "../client/src/pages/SheetsSettings";
import SheetsReports from "../client/src/pages/SheetsReports";
import SheetsInventory from "../client/src/pages/SheetsInventory";

beforeEach(() => {
  vi.stubGlobal("React", React);
  state.pending = "";
  state.mutations = {};
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());
describe("merchant integration feedback follows the action state", () => {
  it("renders connection and report settings without announcing an attempted operation", () => {
    const html = renderToStaticMarkup(createElement(SheetsSettings));
    expect(html).toContain("حالة الاتصال");
    expect(html).toContain("إعدادات التقارير التلقائية");
    expect(html).not.toMatch(/فشل الإعداد|نجح الإعداد|تم التحديث/);
  });
  it("describes report contents instead of displaying success before generation", () => {
    const html = renderToStaticMarkup(createElement(SheetsReports));
    expect(html).toContain("محتويات التقارير");
    expect(html).toContain("عدد الطلبات الإجمالي");
    expect(html).toContain("أكثر 5 منتجات مبيعاً");
    expect(html).not.toMatch(/تم توليد التقرير اليومي بنجاح|فشل التوليد/);
  });
  it("describes import and export without displaying operation results initially", () => {
    const html = renderToStaticMarkup(createElement(SheetsInventory));
    expect(html).toContain("تصدير إلى Sheets");
    expect(html).toContain("كيف تعمل المزامنة؟");
    expect(html).toContain("الكميات فقط");
    expect(html).not.toMatch(/تم الاستيراد بنجاح|فشلت المزامنة|فشل التحديث/);
  });
  it.each([SheetsSettings, SheetsReports, SheetsInventory])(
    "reports a rejected operation as an error toast",
    Component => {
      renderToStaticMarkup(createElement(Component));
      for (const callbacks of Object.values(state.mutations)) {
        state.toast.error.mockClear();
        callbacks.onError(new Error("تعذر الاتصال بالخدمة"));
        expect(state.toast.error).toHaveBeenCalledWith("تعذر الاتصال بالخدمة");
        expect(state.toast.success).not.toHaveBeenCalled();
      }
    }
  );
  it("blocks concurrent inventory writes while either direction is pending", () => {
    for (const pending of ["syncInventory", "updateInventoryFromSheets"]) {
      state.pending = pending;
      const html = renderToStaticMarkup(createElement(SheetsInventory));
      expect((html.match(/<button[^>]*disabled=""/g) || []).length).toBe(2);
    }
  });
});
