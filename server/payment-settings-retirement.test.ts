import { beforeEach, afterEach, expect, it, vi } from "vitest";
const effects = vi.hoisted(() => ({
  db: vi.fn(),
  pool: vi.fn(),
  access: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("./db/connection", async original => ({
  ...(await original<typeof import("./db/connection")>()),
  getDb: effects.db,
  getPool: effects.pool,
}));
vi.mock("./accounts/merchant-access", async original => ({
  ...(await original<typeof import("./accounts/merchant-access")>()),
  resolveMerchantAccess: effects.access,
}));
import { appRouter } from "./routers";
import { merchantPaymentsRouter } from "./routers-merchant-payments";
const ctx = (user: any = { id: 21, role: "user" }, selector = "31") =>
  ({ user, req: { headers: { "x-merchant-id": selector } }, res: {} }) as any;
const input = {
  tapEnabled: true,
  tapPublicKey: "pk_test_fixture",
  tapSecretKey: "sk_test_synthetic",
  tapTestMode: true,
  autoSendPaymentLink: true,
  paymentLinkMessage: "Legacy",
  defaultCurrency: "SAR" as const,
};
beforeEach(() => {
  vi.resetAllMocks();
  for (const call of Object.values(effects))
    call.mockImplementation(() => {
      throw Error("retired endpoint reached side effect");
    });
  vi.stubGlobal("fetch", effects.fetch);
});
afterEach(() => vi.unstubAllGlobals());
const untouched = () => {
  for (const call of Object.values(effects))
    expect(call).not.toHaveBeenCalled();
};
for (const mounted of [true, false]) {
  const caller = (user?: any, selector?: string) =>
    mounted
      ? appRouter.createCaller(ctx(user, selector)).merchantPayments
      : merchantPaymentsRouter.createCaller(ctx(user, selector));
  it.each(["user", "admin"])(
    `retires every unreviewed payment endpoint before reads or transport (${mounted}, %s)`,
    async role => {
      const api = caller({ id: 21, role });
      for (const call of [
        () => api.getSettings(),
        () => api.saveSettings(input),
        () => api.testConnection(),
      ])
        await expect(call()).rejects.toMatchObject({
          code: "PRECONDITION_FAILED",
          message: "payment_settings:reviewed_workspace_required",
        });
      untouched();
    }
  );
  it(`cannot acknowledge disable or empty replacement on the old route (${mounted})`, async () => {
    for (const value of [
      { tapEnabled: false },
      { ...input, tapSecretKey: "", tapPublicKey: "", tapEnabled: false },
    ])
      await expect(caller().saveSettings(value)).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
      });
    untouched();
  });
  it(`preserves authentication and strict request boundaries (${mounted})`, async () => {
    await expect(caller(null).getSettings()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      caller(undefined, "invalid").getSettings()
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller().saveSettings({ ...input, merchantId: 99 } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    untouched();
  });
}
it("mounts one canonical router and retains reviewed operations only alongside tombstones", () => {
  for (const name of [
    "workspace",
    "saveReviewed",
    "probeReviewed",
    "getSettings",
    "saveSettings",
    "testConnection",
  ])
    expect(appRouter._def.procedures[`merchantPayments.${name}`]).toBe(
      merchantPaymentsRouter._def.procedures[name]
    );
  expect(Object.keys(merchantPaymentsRouter._def.procedures).sort()).toEqual(
    [
      "workspace",
      "saveReviewed",
      "probeReviewed",
      "getSettings",
      "saveSettings",
      "testConnection",
    ].sort()
  );
});
