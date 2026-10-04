// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
const state = vi.hoisted(() => ({ language: "en" }));
vi.mock(
  "@/lib/trpc",
  () => import("../prototypes/tenant-dashboard/src/service-preview-api")
);
vi.mock(
  "wouter",
  () => import("../prototypes/tenant-dashboard/src/service-preview-router")
);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: state.language },
    t: (key: string) =>
      key
        .split(".")
        .reduce((o: any, k) => o?.[k], state.language === "ar" ? ar : en) ||
      key,
  }),
}));
import Payments from "../client/src/pages/merchant/PaymentLinks";

import { ServicePreviewContext } from "../prototypes/tenant-dashboard/src/service-preview-api";
import {
  ServicePreviewModel,
  type ServiceMode,
} from "../prototypes/tenant-dashboard/src/service-preview-model";
import {
  linkDraftInput,
  emptyLinkDraft,
  pendingPaymentLinkRequest,
  rememberPaymentLinkRequest,
  clearPaymentLinkRequest,
  paymentLinkRequestKey,
} from "../client/src/lib/payment-links-view";
let root: Root, host: HTMLDivElement, model: ServicePreviewModel;
beforeEach(() => {
  vi.stubGlobal("React", React);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear();
  state.language = "en";
  history.replaceState(null, "", "/?path=/merchant/payment-links");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  model = new ServicePreviewModel(269);
});
afterEach(async () => {
  await act(async () => root.unmount());
  model.dispose();
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const c = () =>
  state.language === "ar" ? ar.paymentLinksUx : en.paymentLinksUx;
const render = (detail = false) =>
  act(async () =>
    root.render(
      <ServicePreviewContext.Provider value={model}>
        <Payments />
      </ServicePreviewContext.Provider>
    )
  );
const go = async (path: string, extra = "") =>
  act(async () => {
    history.replaceState(null, "", "/?path=" + path + extra);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
const button = (text: string) =>
  Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
    x => x.textContent?.trim() === text
  )!;
const click = async (text: string) =>
  act(async () => {
    expect(button(text)).toBeTruthy();
    button(text).click();
  });
const change = async (id: string, value: string) =>
  act(async () => {
    const el = host.querySelector<HTMLInputElement | HTMLSelectElement>(
      "#pl-" + id
    )!;
    Object.getOwnPropertyDescriptor(
      el.tagName === "SELECT"
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype,
      "value"
    )!.set!.call(el, value);
    el.dispatchEvent(
      new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })
    );
  });
const submit = () =>
  act(async () => {
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
const check = () =>
  act(async () => {
    host.querySelector<HTMLInputElement>(".pl-check input")!.click();
  });
const createDraft = async () => {
  await change("title", "Store consultation");
  await change("amount", "125.50");
  await check();
};
it.each(["ar", "en"])(
  "lists 52 links, pages and filters all records in %s",
  async language => {
    state.language = language;
    await render();
    expect(host.querySelector(".pl-workspace")?.getAttribute("dir")).toBe(
      language === "ar" ? "rtl" : "ltr"
    );
    expect(host.querySelectorAll("tbody tr")).toHaveLength(25);
    await click(c().next);
    await click(c().next);
    expect(host.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(button(c().next).disabled).toBe(true);
    await change("availability", "available");
    await submit();
    expect(host.querySelectorAll("tbody tr")).toHaveLength(11);
    expect(host.querySelectorAll(".pl-status-available")).toHaveLength(11);
    await change("search", "Nawa · 51");
    await submit();
    expect(host.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(host.textContent).toContain("#51");
    await click(c().reset);
    expect(host.querySelectorAll("tbody tr")).toHaveLength(25);
  }
);
it("preserves filter context through detail and back", async () => {
  await go("/merchant/payment-links", "&availability=available&pageSize=50");
  await render();
  await act(async () =>
    host.querySelector<HTMLAnchorElement>("tbody .ph-detail-link")!.click()
  );
  expect(host.textContent).toContain(c().storedStats);
  await act(async () =>
    host.querySelector<HTMLAnchorElement>(".ph-back")!.click()
  );
  expect(new URLSearchParams(location.search).get("availability")).toBe(
    "available"
  );
  expect(host.querySelectorAll("tbody tr")).toHaveLength(11);
});
it.each([
  "failure",
  "foreign",
  "stale-error",
  "forbidden",
  "session",
  "loading",
  "readonly",
] as ServiceMode[])("does not expose actionable rows on %s", async mode => {
  model = new ServicePreviewModel(269, mode);
  await render();
  expect(host.querySelectorAll("tbody tr")).toHaveLength(0);
  expect(host.querySelector("a.pl-primary")).toBeNull();
  expect(model.operations).toBe(0);
});
it.each([
  "&link=0",
  "&link=-1",
  "&link=999999999999",
  "&link=1&create=1",
  "&create=x",
])("rejects malformed view %s", async extra => {
  await go("/merchant/payment-links", extra);
  await render();
  expect(host.querySelector('[data-state="missing"]')).not.toBeNull();
});
it("displays unknown legacy amounts without inventing zero or hiding warnings", async () => {
  model = new ServicePreviewModel(269, "legacy");
  await go("/merchant/payment-links", "&link=1");
  await render();
  expect(host.textContent).toContain(c().warnings);
  expect(host.querySelector(".ph-amount")?.textContent).toBe(c().unknown);
});
it("hides unverified public and related URLs", async () => {
  model = new ServicePreviewModel(269, "unavailable-reference");
  await go("/merchant/payment-links", "&link=1");
  await render();
  expect(host.querySelector("#pl-customer-url")).toBeNull();
  expect(host.textContent).toContain(c().urlUnavailable);
});
it("waits for clipboard acknowledgement and reports rejection honestly", async () => {
  let reject!: (value: unknown) => void;
  const writeText = vi.fn(
    () =>
      new Promise<void>((_, r) => {
        reject = r;
      })
  );
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  await go("/merchant/payment-links", "&link=1");
  await render();
  await click(c().copy);
  expect(host.textContent).not.toContain(c().copied);
  await act(async () => reject(Error("denied")));
  expect(host.textContent).toContain(c().copyFailed);
  expect(model.operations).toBe(0);
});
it("requires explicit disable review and adopts confirmed source state", async () => {
  await go("/merchant/payment-links", "&link=1");
  await render();
  await click(c().disable);
  expect(button(c().disableConfirm).disabled).toBe(true);
  await check();
  await click(c().disableConfirm);
  expect(host.textContent).toContain(c().disabledSaved);
  expect(host.querySelector(".pl-status-disabled")).not.toBeNull();
  expect(model.operations).toBe(1);
  expect(button(c().disable)).toBeUndefined();
});
it.each(["save-conflict", "uncertain-save"] as ServiceMode[])(
  "blocks disable until reread after %s",
  async mode => {
    model = new ServicePreviewModel(269, mode);
    await go("/merchant/payment-links", "&link=1");
    await render();
    await click(c().disable);
    await check();
    await click(c().disableConfirm);
    expect(button(c().disable)?.disabled ?? true).toBe(true);
    expect(model.operations).toBe(mode === "uncertain-save" ? 1 : 0);
    await click(c().refresh);
    if (mode === "uncertain-save") expect(button(c().disable)).toBeUndefined();
    else expect(button(c().disable).disabled).toBe(false);
  }
);
it("shows field errors, opens advanced inputs and focuses the invalid field", async () => {
  await go("/merchant/payment-links", "&create=1");
  await render();
  await submit();
  expect(host.textContent).toContain(c().titleError);
  expect(host.textContent).toContain(c().amountError);
  expect(host.textContent).toContain(c().reviewError);
  expect(document.activeElement?.id).toBe("pl-title");
  await createDraft();
  await change("max-uses", "1.5");
  await check();
  await submit();
  expect(host.querySelector("details")?.open).toBe(true);
  expect(document.activeElement?.id).toBe("pl-max-uses");
  expect(host.textContent).toContain(c().usesError);
  expect(model.operations).toBe(0);
});
it("creates an exact amount once and clears only its verified pending UUID", async () => {
  await go("/merchant/payment-links", "&create=1");
  await render();
  await createDraft();
  await submit();
  expect(host.textContent).toContain(c().created);
  expect(model.operations).toBe(1);
  expect(pendingPaymentLinkRequest(sessionStorage, 1269, 269)).toBeNull();
  await act(async () =>
    host.querySelector<HTMLAnchorElement>(".pl-primary")!.click()
  );
  expect(host.querySelector(".ph-amount")?.textContent).toContain("125.50");
  expect(model.operations).toBe(1);
});
it("recovers an uncertain creation with one write and current source state", async () => {
  model = new ServicePreviewModel(269, "uncertain-save");
  await go("/merchant/payment-links", "&create=1");
  await render();
  await createDraft();
  await submit();
  expect(host.textContent).toContain(c().recovered);
  expect(model.operations).toBe(1);
  expect(pendingPaymentLinkRequest(sessionStorage, 1269, 269)).toBeNull();
});
it("keeps the same reference after a failed attempt and requires manual retry", async () => {
  model = new ServicePreviewModel(269, "action-failure");
  await go("/merchant/payment-links", "&create=1");
  await render();
  await createDraft();
  await submit();
  const id = pendingPaymentLinkRequest(sessionStorage, 1269, 269);
  expect(id).toBeTruthy();
  expect(host.textContent).toContain(c().notFound);
  expect(model.operations).toBe(0);
  await click(c().checkRequest);
  expect(model.operations).toBe(0);
  await click(c().retrySame);
  expect(model.operations).toBe(1);
  const found = model.read("payments.linksWorkspace.creationRequest", {
    requestId: id,
  }).data;
  expect(found.outcome).toBe("found");
  expect(host.textContent).toContain(c().created);
});
it("does not send without durable storage", async () => {
  await go("/merchant/payment-links", "&create=1");
  await render();
  await createDraft();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw Error("blocked");
  });
  await submit();
  expect(model.operations).toBe(0);
  expect(host.textContent).toContain(c().storageError);
});
it("double submission during a pending write is locked", async () => {
  model = new ServicePreviewModel(269, "pending-save");
  await go("/merchant/payment-links", "&create=1");
  await render();
  await createDraft();
  await submit();
  await submit();
  expect(model.pending).toBe(1);
  expect(model.operations).toBe(0);
  await act(async () => model.finishPending());
  expect(model.operations).toBe(1);
  expect(host.textContent).toContain(c().created);
});
it("ignores a late creation result after changing tenant", async () => {
  model = new ServicePreviewModel(269, "pending-save");
  await go("/merchant/payment-links", "&create=1");
  await render();
  await createDraft();
  await submit();
  const old = model;
  model = new ServicePreviewModel(270);
  await render();
  await act(async () => old.finishPending());
  expect(host.textContent).not.toContain(c().created);
  expect(model.operations).toBe(0);
  expect(pendingPaymentLinkRequest(sessionStorage, 1269, 269)).toBeTruthy();
  expect(pendingPaymentLinkRequest(sessionStorage, 1270, 270)).toBeNull();
  old.dispose();
});
it.each(["1e3", "1,000", "1.001", "-1", "Infinity", "0.99", "1000000.01"])(
  "rejects invalid money without rounding: %s",
  value => {
    expect(
      linkDraftInput(
        { ...emptyLinkDraft(), title: "Valid", amount: value, reviewed: true },
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      ).success
    ).toBe(false);
  }
);
it.each(["125.50", "١٢٥٫٥٠", "۱۲۵٫۵۰"])(
  "converts exact input %s to minor units",
  amount => {
    const p = linkDraftInput(
      { ...emptyLinkDraft(), title: "Valid", amount, reviewed: true },
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    );
    expect(p.success && p.data.amountMinor).toBe(12550);
  }
);
it("keeps storage scope separate and refuses replacing or clearing another pending request", () => {
  const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  rememberPaymentLinkRequest(sessionStorage, 1269, 269, a);
  expect(() =>
    rememberPaymentLinkRequest(sessionStorage, 1269, 269, b)
  ).toThrow();
  expect(() => clearPaymentLinkRequest(sessionStorage, 1269, 269, b)).toThrow();
  expect(pendingPaymentLinkRequest(sessionStorage, 1270, 270)).toBeNull();
  expect(
    [...Array(sessionStorage.length)].map((_, i) =>
      sessionStorage.getItem(sessionStorage.key(i)!)
    )
  ).toEqual([a]);
  expect(paymentLinkRequestKey(1269, 269)).not.toBe(
    paymentLinkRequestKey(1269, 270)
  );
});
it("does not call an invalid legacy usage limit unlimited", async () => {
  const read = model.read.bind(model);
  vi.spyOn(model, "read").mockImplementation((name, input) => {
    const value = read(name, input);
    if (name === "payments.linksWorkspace.detail" && value.data?.link)
      return {
        ...value,
        data: {
          ...value.data,
          link: {
            ...value.data.link,
            maxUsageCount: null,
            availability: "invalid",
            warnings: ["counters"],
          },
        },
      };
    return value;
  });
  await go("/merchant/payment-links", "&link=1");
  await render();
  expect(host.textContent).not.toContain(c().unlimited);
  expect(host.textContent).toContain(c().warningCounters);
});
it("blocks an unverified request receipt without replacing its UUID", async () => {
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  rememberPaymentLinkRequest(sessionStorage, 1269, 269, id);
  const read = model.read.bind(model);
  vi.spyOn(model, "read").mockImplementation((name, input) => {
    const r = read(name, input);
    return name === "payments.linksWorkspace.creationRequest"
      ? { ...r, data: { ...r.data, outcome: "unverified" } }
      : r;
  });
  await go("/merchant/payment-links", "&create=1");
  await render();
  expect(host.textContent).toContain(c().unverified);
  expect(button(c().retrySame).disabled).toBe(true);
  expect(model.operations).toBe(0);
  expect(pendingPaymentLinkRequest(sessionStorage, 1269, 269)).toBe(id);
});
it("recovers a pending creation after navigation and exposes its current disabled state", async () => {
  const requestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const created = await model.mutate("payments.linksWorkspace.createReviewed", {
    requestId,
    reviewed: true,
    title: "Recovered link",
    amountMinor: 12550,
  });
  await model.mutate("payments.linksWorkspace.disableReviewed", {
    id: created.workspace.link.id,
    expectedRevision: created.workspace.link.revision,
    reviewed: true,
  });
  rememberPaymentLinkRequest(sessionStorage, 1269, 269, requestId);
  await go("/merchant/payment-links", "&create=1");
  await render();
  expect(host.textContent).toContain(c().recovered);
  expect(model.operations).toBe(2);
  await act(async () =>
    host.querySelector<HTMLAnchorElement>(".pl-primary")!.click()
  );
  expect(host.querySelector(".pl-status-disabled")).not.toBeNull();
  expect(model.operations).toBe(2);
});
