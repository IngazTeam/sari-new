// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import en from "../client/src/locales/en.json";
import { qualityFixture } from "./tests/helpers/quality-fixture";
import { qualityFlag } from "../shared/quality-readout";
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key: string, args: Record<string, unknown> = {}) => {
      let s = (en.replyQualityUx as any)[key.split(".").at(-1)!] || key;
      for (const [k, v] of Object.entries(args))
        s = s.replace(`{{${k}}}`, String(v));
      return s;
    },
  }),
}));
const api = vi.hoisted(() => ({
  query: {} as any,
  options: {} as any,
  input: {} as any,
  refetch: vi.fn(),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    sariBrain: {
      getQualityDashboard: {
        useQuery: (input: any, options: any) => {
          api.input = input;
          api.options = options;
          return { ...api.query, refetch: api.refetch };
        },
      },
    },
  },
}));
import { ReplyQualityReadout } from "../client/src/components/ReplyQualityReadout";
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  api.query = { data: qualityFixture() };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const render = () =>
  act(async () => root.render(React.createElement(ReplyQualityReadout)));
const c = en.replyQualityUx;
it("shows recorded evidence with its limitations, unknown sentiments and an insufficient trend", async () => {
  await render();
  for (const key of [
    "scope",
    "coverage",
    "durationHelp",
    "shortHelp",
    "escalationHelp",
    "insufficient",
    "unknown",
    "sentimentHelp",
  ] as const)
    expect(container.textContent).toContain(c[key]);
  expect(container.textContent).toContain("7");
  expect(container.textContent).not.toContain("improving");
  expect(container.querySelector("img")).toBeNull();
});
it.each(["isError", "isFetching", "isLoading"])(
  "hides previous figures during %s",
  async state => {
    api.query[state] = true;
    await render();
    expect(container.querySelector("dd")).toBeNull();
    expect(container.textContent).toContain(
      state === "isError" ? c.error : c.loading
    );
  }
);
it("shows a successful empty period instead of disappearing or calculating rates", async () => {
  api.query.data = { ...qualityFixture(), totalResponses: 0 };
  await render();
  expect(container.textContent).toContain(c.empty);
  expect(container.querySelector("dd")).toBeNull();
});
it("retains null rates and durations as unknown without converting to zero", async () => {
  const r = qualityFixture();
  r.avgResponseTimeMs = null;
  r.responseTimeSamples = 0;
  r.cache = qualityFlag(20, 0, 0);
  api.query.data = r;
  await render();
  expect(
    [...container.querySelectorAll("dd")].slice(0, 2).map(n => n.textContent)
  ).toEqual(["—", "—"]);
  expect(container.textContent).toContain("0%");
});
it("refetches on explicit refresh and reads the selected period with automatic retry disabled", async () => {
  await render();
  expect(api.input).toEqual({ days: 30 });
  expect(api.options.retry).toBe(false);
  await act(async () => {
    const select = container.querySelector("select")!;
    select.value = "7";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(api.input).toEqual({ days: 7 });
  await act(async () => container.querySelector("button")!.click());
  expect(api.refetch).toHaveBeenCalledOnce();
});
it("retains question text safely and labels recent values as excerpts", async () => {
  api.query.data.questions[1].text = '<img src=x onerror=alert(1)>';
  await render();
  expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  expect(container.textContent).toContain(c.questionsHelp);
  expect(container.textContent).toContain(c.recentHelp);
  expect(container.querySelector("time")?.getAttribute("datetime")).toBe(
    "2026-09-30T12:00:00.000Z"
  );
});
