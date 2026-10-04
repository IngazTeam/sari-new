import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
const ctx = (user: any = { id: 21, role: "user" }, selector = "31") =>
  ({ user, req: { headers: { "x-merchant-id": selector } }, res: {} }) as any;
const input = { getById: { id: 1 }, list: { limit: 50 }, getStats: {} };
const names = ["getById", "list", "getStats"] as const;
beforeEach(() => {
  vi.resetAllMocks();
  for (const call of Object.values(effects))
    call.mockImplementation(() => {
      throw Error("retired history reached a side effect");
    });
  vi.stubGlobal("fetch", effects.fetch);
});
afterEach(() => vi.unstubAllGlobals());
const untouched = () => {
  for (const call of Object.values(effects))
    expect(call).not.toHaveBeenCalled();
};
it.each(names)(
  "retires payments.%s for users and admins before any read or provider call",
  async name => {
    for (const role of ["user", "admin"])
      await expect(
        (appRouter.createCaller(ctx({ id: 21, role })).payments[name] as any)(
          input[name]
        )
      ).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
        message: "payment_history:workspace_required",
      });
    untouched();
  }
);
it.each(names)(
  "preserves auth and selector boundaries for payments.%s",
  async name => {
    await expect(
      (appRouter.createCaller(ctx(null)).payments[name] as any)(input[name])
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(
      (appRouter.createCaller(ctx(undefined, "invalid")).payments[name] as any)(
        input[name]
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    untouched();
  }
);
it.each(names)(
  "rejects a merchant override on the legacy %s input",
  async name => {
    await expect(
      (appRouter.createCaller(ctx()).payments[name] as any)({
        ...input[name],
        merchantId: 99,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    untouched();
  }
);
it("keeps the bounded source and public checkout/status routes registered", () => {
  for (const name of [
    "payments.workspace.list",
    "payments.workspace.detail",
    "payments.getPublicLink",
    "payments.checkoutLink",
    "payments.getPublicChargeStatus",
    "payments.getPublicLinkPaymentStatus",
  ])
    expect(appRouter._def.procedures[name]).toBeDefined();
});
