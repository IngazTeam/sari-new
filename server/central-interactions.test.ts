import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { renderCentralMarkup } from "../shared/central/render";
import { bootstrapCentral } from "../client/src/central/bootstrap";
import { wireTransactions } from "../client/src/central/transactions";
let dom: JSDOM;
function mount(path: string) {
  dom = new JSDOM(
    '<!doctype html><html><head><script data-central-seo></script></head><body><div id="root">' +
      renderCentralMarkup(path.split("?")[0], "en") +
      "</div></body></html>",
    { url: "https://sary.live" + path, pretendToBeVisual: true }
  );
  for (const key of [
    "window",
    "document",
    "location",
    "history",
    "localStorage",
    "FormData",
    "HTMLInputElement",
  ])
    vi.stubGlobal(key, (dom.window as any)[key]);
  return dom.window.document;
}
function field(d: Document, name: string, value: string) {
  (d.querySelector(`[name="${name}"]`) as HTMLInputElement).value = value;
}
function response(data: unknown) {
  return new Response(JSON.stringify([{ result: { data: { json: data } } }]), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
afterEach(() => {
  dom?.window.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("central production interactions", () => {
  it("validates signup steps and sends independent legal consent to the real contract", async () => {
    const d = mount("/signup?lang=en");
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            {
              error: {
                json: {
                  message: "Rejected",
                  code: -32600,
                  data: {
                    code: "BAD_REQUEST",
                    httpStatus: 400,
                    path: "auth.signup",
                  },
                },
              },
            },
          ]),
          { status: 400, headers: { "Content-Type": "application/json" } }
        )
    );
    vi.stubGlobal("fetch", fetchMock);
    bootstrapCentral();
    field(d, "name", "Test User");
    field(d, "businessName", "Test Store");
    field(d, "email", "test@example.com");
    field(d, "phone", "+966501234567");
    (d.querySelector("[data-signup-next]") as HTMLButtonElement).click();
    expect(
      (d.querySelector('[data-signup-step="1"]') as HTMLElement).hidden
    ).toBe(true);
    field(d, "password", "TestPassword1");
    field(d, "confirmPassword", "WrongPassword1");
    d.querySelector("form")!.dispatchEvent(
      new dom.window.Event("submit", { bubbles: true, cancelable: true })
    );
    expect(d.querySelector("#confirmPassword-error")!.textContent).toContain(
      "do not match"
    );
    expect(fetchMock).not.toHaveBeenCalled();
    field(d, "confirmPassword", "TestPassword1");
    for (const name of ["acceptedTerms", "acceptedPrivacy"])
      (d.querySelector(`[name="${name}"]`) as HTMLInputElement).checked = true;
    d.querySelector("form")!.dispatchEvent(
      new dom.window.Event("submit", { bubbles: true, cancelable: true })
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(String(url)).toContain("/api/trpc/auth.signup");
    const payload = JSON.parse(options.body as string)["0"].json;
    expect(payload).toMatchObject({
      name: "Test User",
      businessName: "Test Store",
      email: "test@example.com",
      acceptedTerms: true,
      acceptedPrivacy: true,
      marketingConsent: false,
    });
    await vi.waitFor(() =>
      expect(d.querySelector("#form-feedback")!.textContent).toContain(
        "could not complete"
      )
    );
    expect(localStorage.getItem("sari_remember_password")).toBeNull();
    expect(options.credentials).toBe("include");
  });
  it("keeps invalid login errors generic and never persists credentials", async () => {
    const d = mount("/login?lang=en");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 }))
    );
    bootstrapCentral();
    field(d, "email", "missing@example.com");
    field(d, "password", "WrongPassword1");
    (d.querySelector("[data-password]") as HTMLButtonElement).click();
    expect((d.querySelector("#password") as HTMLInputElement).type).toBe(
      "text"
    );
    d.querySelector("form")!.dispatchEvent(
      new dom.window.Event("submit", { bubbles: true, cancelable: true })
    );
    await vi.waitFor(() =>
      expect(d.querySelector("#form-feedback")!.textContent).toContain(
        "email address or password is incorrect"
      )
    );
    expect(localStorage.length).toBe(0);
  });
  it("does not report a support message as sent without server acceptance", async () => {
    const d = mount("/support?lang=en");
    vi.stubGlobal(
      "fetch",
      vi.fn(async url =>
        String(url).includes("/status")
          ? new Response(JSON.stringify({ status: "operational" }))
          : new Response(JSON.stringify({ accepted: false }), { status: 503 })
      )
    );
    bootstrapCentral();
    field(d, "name", "Test User");
    field(d, "email", "test@example.com");
    field(d, "subject", "A support question");
    field(d, "message", "A sufficiently detailed support question.");
    d.querySelector("form")!.dispatchEvent(
      new dom.window.Event("submit", { bubbles: true, cancelable: true })
    );
    await vi.waitFor(() =>
      expect(d.querySelector("#form-feedback")!.textContent).toContain(
        "request was not sent"
      )
    );
    expect(
      (d.querySelector('[name="message"]') as HTMLTextAreaElement).value
    ).toContain("support question");
  });
  it("shows current API prices and preserves yearly billing in the checkout link", async () => {
    const d = mount("/pricing?lang=en");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response([
          {
            id: 3,
            name: "باقة",
            nameEn: "Growth",
            description: "وصف",
            descriptionEn: "Room to grow",
            monthlyPrice: "150",
            yearlyPrice: "1500",
            currency: "SAR",
          },
        ])
      )
    );
    bootstrapCentral();
    await vi.waitFor(() =>
      expect(d.querySelector("#central-plans")!.textContent).toContain("Growth")
    );
    (d.querySelector('[data-billing="yearly"]') as HTMLButtonElement).click();
    expect(d.querySelector("#central-plans")!.textContent).toContain("1,500");
    expect(d.querySelector("#central-plans a")!.getAttribute("href")).toBe(
      "/subscribe/3?billing=yearly&lang=en"
    );
  });
  it("does not infer payment success from a user-controlled status query", async () => {
    const d = mount("/payment/return?lang=en&status=success");
    const api = { payments: { getPublicChargeStatus: { query: vi.fn() } } };
    await wireTransactions(d.getElementById("root")!, "en", api as any);
    expect(d.querySelector("#transaction-content")!.textContent).toContain(
      "verification link is invalid"
    );
    expect(api.payments.getPublicChargeStatus.query).not.toHaveBeenCalled();
  });
  it("shows payment success only after the server confirms capture", async () => {
    const d = mount("/payment/return?lang=en&tap_id=chg_test_12345678");
    const query = vi.fn().mockResolvedValue({ status: "captured" });
    await wireTransactions(d.getElementById("root")!, "en", {
      payments: { getPublicChargeStatus: { query } },
    } as any);
    expect(query).toHaveBeenCalledWith({ chargeId: "chg_test_12345678" });
    expect(d.querySelector("#transaction-content")!.textContent).toContain(
      "transaction is confirmed"
    );
  });
});
