import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  merchant: vi.fn(),
  customers: vi.fn(),
  customer: vi.fn(),
  campaigns: vi.fn(),
  campaign: vi.fn(),
  create: vi.fn(),
  updateBot: vi.fn(),
  settings: vi.fn(),
  logs: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: mocks.access,
}));
vi.mock("./db", async original => ({
  ...(await original<typeof import("./db")>()),
  getMerchantById: mocks.merchant,
  getCustomersByMerchant: mocks.customers,
  getCustomerByPhone: mocks.customer,
  getCampaignsByMerchantId: mocks.campaigns,
  getCampaignById: mocks.campaign,
  createCampaign: mocks.create,
  updateBotSettings: mocks.updateBot,
  getBotSettings: mocks.settings,
  getCampaignLogsWithStats: mocks.logs,
}));
import { appRouter } from "./routers";
const caller = (selected = "20", platformRole = "user") =>
  appRouter.createCaller({
    user: { id: 7, role: platformRole },
    req: { headers: { "x-merchant-id": selected } },
    res: {},
    merchantId: 999,
  } as any);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({
    merchantId: 20,
    role: "viewer",
    memberId: 3,
  });
  mocks.merchant.mockResolvedValue({ id: 20, status: "active" });
  mocks.customers.mockResolvedValue([]);
  mocks.campaigns.mockResolvedValue([]);
  mocks.settings.mockResolvedValue({ autoReplyEnabled: true });
  mocks.create.mockImplementation(async data => ({ id: 1, ...data }));
  mocks.updateBot.mockResolvedValue({ success: true });
});
describe("mounted customer, bot and campaign permissions", () => {
  it.each(["owner", "manager", "sales_supervisor", "viewer"])(
    "allows %s to read only the selected customer list",
    async role => {
      mocks.access.mockResolvedValue({ merchantId: 20, role, memberId: 3 });
      await expect(caller().customers.list({})).resolves.toEqual([]);
      expect(mocks.access).toHaveBeenCalledWith(7, 20);
      expect(mocks.customers).toHaveBeenCalledWith(20);
      expect(mocks.merchant).toHaveBeenCalledWith(20);
    }
  );
  it("prevents viewer bulk exports while allowing permitted customer managers", async () => {
    await expect(caller().customers.exportCsv()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(caller().customers.export()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.customers).not.toHaveBeenCalled();
    mocks.access.mockResolvedValue({
      merchantId: 20,
      role: "sales_supervisor",
      memberId: 3,
    });
    await expect(caller().customers.exportCsv()).resolves.toMatchObject({
      count: 0,
    });
  });
  it.each(["viewer", "sales_supervisor"])(
    "blocks %s campaign mutations before any campaign lookup",
    async role => {
      mocks.access.mockResolvedValue({ merchantId: 20, role, memberId: 3 });
      const current = caller();
      for (const action of [
        () => current.campaigns.create({ name: "fixture", message: "fixture" }),
        () => current.campaigns.update({ id: 4, name: "changed" }),
        () => current.campaigns.delete({ id: 4 }),
        () => current.campaigns.send({ id: 4 }),
        () => current.campaigns.acknowledgeManualReview({ id: 4 }),
      ]) {
        await expect(action()).rejects.toMatchObject({ code: "FORBIDDEN" });
      }
      expect(mocks.campaign).not.toHaveBeenCalled();
      expect(mocks.create).not.toHaveBeenCalled();
    }
  );
  it.each(["owner", "manager"])(
    "lets %s create a campaign bound to the selected membership",
    async role => {
      mocks.access.mockResolvedValue({ merchantId: 20, role, memberId: 3 });
      const result = await caller().campaigns.create({
        name: "fixture",
        message: "fixture",
      });
      expect(result?.merchantId).toBe(20);
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({ merchantId: 20 })
      );
    }
  );
  it("rejects foreign campaign reads and sends even for an otherwise authorized member", async () => {
    mocks.access.mockResolvedValue({
      merchantId: 20,
      role: "manager",
      memberId: 3,
    });
    mocks.campaign.mockResolvedValue({
      id: 4,
      merchantId: 30,
      status: "draft",
    });
    for (const action of [
      () => caller().campaigns.getById({ id: 4 }),
      () => caller().campaigns.getReport({ id: 4 }),
      () => caller().campaigns.send({ id: 4 }),
    ])
      await expect(action()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.logs).not.toHaveBeenCalled();
  });
  it.each(["viewer", "sales_supervisor"])(
    "blocks %s bot configuration and test sending",
    async role => {
      mocks.access.mockResolvedValue({ merchantId: 20, role, memberId: 3 });
      await expect(
        caller().botSettings.update({ autoReplyEnabled: false })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        caller().botSettings.sendTestMessage()
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mocks.updateBot).not.toHaveBeenCalled();
      expect(mocks.merchant).not.toHaveBeenCalled();
    }
  );
  it.each(["owner", "manager"])(
    "allows %s to configure the selected bot",
    async role => {
      mocks.access.mockResolvedValue({ merchantId: 20, role, memberId: 3 });
      await caller().botSettings.update({ autoReplyEnabled: false });
      expect(mocks.updateBot).toHaveBeenCalledWith(20, {
        autoReplyEnabled: false,
      });
    }
  );
  it("fails before domain reads after access is revoked or identity cannot be verified", async () => {
    mocks.access.mockResolvedValue(null);
    await expect(caller().customers.list({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    mocks.access.mockRejectedValue(new Error("database unavailable"));
    await expect(caller().botSettings.get()).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    expect(mocks.merchant).not.toHaveBeenCalled();
    expect(mocks.customers).not.toHaveBeenCalled();
  });
});
