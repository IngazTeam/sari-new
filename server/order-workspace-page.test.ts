// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
const m = vi.hoisted(() => ({
  data: null as any,
  detail: null as any,
  error: null as any,
  detailError: null as any,
  fetching: false,
  detailFetching: false,
  selection: null as any,
  detailId: 0,
  write: vi.fn(),
  review: vi.fn(),
  receipt: vi.fn(),
  refresh: vi.fn(),
  invalidate: vi.fn(),
  language: "ar",
}));
vi.mock("../client/src/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      orders: {
        workspace: {
          list: { invalidate: m.invalidate },
          detail: { invalidate: m.invalidate },
          statusHistory: { invalidate: m.invalidate },
          statusReview: { fetch: m.review },
          statusReceipt: { fetch: m.receipt },
        },
      },
    }),
    orders: {
      workspace: {
        list: {
          useQuery: (input: any) => {
            m.selection = input;
            return {
              data: m.data,
              error: m.error,
              isFetching: m.fetching,
              refetch: m.refresh,
            };
          },
        },
        detail: {
          useQuery: (input: any) => {
            m.detailId = input.id;
            return {
              data: m.detail,
              error: m.detailError,
              isFetching: m.detailFetching,
              refetch: m.refresh,
            };
          },
        },
        statusWrite: { useMutation: () => ({ mutateAsync: m.write }) },
        statusHistory: {
          useQuery: (input: any) => ({
            data: {
              merchantId: 20,
              orderId: input.id,
              beforeId: input.beforeId ?? null,
              items: [],
              next: null,
            },
            isFetching: false,
            isLoading: false,
            error: null,
            refetch: m.refresh,
          }),
        },
      },
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
          .reduce((v: any, k) => v?.[k], m.language === "en" ? en : ar) ?? key
      ).replace(/\{\{(\w+)\}\}/g, (_, k) => String(values[k] ?? "")),
  }),
}));
vi.mock("../client/src/components/merchant/WorkspaceState", () => ({
  WorkspaceState: ({ kind }: any) =>
    React.createElement("p", null, `state:${kind}`),
  workspaceFailureKind: () => "error",
}));
vi.mock("../client/src/components/CheckoutInvoiceReview", () => ({
  CheckoutInvoiceReview: () => React.createElement("p", null, "INVOICE"),
}));
vi.mock("../client/src/components/CheckoutMarginExceptionAudit", () => ({
  CheckoutMarginExceptionAudit: () => React.createElement("p", null, "MARGIN"),
}));
vi.mock("../client/src/components/CheckoutDiscountBreakdown", () => ({
  CheckoutDiscountBreakdown: () => React.createElement("p", null, "DISCOUNT"),
}));
vi.mock("../client/src/components/CheckoutDiscountRelease", () => ({
  CheckoutDiscountRelease: ({ onUpdated }: any) =>
    React.createElement("button", { onClick: onUpdated }, "RELEASE"),
}));
vi.mock("../client/src/components/OrderCheckoutAttempts", () => ({
  OrderCheckoutAttempts: ({ onUpdated }: any) =>
    React.createElement("button", { onClick: onUpdated }, "ATTEMPTS"),
}));
vi.mock("../client/src/components/ZidCheckoutReconciliation", () => ({
  ZidCheckoutReconciliation: () => React.createElement("p", null, "ZID"),
}));
vi.mock("../client/src/components/SallaCheckoutReview", () => ({
  SallaCheckoutReview: () => React.createElement("p", null, "SALLA"),
}));
import { OrderWorkspace } from "../client/src/components/merchant/OrderWorkspace";
import {
  readOrderStatusCache,
  saveOrderStatusCache,
} from "../client/src/lib/order-status-cache";
import {
  clearKnowledgeWorkspace,
  knowledgeCacheEpoch,
} from "../client/src/lib/knowledge-workspace-cache";
const scope = "7:20:orders",
  l = ar.orderWorkspace;
const row = () => ({
  id: 1,
  merchantId: 20,
  number: "LOCAL-62",
  customerName: "Local customer",
  customerPhone: "+12025550162",
  status: "pending",
  paymentStatus: "unpaid",
  currency: "USD",
  totalMinor: 3453,
  externalReference: null,
  checkoutReviewRequired: false,
  createdAt: "2026-09-30T00:00:00.000Z",
  updatedAt: "2026-09-30T00:00:00.000Z",
  customerEmail: "local@example.test",
  address: "Road\nFull",
  city: "Local",
  trackingNumber: null,
  notes: "Original note",
  paymentUrl: null,
  discountCode: null,
  subtotalMinor: null,
  discountMinor: null,
  discountReleased: false,
  isGift: true,
  giftRecipientName: "Gift recipient",
  giftMessage: "Gift message",
  reviewRequested: false,
  reviewRequestedAt: null,
  items: [
    {
      name: "Legacy item",
      quantity: 2,
      unitPriceMinor: null,
      totalMinor: null,
    },
  ],
  rawItems: '[{"name":"Legacy item","price":25,"quantity":2}]',
  itemsState: "legacy",
  truncatedFields: [],
});
const workspace = () => ({
  merchantId: 20,
  selection: { search: "", status: "all", payment: "all", page: 1 },
  generatedAt: "2026-09-30T00:00:00.000Z",
  timeZone: "UTC",
  page: 1,
  pageSize: 25,
  pages: 1,
  total: 1,
  filtered: 1,
  items: [row()],
  statuses: [],
  payments: [],
  values: [],
  canManage: true,
});
const receipt = (a: any) => ({
  version: "order-status.v1",
  merchantId: 20,
  actorId: 7,
  requestId: a.requestId,
  orderId: a.intent.id,
  from: "pending",
  status: a.intent.status,
  reason: a.intent.reason ?? null,
  trackingNumber: a.intent.trackingNumber ?? null,
  notificationQueued: a.intent.notify,
  committedAt: "2026-09-30T00:00:00.000Z",
});
let root: Root, container: HTMLDivElement;
const render = () =>
  act(async () => root.render(React.createElement(OrderWorkspace, { scope })));
const button = (text: string) =>
  Array.from(container.querySelectorAll("button")).find(
    b => b.textContent === text
  )!;
const click = (text: string) => act(async () => button(text).click());
const input = (id: string, value: string) =>
  act(async () => {
    const el = container.querySelector<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >(`#${id}`)!;
    const proto =
      el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(
      new Event(el instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true,
      })
    );
  });
const open = () =>
  act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="فتح الطلب LOCAL-62"]')!
      .click()
  );
const start = async () => {
  await render();
  await open();
  await click(l.statusChange);
};
const review = async () => {
  await click(l.prepare);
  await act(async () => {
    container
      .querySelectorAll<HTMLInputElement>('.ow-form input[type="checkbox"]')[1]
      .click();
  });
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("React", React);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  clearKnowledgeWorkspace();
  sessionStorage.clear();
  m.data = workspace();
  m.detail = row();
  m.error = null;
  m.detailError = null;
  m.fetching = false;
  m.detailFetching = false;
  m.language = "ar";
  m.invalidate.mockResolvedValue(undefined);
  m.refresh.mockResolvedValue({});
  m.receipt.mockResolvedValue(null);
  m.write.mockImplementation(async a => receipt(a));
  m.review.mockImplementation(async intent => ({
    merchantId: 20,
    actorId: 7,
    intent,
    digest: "a".repeat(64),
    order: { ...m.detail, paymentStatus: "unpaid" },
    notification: intent.notify
      ? { customerPhone: m.detail.customerPhone, message: "Reviewed message" }
      : null,
  }));
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
describe("order workspace journeys", () => {
  it("opens fresh detail and preserves gifts, raw item data, address and notes", async () => {
    await render();
    await open();
    expect(m.detailId).toBe(1);
    for (const text of [
      "Gift recipient",
      "Gift message",
      "Original note",
      "Road\nFull",
      '"price":25',
      l.legacyItems,
    ])
      expect(container.textContent).toContain(text);
  });
  it.each(["error", "fetching", "merchant", "selection"])(
    "does not display unconfirmed list contents for %s",
    async kind => {
      if (kind === "error") m.error = Error();
      if (kind === "fetching") m.fetching = true;
      if (kind === "merchant") m.data.merchantId = 99;
      if (kind === "selection") m.data.selection.page = 2;
      await render();
      expect(container.textContent).not.toContain("Local customer");
    }
  );
  it("makes viewer actions unavailable while preserving platform review entry points", async () => {
    m.data.canManage = false;
    await render();
    expect(container.textContent).toContain("ZID");
    expect(container.textContent).toContain("SALLA");
    await open();
    expect(button(l.statusChange).disabled).toBe(true);
    expect(container.textContent).toContain(l.readOnly);
  });
  it("hides foreign detail rather than trusting the clicked list row", async () => {
    m.detail.merchantId = 99;
    await render();
    await open();
    expect(container.textContent).not.toContain("Gift recipient");
    expect(button(l.statusChange)).toBeUndefined();
  });
  it("prepares a review without saving and requires fresh acknowledgement", async () => {
    await start();
    await click(l.prepare);
    expect(m.write).not.toHaveBeenCalled();
    expect(button(l.save).disabled).toBe(true);
    await input("ow-status", "shipped");
    expect(button(l.save)).toBeUndefined();
  });
  it("focuses a missing cancellation reason without a network request", async () => {
    await start();
    await input("ow-status", "cancelled");
    await click(l.prepare);
    expect(document.activeElement?.id).toBe("ow-reason");
    expect(m.review).not.toHaveBeenCalled();
    expect(m.write).not.toHaveBeenCalled();
  });
  it("retains the exact request before save, and clears only after a matching receipt", async () => {
    await start();
    await review();
    m.write.mockImplementation(async a => {
      expect(readOrderStatusCache(scope).attempt).toEqual(a);
      return receipt(a);
    });
    await click(l.save);
    expect(m.write).toHaveBeenCalledOnce();
    expect(readOrderStatusCache(scope)).toEqual({
      draft: undefined,
      attempt: undefined,
    });
    expect(container.textContent).toContain(l.saved);
  });
  it("recovers a lost save response without a second write", async () => {
    await start();
    await review();
    m.write.mockRejectedValue(Error("Lost"));
    await click(l.save);
    const a = m.write.mock.calls[0][0];
    expect(readOrderStatusCache(scope).attempt).toEqual(a);
    expect(container.textContent).toContain(l.uncertain);
    m.receipt.mockResolvedValue(receipt(a));
    await click(l.checkReceipt);
    expect(m.write).toHaveBeenCalledOnce();
    expect(m.receipt).toHaveBeenCalledWith({ requestId: a.requestId });
    expect(readOrderStatusCache(scope).attempt).toBeUndefined();
  });
  it("retries an uncertain write using exactly the same payload and UUID", async () => {
    await start();
    await review();
    m.write.mockRejectedValueOnce(Error("Lost"));
    await click(l.save);
    const a = m.write.mock.calls[0][0];
    await click(l.repeat);
    expect(m.write.mock.calls[1][0]).toEqual(a);
  });
  it("retains the draft on conflict and removes approval of the old review", async () => {
    await start();
    await review();
    m.write.mockRejectedValue({ data: { code: "CONFLICT" } });
    await click(l.save);
    expect(readOrderStatusCache(scope).draft?.id).toBe(1);
    expect(readOrderStatusCache(scope).attempt).toBeUndefined();
    expect(button(l.save)).toBeUndefined();
    expect(container.textContent).toContain(l.conflict);
  });
  it("does not submit if retaining the operation fails", async () => {
    await start();
    await review();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw Error("Unavailable");
    });
    await click(l.save);
    expect(m.write).not.toHaveBeenCalled();
    expect(container.textContent).toContain(l.storageError);
  });
  it("rejects a receipt for another merchant and keeps the attempt recoverable", async () => {
    await start();
    await review();
    m.write.mockImplementation(async a => ({ ...receipt(a), merchantId: 99 }));
    await click(l.save);
    expect(readOrderStatusCache(scope).attempt).toBeTruthy();
    expect(container.textContent).not.toContain(l.saved);
  });
  it("ignores a late success after logout", async () => {
    await start();
    await review();
    m.write.mockImplementation(async a => {
      clearKnowledgeWorkspace();
      return receipt(a);
    });
    await click(l.save);
    expect(container.textContent).not.toContain(l.saved);
    expect(readOrderStatusCache(scope).attempt).toBeUndefined();
  });
  it("restores the draft banner and discards only after confirmation", async () => {
    saveOrderStatusCache(
      scope,
      {
        draft: {
          id: 1,
          status: "cancelled",
          trackingNumber: "",
          reason: "Unsaved",
          notify: false,
        },
      },
      knowledgeCacheEpoch()
    );
    await render();
    expect(container.textContent).toContain(l.draft);
    await click(l.discard);
    expect(readOrderStatusCache(scope).draft).toBeTruthy();
    await click(l.confirmDiscard);
    expect(readOrderStatusCache(scope).draft).toBeUndefined();
  });
  it("preserves invoice, payment and discount tools for eligible local SAR orders", async () => {
    m.detail.currency = "SAR";
    m.detail.checkoutReviewRequired = true;
    await render();
    await open();
    expect(container.textContent).toContain("INVOICE");
    expect(container.textContent).toContain("ATTEMPTS");
    m.refresh.mockClear();
    await click("ATTEMPTS");
    expect(m.refresh).toHaveBeenCalled();
    m.detail = {
      ...m.detail,
      checkoutReviewRequired: false,
      status: "cancelled",
      subtotalMinor: 4000,
      discountMinor: 547,
    };
    await render();
    expect(container.textContent).toContain("MARGIN");
    expect(container.textContent).toContain("DISCOUNT");
    expect(container.textContent).toContain("RELEASE");
    m.refresh.mockClear();
    await click("RELEASE");
    expect(m.refresh).toHaveBeenCalled();
  });
  it("does not offer manual changes or local financial actions for external orders", async () => {
    m.detail.externalReference = "EXTERNAL";
    m.detail.currency = "SAR";
    await render();
    await open();
    expect(button(l.statusChange)).toBeUndefined();
    expect(container.textContent).not.toContain("INVOICE");
    expect(container.textContent).not.toContain("ATTEMPTS");
  });
  it("renders English labels without raw translation keys", async () => {
    m.language = "en";
    await render();
    expect(container.textContent).toContain(en.orderWorkspace.description);
    expect(container.textContent).not.toContain("orderWorkspace.");
  });
});
