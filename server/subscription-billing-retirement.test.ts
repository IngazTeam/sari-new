import { beforeEach, afterEach, it, expect, vi } from "vitest";
const effects = vi.hoisted(() => ({
  db: vi.fn(),
  pool: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("./db/connection", async original => ({
  ...(await original<typeof import("./db/connection")>()),
  getDb: effects.db,
  getPool: effects.pool,
}));
import { appRouter } from "./routers";
const routes = [
  ["merchantSubscription", "getCurrentSubscription"],
  ["merchantSubscription", "getDaysRemaining"],
  ["merchantSubscription", "checkStatus"],
  ["payment", "listTransactions"],
  ["payment", "getTransactionDetails"],
] as const;
const run = (
  group: string,
  route: string,
  user: unknown = { id: 21, role: "user" },
  input: unknown = route === "getTransactionDetails" ? { id: 7 } : undefined
) =>
  (
    appRouter.createCaller({
      user,
      req: { headers: { "x-merchant-id": "99" } },
      res: {},
    } as any) as any
  )[group][route](input);
beforeEach(() => {
  vi.resetAllMocks();
  for (const fn of Object.values(effects))
    fn.mockImplementation(() => {
      throw Error("Retired billing read reached an effect");
    });
  vi.stubGlobal("fetch", effects.fetch);
});
afterEach(() => {
  for (const fn of Object.values(effects)) expect(fn).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
it.each(routes)(
  "retires %s.%s before database and network",
  async (group, route) => {
    for (const role of ["user", "admin"])
      await expect(run(group, route, { id: 21, role })).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
        message: "subscription:workspace_required",
      });
  }
);
it.each(routes)("authenticates %s.%s", async (group, route) => {
  await expect(run(group, route, null)).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
});
it.each(routes)(
  "rejects malformed or forged scope on %s.%s",
  async (group, route) => {
    for (const input of [
      { merchantId: 99 },
      { id: 7, actorId: 99 },
      { id: -1 },
      { id: 1.5 },
      {},
      null,
      "7",
    ])
      await expect(run(group, route, undefined, input)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
  }
);
it("preserves scoped replacements and public callback", () => {
  for (const name of [
    "merchantSubscription.workspace",
    "merchantSubscription.paymentHistory",
    "payment.getPaymentCallbackStatus",
  ])
    expect(appRouter._def.procedures[name]).toBeDefined();
});
