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
const names = [
  "list",
  "unreadCount",
  "markAsRead",
  "markAllAsRead",
  "delete",
] as const;
const ctx = (user: any = { id: 21, role: "user" }) =>
  ({ user, req: { headers: {} }, res: {} }) as any;
const input = (name: string) =>
  name === "markAsRead" || name === "delete" ? { id: 1 } : undefined;
beforeEach(() => {
  vi.resetAllMocks();
  for (const fn of Object.values(effects))
    fn.mockImplementation(() => {
      throw Error("retired notification API reached an effect");
    });
  vi.stubGlobal("fetch", effects.fetch);
});
afterEach(() => vi.unstubAllGlobals());
const untouched = () => {
  for (const fn of Object.values(effects)) expect(fn).not.toHaveBeenCalled();
};
it.each(names)(
  "rejects legacy notifications.%s before reading or changing data",
  async name => {
    for (const role of ["user", "admin"])
      await expect(
        (
          appRouter.createCaller(ctx({ id: 21, role })).notifications[
            name
          ] as any
        )(input(name))
      ).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
        message: "account_notifications:workspace_required",
      });
    untouched();
  }
);
it.each(names)("keeps authentication on retired %s", async name => {
  await expect(
    (appRouter.createCaller(ctx(null)).notifications[name] as any)(input(name))
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  untouched();
});
it.each(names)(
  "does not accept actor or merchant overrides on %s",
  async name => {
    for (const extra of [{ userId: 99 }, { actorId: 99 }, { merchantId: 99 }])
      await expect(
        (appRouter.createCaller(ctx()).notifications[name] as any)({
          ...input(name),
          ...extra,
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    untouched();
  }
);
it.each([0, -1, 1.1, 2147483648, Infinity])(
  "rejects invalid legacy record id %s",
  async id => {
    for (const name of ["markAsRead", "delete"] as const)
      await expect(
        appRouter.createCaller(ctx()).notifications[name]({ id })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    untouched();
  }
);
it("retains all four reviewed source and action procedures", () => {
  for (const name of ["list", "detail", "applyReviewed", "readAllReviewed"])
    expect(
      appRouter._def.procedures["notifications.workspace." + name]
    ).toBeDefined();
});
