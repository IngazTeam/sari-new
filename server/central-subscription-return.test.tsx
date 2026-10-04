// @vitest-environment jsdom
import React, { act } from "react";
import { createTRPCClient } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { AppRouter } from "./routers";
import { wireTransactions } from "../client/src/central/transactions";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
let host: HTMLDivElement,
  calls: Array<{ path: string; type: string; input: unknown }>;
beforeEach(() => {
  vi.stubGlobal("React", React);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  calls = [];
  history.replaceState(
    null,
    "",
    "/payment/callback?tap_id=chg_public_local495"
  );
  host = document.createElement("div");
  host.innerHTML =
    '<h1>Public return page</h1><div id="central-transaction"><div id="form-feedback"></div><div id="transaction-content" role="status"></div></div>';
  document.body.append(host);
});
afterEach(async () => {
  await act(async () => window.dispatchEvent(new Event("pagehide")));
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const client = (status: unknown = "processing", failed = false) =>
  createTRPCClient<AppRouter>({
    links: [
      () =>
        ({ op }) =>
          observable(observer => {
            calls.push({ path: op.path, type: op.type, input: op.input });
            if (failed) observer.error(new Error("read unavailable") as any);
            else {
              observer.next({ result: { data: { status } } });
              observer.complete();
            }
            return () => {};
          }),
    ],
  });
const flush = async () => {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 30));
  });
};
it.each(["ar", "en"] as const)(
  "mounts the actual public callback with isolated %s copy and only one local status query",
  async lang => {
    await act(async () => {
      await wireTransactions(host, lang, client());
    });
    await flush();
    const copy = lang === "ar" ? ar.paymentReturnUx : en.paymentReturnUx;
    expect(host.querySelector(".pr-workspace")?.textContent).toContain(
      copy.pending
    );
    expect(host.querySelectorAll("h1")).toHaveLength(1);
    expect(host.querySelector("#payment-return-title")?.tagName).toBe("H2");
    expect(calls).toEqual([
      {
        path: "payment.getPaymentCallbackStatus",
        type: "query",
        input: { tap_id: "chg_public_local495" },
      },
    ]);
    expect(host.textContent).not.toContain("paymentReturnUx.");
  }
);
it.each(["completed", "failed", "invalid"])(
  "uses shared record states for %s without writing or asserting activation",
  async status => {
    await act(async () => {
      await wireTransactions(host, "en", client(status));
    });
    await flush();
    expect(host.querySelector("#payment-return-title")?.textContent).toBe(
      status === "invalid"
        ? en.paymentReturnUx.unavailable
        : en.paymentReturnUx[status as "completed" | "failed"]
    );
    expect(calls.every(c => c.type === "query")).toBe(true);
    expect(host.textContent).not.toContain("activated");
  }
);
it.each([
  "?tap_id=bad",
  "?tap_id=chg_first_12345&tap_id=chg_second_12345",
  "?tap_id=chg_first_12345&token=PAYID_123456",
  "",
])(
  "does not issue a read for ambiguous or missing public references %s",
  async query => {
    history.replaceState(null, "", "/payment/callback" + query);
    await act(async () => {
      await wireTransactions(host, "ar", client());
    });
    await flush();
    expect(host.textContent).toContain(ar.paymentReturnUx.invalid);
    expect(calls).toHaveLength(0);
  }
);
it("reports transport errors without a success claim and retries only after an explicit click", async () => {
  await act(async () => {
    await wireTransactions(host, "en", client("processing", true));
  });
  await flush();
  expect(host.textContent).toContain(en.paymentReturnUx.unavailableBody);
  expect(calls).toHaveLength(1);
  const retry = Array.from(
    host.querySelectorAll<HTMLButtonElement>("button")
  ).find(n => n.textContent === en.paymentReturnUx.refresh)!;
  await act(async () => retry.click());
  await flush();
  expect(calls).toHaveLength(2);
  expect(calls.every(c => c.type === "query")).toBe(true);
});
it("uses real navigation links rather than trapping merchant navigation inside the public widget", async () => {
  await act(async () => {
    await wireTransactions(host, "en", client());
  });
  await flush();
  const link = host.querySelector<HTMLAnchorElement>(
    'a[href="/merchant/usage?tab=subscription"]'
  )!;
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  // Prevent jsdom navigation only after observing whether React consumed the event.
  let consumed: boolean | undefined;
  document.addEventListener(
    "click",
    event => {
      consumed = event.defaultPrevented;
      event.preventDefault();
    },
    { once: true }
  );
  await act(async () => link.dispatchEvent(click));
  expect(consumed).toBe(false);
  expect(location.pathname).toBe("/payment/callback");
});
it("does not mount or read after its host was removed during async initialization", async () => {
  const mounting = wireTransactions(host, "en", client());
  host.remove();
  await act(async () => {
    await mounting;
  });
  await flush();
  expect(calls).toHaveLength(0);
});
it("keeps order-payment return on its separate reader", async () => {
  history.replaceState(null, "", "/payment/return?tap_id=chg_order_local495");
  await act(async () => {
    await wireTransactions(host, "en", client("captured"));
  });
  await flush();
  expect(host.querySelector(".pr-workspace")).toBeNull();
  expect(calls[0]?.path).toBe("payments.getPublicChargeStatus");
  expect(calls).toHaveLength(1);
});
