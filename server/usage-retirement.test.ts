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
import { subscriptionsRouter } from "./routers-subscriptions";
import { subscriptionUsageProcedure } from "./routers-usage";
const ctx = (user: any = { id: 21, role: "user" }) =>
  ({ user, req: { headers: { "x-merchant-id": "99" } }, res: {} }) as any;
const queries = [
  [
    "usage.getCurrentUsage",
    (c: any, input?: any) =>
      appRouter.createCaller(c).usage.getCurrentUsage(input),
  ],
  [
    "usage.getUsageHistory",
    (c: any, input?: any) =>
      appRouter.createCaller(c).usage.getUsageHistory(input),
  ],
  [
    "subscriptions.getUsage",
    (c: any, input?: any) =>
      appRouter.createCaller(c).subscriptions.getUsage(input),
  ],
  [
    "standalone subscriptions.getUsage",
    (c: any, input?: any) =>
      subscriptionsRouter.createCaller(c).getUsage(input),
  ],
] as const;
beforeEach(() => {
  vi.resetAllMocks();
  for (const fn of Object.values(effects))
    fn.mockImplementation(() => {
      throw Error("Retired usage API reached an effect");
    });
  vi.stubGlobal("fetch", effects.fetch);
});
afterEach(() => vi.unstubAllGlobals());
const untouched = () => {
  for (const fn of Object.values(effects)) expect(fn).not.toHaveBeenCalled();
};
it.each(queries)(
  "retires %s before all database or network effects",
  async (_name, read) => {
    for (const role of ["user", "admin"])
      await expect(read(ctx({ id: 21, role }))).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
        message: "usage:workspace_required",
      });
    untouched();
  }
);
it.each(queries)("retains authentication on %s", async (_name, read) => {
  await expect(read(ctx(null))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  untouched();
});
it.each(queries)(
  "rejects identity overrides and extra inputs on %s",
  async (_name, read) => {
    for (const input of [
      { merchantId: 99 },
      { actorId: 99 },
      { userId: 99 },
      {},
      null,
      1,
    ])
      await expect(read(ctx(), input)).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    untouched();
  }
);
it("retains the scoped workspace and shares the retired subscription procedure in both mounts", () => {
  expect(appRouter._def.procedures["usage.workspace"]).toBeDefined();
  expect(appRouter._def.procedures["subscriptions.getUsage"]).toBe(
    subscriptionUsageProcedure
  );
  expect(subscriptionsRouter._def.procedures.getUsage).toBe(
    subscriptionUsageProcedure
  );
});
