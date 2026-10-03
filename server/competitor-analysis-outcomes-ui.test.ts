// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
const m = vi.hoisted(() => ({
  rows: [] as any[],
  locale: "en",
  add: null as any,
  remove: null as any,
  toast: vi.fn(),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, args: any = {}) => {
      const dict = m.locale === "ar" ? ar : en;
      let value =
        key.split(".").reduce((o: any, k) => o?.[k], dict as any) || key;
      for (const [k, v] of Object.entries(args))
        value = value.replaceAll(`{{${k}}}`, String(v));
      return value;
    },
  }),
}));
vi.mock("sonner", () => ({ toast: { error: m.toast, success: vi.fn() } }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      websiteAnalysis: { listCompetitors: { invalidate: vi.fn() } },
    }),
    websiteAnalysis: {
      listCompetitors: { useQuery: () => ({ data: m.rows, isLoading: false }) },
      addCompetitor: {
        useMutation: (callbacks: any) => {
          m.add = callbacks;
          return { mutate: vi.fn(), isPending: false };
        },
      },
      deleteCompetitor: {
        useMutation: (callbacks: any) => {
          m.remove = callbacks;
          return { mutate: vi.fn(), isPending: false };
        },
      },
    },
  },
}));
import CompetitorAnalysis from "../client/src/pages/CompetitorAnalysis";
let host: HTMLDivElement, root: Root;
const secret = "PRIVATE_HISTORICAL_ERROR_430";
beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.clearAllMocks();
  m.locale = "en";
  m.rows = [
    {
      id: 8,
      name: "Fixture",
      url: "https://example.test",
      status: "failed",
      errorMessage: secret,
      createdAt: "2026-10-03",
      strengths: [],
      weaknesses: [],
    },
  ];
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const render = () =>
  act(async () => root.render(React.createElement(CompetitorAnalysis)));
it.each(["ar", "en"])(
  "uses localized failure explanations instead of raw stored or mutation errors (%s)",
  async locale => {
    m.locale = locale;
    await render();
    const copy = (locale === "ar" ? ar : en).competitorAnalysisPage;
    expect(host.textContent).toContain(copy.analysisFailed);
    expect(host.textContent).not.toContain(secret);
    await act(async () => {
      m.add.onError({ message: secret });
      m.remove.onError({ message: secret });
    });
    expect(m.toast.mock.calls).toEqual([[copy.addFailed], [copy.deleteFailed]]);
  }
);
it.each(["pending", "analyzing", "failed"])(
  "disables deletion only while the report is still %s",
  async status => {
    m.rows[0].status = status;
    await render();
    const button = host.querySelector(
      'button[aria-label="Delete competitor Fixture"]'
    ) as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.disabled).toBe(status !== "failed");
  }
);
