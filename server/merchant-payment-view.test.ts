import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  settings: vi.fn(),
  merchant: vi.fn(),
  access: vi.fn(),
}));
vi.mock("./db", async original => ({
  ...(await original<typeof import("./db")>()),
  getMerchantById: m.merchant,
  getMerchantPaymentSettings: m.settings,
}));
vi.mock("./accounts/merchant-access", async original => ({
  ...(await original<typeof import("./accounts/merchant-access")>()),
  resolveMerchantAccess: m.access,
}));
import { appRouter } from "./routers";
import { merchantPaymentsRouter } from "./routers-merchant-payments";
import { toMerchantPaymentSettingsView } from "./payment/payment-link-policy";
const record = {
  id: 41,
  merchantId: 31,
  tapEnabled: 1,
  tapPublicKey: "pk_test_fixture",
  tapSecretKey: "sk_test_private-fixture",
  tapWebhookSecret: "whsec_private-fixture",
  tapTestMode: 1,
  isVerified: 1,
  lastVerifiedAt: "2026-10-04 10:00:00",
  autoSendPaymentLink: 0,
  paymentLinkMessage: "Saved message",
  defaultCurrency: "SAR",
  webhookUrl: "https://private.example.test/callback",
  futureSecret: "private-future-field",
};
beforeEach(() => {
  vi.resetAllMocks();
  m.settings.mockResolvedValue(record);
  m.merchant.mockResolvedValue({ id: 31 });
  m.access.mockResolvedValue({ merchantId: 31, role: "owner" });
});
function assertBounded(view: any) {
  expect(Object.keys(view).sort()).toEqual(
    [
      "tapEnabled",
      "tapPublicKey",
      "tapTestMode",
      "autoSendPaymentLink",
      "paymentLinkMessage",
      "defaultCurrency",
      "hasTapSecretKey",
      "isVerified",
      "credentialsVerified",
      "isReadyForPayments",
      "lastVerifiedAt",
    ].sort()
  );
  expect(JSON.stringify(view)).not.toContain("private");
  expect(view).toMatchObject({
    tapPublicKey: "pk_test_fixture",
    hasTapSecretKey: true,
    isReadyForPayments: true,
    paymentLinkMessage: "Saved message",
    autoSendPaymentLink: 0,
    defaultCurrency: "SAR",
  });
}
it("serializes an allowlist rather than dropping only the main Tap secret", () =>
  assertBounded(toMerchantPaymentSettingsView(record)));
it.each(["owner", "manager", "viewer", "sales_supervisor"])(
  "retired readers expose no stored secrets for %s",
  async role => {
    m.access.mockResolvedValue({ merchantId: 31, role });
    const ctx = {
      user: { id: 21, role: "user" },
      req: { headers: { "x-merchant-id": "31" } },
      res: {},
    } as any;
    for (const api of [
      appRouter.createCaller(ctx).merchantPayments,
      merchantPaymentsRouter.createCaller(ctx),
    ])
      await expect(api.getSettings()).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
        message: "payment_settings:reviewed_workspace_required",
      });
    for (const effect of Object.values(m))
      expect(effect).not.toHaveBeenCalled();
  }
);
