import { afterEach, beforeEach, expect, it, vi } from "vitest";
const effects = vi.hoisted(() => ({
  link: vi.fn(),
  charge: vi.fn(),
  db: vi.fn(),
  pool: vi.fn(),
}));
vi.mock("./db_payments", () => ({ getPaymentLinkByLinkId: effects.link }));
vi.mock("./payment/tap-client", async original => ({
  ...(await original<typeof import("./payment/tap-client")>()),
  postTapCharge: effects.charge,
}));
vi.mock("./db/connection", async original => ({
  ...(await original<typeof import("./db/connection")>()),
  getDb: effects.db,
  getPool: effects.pool,
}));
import { appRouter } from "./routers";
const linkId = "link_" + "a".repeat(32);
const api = () =>
  appRouter.createCaller({ user: null, req: { headers: {} }, res: {} } as any)
    .payments;
beforeEach(() => {
  vi.resetAllMocks();
  for (const fn of [effects.db, effects.pool, effects.charge])
    fn.mockImplementation(() => {
      throw Error("unavailable link reached downstream work");
    });
});
afterEach(() => vi.restoreAllMocks());
it.each([
  { status: "expired" },
  { status: "unknown" },
  { expiresAt: "not-a-date" },
  { maxUsageCount: -1 },
  { usageCount: -1 },
  { isActive: 2 },
])(
  "blocks checkout and public availability before provider/DB for %j",
  async patch => {
    effects.link.mockResolvedValue({
      id: 1,
      merchantId: 7,
      linkId,
      title: "Synthetic link",
      description: null,
      amount: 12550,
      currency: "SAR",
      isActive: 1,
      status: "active",
      usageCount: 0,
      maxUsageCount: null,
      expiresAt: null,
      ...patch,
    });
    expect(await api().getPublicLink({ linkId })).toMatchObject({
      available: false,
    });
    await expect(
      api().checkoutLink({
        linkId,
        customerName: "Local customer",
        customerPhone: "0501234567",
        checkoutAttemptId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "رابط الدفع غير متاح أو منتهي",
    });
    expect(effects.charge).not.toHaveBeenCalled();
    expect(effects.db).not.toHaveBeenCalled();
    expect(effects.pool).not.toHaveBeenCalled();
  }
);
