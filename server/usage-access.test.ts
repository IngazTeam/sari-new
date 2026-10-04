import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  access: vi.fn(),
  workspace: vi.fn(),
  owner: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
vi.mock("./accounts/usage-workspace", () => ({
  readUsageWorkspace: m.workspace,
}));
vi.mock("./db", async original => ({
  ...(await original<typeof import("./db")>()),
  getMerchantByUserId: m.owner,
}));
import { appRouter } from "./routers";
import { MerchantSettingsAuthorityError } from "./accounts/merchant-settings-authority";
const caller = (user: unknown = { id: 7, role: "user" }) =>
  appRouter.createCaller({
    user,
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
    merchantId: 999,
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  m.access.mockResolvedValue({ merchantId: 20, role: "owner" });
  m.workspace.mockResolvedValue({ fixture: "scoped workspace" });
});
it.each(["owner", "manager", "sales_supervisor", "viewer"])(
  "uses selected tenant and actor for %s",
  async role => {
    m.access.mockResolvedValue({ merchantId: 20, role });
    await caller().usage.workspace();
    expect(m.workspace).toHaveBeenCalledWith(7, 20);
    expect(m.access).toHaveBeenCalledWith(7, 20);
    expect(m.owner).not.toHaveBeenCalled();
  }
);
it("rejects revoked membership before the snapshot read", async () => {
  m.access.mockResolvedValue(null);
  await expect(caller().usage.workspace()).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  expect(m.workspace).not.toHaveBeenCalled();
});
it("retains the live authority check inside the snapshot transaction", async () => {
  m.workspace.mockRejectedValue(
    new MerchantSettingsAuthorityError("forbidden")
  );
  await expect(caller().usage.workspace()).rejects.toMatchObject({
    code: "FORBIDDEN",
    message: "Usage access unavailable",
  });
});
it("rejects an anonymous snapshot read", async () => {
  await expect(caller(null).usage.workspace()).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
  expect(m.access).not.toHaveBeenCalled();
  expect(m.workspace).not.toHaveBeenCalled();
});
it("redacts source failures without reporting an empty subscription", async () => {
  m.workspace.mockRejectedValue(new Error("PRIVATE_USAGE_SQL"));
  await expect(caller().usage.workspace()).rejects.toMatchObject({
    code: "INTERNAL_SERVER_ERROR",
    message: "Usage data unavailable",
  });
});
it.each([{ merchantId: 73 }, { actorId: 8 }, { userId: 9 }, {}])(
  "rejects forged snapshot input %j",
  async input => {
    await expect(
      (caller().usage.workspace as any)(input)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(m.workspace).not.toHaveBeenCalled();
  }
);
it("fails closed on membership source failures", async () => {
  m.access.mockRejectedValue(new Error("PRIVATE_MEMBERSHIP_SQL"));
  await expect(caller().usage.workspace()).rejects.toMatchObject({
    code: "INTERNAL_SERVER_ERROR",
  });
  expect(m.workspace).not.toHaveBeenCalled();
});
