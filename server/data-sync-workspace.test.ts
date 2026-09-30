// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
const m = vi.hoisted(() => ({
  data: {} as any,
  error: null as any,
  fetching: false,
  loading: false,
  paused: false,
  language: "en",
  send: vi.fn(),
  refresh: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      sheets: { inventoryStatus: { invalidate: m.invalidate } },
    }),
    sheets: {
      inventoryStatus: {
        useQuery: () => ({
          data: m.data,
          error: m.error,
          isFetching: m.fetching,
          isLoading: m.loading,
          fetchStatus: m.paused ? "paused" : "idle",
          refetch: m.refresh,
        }),
      },
      syncInventory: { useMutation: () => ({ mutateAsync: m.send }) },
    },
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: m.language },
    t: (key: string, values: any = {}) =>
      String(
        key
          .split(".")
          .reduce((v: any, k) => v?.[k], m.language === "ar" ? ar : en) ?? key
      ).replace(/\{\{(\w+)\}\}/g, (_, k) => String(values[k] ?? "")),
  }),
}));
vi.mock("../client/src/components/merchant/WorkspaceState", () => ({
  WorkspaceState: ({ kind, onRetry }: any) =>
    React.createElement(
      "div",
      { "data-state": kind },
      React.createElement("button", { onClick: onRetry }, "Retry")
    ),
  workspaceFailureKind: (error: any) =>
    error.data?.code === "FORBIDDEN"
      ? "forbidden"
      : error.data?.code === "UNAUTHORIZED"
        ? "session"
        : "error",
}));
import { DataSyncWorkspace } from "../client/src/components/merchant/DataSyncWorkspace";
let host: HTMLDivElement, root: Root;
const render = async () =>
  act(async () =>
    root.render(
      React.createElement(DataSyncWorkspace, { scope: "7:20:data-sync" })
    )
  );
const button = (text: string) =>
  Array.from(host.querySelectorAll("button")).find(
    b => b.textContent === text
  )!;
const text = () => host.textContent!;
const click = async (el: HTMLElement) => act(async () => el.click());
const consent = () => host.querySelector("input")!;
beforeEach(async () => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  m.data = {
    isConnected: true,
    merchantId: 20,
    actorId: 7,
    spreadsheetId: "local-export-109",
    sourceDigest: "a".repeat(64),
    lastSync: new Date("2026-09-30T12:00:00Z"),
  };
  m.error = null;
  m.fetching = false;
  m.loading = false;
  m.paused = false;
  m.language = "en";
  m.send.mockResolvedValue({
    success: true,
    merchantId: 20,
    actorId: 7,
    sourceDigest: "a".repeat(64),
    spreadsheetId: "local-export-109",
    sheetId: 0,
    rows: 2,
    unknownStock: 1,
    unverifiedPrice: 0,
    confirmedAt: "2026-09-30T12:00:00.000Z",
  });
  m.invalidate.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await render();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
describe("inventory export feedback and interaction", () => {
  it.each(["merchant", "actor", "source"])(
    "rejects stale identity or source in %s receipt",
    async kind => {
      const receipt = await m.send();
      m.send.mockClear();
      m.send.mockResolvedValue({
        ...receipt,
        ...(kind === "merchant"
          ? { merchantId: 21 }
          : kind === "actor"
            ? { actorId: 8 }
            : { sourceDigest: "b".repeat(64) }),
      });
      await click(consent());
      await click(button("Export inventory"));
      expect(text()).not.toContain("confirmed replacing");
      expect(text()).toContain("response was lost");
    }
  );
  it("does not expose another tenant's destination", async () => {
    m.data = { ...m.data, merchantId: 21 };
    await render();
    expect(host.querySelector("a[target]")).toBeNull();
    expect(consent().disabled).toBe(true);
  });
  it("revokes approval after reconnection to the same spreadsheet", async () => {
    await click(consent());
    m.data = { ...m.data, sourceDigest: "b".repeat(64) };
    await render();
    expect(consent().checked).toBe(false);
  });
  it.each([
    ["BAD_REQUEST", "empty", "no visible products"],
    ["BAD_REQUEST", "limit", "5,000"],
    ["BAD_GATEWAY", "destination", "No visible tab"],
    ["CONFLICT", "unavailable", "write did not start"],
    ["TOO_MANY_REQUESTS", "rate_limit", "hour’s"],
  ])("explains a pre-write rejection %s/%s", async (code, reason, expected) => {
    m.send.mockRejectedValue({
      data: { code },
      message: `inventory_export:${reason}`,
    });
    await click(consent());
    await click(button("Export inventory"));
    expect(text()).toContain(expected);
    expect(text()).not.toContain("response was lost");
    expect(consent().checked).toBe(false);
  });
  it("uses actual status fields, names the destination and requires fresh consent", async () => {
    expect(text()).toContain("active connection");
    expect(text()).toContain("shared connection activity");
    expect(text()).not.toContain("automatically every hour");
    expect(button("Export inventory").disabled).toBe(true);
    await click(consent());
    await click(button("Export inventory"));
    expect(m.send).toHaveBeenCalledExactlyOnceWith({
      expectedSourceDigest: "a".repeat(64),
      reviewed: true,
    });
    expect(text()).toContain("confirmed replacing");
    expect(consent().checked).toBe(false);
    expect(m.invalidate).toHaveBeenCalledOnce();
  });
  it("does not announce success for a resolved failure or allow an automatic retry", async () => {
    m.send.mockResolvedValue({
      success: false,
      message: "private upstream error",
    });
    await click(consent());
    await click(button("Export inventory"));
    expect(text()).toContain("did not confirm");
    expect(text()).not.toContain("confirmed replacing");
    expect(text()).not.toContain("private upstream");
    expect(button("Export inventory").disabled).toBe(true);
    await click(button("I checked the spreadsheet"));
    expect(consent().checked).toBe(false);
    expect(m.send).toHaveBeenCalledOnce();
  });
  it("marks a lost reply uncertain and does not resend it", async () => {
    m.send.mockRejectedValue(Error("access token secret"));
    await click(consent());
    await click(button("Export inventory"));
    expect(text()).toContain("response was lost");
    expect(text()).not.toContain("access token");
    expect(consent().disabled).toBe(true);
    expect(m.send).toHaveBeenCalledOnce();
  });
  it.each([
    "loading",
    "fetching",
    "paused",
    "error",
    "forbidden",
    "session",
    "unlinked",
    "noSheet",
    "unsafeSheet",
  ])("blocks export for %s", async kind => {
    if (kind === "loading") m.loading = true;
    if (kind === "fetching") m.fetching = true;
    if (kind === "paused") m.paused = true;
    if (["error", "forbidden", "session"].includes(kind))
      m.error = {
        data: {
          code:
            kind === "forbidden"
              ? "FORBIDDEN"
              : kind === "session"
                ? "UNAUTHORIZED"
                : "INTERNAL_SERVER_ERROR",
        },
      };
    if (kind === "unlinked") m.data = { isConnected: false };
    if (kind === "noSheet") m.data = { isConnected: true };
    if (kind === "unsafeSheet")
      m.data = { isConnected: true, spreadsheetId: "https://evil.test/" };
    await render();
    expect(button("Export inventory").disabled).toBe(true);
    expect(consent().disabled).toBe(true);
    expect(host.querySelector("a[target]")).toBeNull();
    expect(m.send).not.toHaveBeenCalled();
  });
  it("handles absent and invalid dates without inventing an export result", async () => {
    for (const lastSync of [undefined, "not-a-date"]) {
      m.data = { ...m.data, lastSync };
      await render();
      expect(text()).toContain("No activity recorded");
      expect(text()).not.toContain("Invalid Date");
      expect(host.querySelector("[role=status]")).toBeNull();
    }
  });
  it("does not retain consent when the destination changes", async () => {
    await click(consent());
    m.data = { ...m.data, spreadsheetId: "changed" };
    await render();
    expect(consent().checked).toBe(false);
    expect(host.querySelector("a[target]")?.getAttribute("href")).toBe(
      "https://docs.google.com/spreadsheets/d/changed/edit"
    );
  });
  it("prevents double submission and ignores the old response after a destination change", async () => {
    let resolve!: (r: any) => void;
    m.send.mockImplementation(
      () =>
        new Promise(r => {
          resolve = r;
        })
    );
    await click(consent());
    await click(button("Export inventory"));
    expect(host.firstElementChild?.getAttribute("aria-busy")).toBe("true");
    expect(consent().disabled).toBe(true);
    expect(button("Exporting…").disabled).toBe(true);
    m.data = { ...m.data, spreadsheetId: "changed" };
    await render();
    await act(async () => resolve({ success: true }));
    expect(text()).not.toContain("confirmed replacing");
    expect(m.send).toHaveBeenCalledOnce();
  });
  it("retains both reviewed imports and settings in Arabic", async () => {
    m.language = "ar";
    await render();
    expect(text()).toContain("تصدير المخزون");
    expect(text()).toContain("لا يوجد استيراد تلقائي");
    for (const href of [
      "/merchant/sheets/settings",
      "/merchant/products/upload",
      "/merchant/sheets/inventory",
    ])
      expect(host.querySelector(`a[href="${href}"]`)).not.toBeNull();
    expect(text()).not.toContain("dataSyncUx.");
    expect(host.querySelectorAll("h1")).toHaveLength(1);
  });
});
