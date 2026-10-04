// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
const state = vi.hoisted(() => ({ language: "en" }));
vi.mock(
  "@/lib/trpc",
  () => import("../prototypes/tenant-dashboard/src/service-preview-api")
);
vi.mock(
  "wouter",
  () => import("../prototypes/tenant-dashboard/src/service-preview-router")
);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: state.language },
    t: (key: string) =>
      key
        .split(".")
        .reduce((o: any, k) => o?.[k], state.language === "ar" ? ar : en) ||
      key,
  }),
}));
import Usage from "../client/src/pages/merchant/Usage";
import UsageDashboard from "../client/src/pages/merchant/UsageDashboard";
import { ServicePreviewContext } from "../prototypes/tenant-dashboard/src/service-preview-api";
import {
  ServicePreviewModel,
  type ServiceMode,
} from "../prototypes/tenant-dashboard/src/service-preview-model";
import { scopedUsage } from "../client/src/lib/usage-workspace-view";
let root: Root, host: HTMLDivElement, model: ServicePreviewModel;
const c = () =>
  state.language === "ar" ? ar.usageWorkspaceUx : en.usageWorkspaceUx;
beforeEach(() => {
  vi.stubGlobal("React", React);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  state.language = "en";
  history.replaceState(null, "", "/?path=/merchant/usage");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  model = new ServicePreviewModel(269);
});
afterEach(async () => {
  await act(async () => root.unmount());
  model.dispose();
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const render = (resources = false) =>
  act(async () =>
    root.render(
      <ServicePreviewContext.Provider value={model}>
        {resources ? <UsageDashboard /> : <Usage />}
      </ServicePreviewContext.Provider>
    )
  );
const go = (query: string) =>
  act(async () => {
    history.replaceState(null, "", "/?path=/merchant/usage" + query);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
const clickLink = (text: string) =>
  act(async () => {
    const node = Array.from(host.querySelectorAll<HTMLAnchorElement>("a")).find(
      a => a.textContent === text
    );
    expect(node).toBeTruthy();
    node!.click();
  });
it.each(["en", "ar"])(
  "renders actual translated subscription counters and zero allowance in %s",
  async language => {
    state.language = language;
    await render();
    expect(host.textContent).toContain(c().intro);
    expect(host.textContent).toContain(c().monthly);
    expect(host.textContent).toContain(c().nearLimit);
    expect(host.textContent).toContain(c().noAllowance);
    expect(host.textContent).toContain(c().unlimited);
    expect(host.querySelectorAll(".uw-meter")).toHaveLength(3);
    expect(host.querySelectorAll("progress")).toHaveLength(1);
    expect(host.textContent).not.toContain("usageWorkspaceUx.");
    expect(model.operations).toBe(0);
  }
);
it("opens the resources route with the full catalog count and an unknown product limit", async () => {
  await render(true);
  expect(host.textContent).toContain("734");
  expect(host.textContent).toContain(c().unknownLimit);
  expect(host.textContent).toContain(c().outgoingMessages);
  expect(host.querySelectorAll(".uw-meter")).toHaveLength(5);
  expect(model.operations).toBe(0);
});
it("preserves view in the URL and provides six selectable monthly records", async () => {
  await render();
  await clickLink(c().history);
  expect(location.search).toContain("tab=history");
  expect(host.querySelectorAll("tbody tr")).toHaveLength(6);
  const first = host.querySelector<HTMLButtonElement>(".uw-months button")!;
  await act(async () => first.click());
  expect(first.getAttribute("aria-pressed")).toBe("true");
  expect(host.querySelector(".uw-month-summary")?.textContent).toContain(
    first.textContent!
  );
  await clickLink(c().resources);
  expect(host.textContent).toContain("734");
  expect(model.operations).toBe(0);
});
it.each([
  "loading",
  "failure",
  "stale-error",
  "forbidden",
  "foreign",
  "session",
] as ServiceMode[])(
  "does not show stale or private usage on %s",
  async mode => {
    model = new ServicePreviewModel(269, mode);
    await render();
    expect(host.querySelectorAll(".uw-meter")).toHaveLength(0);
    expect(host.textContent).not.toContain("Nawa sample");
    expect(host.textContent).not.toContain("734");
  }
);
it("keeps confirmed absence separate from errors and shows a real empty history", async () => {
  model = new ServicePreviewModel(269, "empty");
  await render();
  expect(host.textContent).toContain(c().noneHint);
  await clickLink(c().history);
  expect(host.textContent).toContain(c().historyEmpty);
  expect(host.querySelectorAll("tbody tr")).toHaveLength(6);
});
it("keeps legacy counters unknown instead of drawing healthy progress", async () => {
  model = new ServicePreviewModel(269, "legacy");
  await render();
  expect(host.textContent).toContain(c().unknownCount);
  expect(host.querySelectorAll("progress")).toHaveLength(0);
});
it("exposes conflicting subscriptions instead of selecting a counter", async () => {
  model = new ServicePreviewModel(269, "unavailable-reference");
  await render();
  expect(host.textContent).toContain(c().ambiguousHint);
  expect(host.textContent).toContain(c().unknownCount);
  expect(host.querySelectorAll("progress")).toHaveLength(0);
});
it("lets a viewer read without offering usage mutations", async () => {
  model = new ServicePreviewModel(269, "readonly");
  await render();
  expect(host.querySelectorAll(".uw-meter")).toHaveLength(3);
  expect(model.operations).toBe(0);
});
it("rejects a malformed view without silently displaying another section", async () => {
  await go("&tab=not-real");
  await render();
  expect(host.textContent).toContain(c().invalidView);
  expect(host.querySelectorAll(".uw-meter")).toHaveLength(0);
  await clickLink(c().resetView);
  expect(host.querySelectorAll(".uw-meter")).toHaveLength(3);
});
it("refreshes through a read without renewing or resetting", async () => {
  await render();
  const button = Array.from(
    host.querySelectorAll<HTMLButtonElement>("button")
  ).find(b => b.textContent === c().refresh)!;
  await act(async () => button.click());
  expect(model.retries).toBe(1);
  expect(model.operations).toBe(0);
});
it("replaces the visible figures after a tenant switch", async () => {
  await render();
  expect(host.textContent).toContain("Nawa sample");
  model.dispose();
  model = new ServicePreviewModel(270);
  await render();
  expect(host.textContent).toContain("Madar sample");
  expect(host.textContent).not.toContain("Nawa sample");
  expect(host.textContent).toContain(c().reached);
});
it("binds a valid snapshot to both actor and tenant", () => {
  const value = model.read("usage.workspace").data;
  expect(scopedUsage(value, 1269, 269)).not.toBeNull();
  expect(scopedUsage(value, 1270, 269)).toBeNull();
  expect(scopedUsage(value, 1269, 270)).toBeNull();
});
it("fails closed on inconsistent activity data", async () => {
  const original = model.read.bind(model);
  vi.spyOn(model, "read").mockImplementation((name, input) => {
    const r = original(name, input);
    return name === "usage.workspace"
      ? {
          ...r,
          data: { ...r.data, activity: { ...r.data.activity, campaigns: 999 } },
        }
      : r;
  });
  await render();
  expect(host.querySelectorAll(".uw-meter")).toHaveLength(0);
  expect(host.textContent).not.toContain("Nawa sample");
});
it("explains that stored outgoing counts are not delivery or sales proficiency evidence", async () => {
  await render();
  expect(host.querySelector("details")?.textContent).toContain(
    c().notSalesScore
  );
  expect(host.querySelector("details")?.textContent).toContain(
    c().sourceNotice
  );
});
