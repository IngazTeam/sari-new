import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  owner: vi.fn(),
  current: vi.fn(),
  history: vi.fn(),
  stats: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./db", async original => ({
  ...(await original<typeof import("./db")>()),
  getMerchantByUserId: m.owner,
  getMerchantCurrentUsage: m.current,
  getMerchantUsageHistory: m.history,
}));
vi.mock("./usage-tracking", () => ({ getUsageStats: m.stats }));
import { appRouter } from "./routers";
import { subscriptionsRouter } from "./routers-subscriptions";
import { subscriptionUsageProcedure } from "./routers-usage";
const caller = (user: unknown = { id: 7, role: "user" }) =>
  appRouter.createCaller({
    user,
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
    merchantId: 999,
  } as any);
const queries = [
  [
    "current",
    (input?: any, user?: any) =>
      (caller(user).usage.getCurrentUsage as any)(input),
  ],
  [
    "history",
    (input?: any, user?: any) =>
      (caller(user).usage.getUsageHistory as any)(input),
  ],
  [
    "stats",
    (input?: any, user?: any) =>
      (caller(user).subscriptions.getUsage as any)(input),
  ],
] as const;
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner" });
  m.owner.mockResolvedValue({ id: 73 });
  m.current.mockResolvedValue({ fixture: "current usage" });
  m.history.mockResolvedValue([]);
  m.stats.mockResolvedValue({ fixture: "subscription usage" });
});
it.each(queries)(
  "scopes mounted %s reads to selected tenant for every member role",
  async (key, read) => {
    for (const role of ["owner", "manager", "sales_supervisor", "viewer"]) {
      m.access.mockResolvedValue({ merchantId: 20, role });
      await read();
      expect(m[key]).toHaveBeenLastCalledWith(20);
    }
    expect(m.access).toHaveBeenCalledWith(7, 20);
    expect(m.owner).not.toHaveBeenCalled();
  }
);
it.each(queries)(
  "rejects revoked access before reading %s",
  async (key, read) => {
    m.access.mockResolvedValue(null);
    await expect(read()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(m[key]).not.toHaveBeenCalled();
    expect(m.owner).not.toHaveBeenCalled();
  }
);
it.each(queries)("rejects an anonymous %s read", async (key, read) => {
  await expect(read(undefined, null)).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
  expect(m[key]).not.toHaveBeenCalled();
});
it.each(queries)(
  "redacts %s storage failures without converting them into missing subscriptions",
  async (key, read) => {
    m[key].mockRejectedValue(new Error("PRIVATE_USAGE_SQL"));
    await expect(read()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Usage data unavailable",
    });
  }
);
it.each(queries)("rejects a forged tenant input to %s", async (key, read) => {
  await expect(read({ merchantId: 73 })).rejects.toMatchObject({
    code: "BAD_REQUEST",
  });
  expect(m[key]).not.toHaveBeenCalled();
});
it.each(queries)(
  "fails closed on %s membership source errors",
  async (key, read) => {
    m.access.mockRejectedValue(new Error("PRIVATE_MEMBERSHIP_SQL"));
    await expect(read()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(m[key]).not.toHaveBeenCalled();
  }
);
it.each([queries[0], queries[2]])(
  "keeps confirmed missing subscription separate for %s",
  async (key, read) => {
    m[key].mockResolvedValue(null);
    await expect(read()).rejects.toMatchObject({ code: "NOT_FOUND" });
  }
);
it("preserves confirmed empty history", async () => {
  expect(await caller().usage.getUsageHistory()).toEqual([]);
});
it("mounts the same subscription usage procedure as the standalone module", () => {
  expect(appRouter._def.procedures["subscriptions.getUsage"]).toBe(
    subscriptionUsageProcedure
  );
  expect(subscriptionsRouter._def.procedures.getUsage).toBe(
    subscriptionUsageProcedure
  );
});
