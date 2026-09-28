import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  update: vi.fn(),
  merchant: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: mocks.access,
}));
vi.mock("./db", async original => ({
  ...(await original<typeof import("./db")>()),
  getMerchantById: mocks.merchant,
  updateBotSettings: mocks.update,
}));
import { botSettingsRouter } from "./routers-bot-settings";
import { InvalidWorkingScheduleError } from "../shared/bot-working-schedule";
const caller = () =>
  botSettingsRouter.createCaller({
    user: { id: 7, role: "user" },
    req: { headers: { "x-merchant-id": "20" } },
    res: {},
  } as any);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({
    merchantId: 20,
    role: "owner",
    memberId: 3,
  });
  mocks.merchant.mockResolvedValue({ id: 20, status: "active" });
  mocks.update.mockResolvedValue({ workingDays: "" });
});
describe("bot settings validation at the API boundary", () => {
  it.each([
    { workingHoursStart: "99:99" },
    { workingHoursEnd: "24:00" },
    { workingDays: "NaN" },
    { workingDays: "1,1" },
  ])("rejects malformed fields before writing: %j", async input => {
    await expect(caller().update(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("accepts empty days and returns merged schedule rejection as a safe client error", async () => {
    await expect(caller().update({ workingDays: "" })).resolves.toEqual({
      workingDays: "",
    });
    expect(mocks.update).toHaveBeenCalledWith(20, { workingDays: "" });
    mocks.update.mockRejectedValueOnce(
      new InvalidWorkingScheduleError({ workingHoursEnd: "differentTimes" })
    );
    await expect(
      caller().update({ workingHoursEnd: "09:00" })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Review the working schedule",
    });
  });
  it("does not expose database details when a write fails", async () => {
    mocks.update.mockRejectedValueOnce(new Error("SQL password=secret"));
    await expect(
      caller().update({ workingHoursEnabled: false })
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Unable to save bot settings",
    });
  });
});
