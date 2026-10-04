import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  pool: vi.fn(),
  access: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("./db/connection", () => ({ getPool: m.pool }));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: m.access,
}));
import { readMerchantWorkspaceIdentity } from "./accounts/merchant-workspace-identity";
import { merchantWorkspaceIdentityProcedure } from "./routers-merchant-workspace-identity";
import { router } from "./_core/trpc";
import { merchantWorkspaceIdentity } from "../shared/merchant-workspace-identity";
const caller = () =>
  router({
    workspaceIdentity: merchantWorkspaceIdentityProcedure,
  }).createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "21" } },
    res: {},
  } as any);
beforeEach(() => {
  vi.resetAllMocks();
  m.pool.mockResolvedValue({ execute: m.execute });
  m.execute.mockResolvedValue([[{ id: 21, actorId: 7 }]]);
  m.access.mockResolvedValue({ merchantId: 21, role: "viewer" });
});
it("resolves the server selected membership and exposes only identity fields", async () => {
  expect(await caller().workspaceIdentity()).toEqual({ id: 21, actorId: 7 });
  expect(m.access).toHaveBeenCalledWith(7, 21);
  expect(m.execute.mock.calls[0][1].slice(0, 2)).toEqual([7, 21]);
});
it.each([null, undefined])(
  "fails a missing database without inventing identity %#",
  async value => {
    m.pool.mockResolvedValue(value);
    await expect(caller().workspaceIdentity()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "merchant_identity:unavailable",
    });
  }
);
it("does not leak storage failures", async () => {
  m.execute.mockRejectedValue(Error("PRIVATE_CONNECTION"));
  await expect(caller().workspaceIdentity()).rejects.toMatchObject({
    message: "merchant_identity:unavailable",
  });
});
it.each([
  [],
  [
    { id: 21, actorId: 7 },
    { id: 21, actorId: 7 },
  ],
])("rejects absent or ambiguous current authority %#", async rows => {
  m.execute.mockResolvedValue([rows]);
  await expect(caller().workspaceIdentity()).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
});
it.each([
  { id: 22, actorId: 7 },
  { id: 21, actorId: 8 },
  { id: 21, actorId: 7, secret: "PRIVATE" },
])("rejects contradictory or excessive data %#", async row => {
  m.execute.mockResolvedValue([[row]]);
  await expect(caller().workspaceIdentity()).rejects.toMatchObject({
    code: "INTERNAL_SERVER_ERROR",
  });
});
it.each([0, -1, 1.5, 2147483648])(
  "rejects invalid scopes %s before storage",
  async n => {
    await expect(readMerchantWorkspaceIdentity(n, 21)).rejects.toMatchObject({
      reason: "forbidden",
    });
    await expect(readMerchantWorkspaceIdentity(7, n)).rejects.toMatchObject({
      reason: "forbidden",
    });
    expect(m.pool).not.toHaveBeenCalled();
  }
);
it("does not load identity without an authorized membership", async () => {
  m.access.mockResolvedValue(null);
  await expect(caller().workspaceIdentity()).rejects.toMatchObject({
    code: "FORBIDDEN",
  });
  expect(m.execute).not.toHaveBeenCalled();
});
it("rejects extra profile fields at the shared boundary", () => {
  expect(
    merchantWorkspaceIdentity.safeParse({
      id: 21,
      actorId: 7,
      businessName: "Private",
    }).success
  ).toBe(false);
});
