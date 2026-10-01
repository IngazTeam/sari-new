// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import en from "../client/src/locales/en.json";
import ar from "../client/src/locales/ar.json";
import { messageWorkspaceFixture } from "./tests/helpers/message-workspace-fixture";
const m = vi.hoisted(() => ({
  data: undefined as any,
  merchantId: 20,
  merchantFetching: false,
  language: "ar",
  error: null as any,
  fetching: false,
  query: vi.fn(),
  refetch: vi.fn(),
  export: vi.fn(),
  success: vi.fn(),
  failure: vi.fn(),
  filename: "",
}));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    merchants: {
      getCurrent: {
        useQuery: () => ({
          data: { id: m.merchantId },
          isFetching: m.merchantFetching,
          refetch: vi.fn(),
        }),
      },
    },
    messageWorkspace: {
      read: {
        useQuery: (input: any, options: any) => {
          m.query(input, options);
          return {
            data: m.data,
            error: m.error,
            isFetching: m.fetching,
            refetch: m.refetch,
          };
        },
      },
    },
  },
}));
vi.mock("../client/src/lib/message-export", async importOriginal => ({
  ...(await importOriginal<any>()),
  messageExportBlob: (...args: any[]) => m.export(...args),
}));
vi.mock("sonner", () => ({ toast: { success: m.success, error: m.failure } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: m.language },
    t: (key: string) =>
      key
        .split(".")
        .reduce((v: any, k) => v?.[k], m.language === "ar" ? ar : en) ?? key,
  }),
}));
import { MessageWorkspace } from "../client/src/components/merchant/MessageWorkspace";
let root: Root, container: HTMLDivElement;
let memory: ReturnType<typeof memoryLocation>;
const render = () =>
  act(async () =>
    root.render(
      React.createElement(
        Router,
        { hook: memory.hook, searchHook: memory.searchHook },
        React.createElement(MessageWorkspace)
      )
    )
  );
const button = (text: string) =>
  [...container.querySelectorAll("button")].find(
    el => el.textContent === text
  )!;
const click = (text: string) => act(async () => button(text).click());
const select = (index: number, value: string) =>
  act(async () => {
    const el = container.querySelectorAll("select")[index];
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
const tab = (text: string) =>
  act(async () => {
    button(text).dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 })
    );
  });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("React", React);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  m.data = { ...messageWorkspaceFixture(), period: "30d" };
  m.error = null;
  m.fetching = false;
  m.merchantId = 20;
  m.merchantFetching = false;
  m.language = "ar";
  memory = memoryLocation({
    path: "/merchant/message-analytics",
    record: true,
  });
  m.filename = "";
  m.export.mockResolvedValue(new Blob(["report"]));
  m.refetch.mockResolvedValue({ data: m.data });
  URL.createObjectURL = vi.fn(() => "blob:message-report");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement
  ) {
    expect(this.isConnected).toBe(true);
    m.filename = this.download;
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("message workspace review and complete snapshot exports", () => {
  it("shows a recoverable error for a completed snapshot belonging to another store", async () => {
    m.data = { ...m.data, merchantId: 999 };
    await render();
    expect(container.querySelector("[data-state=error]")).toBeTruthy();
    expect(container.querySelector("[data-state=loading]")).toBeNull();
    expect(button(ar.messageWorkspace.export)).toBeUndefined();
  });
  it.each([
    "message-analytics",
    "sari-analytics",
    "advanced-analytics",
    "analytics-dashboard",
    "voice-messages",
    "analysis",
  ])(
    "restores URL state and keeps the %s route and unrelated parameters",
    async route => {
      memory.navigate(
        "/merchant/" + route + "?range=90d&tab=products&from=hub"
      );
      m.data = { ...m.data, period: "90d" };
      await render();
      expect(container.querySelector("select")?.value).toBe("90d");
      expect(
        container.querySelector("[role=tab][data-state=active]")?.textContent
      ).toBe(ar.messageWorkspace.productsOrders);
      await tab(ar.messageWorkspace.sentiment);
      expect(memory.history.at(-1)).toContain("/merchant/" + route + "?");
      expect(memory.history.at(-1)).toContain("from=hub");
      expect(memory.history.at(-1)).toContain("range=90d");
      expect(memory.history.at(-1)).toContain("tab=sentiment");
    }
  );
  it("restores the selected tab after reading a different period and receiving a history update", async () => {
    await render();
    await tab(ar.messageWorkspace.productsOrders);
    await select(0, "7d");
    expect(container.querySelector("[data-state=loading]")).toBeTruthy();
    m.data = { ...m.data, period: "7d" };
    await render();
    expect(
      container.querySelector("[role=tab][data-state=active]")?.textContent
    ).toBe(ar.messageWorkspace.productsOrders);
    await act(async () =>
      memory.navigate("/merchant/message-analytics?range=30d&tab=sentiment")
    );
    m.data = { ...m.data, period: "30d" };
    await render();
    expect(
      container.querySelector("[role=tab][data-state=active]")?.textContent
    ).toBe(ar.messageWorkspace.sentiment);
  });
  it("falls back from invalid URL values without sending an invalid query", async () => {
    memory.navigate("/merchant/message-analytics?range=9000d&tab=invalid");
    await render();
    expect(m.query).toHaveBeenCalledWith({ period: "30d" }, expect.anything());
    expect(
      container.querySelector("[role=tab][data-state=active]")?.textContent
    ).toBe(ar.messageWorkspace.messages);
  });
  it.each(["language", "period-return", "merchant-refresh", "read-refresh"])(
    "permanently invalidates an export when %s changes and returns before completion",
    async change => {
      const pending = deferred<Blob>();
      m.export.mockReturnValue(pending.promise);
      await render();
      await click(ar.messageWorkspace.export);
      if (change === "language") {
        m.language = "en";
        await render();
        m.language = "ar";
        await render();
      }
      if (change === "period-return") {
        await select(0, "90d");
        await select(0, "30d");
      }
      if (change === "merchant-refresh") {
        m.merchantFetching = true;
        await render();
        m.merchantFetching = false;
        await render();
      }
      if (change === "read-refresh") {
        m.fetching = true;
        await render();
        m.fetching = false;
        await render();
      }
      await act(async () => pending.resolve(new Blob(["outdated"])));
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(m.success).not.toHaveBeenCalled();
    }
  );
  it("hides cached metrics and blocks new reads while store identity is being checked", async () => {
    m.merchantFetching = true;
    await render();
    expect(container.querySelector("[data-state=loading]")).toBeTruthy();
    expect(button(ar.messageWorkspace.export)).toBeUndefined();
    expect(m.query).toHaveBeenCalledWith(
      { period: "30d" },
      expect.objectContaining({ enabled: false })
    );
    expect(container.textContent).not.toContain(
      ar.messageWorkspace.activeConversations
    );
  });
  it("uses a single scoped period, four types, and complete accessible series", async () => {
    await render();
    expect(m.query).toHaveBeenCalledWith(
      { period: "30d" },
      { retry: false, staleTime: 0, refetchOnMount: "always", enabled: true }
    );
    for (const key of ["text", "voice", "image", "document"] as const)
      expect(container.textContent).toContain(ar.messageWorkspace[key]);
    expect(
      container.querySelectorAll("table")[0].querySelectorAll("tbody tr")
    ).toHaveLength(7);
    expect(
      container.querySelectorAll("table")[1].querySelectorAll("tbody tr")
    ).toHaveLength(24);
  });
  it("shows classification limitations and full product names with verified price units", async () => {
    await render();
    await tab(ar.messageWorkspace.sentiment);
    expect(container.textContent).toContain(ar.messageWorkspace.sentimentNote);
    expect(container.textContent).toContain(ar.messageWorkspace.confidenceNote);
    await tab(ar.messageWorkspace.productsOrders);
    expect(container.textContent).toContain(
      m.data.products.rows[0].productName
    );
    expect(container.textContent).toContain(ar.messageWorkspace.priceReview);
    expect(container.textContent).toContain(ar.messageWorkspace.unmeasured);
    expect(container.textContent).toContain(ar.messageWorkspace.orderNote);
  });
  it.each(["csv", "xlsx", "pdf"])(
    "exports all eight sections as %s from the reviewed snapshot",
    async format => {
      await render();
      await select(1, format);
      await click(ar.messageWorkspace.export);
      expect(m.export).toHaveBeenCalledOnce();
      expect(m.export.mock.calls[0][0].sections).toHaveLength(8);
      expect(m.export.mock.calls[0].slice(1)).toEqual([format, true]);
      expect(m.filename).toBe(`sary-messages-20-30d.${format}`);
      expect(m.success).toHaveBeenCalledWith(ar.messageWorkspace.exportReady);
      expect(container.querySelector("a[download]")).toBeNull();
    }
  );
  it.each(["period", "tenant", "error", "refresh", "unmount"])(
    "discards in-flight exports after %s changes",
    async change => {
      const pending = deferred<Blob>();
      m.export.mockReturnValue(pending.promise);
      await render();
      await click(ar.messageWorkspace.export);
      expect(button(ar.messageWorkspace.exporting).disabled).toBe(true);
      if (change === "period") await select(0, "90d");
      if (change === "tenant") {
        m.merchantId = 21;
        await render();
      }
      if (change === "error") {
        m.error = Error("failed");
        await render();
      }
      if (change === "refresh") {
        m.fetching = true;
        await render();
      }
      if (change === "unmount") await act(async () => root.render(null));
      await act(async () => pending.resolve(new Blob(["stale"])));
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(m.success).not.toHaveBeenCalled();
    }
  );
  it("hides stale results on failure and never replaces them with zero counts", async () => {
    m.error = { data: { code: "FORBIDDEN" } };
    await render();
    expect(container.querySelector("[data-state=forbidden]")).toBeTruthy();
    expect(button(ar.messageWorkspace.export)).toBeUndefined();
    expect(container.textContent).not.toContain(ar.messageWorkspace.empty);
  });
  it("hides mismatched period results until the selected period arrives, including all 90 dates", async () => {
    await render();
    await select(0, "90d");
    expect(button(ar.messageWorkspace.export)).toBeUndefined();
    expect(container.querySelector("[data-state=loading]")).toBeTruthy();
    m.data = {
      ...m.data,
      period: "90d",
      daily: Array.from({ length: 90 }, (_, i) => ({
        date: new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10),
        count: 0,
      })),
    };
    await render();
    expect(
      container.querySelector("tbody")!.querySelectorAll("tr")
    ).toHaveLength(90);
  });
  it("awaits refresh and reports a failed refetch honestly", async () => {
    const pending = deferred<any>();
    m.refetch.mockReturnValue(pending.promise);
    await render();
    await click(ar.messageWorkspace.refresh);
    expect(m.success).not.toHaveBeenCalled();
    expect(button(ar.messageWorkspace.refresh).disabled).toBe(true);
    await act(async () => pending.resolve({ error: Error("unavailable") }));
    expect(m.failure).toHaveBeenCalledWith(ar.messageWorkspace.refreshFailed);
  });
  it("keeps genuine empty counts separate from unavailable percentages", async () => {
    m.data.messages.total = 0;
    m.data.messages.incoming = 0;
    m.data.messages.outgoing = 0;
    m.data.messages.activeConversations = 0;
    m.data.messages.byType = m.data.messages.byType.map((row: any) => ({
      ...row,
      count: 0,
      share: null,
    }));
    await render();
    expect(container.textContent).toContain(ar.messageWorkspace.empty);
    expect(container.textContent).toContain(ar.messageWorkspace.unavailable);
    expect(button(ar.messageWorkspace.export)).toBeTruthy();
  });
  it("reports preparation failure without claiming a file was downloaded", async () => {
    m.export.mockRejectedValue(Error("font failed"));
    await render();
    await click(ar.messageWorkspace.export);
    expect(m.failure).toHaveBeenCalledWith(ar.messageWorkspace.exportFailed);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
