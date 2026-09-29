// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import { messageWorkspaceFixture } from "./tests/helpers/message-workspace-fixture";
const m = vi.hoisted(() => ({
  data: undefined as any,
  merchantId: 20,
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
        useQuery: () => ({ data: { id: m.merchantId }, refetch: vi.fn() }),
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
    i18n: { language: "ar" },
    t: (key: string) => key.split(".").reduce((v: any, k) => v?.[k], ar) ?? key,
  }),
}));
import { MessageWorkspace } from "../client/src/components/merchant/MessageWorkspace";
let root: Root, container: HTMLDivElement;
const render = () =>
  act(async () => root.render(React.createElement(MessageWorkspace)));
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
  it("uses a single scoped period, four types, and complete accessible series", async () => {
    await render();
    expect(m.query).toHaveBeenCalledWith(
      { period: "30d" },
      { staleTime: 0, refetchOnMount: "always" }
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
