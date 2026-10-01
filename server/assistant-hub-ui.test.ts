// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
const locale = vi.hoisted(() => ({ language: "ar" }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: locale,
    t: (key: string) =>
      key
        .split(".")
        .reduce((v: any, k) => v?.[k], locale.language === "ar" ? ar : en) ??
      key,
  }),
}));
import Hub from "../client/src/pages/merchant/AIWhatsAppHub";
const routes = [
  "sari-brain",
  "virtual-team",
  "human-takeover",
  "language-settings",
  "bot-settings",
  "test-sari",
  "sari-playground",
  "quick-responses",
  "ai-suggestions",
  "voice-messages",
  "scheduled-messages",
  "whatsapp-auto-notifications",
  "sari-analytics",
];
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("React", React);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
it.each(["ar", "en"])(
  "exposes every assistant tool with translated copy and correct direction in %s",
  async (lang) => {
    locale.language = lang;
    await act(async () => root.render(React.createElement(Hub)));
    expect(container.firstElementChild?.getAttribute("dir")).toBe(
      lang === "ar" ? "rtl" : "ltr",
    );
    const anchors = Array.from(container.querySelectorAll("a"));
    expect(anchors.map((a) => a.getAttribute("href"))).toEqual(
      routes.map((p) => "/merchant/" + p),
    );
    for (const anchor of anchors) {
      expect(anchor.textContent?.trim().length).toBeGreaterThan(20);
      expect(anchor.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
        "true",
      );
    }
    expect(container.textContent).not.toMatch(
      /assistantHubUx\.|assistantSectionsUx\.|aIWhatsAppHub\./,
    );
    if (lang === "en")
      expect(container.textContent).not.toMatch(/[\u0600-\u06ff]/);
    const copy = lang === "ar" ? ar : en;
    expect(container.textContent).toContain(
      copy.assistantHubUx.notificationsDescription,
    );
    expect(container.textContent).toContain(
      copy.assistantHubUx.analyticsDescription,
    );
  },
);
