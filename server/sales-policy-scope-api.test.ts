import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  discountRead: vi.fn(),
  discountSave: vi.fn(),
  marginRead: vi.fn(),
  marginSave: vi.fn(),
}));
vi.mock("./accounts/merchant-access", () => ({
  resolveMerchantAccess: mocks.access,
}));
vi.mock("./ai/discount-policy", () => ({
  getDiscountPolicy: mocks.discountRead,
  updateDiscountPolicy: mocks.discountSave,
}));
vi.mock("./ai/checkout-margin-policy", () => ({
  getMarginPolicy: mocks.marginRead,
  updateMarginPolicy: mocks.marginSave,
}));
import { botSettingsRouter } from "./routers-bot-settings";
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
});
it.each(["discount", "margin"] as const)(
  "binds %s reads and writes to the resolved store and actor",
  async (kind) => {
    const policy =
        kind === "discount"
          ? { enabled: true, maxPercent: 15, expireHours: 24 }
          : { enabled: true, minPercent: 20 },
      data = { policy, revision: 2, evidence: "a".repeat(64), history: [] };
    mocks[(kind + "Read") as "discountRead"].mockResolvedValue(data);
    mocks[(kind + "Save") as "discountSave"].mockResolvedValue(data);
    const api = caller(),
      read =
        kind === "discount"
          ? await api.getDiscountPolicy()
          : await api.getMarginPolicy();
    expect(read).toMatchObject({ ...data, merchantId: 20, canManage: true });
    expect(mocks[(kind + "Read") as "discountRead"]).toHaveBeenCalledWith(20);
    const input = {
      policy,
      expectedRevision: 1,
      evidence: "b".repeat(64),
      reviewed: true as const,
    };
    const saved =
      kind === "discount"
        ? await api.updateDiscountPolicy(input as any)
        : await api.updateMarginPolicy(input as any);
    expect(saved).toMatchObject({ ...data, merchantId: 20 });
    expect(mocks[(kind + "Save") as "discountSave"]).toHaveBeenCalledWith({
      ...input,
      merchantId: 20,
      actorUserId: 7,
    });
  },
);
it.each(["discount", "margin"] as const)(
  "rejects client-supplied store identity on %s writes",
  async (kind) => {
    const api = caller(),
      input = {
        policy:
          kind === "discount"
            ? { enabled: true, maxPercent: 15, expireHours: 24 }
            : { enabled: true, minPercent: 20 },
        expectedRevision: 1,
        evidence: "b".repeat(64),
        reviewed: true,
        merchantId: 999,
      };
    await expect(
      kind === "discount"
        ? api.updateDiscountPolicy(input as any)
        : api.updateMarginPolicy(input as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks[(kind + "Save") as "discountSave"]).not.toHaveBeenCalled();
  },
);
