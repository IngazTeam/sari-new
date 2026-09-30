// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
const m = vi.hoisted(() => ({
  data: null as any,
  error: null as any,
  fetching: false,
  detail: null as any,
  detailError: null as any,
  detailFetching: false,
  selection: null as any,
  create: vi.fn(),
  change: vi.fn(),
  target: vi.fn(),
  receipt: vi.fn(),
  refetch: vi.fn(),
  detailRead: vi.fn(),
  invalidate: vi.fn(),
  toast: vi.fn(),
  language: "ar",
}));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      sariBrain: {
        quotations: {
          workspace: { invalidate: m.invalidate },
          detail: { invalidate: m.invalidate, fetch: m.detailRead },
          receipt: { fetch: m.receipt },
        },
      },
    }),
    sariBrain: {
      quotations: {
        workspace: {
          useQuery: (input: any) => {
            m.selection = input;
            return {
              data: m.data,
              error: m.error,
              isFetching: m.fetching,
              refetch: m.refetch,
            };
          },
        },
        detail: {
          useQuery: () => ({
            data: m.detail,
            error: m.detailError,
            isFetching: m.detailFetching,
            refetch: m.detailRead,
          }),
        },
        create: { useMutation: () => ({ mutateAsync: m.create }) },
        change: { useMutation: () => ({ mutateAsync: m.change }) },
        target: { useMutation: () => ({ mutateAsync: m.target }) },
      },
    },
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: m.language },
    t: (key: string) =>
      key
        .split(".")
        .reduce((v: any, k) => v?.[k], m.language === "en" ? en : ar) ?? key,
  }),
}));
vi.mock("sonner", () => ({ toast: { success: m.toast, error: m.toast } }));
vi.mock("../client/src/components/ui/dialog", () => {
  const part = ({ children }: any) =>
    React.createElement("section", null, children);
  return {
    Dialog: part,
    DialogContent: part,
    DialogHeader: part,
    DialogTitle: part,
    DialogDescription: part,
  };
});
vi.mock("../client/src/components/merchant/WorkspaceState", () => ({
  WorkspaceState: ({ kind }: any) =>
    React.createElement("p", null, `state:${kind}`),
  workspaceFailureKind: () => "error",
}));
vi.mock("../client/src/components/merchant/QuotationDeliveryDialog", () => ({
  QuotationDeliveryDialog: () =>
    React.createElement("div", null, "Delivery review"),
}));
import { QuotationWorkspace } from "../client/src/components/merchant/QuotationWorkspace";
import { quotationPlainText } from "../client/src/lib/quotation-display";
import {
  readQuotationEditorCache,
  saveQuotationEditorCache,
  blankQuotationForm,
} from "../client/src/lib/quotation-editor-cache";
import {
  clearKnowledgeWorkspace,
  knowledgeCacheEpoch,
} from "../client/src/lib/knowledge-workspace-cache";
const scope = "7:20:sales-hub",
  l = ar.quotationWorkspace;
const row = () => ({
  id: 1,
  merchantId: 20,
  number: "Q-local",
  customerName: "Customer fixture",
  customerPhone: "+12025550100",
  status: "draft",
  currency: "SAR",
  subtotalMinor: 3003,
  taxMinor: 450,
  totalMinor: 3453,
  createdAt: "2026-09-30T00:00:00.000Z",
  validUntil: "2026-10-07",
  validityElapsed: false,
  managed: false,
  provider: null,
  conversationId: 5,
  orderId: null,
  revision: 1,
  taxBasisPoints: 1500,
});
const detail = () => ({
  ...row(),
  items: [
    {
      name: "Full item",
      description: "All saved description",
      quantity: 3,
      unitPriceMinor: 1001,
      totalMinor: 3003,
    },
  ],
  rawItems: null,
  itemsTruncated: false,
});
const workspace = () => ({
  merchantId: 20,
  canManage: true,
  canSetTarget: true,
  selection: { search: "", status: "all", page: 1, pageSize: 20 },
  generatedAt: "2026-09-30T00:00:00.000Z",
  timeZone: "UTC",
  total: 21,
  statuses: [
    { status: "draft", count: 20 },
    { status: "accepted", count: 1 },
  ],
  acceptedShare: 100 / 21,
  values: [
    { currency: "SAR", count: 1, totalMinor: 3453, excludedAmounts: 0 },
    { currency: "USD", count: 1, totalMinor: 2000, excludedAmounts: 0 },
  ],
  currentMonth: {
    from: "2026-09-01T00:00:00.000Z",
    through: "2026-09-30T00:00:00.000Z",
    end: "2026-09-30",
  },
  target: {
    id: 3,
    revision: 2,
    amountMinor: 10000,
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
  },
  targetBasis: {
    created: 21,
    accepted: 1,
    acceptedSar: 1,
    acceptedSarMinor: 3453,
    excludedSarAmounts: 0,
    progress: 34.53,
  },
  list: { items: [row()], total: 21, totalPages: 2 },
  unmeasured: {
    delivered: null,
    settledRevenue: null,
    salesConversion: null,
    salesProficiency: null,
  },
});
let root: Root, container: HTMLDivElement;
const render = () =>
  act(async () =>
    root.render(React.createElement(QuotationWorkspace, { scope }))
  );
const buttons = (text: string) =>
  Array.from(container.querySelectorAll("button")).filter(
    b => b.textContent === text
  );
const button = (text: string) => buttons(text)[0]!;
const click = (text: string) => act(async () => button(text).click());
const input = (id: string, value: string) =>
  act(async () => {
    const el = container.querySelector<HTMLInputElement>(`[id="${id}"]`)!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
const receipt = (kind: string, requestId: string) => ({
  merchantId: 20,
  kind,
  requestId,
  recordId: 1,
  revision: 2,
  changed: true,
  committedAt: "2026-09-30T00:00:00.000Z",
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("React", React);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  clearKnowledgeWorkspace();
  sessionStorage.clear();
  m.data = workspace();
  m.detail = detail();
  m.error = null;
  m.detailError = null;
  m.fetching = false;
  m.detailFetching = false;
  m.language = "ar";
  m.invalidate.mockResolvedValue(undefined);
  m.refetch.mockImplementation(async () => ({ data: m.data }));
  m.detailRead.mockImplementation(async () => m.detail);
  m.create.mockImplementation(async (v: any) => receipt("create", v.requestId));
  m.change.mockImplementation(async (v: any) => receipt("status", v.requestId));
  m.target.mockImplementation(async (v: any) => receipt("target", v.requestId));
  m.receipt.mockResolvedValue(null);
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
describe("quotation workspace journeys", () => {
  it("does not send a save when retaining its request fails", async () => {
    const form=blankQuotationForm(); form.items[0].name="Stored draft";
    saveQuotationEditorCache(scope,{form},knowledgeCacheEpoch());
    await render(); await click(l.resumeDraft);
    vi.spyOn(Storage.prototype,"setItem").mockImplementation(()=>{throw Error("quota")});
    await click(l.saveDraft);
    expect(m.create).not.toHaveBeenCalled();
    expect(container.textContent).toContain(l.storageError);
  });
  it("ignores completion after logout and rejects a receipt from another merchant", async () => {
    const form=blankQuotationForm(); form.items[0].name="Stored draft";
    saveQuotationEditorCache(scope,{form},knowledgeCacheEpoch());
    m.create.mockImplementationOnce(async(v:any)=>({...receipt("create",v.requestId),merchantId:21}));
    await render(); await click(l.resumeDraft); await click(l.saveDraft);
    expect(readQuotationEditorCache(scope).attempt).toBeTruthy();
    expect(m.toast).not.toHaveBeenCalledWith(l.saved);
    let finish:(v:any)=>void=()=>{};
    m.create.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}));
    await click(l.retryAttempt); const sent=m.create.mock.calls[1][0];
    clearKnowledgeWorkspace();
    await act(async()=>finish(receipt("create",sent.requestId)));
    expect(readQuotationEditorCache(scope)).toEqual({});
    expect(m.toast).not.toHaveBeenCalledWith(l.saved);
  });
  it("shows exact values, currency separation, samples and truthful metric limits", async () => {
    await render();
    expect(container.textContent).toContain("٣٤٫٥٣");
    expect(container.textContent).toContain("USD");
    expect(container.textContent).toContain(l.measurementNote);
    expect(container.textContent).toContain(l.targetBasis);
    expect(button(l.previous).disabled).toBe(true);
    expect(button(l.next).disabled).toBe(false);
    await click(l.next);
    expect(m.selection.page).toBe(2);
    expect(container.textContent).not.toContain("Customer fixture");
  });
  it("hides data on failed read, loading, wrong tenant and mismatched selection", async () => {
    await render();
    for (const change of [
      () => {
        m.error = Error();
      },
      () => {
        m.error = null;
        m.fetching = true;
      },
      () => {
        m.fetching = false;
        m.data.merchantId = 21;
      },
      () => {
        m.data.merchantId = 20;
        m.data.selection.search = "different";
      },
    ]) {
      change();
      await render();
      expect(container.textContent).not.toContain("Customer fixture");
      expect(button(l.create).disabled).toBe(true);
    }
  });
  it("searches only on submit and resets page to one", async () => {
    await render();
    const el = container.querySelector<HTMLInputElement>(
      'input[type="search"]'
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(el, "literal %_");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(m.selection.search).toBe("");
    await act(async () =>
      container
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    );
    expect(m.selection).toMatchObject({ search: "literal %_", page: 1 });
  });
  it("loads complete detail and prevents copying partial legacy items", async () => {
    await render();
    await click(l.open);
    expect(container.textContent).toContain("All saved description");
    expect(
      container.querySelector(
        'a[href="/merchant/conversations?conversationId=5"]'
      )
    ).not.toBeNull();
    m.detail.rawItems = "legacy saved text";
    await render();
    expect(button(l.copy).disabled).toBe(true);
    expect(container.textContent).toContain("legacy saved text");
    m.detailError = Error();
    await render();
    expect(container.textContent).not.toContain("All saved description");
  });
  it("never adds unselected commercial terms to copied text", () => {
    const text = quotationPlainText(
      detail() as any,
      key => key.split(".").reduce((v: any, k) => v?.[k], en) ?? key,
      "en-GB"
    );
    expect(text).toContain("34.53 SAR");
    expect(text).toContain("All saved description");
    expect(text).toContain(en.quotationWorkspace.copyNote);
    expect(() =>
      quotationPlainText(
        { ...detail(), itemsTruncated: true } as any,
        k => k,
        "en-GB"
      )
    ).toThrow();
  });
  it("respects viewer and sales supervisor action permissions", async () => {
    m.data.canManage = false;
    m.data.canSetTarget = false;
    await render();
    expect(button(l.create).disabled).toBe(true);
    expect(button(l.editTarget).disabled).toBe(true);
    await click(l.open);
    expect(button(l.markAccepted).disabled).toBe(true);
    expect(button(ar.quotationSend.open).disabled).toBe(true);
    m.data.canManage = true;
    await render();
    expect(button(l.markAccepted).disabled).toBe(false);
    expect(button(l.editTarget).disabled).toBe(true);
  });
  it("keeps a draft on close and restores it after remount, validates per-field then saves canonical amounts", async () => {
    await render();
    await click(l.create);
    await click(l.saveDraft);
    expect(
      container.querySelector('[id="qt-items.0.name"][aria-invalid="true"]')
    ).not.toBeNull();
    expect(m.create).not.toHaveBeenCalled();
    await input("qt-items.0.name", "New fixture");
    await input("qt-items.0.quantity", "3");
    await input("qt-items.0.unitPrice", "10.01");
    await input("qt-customerPhone", "bad");
    await click(l.saveDraft);
    expect(
      container.querySelector('[id="qt-customerPhone"][aria-invalid="true"]')
    ).not.toBeNull();
    await input("qt-customerPhone", "");
    await click(l.closeKeep);
    expect(readQuotationEditorCache(scope).form?.items[0].name).toBe(
      "New fixture"
    );
    await act(async () => root.unmount());
    root = createRoot(container);
    await render();
    await click(l.resumeDraft);
    expect(
      container.querySelector<HTMLInputElement>('[id="qt-items.0.name"]')!.value
    ).toBe("New fixture");
    await click(l.saveDraft);
    expect(m.create).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          {
            name: "New fixture",
            description: "",
            quantity: 3,
            unitPrice: 10.01,
          },
        ],
        taxBasisPoints: 1500,
        currency: "SAR",
      })
    );
    expect(readQuotationEditorCache(scope)).toEqual({});
    expect(container.textContent).toContain(l.detail);
  });
  it("keeps an uncertain creation reference and recovers its receipt without creating again", async () => {
    const form = blankQuotationForm();
    form.items[0].name = "Prepared draft";
    saveQuotationEditorCache(scope, { form }, knowledgeCacheEpoch());
    m.create.mockRejectedValueOnce(Error("response lost"));
    await render();
    await click(l.resumeDraft);
    await click(l.saveDraft);
    const sent = m.create.mock.calls[0][0];
    expect(readQuotationEditorCache(scope).attempt?.input.requestId).toBe(
      sent.requestId
    );
    await click(l.closeKeep);
    await act(async () => root.unmount());
    root = createRoot(container);
    await render();
    expect(m.create).toHaveBeenCalledOnce();
    m.receipt.mockResolvedValue(receipt("create", sent.requestId));
    await click(l.checkReceipt);
    expect(m.receipt).toHaveBeenCalledWith({ requestId: sent.requestId });
    expect(m.create).toHaveBeenCalledOnce();
    expect(readQuotationEditorCache(scope)).toEqual({});
  });
  it("retries the same request after a lost response and never double-clicks into a second mutation", async () => {
    const form = blankQuotationForm();
    form.items[0].name = "Draft";
    saveQuotationEditorCache(scope, { form }, knowledgeCacheEpoch());
    let reject: (e: Error) => void = () => {};
    m.create.mockImplementationOnce(
      () =>
        new Promise((_, r) => {
          reject = r;
        })
    );
    await render();
    await click(l.resumeDraft);
    await act(async () => {
      button(l.saveDraft).click();
      button(l.saveDraft).click();
    });
    expect(m.create).toHaveBeenCalledOnce();
    await act(async () => reject(Error("lost")));
    const first = m.create.mock.calls[0][0];
    await click(l.retryAttempt);
    expect(m.create.mock.calls[1][0]).toEqual(first);
  });
  it("blocks writes when storage fails, and does not erase unreadable saved attempts", async () => {
    sessionStorage.setItem("sary:quotation-editor:v1:" + scope, "broken");
    await render();
    await click(l.create);
    expect(button(l.saveDraft).disabled).toBe(true);
    await click(l.retryStorage);
    expect(sessionStorage.getItem("sary:quotation-editor:v1:" + scope)).toBe(
      "broken"
    );
    expect(m.create).not.toHaveBeenCalled();
  });
  it("reviews status before changing it, then reloads conflicts without automatic resubmission", async () => {
    await render();
    await click(l.open);
    await click(l.markAccepted);
    expect(m.change).not.toHaveBeenCalled();
    expect(container.textContent).toContain(l.changeTo);
    m.change.mockRejectedValueOnce({ data: { code: "CONFLICT" } });
    await click(l.confirmSave);
    expect(m.change).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        expectedRevision: 1,
        expectedStatus: "draft",
        status: "accepted",
      })
    );
    expect(button(l.confirmSave).disabled).toBe(true);
    m.detail = { ...detail(), revision: 2, status: "sent" };
    await click(l.reviewLatest);
    expect(m.change).toHaveBeenCalledOnce();
    await click(l.confirmSave);
    expect(m.change.mock.calls[1][0]).toMatchObject({
      expectedRevision: 2,
      expectedStatus: "sent",
    });
    expect(m.change.mock.calls[1][0].requestId).not.toBe(
      m.change.mock.calls[0][0].requestId
    );
  });
  it("does not offer changes for managed quotations and prevents accepting expired quotations", async () => {
    m.detail.managed = true;
    await render();
    await click(l.open);
    expect(buttons(l.markAccepted)).toHaveLength(0);
    m.detail.managed = false;
    m.detail.validityElapsed = true;
    await render();
    expect(button(l.markAccepted).disabled).toBe(true);
    expect(button(l.markRejected).disabled).toBe(false);
  });
  it("accepts a zero target, preserves reviewed revision and reuses the attempt after uncertainty", async () => {
    m.target.mockRejectedValueOnce(Error("lost"));
    await render();
    await click(l.editTarget);
    await input("qt-target-amount", "0");
    await click(l.confirmSave);
    const first = m.target.mock.calls[0][0];
    expect(first).toMatchObject({
      period: "2026-09",
      expectedRevision: 2,
      amount: 0,
    });
    await click(l.retryAttempt);
    expect(m.target.mock.calls[1][0]).toEqual(first);
  });
  it("requires explicit draft discard and does not delete saved quotations", async () => {
    await render();
    await click(l.create);
    await input("qt-items.0.name", "Keep");
    await click(l.discard);
    expect(container.textContent).toContain(l.discardConfirm);
    await click(l.keepDraft);
    expect(readQuotationEditorCache(scope).form?.items[0].name).toBe("Keep");
    await click(l.discard);
    await click(l.confirmDiscard);
    expect(readQuotationEditorCache(scope)).toEqual({});
    expect(m.create).not.toHaveBeenCalled();
    expect(m.change).not.toHaveBeenCalled();
  });
  it("renders English labels without missing translation keys", async () => {
    m.language = "en";
    await render();
    await click(en.quotationWorkspace.create);
    expect(container.textContent).toContain(en.quotationWorkspace.draftNote);
    expect(container.textContent).not.toContain("quotationWorkspace.");
  });
});
