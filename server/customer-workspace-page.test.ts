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
  paused: false,
  language: "en",
  inputs: {} as any,
  refresh: vi.fn(),
  export: vi.fn(),
  write: vi.fn(),
  receipt: vi.fn(),
}));
vi.mock("../client/src/lib/trpc", () => {
  const query = (name: string) => ({
    useQuery: (input: any) => {
      m.inputs[name] = input;
      return {
        data: m.data[name],
        error: m.error,
        isFetching: m.fetching,
        isLoading: false,
        fetchStatus: m.paused ? "paused" : "idle",
        dataUpdatedAt: 10,
        refetch: m.refresh,
      };
    },
  });
  return {
    trpc: {
      useUtils: () => ({
        customers: {
          workspace: { export: { fetch: m.export } },
          annotations: { receipt: { fetch: m.receipt } },
        },
      }),
      customers: {
        workspace: { list: query("list"), detail: query("detail") },
        annotations: {
          read: query("annotations"),
          write: { useMutation: () => ({ mutateAsync: m.write }) },
        },
      },
    },
  };
});
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
  WorkspaceState: ({ kind, onRetry, description }: any) =>
    React.createElement(
      "div",
      { "data-state": kind },
      description,
      onRetry && React.createElement("button", { onClick: onRetry }, "Retry")
    ),
  workspaceFailureKind: (e: any) =>
    e?.data?.code === "FORBIDDEN"
      ? "forbidden"
      : e?.data?.code === "UNAUTHORIZED"
        ? "session"
        : "error",
}));
import { CustomerListWorkspace } from "../client/src/components/merchant/CustomerListWorkspace";
import { CustomerDetailWorkspace } from "../client/src/components/merchant/CustomerDetailWorkspace";
import { CustomerAnnotations } from "../client/src/components/merchant/CustomerAnnotations";
import { readCustomerCache } from "../client/src/lib/customer-workspace-cache";
import { clearKnowledgeWorkspace } from "../client/src/lib/knowledge-workspace-cache";
const scope = "7:20:customers",
  key = "customer%2F75",
  through = "2026-09-30T12:00:00.000Z";
const paging = { page: 1, pageSize: 25, total: 1, pages: 1 };
const row = {
  key,
  name: "<img src=x onerror=alert(1)>",
  firstRecordedAt: through,
  lastInteractionAt: through,
  activity: "active",
  sources: ["conversation", "order", "loyalty"],
  conversationCount: 1,
  orderCount: 2,
  profileCount: 0,
  zidCount: 0,
  loyaltyCount: 2,
};
function fixtures() {
  return {
    list: {
      merchantId: 20,
      canManage: true,
      through,
      selection: { search: "", activity: "all", page: 1 },
      totals: {
        all: 1,
        active: 1,
        recent: 0,
        inactive: 0,
        unknown: 0,
        firstRecordedThisMonth: 1,
        excludedEmptyIdentifiers: 2,
        excludedInvalidIdentifiers: 3,
      },
      pagination: paging,
      rows: [row],
    },
    detail: {
      merchantId: 20,
      through,
      selection: { key, ordersPage: 1, conversationsPage: 1 },
      customer: row,
      amounts: [
        {
          currency: "SAR",
          eligibleOrders: 1,
          excludedAmounts: 0,
          totalMinor: 125,
          markedPaidMinor: 0,
        },
        {
          currency: "USD",
          eligibleOrders: 1,
          excludedAmounts: 0,
          totalMinor: 250,
          markedPaidMinor: 250,
        },
      ],
      loyalty: { records: 2, points: null },
      orders: {
        pagination: { ...paging, total: 2 },
        rows: [
          {
            id: 75,
            reference: "TEST-75",
            customerPhone: key,
            currency: "SAR",
            totalMinor: 125,
            status: "paid",
            paymentStatus: "unpaid",
            createdAt: through,
          },
        ],
      },
      conversations: {
        pagination: paging,
        rows: [
          {
            id: 75,
            customerPhone: "raw+phone/75",
            name: "Source name",
            status: "active",
            createdAt: through,
            lastMessageAt: through,
          },
        ],
      },
    },
    annotations: {
      merchantId: 20,
      key,
      selection: { key, page: 1 },
      canManage: true,
      revision: 0,
      tags: ["Existing"],
      pagination: { ...paging, total: 0, pages: 0 },
      notes: [],
    },
  };
}
function receipt(input: any) {
  return {
    merchantId: 20,
    actorId: 7,
    key,
    requestId: input.requestId,
    kind: input.kind,
    noteId: input.kind === "note" ? 75 : null,
    tags: input.kind === "tags" ? input.tags : null,
    revision: input.kind === "tags" ? 1 : null,
    createdAt: through,
  };
}
let root: Root, host: HTMLDivElement, download: ReturnType<typeof vi.spyOn>;
const render = async (kind = "list") =>
  act(() =>
    root.render(
      kind === "list"
        ? React.createElement(CustomerListWorkspace, { scope })
        : kind === "detail"
          ? React.createElement(CustomerDetailWorkspace, {
              scope,
              customerKey: key,
            })
          : React.createElement(CustomerAnnotations, {
              scope,
              customerKey: key,
            })
    )
  );
const button = (text: string) =>
  Array.from(host.querySelectorAll("button")).find(
    b => b.textContent === text
  )!;
const click = async (text: string) => act(() => button(text).click());
const input = async (selector: string, value: string) =>
  act(() => {
    const el = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      selector
    )!;
    Object.getOwnPropertyDescriptor(
      el.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      "value"
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  clearKnowledgeWorkspace();
  sessionStorage.clear();
  Object.assign(m, {
    data: fixtures(),
    error: null,
    fetching: false,
    paused: false,
    language: "en",
    inputs: {},
  });
  m.write.mockImplementation(async input => receipt(input));
  m.export.mockImplementation(async selection => ({
    merchantId: 20,
    selection,
    through,
    count: 1,
    limit: 5000,
    data: "a,b",
    filename: "customers.csv",
    mimeType: "text/csv",
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => "blob:customers");
      static revokeObjectURL = vi.fn();
    }
  );
  download = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("customer workspace screens", () => {
  it("escapes names and encodes identifiers exactly once in links", async () => {
    await render();
    expect(host.textContent).toContain(row.name);
    expect(host.querySelector("img")).toBeNull();
    expect(host.querySelector("a")?.getAttribute("href")).toBe(
      "/merchant/customers/customer%252F75"
    );
  });
  it.each([
    "error",
    "fetching",
    "paused",
    "wrong tenant",
    "wrong selection",
    "malformed",
  ])("hides stale records and blocks export for %s", async kind => {
    if (kind === "error") m.error = Error("offline");
    if (kind === "fetching") m.fetching = true;
    if (kind === "paused") m.paused = true;
    if (kind === "wrong tenant") m.data.list.merchantId = 21;
    if (kind === "wrong selection") m.data.list.selection.page = 2;
    if (kind === "malformed") delete m.data.list.totals;
    await render();
    expect(host.textContent).not.toContain(row.name);
    expect(button(en.customerWorkspaceUx.export).disabled).toBe(true);
    expect(host.querySelector("[data-state]")).not.toBeNull();
  });
  it("submits literal search and resets page for the activity filter", async () => {
    await render();
    await input("input[type=search]", " %_ ");
    await click(en.customerWorkspaceUx.searchAction);
    expect(m.inputs.list).toEqual({ search: "%_", activity: "all", page: 1 });
    await act(() => {
      const el = host.querySelector("select")!;
      el.value = "unknown";
      el.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(m.inputs.list).toEqual({
      search: "%_",
      activity: "unknown",
      page: 1,
    });
    await click(en.customerWorkspaceUx.clear);
    expect(m.inputs.list.search).toBe("");
  });
  it("exports all matching results and describes download start only", async () => {
    await render();
    await click(en.customerWorkspaceUx.export);
    expect(m.export.mock.calls[0][0]).toEqual({
      search: "",
      activity: "all",
      language: "en",
    });
    expect(download).toHaveBeenCalledOnce();
    expect(host.textContent).toContain("Download started for 1 records");
  });
  it.each(["selection", "logout", "unmount", "wrong tenant"])(
    "discards a late export after %s",
    async kind => {
      let resolve: any;
      m.export.mockImplementation(() => new Promise(r => (resolve = r)));
      await render();
      await click(en.customerWorkspaceUx.export);
      const selection = m.export.mock.calls[0][0];
      if (kind === "selection") {
        await input("input", "changed");
        await click(en.customerWorkspaceUx.searchAction);
      }
      if (kind === "logout") clearKnowledgeWorkspace();
      if (kind === "unmount") await act(() => root.render(null));
      await act(() =>
        resolve({
          merchantId: kind === "wrong tenant" ? 21 : 20,
          selection,
          through,
          count: 1,
          limit: 5000,
          data: "a",
          filename: "a.csv",
          mimeType: "text/csv",
        })
      );
      expect(download).not.toHaveBeenCalled();
    }
  );
  it("keeps currencies separate, shows loyalty ambiguity and uses real source links", async () => {
    await render("detail");
    expect(host.textContent).toContain("1.25");
    expect(host.textContent).toContain("2.50");
    expect(host.textContent).toContain("2 loyalty records");
    await click(en.customerWorkspaceUx.orders);
    expect(host.textContent).toContain("TEST-75");
    await click(en.customerWorkspaceUx.conversations);
    expect(host.querySelector('a[href*="?phone="]')?.getAttribute("href")).toBe(
      "/merchant/conversations?phone=raw%2Bphone%2F75"
    );
    await click(en.customerWorkspaceUx.annotations);
    expect(host.querySelector("textarea")).not.toBeNull();
  });
  it("shows missing and permission failures without fabricating empty customer data", async () => {
    m.data.detail.customer = null;
    await render("detail");
    expect(host.querySelector("[data-state=missing]")).not.toBeNull();
    m.error = { data: { code: "FORBIDDEN" } };
    await render("detail");
    expect(host.querySelector("[data-state=forbidden]")).not.toBeNull();
    expect(host.querySelector("textarea")).toBeNull();
  });
  it("renders Arabic RTL and blocks export for a viewer", async () => {
    m.language = "ar";
    m.data.list.canManage = false;
    await render();
    expect(host.querySelector("section")?.dir).toBe("rtl");
    expect(button(ar.customerWorkspaceUx.export).disabled).toBe(true);
  });
});
describe("customer annotation writes", () => {
  it("retains drafts across remount and saves a verified note receipt", async () => {
    await render("annotations");
    await input("textarea", "  Internal note  ");
    await act(() => root.render(null));
    await render("annotations");
    expect(host.querySelector("textarea")?.value).toBe("  Internal note  ");
    await click(en.customerWorkspaceUx.saveNote);
    expect(m.write).toHaveBeenCalledOnce();
    expect(m.write.mock.calls[0][0].content).toBe("Internal note");
    expect(host.querySelector("textarea")?.value).toBe("");
    expect(readCustomerCache(scope, key).attempt).toBeUndefined();
    expect(m.refresh).toHaveBeenCalled();
  });
  it("keeps an unknown result across remount, recovers the receipt without a new write", async () => {
    m.write.mockRejectedValue(Error("Lost acknowledgement"));
    await render("annotations");
    await input("textarea", "Recover me");
    await click(en.customerWorkspaceUx.saveNote);
    const attempt = readCustomerCache(scope, key).attempt!;
    expect(host.querySelector("textarea")?.disabled).toBe(true);
    await act(() => root.render(null));
    await render("annotations");
    m.receipt.mockResolvedValue(receipt(attempt));
    await click(en.customerWorkspaceUx.recover);
    expect(m.write).toHaveBeenCalledOnce();
    expect(m.receipt.mock.calls[0][0]).toEqual({
      requestId: attempt.requestId,
    });
    expect(readCustomerCache(scope, key).attempt).toBeUndefined();
  });
  it("retries an uncertain save with the identical request and content", async () => {
    m.write.mockRejectedValueOnce(Error("network"));
    await render("annotations");
    await input("textarea", "Retry");
    await click(en.customerWorkspaceUx.saveNote);
    await click(en.customerWorkspaceUx.retrySame);
    expect(m.write.mock.calls[1][0]).toEqual(m.write.mock.calls[0][0]);
    expect(readCustomerCache(scope, key).attempt).toBeUndefined();
  });
  it("rejects a receipt for another actor and keeps recovery available", async () => {
    m.write.mockImplementation(async input => ({
      ...receipt(input),
      actorId: 8,
    }));
    await render("annotations");
    await input("textarea", "Mine");
    await click(en.customerWorkspaceUx.saveNote);
    expect(readCustomerCache(scope, key).attempt).toBeDefined();
    expect(host.textContent).not.toContain("Saved. Request reference");
  });
  it("blocks overwrite when a saved tag revision changes", async () => {
    await render("annotations");
    await input("input", "VIP");
    await click(en.customerWorkspaceUx.addTag);
    expect(readCustomerCache(scope, key).draft.tags?.values).toEqual([
      "Existing",
      "VIP",
    ]);
    m.data.annotations = {
      ...m.data.annotations,
      revision: 1,
      tags: ["Changed elsewhere"],
    };
    await render("annotations");
    expect(button(en.customerWorkspaceUx.saveTags).disabled).toBe(true);
    expect(host.textContent).toContain("Changed elsewhere");
    await click(en.customerWorkspaceUx.useCurrent);
    expect(host.textContent).not.toContain("VIP");
    expect(m.write).not.toHaveBeenCalled();
  });
  it("persists tags only after explicit save with the loaded revision", async () => {
    await render("annotations");
    await input("input", "VIP");
    await click(en.customerWorkspaceUx.addTag);
    expect(m.write).not.toHaveBeenCalled();
    await click(en.customerWorkspaceUx.saveTags);
    expect(m.write.mock.calls[0][0]).toMatchObject({
      kind: "tags",
      tags: ["Existing", "VIP"],
      expectedRevision: 0,
    });
    expect(readCustomerCache(scope, key).draft.tags).toBeUndefined();
  });
  it("keeps a rejected write draft and requires explicit discard confirmation", async () => {
    m.write.mockRejectedValue({ data: { code: "FORBIDDEN" } });
    await render("annotations");
    await input("textarea", "Keep");
    await click(en.customerWorkspaceUx.saveNote);
    expect(readCustomerCache(scope, key)).toMatchObject({
      draft: { note: "Keep" },
      attempt: undefined,
    });
    await click(en.customerWorkspaceUx.discardDraft);
    expect(host.querySelector("textarea")?.value).toBe("Keep");
    await click(en.customerWorkspaceUx.confirmDiscard);
    expect(host.querySelector("textarea")?.value).toBe("");
  });
  it("does not send if browser storage fails", async () => {
    await render("annotations");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw Error("quota");
    });
    await input("textarea", "Keep in memory");
    expect(host.querySelector("textarea")?.value).toBe("Keep in memory");
    expect(button(en.customerWorkspaceUx.saveNote).disabled).toBe(true);
    expect(m.write).not.toHaveBeenCalled();
    expect(host.querySelector("[role=alert]")).not.toBeNull();
  });
  it.each(["viewer", "error", "wrong tenant", "wrong key"])(
    "blocks annotation editing for %s",
    async kind => {
      if (kind === "viewer") m.data.annotations.canManage = false;
      if (kind === "error") m.error = Error("offline");
      if (kind === "wrong tenant") m.data.annotations.merchantId = 21;
      if (kind === "wrong key") m.data.annotations.key = "different";
      await render("annotations");
      expect(host.querySelector("textarea")?.disabled).toBe(true);
      expect(button(en.customerWorkspaceUx.saveNote).disabled).toBe(true);
    }
  );
  it("does not resurrect a draft from a late save after sign-out", async () => {
    let resolve: any;
    m.write.mockImplementation(() => new Promise(r => (resolve = r)));
    await render("annotations");
    await input("textarea", "Late");
    await click(en.customerWorkspaceUx.saveNote);
    const request = m.write.mock.calls[0][0];
    clearKnowledgeWorkspace();
    await act(() => resolve(receipt(request)));
    expect(readCustomerCache(scope, key).draft.note).toBe("");
    expect(host.textContent).not.toContain("Saved. Request reference");
  });
});
