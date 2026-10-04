import { beforeEach, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ getDb: vi.fn(), getPool: vi.fn() }));
vi.mock("./db/connection", async importOriginal => ({
  ...(await importOriginal<typeof import("./db/connection")>()),
  getDb: calls.getDb,
  getPool: calls.getPool,
}));
import { appRouter } from "./routers";
beforeEach(() => {
  vi.resetAllMocks();
  for (const call of Object.values(calls))
    call.mockImplementation(() => {
      throw Error("retired route reached database");
    });
});
const caller = (
  user: any = { id: 21, role: "user", email: "self@example.test" },
  selector = "31"
) =>
  appRouter.createCaller({
    user,
    req: { headers: { "x-merchant-id": selector } },
    res: {},
  } as any);
it.each(["user", "admin"])(
  "retires both profile writers for %s before database access",
  async role => {
    const api = caller({ id: 21, role });
    await expect(
      api.auth.updateProfile({ name: "Legacy name" })
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "self_profile:reviewed_write_required",
    });
    await expect(
      api.merchants.update({ businessName: "Legacy business" })
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "merchant_profile:reviewed_write_required",
    });
    for (const call of Object.values(calls))
      expect(call).not.toHaveBeenCalled();
  }
);
it.each([
  {},
  { name: "New name", email: "replacement@example.test" },
  { email: "self@example.test" },
])("does not acknowledge a legacy account request %j", async input => {
  await expect(caller().auth.updateProfile(input)).rejects.toMatchObject({
    code: "PRECONDITION_FAILED",
  });
  for (const call of Object.values(calls)) expect(call).not.toHaveBeenCalled();
});
it.each([
  {},
  { phone: "", autoReplyEnabled: false },
  { timezone: "UTC", logoUrl: null },
])("does not acknowledge a legacy store request %j", async input => {
  await expect(caller().merchants.update(input)).rejects.toMatchObject({
    code: "PRECONDITION_FAILED",
  });
  for (const call of Object.values(calls)) expect(call).not.toHaveBeenCalled();
});
it("keeps authentication, selector and unknown-field validation", async () => {
  await expect(
    caller(null).auth.updateProfile({ name: "Guest" })
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(
    caller(null).merchants.update({ businessName: "Guest" })
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  await expect(
    caller(undefined, "bad").merchants.update({})
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(
    caller().merchants.update({ currency: "USD" } as any)
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await expect(
    caller().auth.updateProfile({ name: "Valid", role: "admin" } as any)
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  for (const call of Object.values(calls)) expect(call).not.toHaveBeenCalled();
});
it("retains reviewed sources and separate administrator workflows", () => {
  expect(Object.keys(appRouter._def.procedures)).toEqual(
    expect.arrayContaining([
      "auth.selfProfileWorkspace",
      "auth.renameReviewed",
      "merchants.profileWorkspace",
      "merchants.profileSaveReviewed",
      "merchants.currencyWorkspace",
      "merchants.currencySaveReviewed",
      "merchants.adminUpdate",
      "merchants.updateStatus",
    ])
  );
});
