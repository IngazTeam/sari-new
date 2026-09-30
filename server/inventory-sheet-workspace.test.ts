// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
const m = vi.hoisted(() => ({
  data: {} as any,
  errors: {} as any,
  fetching: {} as any,
  paused: {} as any,
  updated: 1,
  language: "en",
  inputs: {} as any,
  prepare: vi.fn(),
  commit: vi.fn(),
  receipt: vi.fn(),
  discard: vi.fn(),
  read: vi.fn(),
  refresh: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("../client/src/lib/trpc", () => {
  const query = (name: string) => ({
    useQuery: (input: unknown, opts?: { enabled?: boolean }) => {
      m.inputs[name] = input;
      return {
        data: opts?.enabled === false ? undefined : m.data[name],
        error: m.errors[name] ?? null,
        isFetching: !!m.fetching[name],
        isLoading: false,
        fetchStatus: m.paused[name] ? "paused" : "idle",
        dataUpdatedAt: m.updated,
        refetch: m.refresh,
      };
    },
  });
  return {
    trpc: {
      useUtils: () => ({
        products: {
          list: { invalidate: m.invalidate },
          sheetInventory: {
            read: { fetch: m.read, invalidate: m.invalidate },
            receipt: { fetch: m.receipt },
          },
        },
      }),
      products: {
        sheetInventory: {
          connection: query("connection"),
          list: query("list"),
          read: query("read"),
          prepare: { useMutation: () => ({ mutateAsync: m.prepare }) },
          commit: { useMutation: () => ({ mutateAsync: m.commit }) },
          discard: { useMutation: () => ({ mutateAsync: m.discard }) },
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
  WorkspaceState: ({ kind, onRetry, title, description }: any) =>
    React.createElement(
      "div",
      { "data-state": kind },
      title,
      description,
      onRetry && React.createElement("button", { onClick: onRetry }, "Retry")
    ),
  workspaceFailureKind: (e: any) =>
    e?.data?.code === "FORBIDDEN"
      ? "forbidden"
      : e?.data?.code === "UNAUTHORIZED"
        ? "session"
        : e?.data?.code === "NOT_FOUND"
          ? "missing"
          : "error",
}));
import { InventorySheetWorkspace } from "../client/src/components/merchant/InventorySheetWorkspace";
import {
  checkedSheetConnection,
  checkedSheetList,
  checkedSheetReview,
  checkedSheetReceipt,
  readSheetAttempt,
  saveSheetAttempt,
  type SheetAttempt,
} from "../client/src/lib/inventory-sheet-workspace";
import {
  clearKnowledgeWorkspace,
  knowledgeCacheEpoch,
} from "../client/src/lib/knowledge-workspace-cache";
import {
  inventorySheetPrepareInput,
  inventorySheetReadInput,
  inventorySheetReview,
} from "../shared/product-sheet-inventory-review";
import { readProductSheetGrid } from "./product-sheet-preview";
import {
  previewSheetInventory,
  planSheetInventory,
} from "./product-sheet-inventory";
const scope = "7:20:sheet-inventory",
  reviewId = "11111111-1111-4111-8111-111111111100",
  requestId = "11111111-1111-4111-8111-111111111101",
  digest = "a".repeat(64),
  sourceDigest = "b".repeat(64);
const sheet = {
    id: 0,
    title: "Products",
    hidden: false,
    rows: 1000,
    columns: 26,
  },
  source = {
    integrationId: 5,
    spreadsheetId: "local-ui-100",
    digest: sourceDigest,
  };
const input = () =>
  inventorySheetPrepareInput.parse({
    reviewId,
    selection: {
      expectedSourceDigest: sourceDigest,
      sheet,
      options: {},
    },
  });
const cache = (): SheetAttempt => ({
  input: input(),
  digest,
  attempt: null,
  receipt: null,
});
const write = () => ({
  reviewId,
  requestId,
  expectedDigest: digest,
  reviewed: true as const,
});
function fixture(prepare = input(), invalid = false) {
  const snap = previewSheetInventory(
    readProductSheetGrid(
      {
        spreadsheetId: source.spreadsheetId,
        sheets: [
          {
            properties: {
              sheetId: 0,
              title: "Products",
              hidden: false,
              sheetType: "GRID",
              gridProperties: { rowCount: 1000, columnCount: 26 },
            },
            data: [
              {
                rowData: [
                  ["id", "stock", "name"],
                  ["100", invalid ? "" : "20", "Unused sheet name"],
                ].map(row => ({
                  values: row.map(x => ({
                    userEnteredValue: { stringValue: x },
                  })),
                })),
              },
            ],
          },
        ],
      },
      {
        spreadsheetId: source.spreadsheetId,
        sheet,
        readAt: "2026-09-30T12:00:00.000Z",
      }
    ),
    prepare.selection.options
  );
  const plan = planSheetInventory(snap, [
      {
        id: 100,
        name: "Tea",
        stock: 7,
        stockValid: true,
        locked: false,
        digest: "c".repeat(64),
      },
    ]),
    { rows, ...meta } = snap;
  return inventorySheetReview.parse({
    merchantId: 20,
    actorId: 7,
    reviewId: prepare.reviewId,
    digest,
    selection: inventorySheetReadInput.parse({ reviewId: prepare.reviewId }),
    source,
    options: prepare.selection,
    createdAt: "2026-09-30T12:00:00.000Z",
    expiresAt: "2026-10-01T12:00:00.000Z",
    expired: false,
    canManage: true,
    integrationSource: "none",
    sourceCurrent: true,
    canCommit: !invalid,
    receipt: null,
    preview: meta,
    counts: plan.counts,
    rows: rows.map((r, i) => ({ source: r, change: plan.rows[i] })),
    filteredTotal: 1,
    totalPages: 1,
  });
}
const receipt = () => ({
  merchantId: 20,
  actorId: 7,
  reviewId,
  requestId,
  kind: "sheet_inventory" as const,
  digest,
  sourceDigest,
  snapshotDigest: fixture().preview.digest,
  createdAt: "2026-09-30T12:10:00.000Z",
  rows: [
    {
      number: 2,
      action: "update" as const,
      productId: 100,
      before: 7,
      after: 20,
    },
  ],
  counts: { update: 1, unchanged: 0 },
});
let host: HTMLDivElement, root: Root;
const render = async () => {
  await act(async () => {
    root.render(React.createElement(InventorySheetWorkspace, { scope }));
  });
};
const button = (text: string) => {
  const b = Array.from(host.querySelectorAll("button")).find(
    b => b.textContent === text
  );
  if (!b) throw Error("Missing button: " + text + "\n" + host.textContent);
  return b;
};
const click = async (text: string) => {
  await act(async () => button(text).click());
};
const select = async (label: string, value: string) => {
  const node = Array.from(host.querySelectorAll("label"))
    .find(l => l.textContent?.startsWith(label))
    ?.querySelector("select");
  if (!node) throw Error("Missing select " + label);
  await act(async () => {
    node.value = value;
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
};
const approve = async () => {
  const box = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  await act(async () => box.click());
};
beforeEach(() => {
  vi.resetAllMocks();
  (globalThis as any).React = React;
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear();
  m.data = {
    connection: {
      merchantId: 20,
      actorId: 7,
      source,
      integrationSource: "none",
      reason: null,
    },
    list: { merchantId: 20, actorId: 7, source, sheets: [sheet] },
    read: fixture(),
  };
  m.errors = {};
  m.fetching = {};
  m.paused = {};
  m.updated = 1;
  m.language = "en";
  m.invalidate.mockResolvedValue(undefined);
  m.refresh.mockResolvedValue(undefined);
  m.discard.mockResolvedValue({ discarded: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});
describe("Sheets workspace recovery and identity", () => {
  it("keeps references isolated, verifies storage and clears them on logout", () => {
    saveSheetAttempt(scope, cache(), knowledgeCacheEpoch());
    expect(readSheetAttempt(scope)).toEqual(cache());
    expect(readSheetAttempt("8:20:sheet-inventory")).toBeNull();
    const epoch = knowledgeCacheEpoch();
    clearKnowledgeWorkspace();
    expect(readSheetAttempt(scope)).toBeNull();
    expect(() => saveSheetAttempt(scope, cache(), epoch)).toThrow(
      "Session changed"
    );
  });
  it("rejects wrong-scope connections, lists, reviews and receipts", () => {
    expect(() =>
      checkedSheetConnection({ ...m.data.connection, merchantId: 30 }, scope)
    ).toThrow();
    expect(() => checkedSheetList(m.data.list, scope, digest)).toThrow();
    expect(() =>
      checkedSheetReview(
        { ...fixture(), actorId: 8 },
        scope,
        inventorySheetReadInput.parse({ reviewId }),
        cache()
      )
    ).toThrow();
    expect(() =>
      checkedSheetReceipt({ ...receipt(), requestId: reviewId }, scope, {
        ...cache(),
        attempt: write(),
      })
    ).toThrow();
    expect(() =>
      saveSheetAttempt(
        scope,
        {
          ...cache(),
          attempt: write(),
          receipt: { ...receipt(), merchantId: 30 },
        },
        knowledgeCacheEpoch()
      )
    ).toThrow();
  });
  it("rejects another selection, mapping or stored digest even within the same tenant", () => {
    const r = fixture(),
      sel = inventorySheetReadInput.parse({ reviewId });
    expect(() =>
      checkedSheetReview(r, scope, { ...sel, page: 2 }, cache())
    ).toThrow();
    expect(() =>
      checkedSheetReview(r, scope, sel, { ...cache(), digest: sourceDigest })
    ).toThrow();
    expect(() =>
      checkedSheetReview(r, scope, sel, {
        ...cache(),
        input: {
          ...input(),
          selection: {
            ...input().selection,
            options: { mapping: { productId: 0, stock: 1 } },
          },
        },
      })
    ).toThrow();
  });
});
describe("Sheets workspace interactions", () => {
  it("blocks equal or empty mapping without discarding the saved review", async () => {
    saveSheetAttempt(scope, cache(), knowledgeCacheEpoch());
    await render();
    await select("Stock column", "0");
    expect(button("Read again and review").disabled).toBe(true);
    expect(host.textContent).toContain("Select two different");
    await click("Read again and review");
    expect(m.discard).not.toHaveBeenCalled();
    await select("Stock column", "");
    expect(button("Read again and review").disabled).toBe(true);
    await select("Stock column", "1");
    expect(button("Read again and review").disabled).toBe(false);
  });
  it("shows unknown current stock and an explicit zero after approval", async () => {
    saveSheetAttempt(scope, cache(), knowledgeCacheEpoch());
    m.data.read.rows[0].source.stock = 0;
    m.data.read.rows[0].change.before = null;
    m.data.read.rows[0].change.after = 0;
    await render();
    expect(host.querySelector(".ps-changes")?.textContent).toContain("Unknown");
    expect(host.querySelector(".ps-changes")?.textContent).toContain(
      "After approval0"
    );
  });
  it.each(["expired", "sourceChanged", "platform"])(
    "blocks approval for %s and retains a path to a new review",
    async state => {
      saveSheetAttempt(scope, cache(), knowledgeCacheEpoch());
      m.data.read.canCommit = false;
      if (state === "expired") m.data.read.expired = true;
      if (state === "sourceChanged") m.data.read.sourceCurrent = false;
      if (state === "platform") m.data.read.integrationSource = "salla";
      await render();
      expect(button("Apply 1 stock changes").disabled).toBe(true);
      expect(button("Start a new review").disabled).toBe(false);
    }
  );
  it("paginates saved receipt rows and includes both old and new quantities", async () => {
    const r = receipt();
    r.rows = Array.from({ length: 25 }, (_, i) => ({
      number: i + 2,
      action: "update" as const,
      productId: i + 100,
      before: 7,
      after: 20,
    }));
    r.counts.update = 25;
    saveSheetAttempt(
      scope,
      { ...cache(), attempt: write(), receipt: r },
      knowledgeCacheEpoch()
    );
    await render();
    expect(host.querySelectorAll("details li")).toHaveLength(20);
    expect(host.textContent).toContain("Current: 7");
    await click("Next");
    expect(host.querySelectorAll("details li")).toHaveLength(5);
    expect(host.textContent).toContain("Row 22");
  });
  it("retries an uncertain commit using the original request ID", async () => {
    saveSheetAttempt(
      scope,
      { ...cache(), attempt: write() },
      knowledgeCacheEpoch()
    );
    m.commit.mockResolvedValue(receipt());
    await render();
    const retry = Array.from(host.querySelectorAll("button")).find(b =>
      /Retry.*same/i.test(b.textContent ?? "")
    );
    expect(retry).toBeTruthy();
    await act(async () => retry!.click());
    expect(m.commit).toHaveBeenCalledWith(write());
    expect(readSheetAttempt(scope)?.receipt?.requestId).toBe(requestId);
  });
  it("loads sheets explicitly and persists preparation identity before calling the provider API", async () => {
    m.prepare.mockImplementation(async prepared => {
      expect(readSheetAttempt(scope)?.input).toEqual(prepared);
      const r = fixture(prepared);
      m.data.read = r;
      return r;
    });
    await render();
    expect(host.textContent).not.toContain("Choose a sheet…");
    await click("Load spreadsheet tabs");
    await select("Product sheet", "0");
    await click("Read sheet for review");
    expect(m.prepare).toHaveBeenCalledTimes(1);
    expect(readSheetAttempt(scope)?.digest).toBe(digest);
    expect(host.textContent).toContain("2. Review the changes");
    expect(host.textContent).toContain("20");
    expect(m.commit).not.toHaveBeenCalled();
  });
  it("shows connection failure instead of claiming disconnection", async () => {
    m.errors.connection = { data: { code: "INTERNAL_SERVER_ERROR" } };
    await render();
    expect(host.querySelector('[data-state="error"]')).toBeTruthy();
    expect(host.textContent).not.toContain("Set up Google Sheets");
    expect(host.textContent).not.toContain("Load spreadsheet tabs");
  });
  it.each(["fetching", "paused", "foreign", "failed"])(
    "withholds stale review on %s",
    async state => {
      saveSheetAttempt(scope, cache(), knowledgeCacheEpoch());
      if (state === "fetching") m.fetching.read = true;
      if (state === "paused") m.paused.read = true;
      if (state === "foreign") m.data.read.actorId = 8;
      if (state === "failed") m.errors.read = { data: { code: "FORBIDDEN" } };
      await render();
      expect(host.textContent).not.toContain("2. Review the changes");
      expect(host.querySelector('input[type="checkbox"]')).toBeNull();
    }
  );
  it("restores a review after a lost prepare reply without resending", async () => {
    saveSheetAttempt(
      scope,
      { ...cache(), digest: null },
      knowledgeCacheEpoch()
    );
    await render();
    expect(readSheetAttempt(scope)?.digest).toBe(digest);
    expect(m.prepare).not.toHaveBeenCalled();
    expect(button("Apply 1 stock changes").disabled).toBe(true);
    await approve();
    expect(button("Apply 1 stock changes").disabled).toBe(false);
  });
  it("requires explicit consent and stores one UUID before applying", async () => {
    saveSheetAttempt(scope, cache(), knowledgeCacheEpoch());
    m.commit.mockImplementation(async request => {
      expect(readSheetAttempt(scope)?.attempt).toEqual(request);
      return { ...receipt(), requestId: request.requestId };
    });
    await render();
    expect(button("Apply 1 stock changes").disabled).toBe(true);
    await approve();
    await click("Apply 1 stock changes");
    expect(m.commit).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("Review applied");
    expect(readSheetAttempt(scope)?.receipt?.counts.update).toBe(1);
  });
  it("blocks approval for invalid rows and renders the reason beside original values", async () => {
    saveSheetAttempt(scope, cache(), knowledgeCacheEpoch());
    m.data.read = fixture(input(), true);
    await render();
    expect(host.textContent).toContain("Stock is empty");
    expect(host.textContent).toContain("Original sheet values");
    expect(
      host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.disabled
    ).toBe(true);
  });
  it("dirty mapping revokes consent and requires another preview", async () => {
    saveSheetAttempt(scope, cache(), knowledgeCacheEpoch());
    await render();
    await approve();
    await select("Stock column", "2");
    expect(button("Apply 1 stock changes").disabled).toBe(true);
    expect(host.textContent).toContain("Options changed");
    expect(m.commit).not.toHaveBeenCalled();
  });
  it("retains an uncertain commit and verifies the receipt before starting again", async () => {
    saveSheetAttempt(scope, cache(), knowledgeCacheEpoch());
    m.commit.mockRejectedValue(Error("Lost reply"));
    await render();
    await approve();
    await click("Apply 1 stock changes");
    const saved = readSheetAttempt(scope)!;
    expect(saved.attempt).not.toBeNull();
    expect(host.textContent).toContain("confirmation did not arrive");
    expect(host.textContent).not.toContain("Start a new review");
    m.receipt.mockResolvedValue({
      ...receipt(),
      requestId: saved.attempt!.requestId,
    });
    const recoverButton = Array.from(host.querySelectorAll("button")).find(b =>
      /Check.*result|Check.*receipt|Check saved result/i.test(
        b.textContent ?? ""
      )
    );
    expect(recoverButton).toBeTruthy();
    await act(async () => recoverButton!.click());
    expect(host.textContent).toContain("Review applied");
    expect(m.commit).toHaveBeenCalledTimes(1);
  });
  it("rejects an unrelated receipt without clearing the pending request", async () => {
    saveSheetAttempt(
      scope,
      { ...cache(), attempt: write() },
      knowledgeCacheEpoch()
    );
    m.receipt.mockResolvedValue({ ...receipt(), merchantId: 30 });
    await render();
    const b = Array.from(host.querySelectorAll("button")).find(b =>
      /Check.*result|Check.*receipt|Check saved result/i.test(
        b.textContent ?? ""
      )
    )!;
    await act(async () => b.click());
    expect(readSheetAttempt(scope)?.attempt).toEqual(write());
    expect(readSheetAttempt(scope)?.receipt).toBeNull();
    expect(host.textContent).not.toContain("Review applied");
  });
  it("does not write when session storage cannot preserve recovery", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw Error("Storage denied");
    });
    await render();
    await click("Load spreadsheet tabs");
    await select("Product sheet", "0");
    await click("Read sheet for review");
    expect(m.prepare).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Recovery reference unavailable");
  });
  it("resets consent after refetch and never exposes a review after permission loss", async () => {
    saveSheetAttempt(scope, cache(), knowledgeCacheEpoch());
    await render();
    await approve();
    m.updated++;
    await render();
    expect(button("Apply 1 stock changes").disabled).toBe(true);
    m.errors.connection = { data: { code: "FORBIDDEN" } };
    await render();
    expect(host.textContent).not.toContain("2. Review the changes");
  });
  it("requires confirmation for discarding a review and preserves it on failure", async () => {
    saveSheetAttempt(scope, cache(), knowledgeCacheEpoch());
    await render();
    await click("Start a new review");
    expect(m.discard).not.toHaveBeenCalled();
    m.discard.mockRejectedValue(Error("Unknown"));
    await click("Finish and start a new review");
    expect(readSheetAttempt(scope)?.input.reviewId).toBe(reviewId);
  });
  it("hides cached receipt during auth failure and keeps the reference", async () => {
    saveSheetAttempt(
      scope,
      { ...cache(), attempt: write(), receipt: receipt() },
      knowledgeCacheEpoch()
    );
    m.errors.connection = { data: { code: "UNAUTHORIZED" } };
    await render();
    expect(host.textContent).not.toContain("Review applied");
    expect(readSheetAttempt(scope)?.receipt).toBeTruthy();
  });
  it("uses Arabic labels and RTL without raw translation keys", async () => {
    saveSheetAttempt(scope, cache(), knowledgeCacheEpoch());
    m.language = "ar";
    await render();
    expect(host.querySelector('[dir="rtl"]')).toBeTruthy();
    expect(host.textContent).toContain("راجع التغييرات");
    expect(host.textContent).not.toMatch(
      /productSheetUx\.|productWorkspaceUx\.|productImportUx\.|inventorySheetUx\./
    );
  });
});
