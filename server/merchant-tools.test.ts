// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
import { merchantTools } from "../client/src/components/merchant/tools";
import {
  navigableMerchantTools,
  merchantSections,
} from "../client/src/components/merchant/navigation";
import {
  readToolFilters,
  toolsLocation,
  toolTranslationKey,
  searchMerchantTools,
} from "../client/src/lib/merchant-tools-search";
import MerchantTools from "../client/src/pages/merchant/Tools";
import { readFileSync } from "node:fs";
import { createInstance } from 'i18next';
let language: "ar" | "en" = "ar";
const dictionaries = { ar, en };
const translation = (key: string, args: Record<string, unknown> = {}) => {
  const value = key
    .split(".")
    .reduce(
      (node: any, k) => node?.[k],
      dictionaries[(args.lng as "ar" | "en") || language],
    );
  return typeof value === "string"
    ? value.replace(/\{\{(\w+)\}\}/g, (_, k) => String(args[k] ?? ""))
    : key;
};
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: translation,
    i18n: { language, dir: () => (language === "ar" ? "rtl" : "ltr") },
  }),
}));
const label = (path: string, lng: "ar" | "en") =>
  translation(toolTranslationKey(path), { lng });
const group = (id: string, lng: "ar" | "en") =>
  translation(`merchantNavigationUx.sections.${id}`, { lng });
const search = (query: string, section = "all") =>
  searchMerchantTools({ query, section }, label, group).map(
    (tool) => tool.path,
  );
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  language = "ar";
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const mount = async (searchPath = "") => {
  const memory = memoryLocation({
    path: "/merchant/tools",
    searchPath,
    record: true,
  });
  await act(async () =>
    root.render(
      React.createElement(
        Router,
        { hook: memory.hook, searchHook: memory.searchHook },
        React.createElement(MerchantTools),
      ),
    ),
  );
  return memory;
};
describe("merchant tool discovery and navigation", () => {
  it('searches English display names with the production Arabic-only resource gate', async () => {
    const production = createInstance();
    await production.init({ lng: 'ar', fallbackLng: 'ar', supportedLngs: ['ar'], resources: { ar: { translation: ar } }, initImmediate: false });
    const found = searchMerchantTools({ query: 'assistant language', section: 'all' },
      (path, lng) => production.t(toolTranslationKey(path), { lng }),
      (section, lng) => production.t(`merchantNavigationUx.sections.${section}`, { lng }));
    expect(found.map(tool => tool.path)).toEqual(['/merchant/language-settings']);
    expect(production.hasResourceBundle('en', 'translation')).toBe(false);
    expect(production.language).toBe('ar');
  });
  it("keeps all existing navigable tools with real routes and complete bilingual labels", () => {
    const routes = JSON.parse(
      readFileSync(
        "docs/audits/tenant-features-2026-09-30/inventory.json",
        "utf8",
      ),
    ).routes.map((r: any) => r.route);
    expect(new Set(navigableMerchantTools.map((t) => t.path)).size).toBe(
      navigableMerchantTools.length,
    );
    for (const tool of merchantTools)
      for (const lng of ["ar", "en"] as const) {
        const text = label(tool.paths[0], lng);
        expect(text, tool.paths[0]).not.toContain("merchantNavigationUx");
        expect(text.length).toBeGreaterThan(0);
      }
    for (const tool of navigableMerchantTools) {
      expect(routes, tool.path).toContain(tool.path);
      expect(tool.path).not.toMatch(
        /:|\/callback$|\/checkout$|\/payment\/(success|cancel)$/,
      );
    }
    for (const section of merchantSections)
      for (const lng of ["ar", "en"] as const)
        expect(group(section.id, lng)).not.toContain("merchantNavigationUx");
  });
  it.each(["  أَرْقَام واتساب  ", "ارقام واتساب", "WHATSAPP numbers"])(
    "finds a task in either language without Arabic diacritic sensitivity: %s",
    (query) => {
      expect(search(query)).toEqual(["/merchant/whatsapp"]);
    },
  );
  it("requires every search word while matching category names and legacy paths", () => {
    expect(search("مساعد language")).toEqual(["/merchant/language-settings"]);
    expect(search("/merchant/sari-analytics")).toEqual(["/merchant/message-analytics"]);
    expect(search("مساعد", "sales")).toEqual([]);
    expect(search("", "ai")).toEqual(
      navigableMerchantTools
        .filter((t) => t.section === "ai")
        .map((t) => t.path),
    );
  });
  it("restores query filters safely and treats unknown sections explicitly", () => {
    expect(readToolFilters("?q=المساعد&section=ai")).toEqual({
      query: "المساعد",
      section: "ai",
      unknownSection: false,
    });
    expect(readToolFilters("?section=unknown")).toEqual({
      query: "",
      section: "all",
      unknownSection: true,
    });
    expect(readToolFilters("?q=" + "x".repeat(200)).query).toHaveLength(100);
    const filters = { query: "ساري & x=#?", section: "ai" };
    expect(readToolFilters(toolsLocation(filters).split("?")[1])).toMatchObject(
      filters,
    );
  });
  it("renders English labels and accessible result links without changing route identities", async () => {
    language = "en";
    await mount("section=ai");
    expect(container.querySelector("h1")?.textContent).toBe("All tools");
    expect(container.querySelector("section")?.dir).toBe("ltr");
    expect(container.querySelector("nav")?.getAttribute("aria-label")).toBe(
      "Matching tools",
    );
    const links = [...container.querySelectorAll("nav a")];
    expect(links.map((a) => a.getAttribute("href"))).toEqual(search("", "ai"));
    expect(
      links.every(
        (a) => !!a.textContent && !/merchantNavigationUx/.test(a.textContent),
      ),
    ).toBe(true);
  });
  it("keeps typed search in the URL and supports restoring the list without dropping a selected filter", async () => {
    const memory = await mount("section=ai");
    await act(async () => {
      const input = container.querySelector("input")!;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, "لغة");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelectorAll("nav a")).toHaveLength(1);
    expect(memory.history.at(-1)).toContain("section=ai&q=");
    await act(async () =>
      container.querySelector<HTMLAnchorElement>("nav a")!.click(),
    );
    expect(memory.history.at(-1)).toBe("/merchant/language-settings");
    await act(async () =>
      memory.navigate(memory.history[memory.history.length - 2]),
    );
    expect(container.querySelector("input")?.value).toBe("لغة");
    expect(container.querySelector("select")?.value).toBe("ai");
  });
  it("explains an empty result and clears both filters without network actions", async () => {
    await mount("section=ai&q=no-such-tool");
    expect(container.querySelector("h2")?.textContent).toBe(
      "لا توجد أدوات مطابقة",
    );
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(".mw-tools-empty button")!
        .click(),
    );
    expect(container.querySelector("input")?.value).toBe("");
    expect(container.querySelector("select")?.value).toBe("all");
    expect(container.querySelectorAll("nav a")).toHaveLength(
      navigableMerchantTools.length,
    );
  });
});
