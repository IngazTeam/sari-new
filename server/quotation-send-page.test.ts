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
  prepare: vi.fn(),
  send: vi.fn(),
  refetch: vi.fn(),
  reviewRead: vi.fn(),
  deliveryRead: vi.fn(),
  saved: vi.fn(),
  language: "ar",
}));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      sariBrain: {
        quotations: {
          review: { fetch: m.reviewRead },
          delivery: { fetch: m.deliveryRead },
        },
      },
    }),
    sariBrain: {
      quotations: {
        sendWorkspace: {
          useQuery: () => ({
            data: m.data,
            error: m.error,
            isFetching: m.fetching,
            refetch: m.refetch,
          }),
        },
        prepareReview: { useMutation: () => ({ mutateAsync: m.prepare }) },
        sendReviewed: { useMutation: () => ({ mutateAsync: m.send }) },
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
        .reduce((v: any, k) => v?.[k], m.language === "ar" ? ar : en) ?? key,
  }),
}));
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
  workspaceFailureKind: () => "unavailable",
}));
import { QuotationDeliveryDialog } from "../client/src/components/merchant/QuotationDeliveryDialog";
import { clearKnowledgeWorkspace } from "../client/src/lib/knowledge-workspace-cache";
const review = () => ({
  id: 3,
  requestId: "11111111-1111-4111-8111-111111111111",
  merchantId: 20,
  actorId: 7,
  quotationId: 1,
  revision: 1,
  snapshotHash: "a".repeat(64),
  status: "draft",
  instanceRecordId: 2,
  provider: "mock",
  accountLabel: "Local account",
  templateId: null,
  document: {
    data: {
      quotationNumber: "Q-local",
      merchantName: "Merchant fixture",
      merchantPhone: "+12025550101",
      customerName: "Local customer",
      customerPhone: "+12025550100",
      items: [
        {
          name: "Reviewed item",
          description: "Full description",
          quantity: 3,
          unitPrice: 10.01,
          total: 30.03,
        },
      ],
      subtotal: 30.03,
      taxAmount: 4.5,
      taxRate: 0.15,
      total: 34.53,
      currency: "SAR",
      createdAt: "2026-09-30",
      validUntil: "2026-10-07",
      termsText: "Exact full terms",
      footerText: "Exact footer",
    },
    logoDataUrl: null,
    logoOmitted: true,
  },
  caption: "Reviewed caption",
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 900000).toISOString(),
  expired: false,
  sent: false,
});
const receipt = () => ({
  id: 4,
  requestId: "22222222-2222-4222-8222-222222222222",
  merchantId: 20,
  quotationId: 1,
  reviewId: 3,
  snapshotHash: "a".repeat(64),
  state: "dispatching",
  transport: "unknown",
  projection: "pending",
  providerMessageId: null,
  preparationFailed: false,
  expired: false,
  recipient: "+12025550100",
  caption: "Reviewed caption",
});
let root: Root, container: HTMLDivElement;
const l = ar.quotationSend;
const render = () =>
  act(async () =>
    root.render(
      React.createElement(QuotationDeliveryDialog, {
        quotationId: 1,
        scope: "7:20:sales-hub",
        onClose: () => {},
        onSaved: m.saved,
      })
    )
  );
const button = (text: string) =>
  [...container.querySelectorAll("button")].find(b => b.textContent === text)!;
const click = (text: string) => act(async () => button(text).click());
const confirm = () =>
  act(async () =>
    container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
  );
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("React", React);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  clearKnowledgeWorkspace();
  sessionStorage.clear();
  m.language = "ar";
  m.error = null;
  m.fetching = false;
  m.data = {
    merchantId: 20,
    actorId: 7,
    quotationId: 1,
    number: "Q-local",
    revision: 1,
    reason: null,
    accounts: [
      { id: 2, provider: "mock", label: "Local account", primary: true },
    ],
    templates: [],
    accountsTruncated: false,
    templatesTruncated: false,
    review: null,
    delivery: null,
    deliveryOwned: false,
  };
  m.prepare.mockImplementation(async (input: any) => ({
    ...review(),
    requestId: input.requestId,
  }));
  m.send.mockResolvedValue(receipt());
  m.refetch.mockImplementation(async () => ({ data: m.data }));
  m.reviewRead.mockResolvedValue(null);
  m.deliveryRead.mockResolvedValue(null);
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
describe("merchant quotation review interactions", () => {
  it("requires preparation and fresh explicit consent before sending a complete reviewed document", async () => {
    await render();
    expect(button(l.send).disabled).toBe(true);
    await click(l.prepare);
    expect(m.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        quotationId: 1,
        expectedRevision: 1,
        instanceRecordId: 2,
        templateId: null,
      })
    );
    for (const text of [
      "Reviewed item",
      "Full description",
      "Exact full terms",
      "Exact footer",
      "Reviewed caption",
      "+12025550100",
      "Local account",
      "Q-local",
    ])
      expect(container.textContent).toContain(text);
    expect(button(l.send).disabled).toBe(true);
    expect(m.send).not.toHaveBeenCalled();
    await confirm();
    await click(l.send);
    expect(m.send).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewId: 3,
        snapshotHash: "a".repeat(64),
        confirmed: true,
      })
    );
    expect(container.textContent).toContain(l.unknown);
    expect(button(l.send).disabled).toBe(true);
  });
  it("retains the same preparation request after a lost response", async () => {
    m.prepare.mockRejectedValueOnce(Error("response lost"));
    await render();
    await click(l.prepare);
    expect(container.textContent).toContain(l.operationFailed);
    const first = m.prepare.mock.calls[0][0];
    await click(l.prepare);
    expect(m.prepare.mock.calls[1][0]).toEqual(first);
    expect(m.send).not.toHaveBeenCalled();
  });
  it("recovers an uncertain send from its saved reference without sending again", async () => {
    m.send.mockRejectedValueOnce(Error("response lost"));
    await render();
    await click(l.prepare);
    await confirm();
    await click(l.send);
    const sent = m.send.mock.calls[0][0];
    m.reviewRead.mockResolvedValue(review());
    m.deliveryRead.mockResolvedValue({
      ...receipt(),
      requestId: sent.requestId,
    });
    await click(l.restore);
    expect(m.deliveryRead).toHaveBeenCalledWith({ requestId: sent.requestId });
    expect(m.send).toHaveBeenCalledOnce();
    expect(button(l.send).disabled).toBe(true);
    expect(container.textContent).toContain(l.unknown);
  });
  it("does not recreate consent when restoring a review or opening the page again", async () => {
    m.data.review = review();
    await render();
    expect(
      container.querySelector<HTMLInputElement>('input[type="checkbox"]')
        ?.checked
    ).toBe(false);
    expect(button(l.send).disabled).toBe(true);
    expect(m.send).not.toHaveBeenCalled();
  });
  it("hides material on a read failure or a mismatched tenant", async () => {
    m.data.review = review();
    m.error = Error("read failed");
    await render();
    expect(container.textContent).not.toContain("Local customer");
    expect(button(l.send).disabled).toBe(true);
    m.error = null;
    m.data.merchantId = 99;
    await render();
    expect(container.textContent).not.toContain("Local customer");
    expect(m.send).not.toHaveBeenCalled();
  });
  it("blocks expired reviews and creates a new request only after explicit new-review action", async () => {
    m.data.review = {
      ...review(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      expired: true,
    };
    await render();
    expect(container.textContent).toContain(l.reviewExpired);
    expect(
      container.querySelector<HTMLInputElement>('input[type="checkbox"]')
        ?.disabled
    ).toBe(true);
    await click(l.newReview);
    await click(l.prepare);
    expect(m.prepare).toHaveBeenCalledOnce();
    expect(m.send).not.toHaveBeenCalled();
  });
  it("shows a previous legacy attempt without offering an unreviewed send", async () => {
    m.data.reason = "legacy";
    await render();
    expect(container.textContent).toContain(l.legacy);
    expect(button(l.prepare).disabled).toBe(true);
    expect(button(l.send).disabled).toBe(true);
  });
  it("blocks sending when session storage cannot retain the attempt reference", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw Error("blocked");
    });
    await render();
    await click(l.prepare);
    expect(m.prepare).not.toHaveBeenCalled();
    expect(container.textContent).toContain(l.storageError);
    expect(button(l.send).disabled).toBe(true);
  });
  it("keeps every item and its description visible and uses English copy", async () => {
    m.language = "en";
    const r = review();
    r.document.data.items = Array.from({ length: 50 }, (_, i) => ({
      ...r.document.data.items[0],
      name: `Line ${i + 1}`,
    }));
    m.data.review = r;
    await render();
    expect(container.querySelectorAll(".qsend-items li")).toHaveLength(50);
    expect(container.textContent).toContain("Line 50");
    expect(container.textContent).toContain(en.quotationSend.confirm);
    expect(button(en.quotationSend.send).disabled).toBe(true);
  });
});
