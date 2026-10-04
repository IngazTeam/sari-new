// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  amount: 12550 as unknown,
  currency: "SAR" as unknown,
  language: "en",
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    payments: {
      getById: {
        useQuery: () => ({
          data: {
            id: 1,
            amount: state.amount,
            currency: state.currency,
            status: "captured",
            createdAt: "2026-10-04T00:00:00Z",
            customerPhone: "synthetic",
          },
          isLoading: false,
        }),
      },
    },
  },
}));
vi.mock("wouter", () => ({
  useParams: () => ({ id: "1" }),
  useLocation: () => ["/merchant/payments/1", vi.fn()],
  Link: ({ children }: any) => <span>{children}</span>,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: state.language },
  }),
}));
import PaymentDetails from "../client/src/pages/PaymentDetails";
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("React", React);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  state.amount = 12550;
  state.currency = "SAR";
  state.language = "en";
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const read = async () => {
  await act(async () => root.render(<PaymentDetails />));
  return host.querySelector("[data-payment-amount],.text-4xl")!.textContent;
};
it.each(["ar", "en"])(
  "shows 12550 stored halalas as 125.50 SAR in %s",
  async language => {
    state.language = language;
    expect(await read()).toBe(
      new Intl.NumberFormat(language, {
        style: "currency",
        currency: "SAR",
        currencyDisplay: "code",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(125.5)
    );
  }
);
it.each([null, undefined, NaN, -100, 1.5, "12550", Number.MAX_SAFE_INTEGER])(
  "never turns an invalid amount %s into a plausible payment",
  async amount => {
    state.amount = amount;
    expect(await read()).toBe("paymentMoneyUx.unavailable");
  }
);
it.each([null, "", "KWD", "ZZZ", "sar"])(
  "does not assume SAR or a minor-unit scale for %s",
  async currency => {
    state.currency = currency;
    expect(await read()).toBe("paymentMoneyUx.unavailable");
  }
);
it("preserves a known zero and displays cents accurately", async () => {
  state.amount = 0;
  expect(await read()).toContain("0.00");
  state.amount = 1;
  expect(await read()).toContain("0.01");
});
